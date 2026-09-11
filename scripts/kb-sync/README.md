# kb-sync: mirror the user guides into the Confluence knowledge base

`scripts/kb-sync` copies the user guide of every live app on cloudscript.io into one page each
in the `Cloudscript Help` Confluence space (key `CSHELP`). That space is the knowledge base of
the Jira Service Management help centre for project CUS, and the JSM virtual service agent
answers customer questions from it. The website stays the single source of truth: a guide is
edited here, pushed to `main`, and the GitHub Actions workflow `.github/workflows/kb-sync.yml`
updates the matching Confluence page. Nobody edits the Confluence pages by hand.

The design is recorded in `openspec/changes/sync-guides-to-confluence-kb/` (proposal, design
decisions D1 to D11, the `kb-sync` spec and the task list). This file is the operator's view.

## The one-way rule

Data flows from this repository to Confluence and never back. Any manual edit to a synced page
in Confluence is overwritten by the next sync that finds a changed guide, and the space
description says so. Legal pages (terms, privacy, DPA) are deliberately not mirrored: each
synced page ends with a footer that links to the dated legal pages on the website.

## What is synced

- Source of truth for the app list: `_data/apps/<slug>.yml`. Exactly the entries with
  `status: live` are synced, each from `apps/<slug>/index.html`. Any other status is skipped and
  reported.
- Extraction boundary (design D3): from the page's `div.prose`, drop the `<h1>` (Confluence shows
  the title), the `.trust-badges` block and every `<style>`, `<script>` and `<noscript>`; keep
  everything from the first remaining element (the lede) up to but excluding the `<h2>Legal</h2>`
  heading; append a fixed footer naming the guide's URL and linking the app's legal documents from
  the registry. Jekyll `{% ... %}` tags in the source (the release-history include) are removed
  before extraction: they are build instructions, not guide text.
- Page Sharing is the one guide without a `div.prose` wrapper (its page is a bespoke section
  layout). For a page with no `div.prose` the extractor uses the whole page fragment as the root
  and applies the same drop rules and boundary, so all seven live guides sync.
- Conversion (design D4): a fixed element whitelist becomes Confluence storage format; every
  relative link and image source is rewritten to an absolute `https://cloudscript.io/...`
  URL resolved against `/apps/<slug>/`; figures become `ac:image` references to the website image
  (never attachments) followed by the caption; `pre > code` becomes the `code` macro; unknown
  elements are unwrapped to their children, so no text is ever dropped silently. The output is
  checked for XML well-formedness before any write.
- Page identity (design D2): each synced page carries the content property `cloudscript-kb`
  `{ slug, sourcePath, contentHash, syncedAt, commit }`. Pages are found by that property, never
  by title, so renaming an app keeps its page.
- Change-only writes (design D5): `contentHash = sha256(body + "\n" + title)`. A page whose stored
  hash matches is skipped; nothing else creates a new Confluence version.
- Retirement (design D6): a page whose slug is no longer `live` is retitled `[Archived] <title>`,
  moved under the `Archived guides` parent and stamped `archivedAt`. Nothing is ever deleted.

## How a run decides

For every `status: live` entry, in registry order and independently of the others:

1. The guide is extracted and converted; a page that fails extraction, conversion or the XML
   check is reported as `failed` before any write, and the run moves on.
2. The page is located by its `cloudscript-kb` property: the design's CQL search first, then a
   per-run index built by reading the property of every page in the space (Confluence indexes
   content properties for CQL only when an app declares them, so the index is the fallback that
   always works). The result table says which path found it.
3. No page: `create` under the space home page, then a single move so it sits before the next
   live app by registry `order` (design D7, on creation only). Page archived: `unarchive`. Stored
   hash equal to the computed hash: `unchanged`, no request. Otherwise `update` with
   `version.number + 1` and the message `kb-sync <short commit>`.
4. Every write is read back (title, version number, property hash) before it is reported.

Then every registry entry that is not live, and every synced page whose slug has left the
registry, is `archive`d if it is not already; an entry with no page is `skipped`. The run exits
non-zero if any page failed, after processing all of them, and prints a per-page table (also
appended to the job summary in Actions).

## Environment variables

The script reads credentials from `process.env` only, never from a file, and redacts the
`Authorization` header from every log line and error message.

| Variable                | Meaning                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `CONFLUENCE_BASE_URL`   | `https://cloudscript.atlassian.net`                                     |
| `CONFLUENCE_USER_EMAIL` | The dedicated service account's email address                           |
| `CONFLUENCE_API_TOKEN`  | Its API token, scoped to page, content-property and space read/write   |
| `KB_SPACE_KEY`          | `CSHELP`                                                                |
| `KB_SYNC_DRY_RUN`       | `1` performs reads only and prints every intended write                 |
| `GITHUB_SHA`            | Set by Actions; named in the version message and the page property      |
| `KB_SYNC_VERBOSE`       | `1` prints every request (method and path only) to stderr; `--verbose` too |

In GitHub Actions the four credentials are repository secrets with the same names. Nothing in
this repository holds a value for any of them.

## Dry run

`node scripts/kb-sync/sync.mjs --dry-run` (or `KB_SYNC_DRY_RUN=1`) performs reads only and prints
each intended create, update, skip and archive with the slug, title and hash, then exits without
writing. With no credentials in the environment the dry run uses an in-memory stand-in for the
REST layer that holds no pages, so it reports one `create` per live app; that is the mode used as
the commit gate and it needs no network. With credentials present the dry run reads the real space
and reports what a live run would do. Manual dispatch of the workflow defaults to a dry run.

## Running locally

```bash
cd scripts/kb-sync && npm ci && cd ../..
node --test tests/kb-sync/*.test.mjs
node scripts/kb-sync/sync.mjs --dry-run
```

Node 22 or newer. The only dependency is `parse5` (pinned exactly, one transitive package,
installed with `npm ci` against the committed lockfile). Live runs from a laptop work with the
same environment variables but the workflow is the intended path.

## Files

| File                     | Role                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `sync.mjs`               | Entry point and orchestration (`runSync`, the result table, the CLI)   |
| `registry.mjs`           | Reads `_data/apps/*.yml` with a strict flat-YAML subset parser         |
| `extract.mjs`            | The extraction boundary and the footer                                 |
| `convert.mjs`            | HTML to storage format, the no-text-lost check, the content hash       |
| `xml.mjs`                | Strict XML well-formedness parser for the converted body               |
| `confluence.mjs`         | The REST client: env-only credentials, redaction, the calls the sync needs |
| `mock-confluence.mjs`    | In-memory stand-in with the same interface, for the offline dry run and tests |
| `text.mjs`               | Escaping, whitespace normalisation and URL resolution helpers          |

## Tests

`tests/kb-sync/` holds one fixture per live app (a copy of `apps/<slug>/index.html` and of its
registry file), a frozen storage-format golden per app, and `node --test` suites for the
extraction boundary, the conversion rules, the REST client (mocked `fetch`, including the
redaction check) and the orchestration (mocked client). The goldens freeze the conversion
behaviour, not the live guide text: a guide edit does not touch them.
