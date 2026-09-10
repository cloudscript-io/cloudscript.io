# sync-guides-to-confluence-kb — design

## Context

- The site is hand-authored HTML with Jekyll used only for layouts (`_config.yml`: "no build pipeline"). Each live app has `apps/<slug>/index.html` (front matter: `layout`, `title`, `description`, `image`) whose `<div class="prose">` holds the guide: `<h1>`, a `.trust-badges` block, `p.lede`, intro paragraphs, then `<h2>` sections; the last section is `Legal` (links to app-scoped terms/privacy/DPA pages). Section headings vary by app (Typst: Adding a document, The configuration editor, What renders, Fonts, Page size and layout, Known limitations, Security and privacy, About Typst, Legal).
- The registry `_data/apps/<slug>.yml` carries `name`, `slug`, `status` (`live` | `coming-soon` | other), `product`, `marketplace_url`, `documents`. Seven entries are `live` as of 10 Sep 2026; `email-viewer-jira` is `coming-soon`.
- Confluence Cloud REST API v2 supports creating and updating pages with `body.representation = storage`, content properties on pages, and CQL search by property. The storage format is an XHTML subset plus `ac:`/`ri:` elements; external images are `<ac:image><ri:url ri:value="https://..."/></ac:image>`; code blocks are `<ac:structured-macro ac:name="code">`.
- JSM links a Confluence space to a service project as its knowledge base; the help centre exposes articles from that space to customers according to the space's article-viewing setting, and the virtual service agent answers from the same space.

## Goals / Non-Goals

**Goals**

- One page per live app in a dedicated knowledge base space, byte-for-byte derived from the website guide, updated on every push to `main` that changes a guide, with no manual step.
- Change-only writes (no version churn), safe re-runs, a dry-run that prints the exact intended writes.
- Least-privilege credentials and a one-way data flow.

**Non-Goals**

- Two-way editing (Confluence edits are overwritten on the next sync by design; the space description says so).
- Syncing legal pages, news posts, the trust or security pages, or any page outside `apps/<slug>/index.html`.
- Uploading images as attachments (external references keep screenshots in sync without re-uploads; if Confluence ever blocks external images in KB articles, the fallback is a per-run attachment upload, deferred until needed).
- Configuring JSM (space link, article visibility, virtual agent) from code.
- Replacing or touching the existing Atlassian Resources space.

## Decisions

- **D1 Target space.** A new space, key `CSHELP`, title `Cloudscript Help`, created by Natasha with the service account as its only editor besides site admins; anonymous/customer viewing is governed by JSM's knowledge base setting, not by the space itself. Rationale: the Atlassian Resources space is an internal summary layer with different authorship; mixing them would put internal notes in the virtual agent's reach.
- **D2 Page identity.** Each synced page carries a content property `cloudscript-kb` with `{ slug, sourcePath, contentHash, syncedAt, commit }`. The script finds a page by CQL `space = CSHELP and type = page and property.cloudscript-kb.slug = "<slug>"`. Title is `<registry name>` and is updated if the name changes. Rationale: titles are user-facing and may change; the slug is the stable key.
- **D3 Extraction boundary.** From `div.prose`: drop the `<h1>` (Confluence shows the title), drop `.trust-badges`, `<style>`, `<script>`, `<noscript>`; keep everything from the first remaining element up to but excluding the `<h2>Legal</h2>` heading (or end of `.prose` if absent). Append a fixed footer: a paragraph "This article is generated from the user guide at <absolute app URL> and is updated automatically. Terms, privacy and data-processing documents for this app: <links from the registry `documents` list>." Rationale: keeps the legal texts single-sourced on the dated website pages while giving the agent a pointer.
- **D4 Conversion rules.** `p`, `h2`..`h4`, `ul`/`ol`/`li`, `table`/`thead`/`tbody`/`tr`/`th`/`td`, `strong`/`em`/`code` (inline), `a` (href rewritten to absolute), `br`, `blockquote` pass through as XHTML. `pre > code` becomes the `code` macro with `language` from a `language-*` class if present. `figure.shot` becomes `<ac:image ac:align="center"><ri:url ri:value="ABS"/></ac:image>` followed by the `figcaption` text as an italic paragraph. `img` outside a figure becomes `ac:image`. `aside`, `details`, `summary` and any unknown element are unwrapped to their children (content is never dropped silently; a test asserts no text nodes are lost). Attributes other than `href`, `src`, `colspan`, `rowspan` are removed. Output is serialised as well-formed XML and validated by a parser before any write.
- **D5 Hashing and idempotence.** `contentHash = sha256(storageBody + "\n" + title)`. If a page exists and its property hash equals the computed hash, the page is skipped and reported as `unchanged`. Otherwise the page is updated with `version.number + 1` and `version.message = "kb-sync <short commit>"`.
- **D6 Retirement.** If a page exists for a slug that is now absent from the registry or not `live`, the page is retitled `[Archived] <title>`, moved under a parent page `Archived guides` (created on demand), and its property gains `archivedAt`. It is never deleted. A slug that returns to `live` is un-archived by the same mechanism in reverse.
- **D7 Ordering.** Registry `order` (or name) drives sibling ordering under the space home page via the move endpoint only when a page is created; existing ordering is not rewritten on every run (avoids needless writes).
- **D8 Credentials and scope.** Secrets `CONFLUENCE_BASE_URL` (`https://cloudscript.atlassian.net`), `CONFLUENCE_USER_EMAIL`, `CONFLUENCE_API_TOKEN` (scoped token: `read:page:confluence`, `write:page:confluence`, `read:content.property:confluence`, `write:content.property:confluence`, `read:space:confluence`), `KB_SPACE_KEY`. The service account is a dedicated Atlassian account (proposed `support-sync@cloudscript.io`) with product access to Confluence only and space permissions only on `CSHELP`. The script reads secrets from `process.env`, never from files, and redacts the `Authorization` header in any error output.
- **D9 Workflow hardening.** `permissions: { contents: read }`; `concurrency: { group: kb-sync, cancel-in-progress: false }`; actions pinned by commit SHA; `npm ci` with committed lockfile; `timeout-minutes: 10`; on any failure the job fails loudly (no partial-success masking), and per-page results are printed as a table in the job summary. Dry run: `workflow_dispatch` input `dry_run` (default `true`) and env `KB_SYNC_DRY_RUN=1`, under which the script performs reads only and prints each intended create/update/archive with the title, slug and hash.
- **D10 Failure semantics.** Pages are processed independently; one failing page does not block the others, but the run exits non-zero if any page failed, and the summary names it. A malformed guide (extractor cannot find `div.prose`, or XML validation fails) fails that page before any write.
- **D11 Local dev.** `node scripts/kb-sync/sync.mjs --dry-run` works with no secrets (fixtures only, mocked REST). Live runs from a laptop are possible with the same env vars but are discouraged; the workflow is the intended path.

## Risks / Trade-offs

- Confluence may render external images poorly or block them in some contexts; mitigated by D4's fallback plan and verified in the live run report.
- Storage format is more permissive than the v2 API validates; an unexpected element could 400. Mitigated by the whitelist in D4 and a fixture per app so every live guide is exercised in tests before it is ever synced.
- The virtual agent quotes text; a badly worded guide sentence becomes a badly worded answer. That is already true of the website and is a content-quality matter, not a sync matter.
- Scoped API tokens are newer than classic tokens; if a required scope is unavailable at setup time the fallback is a classic token on the same restricted service account, recorded in the run report.
