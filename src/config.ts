import type { AstroConfig } from './@types/astro';
import { join as pathJoin, resolve as pathResolve } from 'path';
import { existsSync } from 'fs';

/** Type util */
const type = (thing: any): string => (Array.isArray(thing) ? 'Array' : typeof thing);

/** Throws error if a user provided an invalid config. Manually-implemented to avoid a heavy validation library. */
function validateConfig(config: any): void {
  // basic
  if (config === undefined || config === null) throw new Error(`[astro config] Config empty!`);
  if (typeof config !== 'object') throw new Error(`[astro config] Expected object, received ${typeof config}`);

  // strings
  for (const key of ['projectRoot', 'astroRoot', 'dist', 'public']) {
    if (config[key] && typeof config[key] !== 'string') {
      throw new Error(`[astro config] ${key}: ${JSON.stringify(config[key])}\n  Expected string, received ${type(config[key])}.`);
    }
  }
}

/** Set default config values */
function configDefaults(userConfig?: any): any {
  const config: any = { ...(userConfig || {}) };

  if (!config.projectRoot) config.projectRoot = '.';
  if (!config.astroRoot) config.astroRoot = './astro';
  if (!config.dist) config.dist = './_site';
  if (!config.public) config.public = './public';

  return config;
}

/** Turn raw config values into normalized values */
function normalizeConfig(userConfig: any, root: string): AstroConfig {
  const config: any = { ...(userConfig || {}) };

  config.projectRoot = new URL(config.projectRoot + '/', root);
  config.astroRoot = new URL(config.astroRoot + '/', root);
  config.public = new URL(config.public + '/', root);

  return config as AstroConfig;
}

/** Attempt to load an `astro.config.mjs` file */
export async function loadConfig(rawRoot: string | undefined): Promise<AstroConfig> {
  if (typeof rawRoot === 'undefined') {
    rawRoot = process.cwd();
  }

  let config: any;

  const root = pathResolve(rawRoot);
  const fileProtocolRoot = `file://${root}/`;
  const astroConfigPath = pathJoin(root, 'astro.config.mjs');

  // load
  if (existsSync(astroConfigPath)) {
    config = configDefaults((await import(astroConfigPath)).default);
  } else {
    config = configDefaults();
  }

  // validate
  validateConfig(config);

  // normalize
  config = normalizeConfig(config, fileProtocolRoot);

  return config as AstroConfig;
}
