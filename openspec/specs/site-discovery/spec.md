# site-discovery Specification

## Purpose
Make cloudscript.io discoverable and citable by search engines and AI assistants: crawler directives, a sitemap, canonical URLs on the apex host, structured data for the app pages and addressable guide sections, all built from the site's own pages and registry with no invented facts.

## Requirements
### Requirement: Canonical URLs use the canonical host

Every built HTML page SHALL declare its canonical URL, `og:url`, `og:image` and `twitter:image`
on `site.canonical_url` (`https://cloudscript.io`), and SHALL NOT change any output of
`news/feed.xml` or `news/linkedin.xml`.

#### Scenario: App page canonical
- **GIVEN** the site is built
- **WHEN** `/apps/radar-renderer/` is rendered
- **THEN** its `<link rel="canonical">` href is `https://cloudscript.io/apps/radar-renderer/`
- **AND** its `og:url` has the same value

#### Scenario: Flat page canonical is extensionless
- **GIVEN** the site is built
- **WHEN** `/support` is rendered
- **THEN** its canonical href is `https://cloudscript.io/support` with no `.html` and no `www`

#### Scenario: Feeds are untouched
- **GIVEN** `_site/news/feed.xml` and `_site/news/linkedin.xml` built from the commit before this change
- **WHEN** the site is built after this change
- **THEN** both files are byte-identical to the earlier build

### Requirement: robots.txt allows all crawlers and names the sitemap

The site SHALL serve `/robots.txt` allowing all user agents, with no `Disallow` lines, and a
`Sitemap:` line equal to `site.canonical_url` + `/sitemap.xml`.

#### Scenario: Training and retrieval crawlers allowed
- **GIVEN** the built `robots.txt`
- **WHEN** it is evaluated for user agents `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot` and `Googlebot`
- **THEN** every path is allowed for each

#### Scenario: No path disclosure
- **GIVEN** the built `robots.txt`
- **THEN** it contains no `Disallow` line

### Requirement: sitemap lists every indexable page at its canonical URL

The site SHALL serve `/sitemap.xml`, a well-formed sitemaps.org `urlset`, listing each built HTML
page, each post and each guide at its canonical URL, and nothing else. Posts carry a `<lastmod>`
from their date and guides from their `checked` date; no other entry carries one.

#### Scenario: Live app pages and posts present
- **GIVEN** the registry has apps with `status: live` and `_posts/` has posts
- **WHEN** the sitemap is built
- **THEN** it has a `<loc>` for each live app's guide page, its terms and privacy pages, and each post's `/news/<slug>` URL
- **AND** each post entry has a `<lastmod>` in W3C datetime format

#### Scenario: Guides present
- **GIVEN** `_guides/` has guides
- **WHEN** the sitemap is built
- **THEN** it has a `<loc>` for each guide's `/guides/<slug>` URL with a `<lastmod>` whose date is the guide's `checked`

#### Scenario: Non-indexable pages omitted
- **GIVEN** pages with `noindex: true`, pages with `sitemap: false`, and `404.html`
- **WHEN** the sitemap is built
- **THEN** none of them has a `<loc>` (today: `/404`, `/suggest-thanks`, `/share`)

#### Scenario: Excluded internal paths never listed
- **GIVEN** the `_config.yml` `exclude:` list
- **WHEN** the sitemap is built
- **THEN** no `<loc>` contains `openspec`, `scripts`, `tests`, `content-drafts`, `design-reference`, `CLAUDE`, `PROJECT_STATUS` or `RUNBOOK`

#### Scenario: Sitemap and canonical agree
- **GIVEN** any page listed in the sitemap
- **WHEN** that page's built HTML is read
- **THEN** its canonical href equals its `<loc>`

### Requirement: App guide pages carry SoftwareApplication structured data

Each live app's guide page SHALL include exactly one JSON-LD `SoftwareApplication` block built
only from that app's registry entry and site config, with no price, rating or review data.
Its `description` SHALL be the entry's `structured_description`, a factual definition of the
app for machine readers, kept separate from `description`, which is the home page tile text.
Adding a guides list to the app page SHALL NOT change this block.

#### Scenario: Live app
- **GIVEN** `_data/apps/radar-renderer.yml` with `status: live`
- **WHEN** `/apps/radar-renderer/` is built
- **THEN** it has one `application/ld+json` block that parses as JSON with `@type` `SoftwareApplication`, `name` equal to the registry `name`, `description` equal to the registry `structured_description`, `operatingSystem` `Atlassian Confluence Cloud`, `url` equal to the page canonical and `installUrl` equal to the registry `marketplace_url`
- **AND** it has no `offers`, `aggregateRating` or `review` key

#### Scenario: Jira app
- **GIVEN** `_data/apps/email-viewer-jira.yml` with `product: Jira`
- **THEN** its block's `operatingSystem` is `Atlassian Jira Cloud`

#### Scenario: Script breakout prevented
- **GIVEN** any built page
- **THEN** no `application/ld+json` block contains the sequence `</` before its closing tag

#### Scenario: Home page
- **WHEN** `/` is built
- **THEN** it has JSON-LD for `Organization` and `WebSite`, both with `url` `https://cloudscript.io`

#### Scenario: Only these pages carry structured data
- **GIVEN** the built site
- **THEN** the pages with a JSON-LD block are exactly the home page, each live app's guide page and each guide under `/guides/`

### Requirement: Guide pages carry TechArticle structured data

Each guide page SHALL include exactly one JSON-LD block whose `@graph` holds a `TechArticle`
(`headline` = title, `description`, `datePublished` = `date`, `dateModified` = `checked`,
`image` when set, `author` Person "Natasha Roumanoff", `publisher` Organization CloudScript.io
on the canonical host, `about` the app's `SoftwareApplication` by registry name and app-page
URL, `mainEntityOfPage` = the page canonical) and, only when `faq` is a non-empty list of
`{q, a}`, a `FAQPage` whose `mainEntity` is one `Question` with an `acceptedAnswer` `Answer`
per pair. Every value SHALL pass `jsonify` then `replace: "</", "<\/"`.

#### Scenario: Guide without faq
- **GIVEN** the placeholder guide with `faq: []`
- **WHEN** its page is built
- **THEN** it has one block whose `@graph` has exactly one node, a `TechArticle` with `headline` equal to the title, `datePublished` `2026-11-05`, `dateModified` `2026-11-05`, `author.name` `Natasha Roumanoff`, `about.name` `MSG/EML Email Viewer for Jira`, `about.url` `https://cloudscript.io/apps/email-viewer-jira/` and `mainEntityOfPage` equal to the canonical

#### Scenario: Guide with faq
- **GIVEN** a guide whose `faq` has two `{q, a}` pairs
- **THEN** its block's `@graph` has a second node, a `FAQPage` with two `Question`s in order, each `acceptedAnswer.text` equal to its `a`

#### Scenario: Script breakout prevented in faq
- **GIVEN** a `faq` answer containing `</script>`
- **THEN** the built block contains no `</` and parses back to the original answer

### Requirement: Guide sections are addressable

Every `<h2>` in `apps/*/index.html` SHALL be addressable: it SHALL have an `id` unique within
its page, unless its enclosing `<section>` already has an `id`, in which case the `<h2>` SHALL
NOT carry an `id` of its own (the section's `id` addresses it). The IDs `attach`,
`page-exports`, `mermaid-versions` and `formats` SHALL remain on their current headings.

#### Scenario: Deep link to a section
- **GIVEN** the Mermaid guide's "Layout engines (Dagre and ELK)" heading
- **THEN** it has an `id` and `https://cloudscript.io/apps/mermaid/#<id>` scrolls to it

#### Scenario: Heading inside a section that already has an id
- **GIVEN** the Page Sharing guide, where every `<h2>` sits inside a `<section>` with an `id` (`how`, `data-flow`, `publisher`, `subscriber`, `space-admin`, `admin`, `faq`)
- **THEN** each such `<h2>` has no `id` of its own and its enclosing `<section>` has one
- **AND** `https://cloudscript.io/apps/page-sharing/#<section id>` scrolls to that section

#### Scenario: Knowledge base unaffected
- **GIVEN** the guides with new heading IDs
- **WHEN** kb-sync runs in dry-run mode against `CUSKB`
- **THEN** it plans no page updates

