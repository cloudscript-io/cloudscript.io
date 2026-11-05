## MODIFIED Requirements

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

## ADDED Requirements

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
- **THEN** it has one block whose `@graph` has exactly one node, a `TechArticle` with `headline` equal to the title, `datePublished` `2026-11-05`, `dateModified` `2026-11-05`, `author.name` `Natasha Roumanoff`, `about.name` `MSG & EML Email Viewer for Jira`, `about.url` `https://cloudscript.io/apps/email-viewer-jira/` and `mainEntityOfPage` equal to the canonical

#### Scenario: Guide with faq
- **GIVEN** a guide whose `faq` has two `{q, a}` pairs
- **THEN** its block's `@graph` has a second node, a `FAQPage` with two `Question`s in order, each `acceptedAnswer.text` equal to its `a`

#### Scenario: Script breakout prevented in faq
- **GIVEN** a `faq` answer containing `</script>`
- **THEN** the built block contains no `</` and parses back to the original answer
