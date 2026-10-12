# add-search-and-ai-discovery: design

## Context

Plugin-free Jekyll on GitHub Pages (CLAUDE.md §5). The apex `https://cloudscript.io` is canonical
and `www` redirects to it (CLAUDE.md §4). `_config.yml` `url:` is `https://www.cloudscript.io`,
and `absolute_url` is used in `_layouts/default.html` (canonical, og:url, og:image,
twitter:image) and in both Atom feeds (`<id>`, `<link>`, enclosure). The Zapier to LinkedIn Page
Zap keys on each entry's `<id>` (header comment in `news/linkedin.xml`). Built `page.url` values
are already extensionless on Pages (live `/support` declares `.../support`, not `.../support.html`).

## Decisions

### D1. A separate canonical host key; `url:` is frozen

Add `canonical_url: https://cloudscript.io` (no trailing slash) to `_config.yml`, with a comment
explaining why `url:` must not change. Build canonical URLs as
`{{ site.canonical_url }}{{ page.url }}` (and the same for image paths, which are root-relative).
Use it in default.html for `rel="canonical"`, `og:url`, `og:image`, `twitter:image`, and in the
sitemap, robots.txt and structured data.

Rejected: changing `url:` to the apex. Simpler, but it rewrites every feed `<id>`, which the
LinkedIn Zap treats as a new item, re-posting the whole news history to the company Page.
Moving `url:` later needs its own change that pins the feed ids to the `www` form first.

### D2. robots.txt allows everything, including AI training crawlers

Natasha's decision, 13 Oct 2026: allow. As a small vendor, the value of models knowing the apps
exist and how they work outweighs keeping public documentation out of training sets. One
`User-agent: *` / `Allow: /` group, no per-bot groups (the default already covers GPTBot,
ClaudeBot, Google-Extended, CCBot and the retrieval bots), a comment recording the decision so it
is not reversed by accident, and `Sitemap: https://cloudscript.io/sitemap.xml`.

No `Disallow` lines: they advertise the paths they hide, and a `Disallow` on a `noindex` page
stops crawlers from ever seeing the `noindex`.

robots.txt is plain text with no front matter; the sitemap URL is written literally (the only
place the host is hard-coded; a test checks it equals `canonical_url` + `/sitemap.xml`).

### D3. sitemap.xml is hand-written Liquid

Same pattern as `news/feed.xml` (`layout: null`, Liquid filters already in use on Pages).
Sources: `site.html_pages` and `site.posts`. A page is omitted when any of these holds:
front matter `noindex: true`; front matter `sitemap: false` (new opt-out key, documented in
CLAUDE.md); it is `404.html`. Today that omits `/404`, `/suggest-thanks` and `/share`.
`<lastmod>` is emitted for posts only (from `post.date`, `date_to_xmlschema`): pages have no
reliable modification date without a plugin, and an inaccurate `lastmod` is worse than none.
No `<priority>` or `<changefreq>` (ignored by Google, noise for everyone else).
Check `site.html_pages` against the GitHub Pages Jekyll version before relying on it (see the
Pages dependency versions page); fall back to `site.pages` filtered on `.html` output if absent.

### D4. Structured data from the registry, in one include

`_includes/structured-data.html`, included once in `<head>` of `_layouts/default.html`.

- **App guide pages**: when `page.dir` equals `/apps/<slug>/`, `page.name` is `index.html`, and
  `_data/apps/<slug>.yml` has `status: live`, emit a `SoftwareApplication`:
  `name` (registry `name`), `description` (registry `description`), `url` (canonical),
  `applicationCategory: "BusinessApplication"`, `operatingSystem: "Atlassian <product> Cloud"`
  (registry `product`), `image` (registry `feature_image`, canonical host, only if set),
  `installUrl` and `sameAs` (registry `marketplace_url`), and
  `publisher: { "@type": "Organization", "name": "CloudScript.io", "url": canonical_url }`.
  No `offers`, `aggregateRating` or `review`: nothing in the registry supports them. This means
  Google will not show a software rich result; the purpose is entity understanding, not a snippet.
- **Home page**: `Organization` (name, url, logo as an absolute PNG URL from existing assets) and
  `WebSite` (name, url). `sameAs` only with URLs already published on the site (for example the
  Marketplace vendor page or LinkedIn Page if the footer or /about already links them); otherwise
  omit it rather than guess.
- **Escaping**: every value goes through `jsonify`, then the whole block's `</` sequences become
  `<\/` (`replace: "</", "<\/"` on each jsonified value). Valid JSON either way.

### D5. Guide section anchors

Every `<h2>` in `apps/*/index.html` gets an `id`. Rule: lowercase the heading text, drop
apostrophes, replace runs of non-alphanumerics with one hyphen, trim hyphens; on a clash within
the page append `-2`, `-3`. Existing IDs (`attach`, `page-exports`, `mermaid-versions`,
`formats`) are kept as they are even where the rule would produce something else, because they
may already be linked. The Legal heading becomes `id="legal"`. `<h3>` is out of scope.
These are hand edits to hand-authored HTML (no build step may rewrite pages, CLAUDE.md §5).

kb-sync impact: `convert.mjs` carries only table-cell attributes into storage format, so heading
IDs should not change any page body or content hash. A kb-sync dry run proves it before push.

## Risks

- `site.html_pages` availability on the Pages Jekyll version: checked as a task gate (D3).
- A future page added without front matter `noindex` that should not be indexed would land in the
  sitemap: covered by the CLAUDE.md publish checklist addition.
- Canonical change causes a re-crawl period in Search Console: expected, low impact.

## Owner actions outside the repo (Natasha, optional, after go-live)

- Submit `https://cloudscript.io/sitemap.xml` in Google Search Console and Bing Webmaster Tools
  (Bing's index feeds several AI assistants' web search). Requires verifying the domain property
  if not already done. Automation never submits anything to a third party.
