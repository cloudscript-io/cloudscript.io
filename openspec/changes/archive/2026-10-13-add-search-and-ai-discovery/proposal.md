# add-search-and-ai-discovery: proposal

## Why

AI assistants (ChatGPT search, Perplexity, Google AI Overviews, Claude with web search) mostly find
vendor documentation through search indexes rather than by reading a site directly, so the guides
are only as discoverable to them as they are to a search engine. A review on 13 Oct 2026 found the
guides themselves in good shape (static HTML, sensible `<h2>` structure, descriptive alt text) but
the site missing the basic plumbing that tells crawlers what exists and what each page is:

- there is no `sitemap.xml` and no `robots.txt` (crawlers are allowed by default, but nothing lists
  the pages and there is no recorded decision on AI training crawlers);
- no page carries structured data, so nothing machine-readable ties an app page to "a Confluence
  (or Jira) Cloud app published by CloudScript.io";
- only four guide sections have anchor IDs, so an AI answer or a support reply can cite only the top
  of a guide of up to 4,900 words, never the section that answers the question;
- every page's `<link rel="canonical">` and `og:url` point at `https://www.cloudscript.io/...`,
  which redirects to the apex `https://cloudscript.io/...` (the canonical host per CLAUDE.md §4),
  so each page names a redirecting URL as its own canonical address (observed live on `/support`
  and `/apps/radar-renderer/`, 13 Oct 2026).

`llms.txt` was considered and deliberately left out: Ahrefs' server logs across 137,000 domains
found 97% of llms.txt files received no requests in May 2026, and neither OpenAI's nor Anthropic's
crawler documentation uses it. It can be added later at negligible cost if that changes.

## What Changes

- **Canonical host fix.** A new `_config.yml` key, `canonical_url: https://cloudscript.io`, is
  used for `<link rel="canonical">`, `og:url`, `og:image`, `twitter:image`, the sitemap, robots.txt
  and structured data. `url:` stays `https://www.cloudscript.io` because both Atom feeds build
  entry `<id>`s from it and the Zapier to LinkedIn Page Zap keys on `<id>`: changing it would
  re-post every news item to the LinkedIn Page.
- **`/robots.txt`**: allow all crawlers, including AI training crawlers (decision recorded in
  design D2), plus a `Sitemap:` line. No `Disallow` lines.
- **`/sitemap.xml`**: hand-written Liquid (no plugin, same pattern as `news/feed.xml`), listing
  every indexable built page and every news post at its canonical, extensionless URL.
- **Structured data**: one include, `_includes/structured-data.html`, emitted from
  `_layouts/default.html`: a `SoftwareApplication` JSON-LD block on each live app's guide page,
  built from its registry entry, and an `Organization` + `WebSite` block on the home page.
- **Section anchors**: every `<h2>` in `apps/*/index.html` carries a stable, unique `id`, unless
  its enclosing `<section>` already has an `id`, in which case the `<h2>` gets none (the D5
  exemption: Page Sharing); the four existing IDs are kept unchanged.
- **Docs**: CLAUDE.md §4 (repo structure) and §9 (publish checklist) and PROJECT_STATUS.md record
  the new files and the rules for new pages.
- **Not changing**: `url:` in `_config.yml`, `news/feed.xml`, `news/linkedin.xml`, page copy,
  the visual design, analytics, kb-sync, jira-options-sync, the registry format.

## Capabilities

### New Capabilities

- `site-discovery`: crawler directives, a sitemap, canonical URLs on the canonical host,
  structured data for app pages, and addressable guide sections.

### Modified Capabilities

- none.

## Affected teams

Natasha and Patrick (site owners). Indirectly: the LinkedIn Page syndication (protected by the
feed-unchanged gate), the Confluence knowledge base `CUSKB` (kb-sync re-reads the guides on push;
expected to plan no writes, verified by dry run), and customers reading the guides (no visible
change other than linkable section headings).

## Impact on existing users

None visible. Search engines will re-evaluate canonicals as they re-crawl; because the apex is
already where `www` redirects, consolidation is the expected outcome, not a ranking loss. Existing
links, including `#mermaid-versions`, `#attach`, `#page-exports` and `#formats`, keep working.

## Adversarial security review

- **Information disclosure via robots.txt.** A `Disallow` list advertises the paths it hides.
  The file therefore has no `Disallow` lines; internal material is kept off the site by the build
  `exclude:` list, which is the control that actually works.
- **Information disclosure via the sitemap.** The sitemap lists only pages Jekyll built, so
  excluded paths (`openspec/`, `scripts/`, `tests/`, `content-drafts/`, `CLAUDE.md`,
  `PROJECT_STATUS.md`, `RUNBOOK.md`) cannot appear; a test asserts it anyway, so a future change
  to `exclude:` that leaks a path fails loudly instead of being announced to every crawler.
- **Script injection via JSON-LD.** Registry strings are emitted inside `<script
  type="application/ld+json">`. `jsonify` does not escape `</`, so a description containing
  `</script>` would break out of the block. Every emitted value is passed through `jsonify` and
  then `</` is escaped to `<\/`; a test asserts no built JSON-LD block contains `</`. The registry
  is repo-controlled (the same trust boundary as the HTML itself), so this is defence in depth,
  not a new exposure.
- **Unwanted reposting.** Covered above: the feeds must build byte-identical before and after.
- **AI training on the guides.** Allowing training crawlers means the guides' descriptions of
  each app's data handling (scopes, egress, storage) become model knowledge that can outlive the
  page. The content is already public; the mitigation is keeping the guides current, which
  CLAUDE.md §7 already requires.
- **Third-party requests.** None added. No new JavaScript, no external resources, GoatCounter
  unchanged.
- **Invented facts.** Structured data carries only registry values. No price, rating, review
  count or download figure is emitted, because none is held in the registry and CLAUDE.md §6
  forbids invented stats.

## Test plan

- New suite `tests/site-discovery/*.test.mjs` (Node built-ins, `node --test`), run against a fresh
  local `_site` build: robots.txt content; sitemap well-formed, every `<loc>` on
  `https://cloudscript.io`, no `.html`, no `www`, no excluded or `noindex` page, every live app
  page and every post present; each built page's canonical equals its sitemap `<loc>`; every
  JSON-LD block parses and contains no `</`; every `<h2>` in each guide has a unique `id` and the
  four legacy IDs survive.
- Feed gate: `news/feed.xml` and `news/linkedin.xml` built before and after the change are
  byte-identical.
- Regression: existing suites (`node --test tests/kb-sync/*.test.mjs
  tests/jira-options-sync/*.test.mjs`) still pass; kb-sync dry run against the changed guides
  plans zero Confluence writes (expected because `scripts/kb-sync/convert.mjs` carries only table-cell attributes into storage format; the dry run is the proof, not this expectation).
- Live, after push: `curl` checks on `/robots.txt`, `/sitemap.xml`, the `www` to apex redirect,
  and the canonical on three pages; structured data checked in validator.schema.org.
