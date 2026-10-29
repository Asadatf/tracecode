# SEO — every public page is findable, by default and on purpose

The template ships the baseline search engines and answer engines (ChatGPT,
Perplexity, Claude, AI Overviews) need: titles and descriptions that fit a
result page, canonicals, a sitemap, `robots.txt`, `llms.txt` and
`llms-full.txt`, structured data, share cards, an IndexNow key. This rule is
what keeps it true as pages are added. The check ids are in parentheses, so a finding from an SEO audit
leads straight back here.

**This is not optional for a page anyone outside can load.** A page that
skips it is a page nobody finds. `src/lib/seo/seo.test.mts` fails the build
on the parts a test can see.

## Adding a page

Every page under `src/app/[locale]/` does one of two things:

**It is public, and joins the index:**

1. Add it to `PUBLIC_PAGES` in `src/lib/seo/pages.ts`: its path, its messages
   namespace, and `lastModified` (today, `YYYY-MM-DD`).
2. Give the namespace a `meta` block in every `messages/*.json`:
   - `meta.title`: 30–60 characters (`content.title.length`), and not a copy
     of the page's H1 (`content.title.distinct`).
   - `meta.description`: 70–160 characters (`content.description.length`).
   - The rest of the namespace is the page's copy. Keep the page's text there,
     not hard-coded in JSX: `llms-full.txt` hands exactly those strings to
     answer engines.
3. Export its metadata through `pageMetadata()`, which writes the title,
   description, canonical, hreflang, share card and robots in one go:

   ```tsx
   export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
   	return pageMetadata({ path: '/pricing', locale: (await params).locale })
   }
   ```

4. Below the home page, render its breadcrumb trail
   (`content.breadcrumb.declared`):
   `<JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }])} />`.
5. When its content changes, move `lastModified` in the same commit. The
   sitemap's `lastmod` is only worth sending if it is true
   (`tech.sitemap.lastmod`).

**Or it is not meant to be found** (admin, a demo, a thank-you page, anything
behind a login): it exports `robots: { index: false, follow: false }` and
stays out of `PUBLIC_PAGES`. Everything under `admin/` inherits that from its
layout.

The test fails on a page that does neither, on a `PUBLIC_PAGES` entry with no
page, on a title or description that doesn't fit, and on a `lastModified`
that isn't a real past date.

A dynamic route (`blog/[slug]`) isn't covered yet: the first one to arrive
gives `pageMetadata` a copy argument and adds its URLs to `src/app/sitemap.ts`
and `llmsPages()`.

## Before launch

- **`NEXT_PUBLIC_APP_URL`** in Vercel's production environment is the real
  domain, not a `*.vercel.app` address. Canonicals, the sitemap and
  `llms.txt` are written against it.
- **`SITE` in `src/lib/seo/site.ts`** is filled in:
  - `name`: one name, the same everywhere (`choose.entity.consistent`).
  - `indexable`: `false` for an internal tool, which makes every page
    noindex and `robots.txt` disallow everything, production included.
  - `sameAs`: the company's profiles (LinkedIn, X, GitHub), so the identity
    markup can be confirmed (`choose.entity.sameas`).
  - `contactEmail`, `privacyHref`, `termsHref`: the footer shows them, and a
    page without a way to reach its publisher or a privacy policy reads as
    untrustworthy (`choose.trust.contact`, `choose.trust.policy`). Point the
    two links at pages that exist.
  - `verification.google` and `verification.bing`: the tokens from Search
    Console and Bing Webmaster Tools (`geo.bing.verified`). Then submit
    `/sitemap.xml` in both.
- **The look of `src/app/icon.svg`, `apple-icon.tsx` and `opengraph-image.tsx`**
  is the brand's, not the template's placeholder.
- **One origin.** In Vercel's Domains settings, the apex and `www` redirect
  to whichever one is canonical (`tech.origin.canonical`).

## What the template already does — don't undo it

- `htmlLimitedBots: /.*/` in `next.config.ts`. Next otherwise streams
  `generateMetadata` into the body for any crawler not on its own list, so
  most answer engines would see a page with no title or canonical in its
  head (`tech.head.streamed`).
- `src/app/robots.ts`: every crawler, the AI retrieval ones included, on
  production; everything disallowed on previews and local builds.
- `next.config.ts` sends `X-Robots-Tag: noindex` on `*.vercel.app`, the
  production deployment's duplicate address (`tech.staging.exposed`), and the
  five headers an audit grades (`tech.transport.headers`).
- `src/app/sitemap.ts`, `llms.txt/` and `llms-full.txt/` are built from
  `PUBLIC_PAGES`. `public/indexnow.txt` holds the IndexNow key `indexnow`,
  the one the SEO platform looks for (`tech.origin.indexnow`).
- The root layout renders Organization and WebSite JSON-LD
  (`choose.schema.identity`) and the footer.
- `src/proxy.ts` skips `/opengraph-image` and `/apple-icon`, which are served
  at paths with no extension; without that, locale routing turns them into 404s.

## Don't

- Don't add `changefreq` or `priority` to the sitemap; Google has never read
  them (`tech.sitemap.deprecated`). Don't stamp every `lastModified` with
  `new Date()`.
- Don't block AI crawlers, in `robots.txt` or in a Vercel Firewall or bot
  rule. Allowing them in `robots.txt` while the firewall refuses them still
  means nobody cites the site (`geo.crawler.blocked`).
- Don't set `nosnippet`, `max-snippet:0` or `data-nosnippet` on content an
  answer engine should quote (`choose.snippet.directives`).
- Don't render a page's copy only on the client. Crawlers read the HTML
  (`tech.render.client`), so content and metadata come from Server Components.
- A cookie banner is a bar, never a modal over the page
  (`choose.overlay.intrusive`).
- One H1 per page, headings descending one level at a time
  (`content.h1.single`, `content.heading.levels`), `alt` on every content
  image (`content.image.alt`), and `next/image` for images, with `priority`
  on the first one (`perf.image.*`).
