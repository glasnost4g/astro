# @astrojs/netlify

Deploy your server-side rendered (SSR) Astro app to [Netlify](https://www.netlify.com/).

Use this adapter in your Astro configuration file:

```js
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';

export default defineConfig({
	adapter: netlify()
});
```

After you build your site the `netlify/` folder will contain [Netlify Functions](https://docs.netlify.com/functions/overview/) in the `netlify/functions/` folder.

Now you can deploy!

```shell
netlify deploy
```

## Configuration

The output folder is configuration with the `dist` property when creating the adapter.

```js
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';

export default defineConfig({
  adapter: netlify({
    dist: new URL('./dist/', import.meta.url)
  })
});
```

And then point to the dist in your `netlify.toml`:

```toml
[functions]
  directory = "dist/functions"
```
