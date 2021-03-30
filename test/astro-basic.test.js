import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { createRuntime } from '../lib/runtime.js';
import { loadConfig } from '../lib/config.js';
import { doc } from './test-utils.js';

const Basics = suite('HMX Basics');

let runtime;

Basics.before(async () => {
  const astroConfig = await loadConfig(new URL('./fixtures/astro-basics', import.meta.url).pathname);

  const logging = {
    level: 'error',
    dest: process.stderr,
  };

  runtime = await createRuntime(astroConfig, { logging });
});

Basics.after(async () => {
  (await runtime) && runtime.shutdown();
});

Basics('Can load page', async () => {
  const result = await runtime.load('/');

  assert.equal(result.statusCode, 200);
  const $ = doc(result.contents);

  assert.equal($('h1').text(), 'Hello world!');
});

Basics.run();
