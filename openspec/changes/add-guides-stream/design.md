# add-guides-stream: design

## Context

Plugin-free Jekyll on GitHub Pages (Jekyll 3.10 on Pages, 4.4.1 locally; CLAUDE.md §5). Posts
already show the shape: a site-level `permalink: /news/:title`, a layout reading the registry
for the app chip and CTA, an index as a directory index, and a per-app include on the app pages.
The guides copy that shape as a collection, so nothing about posts, feeds or the LinkedIn Zap
moves.

## Decisions

### D1. A collection, with the permalink set once in `_config.yml`

```yaml
collections:
  guides:
    output: true
    permalink: /guides/:name
guides_name: Guides
```

`:name` is the file's basename, so `_guides/foo.md` becomes `guides/foo.html`, served
extensionless at `/guides/foo` (same clean-URL behaviour as `news/<slug>.html`). The permalink
has no trailing slash, so no redirect. The index is `guides/index.html` (a directory index, like
`news/index.html`), so a guide file can never collide with it.

Every link to the index is derived from the collection's permalink in Liquid
(`site.collections | where: "label", "guides" | first`, then `permalink | split: ":" | first`
gives `/guides/`), and every mention of the stream's name is `site.guides_name`. Renaming the
stream before publish is therefore: change `guides_name`; for the URL segment, change the
permalink line and `git mv guides/ <segment>/` (the index page's own `title:` is the only other
place that holds the display name, because front matter is not Liquid). Tests read both values
from `_config.yml` and repeat neither.

Rejected: a second posts-like directory under `_posts/` with a category. Posts are what the feeds
and the LinkedIn Zap read; keeping guides out of `site.posts` is the whole point.

### D2. Front-matter contract

| key | required | meaning |
| --- | --- | --- |
| `layout: guide` | yes | the layout below |
| `title` | yes | the question or task, used as the `<h1>`, `<title>` and `headline` |
| `description` | yes | one factual sentence: meta description, index entry, `TechArticle.description` |
| `app` | yes | registry slug; chip, CTA, `about`, product grouping, per-app list |
| `date` | yes | first published; `datePublished` |
| `checked` | yes | the date the steps were last verified; "Checked on", `dateModified`, sitemap `<lastmod>`, index ordering |
| `image` | yes | root-relative raster for og:image (same rule as posts) |
| `see_also` | no | list of guide slugs (no slash) and/or absolute site paths, with optional `#fragment` |
| `faq` | no | list of `{q, a}`; a non-empty list adds the `FAQPage` node |

### D3. `_layouts/guide.html`

Wraps `default.html` like `post.html`: kicker linking to the index, `<h1>`, a meta row with the
byline "By Natasha Roumanoff" (a name, never an email), "Checked on <date>", and the app chip;
then the body; then the Marketplace and app-page CTA; then "See also" when `see_also` is
non-empty; then the back link. Each `see_also` item: a bare slug resolves to the guide whose
`url` equals the index path plus the slug and shows its title; an absolute path resolves to the
post or page with that `url` (fragment stripped) and shows its title, with a fragment rendered
as the id's words after a colon; an item that matches nothing is shown as its raw path, so a
typo is visible in review. Styles reuse `.prose`, `.post-meta`, `.app-chip`, `.cta-row`; a
handful of new rules under a "Guides" comment in `styles.css`.

### D4. `guides/index.html` grouped by product

The home page already groups apps by `product` in a fixed order (Confluence, then Jira). The
index loops over the same fixed list, and for each product lists the guides (sorted by
`checked`, newest first) whose app's registry `product` matches. A product with no guide is
skipped; an app chip sits on every entry, so the reader sees the product first and the app
second. Reuses the `.news-stream`/`.news-item` grid with a `<h3>` per entry under a `<h2>` per
product.

### D5. `_includes/guides-list.html`

`{% include guides-list.html app="<slug>" %}`: `site.guides | where: "app", include.app`,
sorted by `checked` descending; renders `<h2 id="guides">` plus a list, or nothing. Placed
directly before `release-history.html` on every app page; Page Sharing has no release-history
include and no `.prose` wrapper, so there the include sits in its own `.wrap .prose` block
after the FAQ section and outside any `<section>` (an `<h2>` with an id inside a `<section>`
that has one would break the D5 rule of site-discovery).

kb-sync reads the app pages' source and strips every Liquid tag before hashing, so adding the
include changes no knowledge base page.

### D6. Structured data

In `_includes/structured-data.html`, a third branch on `page.layout == "guide"` emits one block:

```json
{ "@context": "https://schema.org", "@graph": [
  { "@type": "TechArticle", "headline", "description", "datePublished", "dateModified",
    "image" (when set), "author": { "@type": "Person", "name": "Natasha Roumanoff" },
    "publisher": { "@type": "Organization", "name", "url" },
    "about": { "@type": "SoftwareApplication", "name", "url" },
    "mainEntityOfPage": <canonical> },
  { "@type": "FAQPage", "mainEntity": [ { "@type": "Question", "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a } } ] }   // only when faq is non-empty
] }
```

Every value passes `jsonify | replace: "</", "<\/"`, as the existing test over the include
requires. `page.layout` rather than `page.collection` because the former is a plain string on
both Jekyll 3.10 and 4.4. App pages keep their single `SoftwareApplication` block unchanged.

### D7. Sitemap

A third loop over `site.guides`, `<lastmod>` from `checked` (`date_to_xmlschema`), the same
opt-outs as posts. The "only posts carry `<lastmod>`" rule becomes "posts and guides".

### D8. Voice rules (recorded in CLAUDE.md §3)

Written by a person for people: first person plural; a disclosure line before any mention of
our own app; an Atlassian documentation or tracker link for every claim about Jira or
Confluence behaviour; a dated "we checked this on" line; first-hand observations over
generalities; no price; no promise about future versions. Guides never enter the news feed,
the LinkedIn feed or kb-sync.

## Risks

- Liquid differences between Jekyll 4.4.1 (local) and 3.10 (Pages): `site.collections` as an
  array with `permalink`, `where` on a collection, `sort` on a date key and `date_to_xmlschema`
  on a front-matter date all exist in 3.10, but the first Pages build is the proof.
- A guide whose `app` names a non-live or missing registry entry would render without a chip
  or grouping; the tests require a live app.
