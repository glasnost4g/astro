import type { AstroConfig } from './@types/astro';
import type { LogOptions } from './logger.js';
import { loadConfiguration, startServer as startSnowpackServer, logger as snowpackLogger } from 'snowpack';
import { existsSync, promises as fsPromises } from 'fs';
import http from 'http';
import { relative as pathRelative } from 'path';
import { defaultLogDestination, info, error, parseError } from './logger.js';

const { readFile } = fsPromises;

const hostname = '127.0.0.1';
const port = 3000;

// Disable snowpack from writing to stdout/err.
snowpackLogger.level = 'silent';

const logging: LogOptions = {
  level: 'debug',
  dest: defaultLogDestination
};

export default async function (astroConfig: AstroConfig) {
  const { projectRoot, hmxRoot } = astroConfig;

  const internalPath = new URL('./frontend/', import.meta.url);
  const snowpackConfigPath = new URL('./snowpack.config.js', projectRoot);

  // Workaround for SKY-251
  const hmxPlugOptions: { resolve?: (s: string) => string } = {};
  if (existsSync(new URL('./package-lock.json', projectRoot))) {
    const pkgLockStr = await readFile(new URL('./package-lock.json', projectRoot), 'utf-8');
    const pkgLock = JSON.parse(pkgLockStr);
    hmxPlugOptions.resolve = (pkgName: string) => {
      const ver = pkgLock.dependencies[pkgName].version;
      return `/_snowpack/pkg/${pkgName}.v${ver}.js`;
    };
  }

  const snowpackConfig = await loadConfiguration(
    {
      root: projectRoot.pathname,
      mount: {
        [hmxRoot.pathname]: '/_hmx',
        [internalPath.pathname]: '/__hmx_internal__',
      },
      plugins: [['astro/snowpack-plugin', hmxPlugOptions]],
      devOptions: {
        open: 'none',
        output: 'stream',
        port: 0,
      },
      packageOptions: {
        knownEntrypoints: ['preact-render-to-string'],
        external: ['@vue/server-renderer'],
      },
    },
    snowpackConfigPath.pathname
  );
  const snowpack = await startSnowpackServer({
    config: snowpackConfig,
    lockfile: null,
  });
  const runtime = snowpack.getServerRuntime();

  const server = http.createServer(async (req, res) => {
    const fullurl = new URL(req.url || '/', 'https://example.org/');
    const reqPath = decodeURI(fullurl.pathname);
    const selectedPage = reqPath.substr(1) || 'index';
    info(logging, 'access', reqPath);

    const selectedPageLoc = new URL(`./pages/${selectedPage}.hmx`, hmxRoot);
    const selectedPageMdLoc = new URL(`./pages/${selectedPage}.md`, hmxRoot);
    const selectedPageUrl = `/_hmx/pages/${selectedPage}.js`;

    // Non-hmx pages
    if (!existsSync(selectedPageLoc) && !existsSync(selectedPageMdLoc)) {
      try {
        const result = await snowpack.loadUrl(reqPath);
        if (result.contentType) {
          res.setHeader('Content-Type', result.contentType);
        }
        res.write(result.contents);
        res.end();
      } catch (err) {
        error(logging, 'static', 'Not found', reqPath);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Not Found');
      }
      return;
    }

    try {
      const mod = await runtime.importModule(selectedPageUrl);
      const html = await mod.exports.default();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } catch (err) {
      switch(err.code) {
        case 'parse-error': {
          err.filename = pathRelative(projectRoot.pathname, err.filename);
          debugger;
          parseError(logging, err);
          break;
        }
        default: {
          error(logging, 'running hmx', err);
          break;
        }
      }
    }
  });

  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}
