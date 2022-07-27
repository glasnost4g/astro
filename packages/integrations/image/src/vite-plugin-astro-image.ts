import type { AstroConfig } from 'astro';
import { pathToFileURL } from 'node:url';
import type { PluginContext } from 'rollup';
import slash from 'slash';
import type { Plugin, ResolvedConfig } from 'vite';
import type { IntegrationOptions } from './index.js';
import type { InputFormat } from './loaders/index.js';
import { metadata } from './utils/metadata.js';

export interface ImageMetadata {
	src: string;
	width: number;
	height: number;
	format: InputFormat;
}

export function createPlugin(config: AstroConfig, options: Required<IntegrationOptions>): Plugin {
	const filter = (id: string) =>
		/^(?!\/_image?).*.(heic|heif|avif|jpeg|jpg|png|tiff|webp|gif)$/.test(id);

	const virtualModuleId = 'virtual:image-loader';

	let resolvedConfig: ResolvedConfig;
	let loaderModuleId: string;

	async function resolveLoader(context: PluginContext) {
		if (!loaderModuleId) {
			const module = await context.resolve(options.serviceEntryPoint);
			if (!module) {
				throw new Error(`"${options.serviceEntryPoint}" could not be found`);
			}
			loaderModuleId = module.id;
		}

		return loaderModuleId;
	}

	return {
		name: '@astrojs/image',
		enforce: 'pre',
		configResolved(viteConfig) {
			resolvedConfig = viteConfig;
		},
		async resolveId(id) {
			// The virtual model redirects imports to the ImageService being used
			// This ensures the module is available in `astro dev` and is included
			// in the SSR server bundle.
			if (id === virtualModuleId) {
				return await resolveLoader(this);
			}
		},
		async load(id) {
			// only claim image ESM imports
			if (!filter(id)) {
				return null;
			}

			const meta = await metadata(id);

			const fileUrl = pathToFileURL(id);
			const src = resolvedConfig.isProduction
				? fileUrl.pathname.replace(config.srcDir.pathname, '/')
				: id;

			const output = {
				...meta,
				src: slash(src), // Windows compat
			};

			return `export default ${JSON.stringify(output)}`;
		},
	};
}
