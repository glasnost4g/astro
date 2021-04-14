import { fileURLToPath } from 'url';
import { createRuntime } from '../lib/runtime.js';
import { loadConfig } from '../lib/config.js';
import * as assert from 'uvu/assert';
/** setup fixtures for tests */
export function setup(Suite, fixturePath) {
  let runtime, setupError;

  Suite.before(async (context) => {
    const astroConfig = await loadConfig(fileURLToPath(new URL(fixturePath, import.meta.url)));

    const logging = {
      level: 'error',
      dest: process.stderr,
    };

    try {
      runtime = await createRuntime(astroConfig, { logging });
    } catch (err) {
      console.error(err);
      setupError = err;
    }

    context.runtime = runtime;
  });

  Suite.after(async () => {
    (await runtime) && runtime.shutdown();
  });

  Suite('No errors creating a runtime', () => {
    assert.equal(setupError, undefined);
  });
}
