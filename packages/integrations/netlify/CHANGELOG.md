# @astrojs/netlify

## 0.1.0

### Minor Changes

- [#2962](https://github.com/withastro/astro/pull/2962) [`17c02925`](https://github.com/withastro/astro/commit/17c02925c52027246000305cea1f9a7b6f484b00) Thanks [@natemoo-re](https://github.com/natemoo-re)! - Update config options to resepect [RFC0019](https://github.com/withastro/rfcs/blob/main/proposals/0019-config-finalization.md)

## 0.0.2

### Patch Changes

- [#2879](https://github.com/withastro/astro/pull/2879) [`80034c6c`](https://github.com/withastro/astro/commit/80034c6cbc89761618847e6df43fd49560a05aa9) Thanks [@matthewp](https://github.com/matthewp)! - Netlify Adapter

  This change adds a Netlify adapter that uses Netlify Functions. You can use it like so:

  ```js
  import { defineConfig } from 'astro/config';
  import netlify from '@astrojs/netlify/functions';

  export default defineConfig({
  	adapter: netlify(),
  });
  ```
