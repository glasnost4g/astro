import type { AstroConfig, BuildConfig, ManifestData } from '../../@types/astro';
import type { LogOptions } from '../logger';

import fs from 'fs';
import * as colors from 'kleur/colors';
import { apply as applyPolyfill } from '../polyfill.js';
import { performance } from 'perf_hooks';
import * as vite from 'vite';
import { createVite, ViteConfigWithSSR } from '../create-vite.js';
import { debug, defaultLogOptions, info, levels, timerMessage, warn, warnIfUsingExperimentalSSR } from '../logger.js';
import { createRouteManifest } from '../routing/index.js';
import { generateSitemap } from '../render/sitemap.js';
import { collectPagesData } from './page-data.js';
import { build as scanBasedBuild } from './scan-based-build.js';
import { staticBuild } from './static-build.js';
import { RouteCache } from '../render/route-cache.js';
import { runHookBuildDone, runHookBuildStart, runHookConfigDone, runHookConfigSetup } from '../../integrations/index.js';
import { getTimeStat } from './util.js';
import { createSafeError } from '../util.js';
import { fixViteErrorMessage } from '../errors.js';

export interface BuildOptions {
	mode?: string;
	logging: LogOptions;
}

/** `astro build` */
export default async function build(config: AstroConfig, options: BuildOptions = { logging: defaultLogOptions }): Promise<void> {
	config = await runHookConfigSetup({ config, command: 'build' });
	const builder = new AstroBuilder(config, options);
	await builder.run();
}

class AstroBuilder {
	private config: AstroConfig;
	private logging: LogOptions;
	private mode = 'production';
	private origin: string;
	private routeCache: RouteCache;
	private manifest: ManifestData;
	private timer: Record<string, number>;

	constructor(config: AstroConfig, options: BuildOptions) {
		if (!config.buildOptions.site && config.buildOptions.sitemap !== false) {
			warn(options.logging, 'config', `Set "buildOptions.site" to generate correct canonical URLs and sitemap`);
		}
		if (options.mode) {
			this.mode = options.mode;
		}
		this.config = config;
		const port = config.devOptions.port; // no need to save this (don’t rely on port in builder)
		this.logging = options.logging;
		this.routeCache = new RouteCache(this.logging);
		this.origin = config.buildOptions.site ? new URL(config.buildOptions.site).origin : `http://localhost:${port}`;
		this.manifest = createRouteManifest({ config }, this.logging);
		this.timer = {};
	}

	/** Setup Vite and run any async setup logic that couldn't run inside of the constructor. */
	private async setup() {
		debug('build', 'Initial setup...');
		const { logging } = this;
		this.timer.init = performance.now();
		this.timer.viteStart = performance.now();
		const viteConfig = await createVite(
			{
				mode: this.mode,
				server: {
					hmr: false,
					middlewareMode: 'ssr',
				},
			},
			{ astroConfig: this.config, logging, mode: 'build' }
		);
		await runHookConfigDone({ config: this.config });
		warnIfUsingExperimentalSSR(logging, this.config);
		const viteServer = await vite.createServer(viteConfig);
		debug('build', timerMessage('Vite started', this.timer.viteStart));
		return { viteConfig, viteServer };
	}

	/** Run the build logic. build() is marked private because usage should go through ".run()" */
	private async build({ viteConfig, viteServer }: { viteConfig: ViteConfigWithSSR; viteServer: vite.ViteDevServer }) {
		const { origin } = this;
		const buildConfig: BuildConfig = {
			client: new URL('./client/', this.config.dist),
			server: new URL('./server/', this.config.dist),
			serverEntry: 'entry.mjs',
			staticMode: undefined,
		};
		await runHookBuildStart({ config: this.config, buildConfig });

		info(this.logging, 'build', 'Collecting build information...');
		this.timer.loadStart = performance.now();
		const { assets, allPages } = await collectPagesData({
			astroConfig: this.config,
			logging: this.logging,
			manifest: this.manifest,
			origin,
			routeCache: this.routeCache,
			viteServer,
			ssr: this.config.buildOptions.experimentalSsr,
		});

		// Filter pages by using conditions based on their frontmatter.
		Object.entries(allPages).forEach(([page, data]) => {
			if ('frontmatter' in data.preload[1]) {
				// TODO: add better type inference to data.preload[1]
				const frontmatter = (data.preload[1] as any).frontmatter;
				if (Boolean(frontmatter.draft) && !this.config.buildOptions.drafts) {
					debug('build', timerMessage(`Skipping draft page ${page}`, this.timer.loadStart));
					delete allPages[page];
				}
			}
		});

		debug('build', timerMessage('All pages loaded', this.timer.loadStart));

		// The names of each pages
		const pageNames: string[] = [];

		// Bundle the assets in your final build: This currently takes the HTML output
		// of every page (stored in memory) and bundles the assets pointed to on those pages.
		this.timer.buildStart = performance.now();
		info(this.logging, 'build', colors.dim(`Completed in ${getTimeStat(this.timer.init, performance.now())}.`));

		// Use the new faster static based build.
		if (!this.config.buildOptions.legacyBuild) {
			await staticBuild({
				allPages,
				astroConfig: this.config,
				logging: this.logging,
				manifest: this.manifest,
				origin: this.origin,
				pageNames,
				routeCache: this.routeCache,
				viteConfig,
				buildConfig,
			});
		} else {
			await scanBasedBuild({
				allPages,
				astroConfig: this.config,
				logging: this.logging,
				origin: this.origin,
				pageNames,
				routeCache: this.routeCache,
				viteConfig,
				viteServer,
			});
		}

		// Write any additionally generated assets to disk.
		this.timer.assetsStart = performance.now();
		Object.keys(assets).map((k) => {
			if (!assets[k]) return;
			const filePath = new URL(`file://${k}`);
			fs.mkdirSync(new URL('./', filePath), { recursive: true });
			fs.writeFileSync(filePath, assets[k], 'utf8');
			delete assets[k]; // free up memory
		});
		debug('build', timerMessage('Additional assets copied', this.timer.assetsStart));

		// Build your final sitemap.
		if (this.config.buildOptions.sitemap && this.config.buildOptions.site) {
			this.timer.sitemapStart = performance.now();
			const sitemapFilter = this.config.buildOptions.sitemapFilter ? (this.config.buildOptions.sitemapFilter as (page: string) => boolean) : undefined;
			const sitemap = generateSitemap(
				pageNames.map((pageName) => new URL(pageName, this.config.buildOptions.site).href),
				sitemapFilter
			);
			const sitemapPath = new URL('./sitemap.xml', this.config.dist);
			await fs.promises.mkdir(new URL('./', sitemapPath), { recursive: true });
			await fs.promises.writeFile(sitemapPath, sitemap, 'utf8');
			debug('build', timerMessage('Sitemap built', this.timer.sitemapStart));
		}

		// You're done! Time to clean up.
		await viteServer.close();
		await runHookBuildDone({ config: this.config, pages: pageNames, routes: Object.values(allPages).map((pd) => pd.route) });

		if (this.logging.level && levels[this.logging.level] <= levels['info']) {
			const buildMode = this.config.buildOptions.experimentalSsr ? 'ssr' : 'static';
			await this.printStats({ logging: this.logging, timeStart: this.timer.init, pageCount: pageNames.length, buildMode });
		}
	}

	/** Build the given Astro project.  */
	async run() {
		const setupData = await this.setup();
		try {
			await this.build(setupData);
		} catch (_err) {
			debugger;
			throw fixViteErrorMessage(createSafeError(_err), setupData.viteServer);
		}
	}

	/** Stats */
	private async printStats({ logging, timeStart, pageCount, buildMode }: { logging: LogOptions; timeStart: number; pageCount: number; buildMode: 'static' | 'ssr' }) {
		const buildTime = performance.now() - timeStart;
		const total = getTimeStat(timeStart, performance.now());

		let messages: string[] = [];
		if (buildMode === 'static') {
			messages = [`${pageCount} page(s) built in`, colors.bold(total)];
		} else {
			messages = ['Server built in', colors.bold(total)];
		}

		info(logging, 'build', messages.join(' '));
		info(logging, 'build', `${colors.bold('Complete!')}`);
	}
}
