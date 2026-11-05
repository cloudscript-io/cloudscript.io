# add-guides-stream: proposal

## Why

The site has two kinds of page about an app: the guide on the app page (one long reference
document per app, mirrored into the Confluence knowledge base) and the news posts (dated release
announcements). Neither answers a question a reader types into a search engine or an AI
assistant, such as "how do I keep the original email on a Jira work item created by email?".
A competitor to MSG/EML Email Viewer runs about twenty such how-to pages for its rival app, and
they draw search and assistant traffic that the app pages, written as reference, do not.

Natasha decided on 5 Nov 2026 to add a stream of standalone how-to articles, written by a person
for people, each about one question and one app, with a machine-readable layer (schema.org
`TechArticle`, and `FAQPage` where the article carries question-and-answer pairs). The first
answers the question above for MSG/EML Email Viewer for Jira, whose version 2.6 (released the
same day, `/news/email-viewer-jira-2-6`) exists for exactly that case.

## What Changes

- **A Jekyll collection `_guides/`**, output at `/guides/<slug>` through a collection-level
  `permalink: /guides/:name` in `_config.yml`, served extensionless like the posts. No
  front-matter permalinks (CLAUDE.md §4).
- **One display name, one URL segment.** The stream's name ("Guides") is a single site variable,
  `guides_name`, read by the nav, the footer, the index, the layout and the per-app include; the
  URL segment lives only in the collection permalink. Natasha is still choosing between "Guides"
  and a question-led name, so a rename before publish touches the two config lines (plus moving
  the index directory for a URL change); no copy or test repeats the name.
- **`_layouts/guide.html`**: the title as the `<h1>` (question form allowed), a byline
  "By Natasha Roumanoff", a "Checked on <date>" line from `checked:`, the app chip from `app:`
  via the registry, the Marketplace and app-page CTA, a "See also" list from `see_also:`.
- **`guides/index.html`** (`/guides/`): every guide grouped by product (Confluence, Jira, from
  the registry `product` of the guide's app), newest `checked` first, with its description and
  app chip. A directory index for the same file-vs-directory reason as `/news/`.
- **`_includes/guides-list.html`**: the guides for one app, included on every app page directly
  before `release-history.html`, rendering nothing when the app has none.
- **Structured data**: `_includes/structured-data.html` emits, on a guide page, ONE JSON-LD block
  holding a `@graph` of a `TechArticle` and, when `faq:` is a non-empty list, a `FAQPage`.
- **Sitemap**: every guide at its canonical URL, `<lastmod>` from `checked:`.
- **Links**: "Guides" next to "News" in the nav and the footer's Company column.
- **Docs and tests**: CLAUDE.md §3 and §4, PROJECT_STATUS.md, `openspec/specs/guides` (new) and
  `openspec/specs/site-discovery` (sitemap and structured data deltas),
  `tests/site-discovery/guides.test.mjs`.
- **A placeholder guide** `_guides/original-email-on-jira-work-items-created-by-email.md` with
  the full front matter and a one-line comment body, replaced by the build manager after
  Natasha's review.
- **Not changing**: `url:`, `news/feed.xml`, `news/linkedin.xml` (guides never enter either),
  kb-sync (it mirrors `apps/<slug>/index.html` only and strips Liquid tags, so the new include
  changes no knowledge base page), jira-options-sync, the registry format, analytics, fonts.

## Capabilities

### New Capabilities

- `guides`: the stream of standalone how-to articles: collection, layout, index, per-app list,
  front-matter contract, voice rules, and the no-syndication rule.

### Modified Capabilities

- `site-discovery`: the sitemap lists guides; guide pages carry one `TechArticle` (plus
  `FAQPage`) JSON-LD block; the feeds stay untouched.

## Affected teams

Natasha (author and publisher; every guide is hers). Indirectly: the LinkedIn Page Zap (guides
never enter the feeds, proven byte-identical), the Confluence knowledge base (kb-sync reads the
app pages' source and strips Liquid tags, so the new include is invisible to it), and readers
of the app pages, who gain a "Guides" list where an app has guides.

## Impact on existing users

No existing URL changes. App pages gain a short list only where a guide exists (today: MSG/EML
Email Viewer for Jira, once the placeholder's body is written). The nav gains one link.

## Adversarial security review

- **Script injection via JSON-LD.** Guide front matter (title, description, `faq` answers) is
  emitted inside `<script type="application/ld+json">`. Every value passes through `jsonify`
  then `replace: "</", "<\/"`, as the existing include requires; a test puts `</script>` in a
  `faq` answer of a test guide and asserts the built block contains no `</`. The guides are
  repo-controlled, so this is defence in depth.
- **HTML injection via front matter on the page.** Title, description, byline and see-also
  labels are rendered with `escape`; the body is Markdown written by Natasha.
- **Email addresses.** The byline is a name only; no guide carries an email address. A test
  greps every built guide and the index for `@` inside `mailto:` or an address pattern.
- **Unwanted reposting.** The feeds iterate `site.posts` only; a guide is a collection document,
  never a post. Byte-identity before and after is proven with the feed baseline.
- **Information disclosure.** `_guides/` is content, nothing internal; `openspec/` stays excluded.
- **Third-party requests.** None added: no JavaScript, no external resource.
- **Invented facts.** Structured data carries only front matter and registry values; no rating,
  price or review.

## Test plan

- `tests/site-discovery/guides.test.mjs`: the collection serves at `/guides/<slug>` with an apex
  canonical; one JSON-LD block per guide with `TechArticle` and (when `faq:` is present)
  `FAQPage`, dates from `date:` and `checked:`, author and publisher fixed, `about` the app;
  no guide URL in `news/feed.xml` or `news/linkedin.xml`; the index lists every guide under its
  product; the per-app include renders on an app with guides and nothing on one without; a
  `</script>` in a `faq` answer is escaped; byline without an email.
- Existing suites updated where the rule changes (sitemap `<lastmod>` now for posts and guides;
  the set of pages carrying structured data now includes guides) and re-run with
  `SITE_DISCOVERY_FEED_BASELINE` set, proving the feeds byte-identical.
- kb-sync and jira-options-sync suites unchanged and green.
- Rendered check at desktop and 375px for `/guides/`, the placeholder guide and an app page.
