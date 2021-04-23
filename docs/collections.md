# 🍱 Collections

## ❓ What are Collections?

[Fetching data is easy in Astro][docs-data]. But what if you wanted to make a paginated blog? What if you wanted an easy way to sort data, or filter data based on part of the URL? Or generate an RSS 2.0 feed? When you need something a little more powerful than simple data fetching, Astro’s Collections API may be what you need.

An Astro Collection is similar to the general concept of Collections in static site generators like Jekyll, Hugo, Eleventy, etc. It’s a general way to load an entire data set. But one big difference between Astro Collections and traditional static site generators is: **Astro lets you seamlessly blend remote API data and local files in a JAMstack-friendly way.** To see how, this guide will walk through a few examples. If you’d like, you can reference the [blog example project][example-blog] to see the finished code in context.

## 🧑‍🎨 How to Use

By default, any Astro component can fetch data from any API or local `*.md` files. But what if you had a blog you wanted to paginate? What if you wanted to generate dynamic URLs based on metadata (e.g. `/tag/:tag/`)? Or do both together? Astro Collections are a way to do all of that. It’s perfect for generating blog-like content, or scaffolding out dynamic URLs from your data.

Let’s pretend we have some blog posts written already. This is our starting project structure:

```
└── astro/
    └── pages/
        └── post/
            └── (blog content)
```

The first step in adding some dynamic collections is deciding on a URL schema. For our example website, we’re aiming for the following URLs:

- `/post/:post`: A single blog post page
- `/posts/:page`: A list page of all blog posts, paginated, and sorted most recent first
- `/tag/:tag`: All blog posts, filtered by a specific tag

Because `/post/:post` references the static files we have already, that doesn’t need to be a collection. But we will need collections for `/posts/:page` and `/tag/:tag` because those will be dynamically generated. For both collections we’ll create a `/astro/pages/$[collection].astro` file. This is our new structure:

```diff
  └── astro/
      └── pages/
          ├── post/
          │   └── (blog content)
+         ├── $posts.astro     -> /posts/1, /posts/2, …
+         └── $tag.astro       -> /tag/:tag/1, /tag/:tag/2, …
```

💁‍ **Tip**: Any `.astro` filename beginning with a `$` is how it’s marked as a collection.

In each `$[collection].astro` file, we’ll need 2 things:

```js
// 1. We need to mark “collection” as a prop (this is a special reserved name)
export let collection: any;

// 2. We need to export an async createCollection() function that will retrieve our data.
export async function createCollection() {
  return {
    async data() {
      // return data here to load (we’ll cover how later)
    },
  };
}
```

These are important so your data is exposed to the page as a prop, and also Astro has everything it needs to gather your data and generate the proper routes. How it does this is more clear if we walk through a practical example.

#### Example 1: Simple pagination

Our blog posts all contain `title`, `tags`, and `published_at` in their frontmatter:

```md
---
title: My Blog Post
tags:
  - javascript
published_at: 2021-03-01 09:34:00
---

# My Blog post

…
```

There’s nothing special or reserved about any of these names; you’re free to name everything whatever you’d like, or have as much or little frontmatter as you need.

```jsx
// /astro/pages/$posts.astro
---
export let collection: any;

export async function createCollection() {
  const allPosts = Astro.fetchContent('./post/*.md');                           // load data that already lives at `/post/:slug`
  allPosts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at)); // sort newest -> oldest (we got "published_at" from frontmatter!)

  // (load more data here, if needed)

  return {
    async data() {
      return allPosts;
    },
    pageSize: 10, // how many we want to show per-page (default: 25)
  };
}

function formatDate(date) {
  return new Date(date).toUTCString();
}
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Blog Posts: page {collection.page.current}</title>
    <link rel="canonical" href={collection.url.current} />
    <link rel="prev" href={collection.url.prev} />
    <link rel="next" href={collection.url.next} />
  </head>
  <body>
    <main>
      <h5>Results {collection.start + 1}–{collection.end + 1} of {collection.total}</h6>
      {collection.data.map((post) => (
        <h1>{post.title}</h1>
        <time>{formatDate(post.published_at)}</time>
        <a href={post.url}>Read</a>
      )}
    </main>
    <footer>
      <h4>Page {collection.page.current} / {collection.page.last}</h4>
      <nav class="nav">
        <a class="prev" href={collection.url.prev || '#'}>Prev</a>
        <a class="next" href={collection.url.next || '#'}>Next</a>
      </nav>
    </footer>
  </body>
</html>
```

Let’s walk through some of the key parts:

- `export let collection`: this is important because it exposes a prop to the page for Astro to return with all your data loaded. ⚠️ **It must be named `collection`**.
- `export async function createCollection()`: this is also required, **and must be named this exactly.** This is an async function that lets you load data from anywhere (even a remote API!). At the end, you must return an object with `{ data: yourData }`. There are other options such as `pageSize` we’ll cover later.
- `{collection.data.map((post) => (…`: this lets us iterate over all the markdown posts. This will take the shape of whatever you loaded in `createCollection()`. It will always be an array.
- `{collection.page.current}`: this, and other properties, simply return more info such as what page a user is on, what the URL is, etc. etc.
- Curious about everything on `collection`? See the [reference][collection-api].

#### Example 2: Advanced filtering & pagination

In our earlier example, we covered simple pagination for `/posts/1`, but we’d still like to make `/tag/:tag/1` and `/year/:year/1`. To do that, we’ll create 2 more collections: `/astro/pages/$tag.astro` and `astro/pages/$year.astro`. Assume that the markup is the same, but we’ve expanded the `createCollection()` function with more data.

```diff
  // /astro/pages/$tag.astro
  ---
  import Pagination from '../components/Pagination.astro';
  import PostPreview from '../components/PostPreview.astro';

  export let collection: any;

  export async function createCollection() {
    const allPosts = Astro.fetchContent('./post/*.md');
    allPosts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
+   const allTags = [...new Set(allPosts.map((post) => post.tags).flat())];  // gather all unique tags (we got "tags" from frontmatter!)
+   allTags.sort((a, b) => a.localeCompare(b));                              // sort tags A -> Z
+   const routes = allTags.map((tag) => ({ tag }));                          // this is where we set { params: { tag } }

    return {
-     async data() {
-       return allPosts;
+     async data({ params }) {
+       return allPosts.filter((post) => post.tags.includes(params.tag));    // filter posts that match the :tag from the URL ("params")
      },
      pageSize: 10,
+     routes,
+     permalink: ({ params }) => `/tag/${params.tag}/`                       // this is where we generate our URL structure
    };
  }
  ---
```

Some important concepts here:

- `routes = allTags.map((tag) => ({ tag }))`: Astro handles pagination for you automatically. But when it needs to generate multiple routes, this is where you tell Astro about all the possible routes. This way, when you run `astro build`, your static build isn’t missing any pages.
- `permalink: ({ params }) => `/tag/${params.tag}/`: this is where you tell Astro what the generated URL should be. Note that while you have control over this, the root of this must match the filename (it’s best **NOT** to use `/pages/$tag.astro`to generate`/year/$year.astro`; that should live at `/pages/$year.astro` as a separate file).
- `allPosts.filter((post) => post.tag === params.tag)`: we aren’t returning all posts here; we’re only returning posts with a matching tag. _What tag,_ you ask? The `routes` array has `[{ tag: 'javascript' }, { tag: '…`, and all the routes we need to gather. So we first need to query everything, but only return the `.filter()`ed posts at the very end.

Other things of note is that we are sorting like before, but we filter by the frontmatter `tag` property, and return those at URLs.

These are still paginated, too! But since there are other conditions applied, they live at a different URL.

#### Tips

- Having to load different collections in different `$[collection].astro` files might seem like a pain at first, until you remember **you can create reusable components!** Treat `/pages/*.astro` files as your one-off routing & data fetching logic, and treat `/components/*.astro` as your reusable markup. If you find yourself duplicating things too much, you can probably use a component instead!
- Stay true to `/pages/$[collection].astro` naming. If you have an `/all-posts/*` route, then use `/pages/$all-posts.astro` to manage that. Don’t try and trick `permalink` to generate too many URL trees; it’ll only result in pages being missed when it comes time to build.

### 📚 Further Reading

- [Fetching data in Astro][docs-data]
- API Reference: [collection][collection-api]
- API Reference: [createCollection()][create-collection-api]
- API Reference: [Creating an RSS feed][create-collection-api]

[docs-data]: ../README.md#-fetching-data
[collection-api]: ./api.md#collection
[create-collection-api]: ./api.md#createcollection
[example-blog]: ../examples/blog
[fetch-content]: ./api.md#fetchcontent
