
export default {
  name: '@astrojs/test-custom-element-renderer',
  server: './server',
  polyfills: [
    './polyfill.js'
  ],
  hydrationPolyfills: [
    './hydration-polyfill.js'
  ]
};
