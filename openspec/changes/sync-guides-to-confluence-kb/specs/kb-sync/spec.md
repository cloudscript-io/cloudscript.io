# kb-sync (delta)

## ADDED Requirements

### Requirement: Live registry entries select the guides to sync

The sync SHALL treat `_data/apps/<slug>.yml` as the only source of truth for which guides exist and which are current. Exactly the entries with `status: live` SHALL be synced, each from `apps/<slug>/index.html`. Entries with any other status, and pages whose slug no longer appears in the registry, SHALL be archived, never deleted.

#### Scenario: a live entry is synced

- **GIVEN** `_data/apps/typst-renderer.yml` has `status: live` and `apps/typst-renderer/index.html` exists
- **WHEN** the sync runs
- **THEN** exactly one knowledge base page exists whose `cloudscript-kb` property has `slug = "typst-renderer"`, titled with the registry `name`

#### Scenario: a coming-soon entry is not synced

- **GIVEN** `_data/apps/email-viewer-jira.yml` has `status: coming-soon`
- **WHEN** the sync runs
- **THEN** no page is created for `email-viewer-jira`, and the run summary lists it as `skipped (status: coming-soon)`

#### Scenario: a retired entry is archived, not deleted

- **GIVEN** a knowledge base page exists with property `slug = "example"` and the registry no longer lists `example` as `live`
- **WHEN** the sync runs
- **THEN** the page is retitled `[Archived] <previous title>`, moved under the `Archived guides` parent page, its property gains `archivedAt`, and no page is deleted

### Requirement: The extraction boundary is the guide proper

From the page's `div.prose`, the sync SHALL drop the `<h1>`, the `.trust-badges` block, and every `<style>`, `<script>` and `<noscript>` element; SHALL keep every remaining element from the first (the `p.lede`) up to but excluding the `<h2>` whose text is `Legal`; and SHALL append a fixed footer paragraph naming the absolute guide URL and linking each document in the registry's `documents` list. No text node from the kept range SHALL be lost in conversion.

#### Scenario: the lede is kept and the legal section is excluded

- **GIVEN** the Typst guide fixture with sections ending in `Security and privacy`, `About Typst`, `Legal`
- **WHEN** the guide body is extracted
- **THEN** the output begins with the lede paragraph, contains the `Security and privacy` and `About Typst` sections, and contains neither the `Legal` heading nor any content after it, except the generated footer

#### Scenario: badges, styles and the H1 are stripped

- **GIVEN** the same fixture, which contains a `<style>` block, a `.trust-badges` anchor and an `<h1>`
- **WHEN** the guide body is extracted
- **THEN** none of `<style>`, `trust-badge` or an `<h1>` appear in the output

#### Scenario: no text is lost

- **GIVEN** any live guide fixture
- **WHEN** the guide body is extracted and converted
- **THEN** the concatenated text content of the converted body equals the concatenated text content of the kept source range (whitespace-normalised), plus the footer

### Requirement: Conversion produces valid Confluence storage format with absolute references

The sync SHALL convert the kept HTML to Confluence storage format using only the element mapping in design D4, SHALL rewrite every relative `href` and `src` to an absolute `https://www.cloudscript.io` URL, SHALL express images as `ac:image` with `ri:url`, SHALL express `pre > code` as the `code` macro, SHALL unwrap unknown elements to their children rather than dropping them, and SHALL validate the result as well-formed XML before any write.

#### Scenario: relative links become absolute

- **GIVEN** a guide containing `<a href="/apps/typst-renderer/privacy">`
- **WHEN** the body is converted
- **THEN** the output contains `href="https://www.cloudscript.io/apps/typst-renderer/privacy"`

#### Scenario: a screenshot figure becomes an external image with its caption

- **GIVEN** a guide containing `<figure class="shot"><img src="render-maths.png"><figcaption>Maths rendered on the page</figcaption></figure>` under `apps/typst-renderer/`
- **WHEN** the body is converted
- **THEN** the output contains `<ac:image ac:align="center"><ri:url ri:value="https://www.cloudscript.io/apps/typst-renderer/render-maths.png"/></ac:image>` followed by a paragraph containing `Maths rendered on the page`

#### Scenario: malformed output never reaches Confluence

- **GIVEN** a conversion whose serialised output fails XML parsing
- **WHEN** the sync processes that app
- **THEN** that app is reported as failed, no write is attempted for it, and the run exits non-zero after processing the remaining apps

### Requirement: Writes are idempotent and change-only

The sync SHALL locate a page by the `cloudscript-kb.slug` property, SHALL compute `sha256(body + "\n" + title)`, SHALL skip the update when the stored hash equals the computed hash, and SHALL otherwise update the page body, title and property in one run with a version message naming the commit.

#### Scenario: an unchanged guide creates no new version

- **GIVEN** a synced page whose stored hash equals the hash computed from the current source
- **WHEN** the sync runs
- **THEN** no update request is sent and the page's version number is unchanged

#### Scenario: a changed guide creates exactly one new version

- **GIVEN** a synced page and a source guide edited in one paragraph
- **WHEN** the sync runs
- **THEN** exactly one update request is sent for that page, its version increments by one, and the property hash equals the new computed hash

#### Scenario: a renamed app keeps its page

- **GIVEN** a synced page for slug `mermaid` and a registry `name` changed from the previous title
- **WHEN** the sync runs
- **THEN** the same page (same page id) is updated with the new title; no second page is created

### Requirement: Triggers, dry run and failure reporting

The workflow SHALL run on push to `main` when paths under `apps/**/index.html`, `_data/apps/`, or `scripts/kb-sync/` change, and on manual dispatch with a `dry_run` input defaulting to true. In dry run the sync SHALL perform reads only and print every intended create, update, skip and archive with slug, title and hash. Pages SHALL be processed independently; the run SHALL exit non-zero if any page failed and SHALL print a per-page result table in the job summary.

#### Scenario: a push that touches no guide does not run the sync

- **GIVEN** a push to `main` changing only `news/index.html`
- **WHEN** GitHub evaluates the workflow triggers
- **THEN** the kb-sync workflow does not run

#### Scenario: dry run writes nothing

- **GIVEN** `KB_SYNC_DRY_RUN=1` and a registry with seven live apps, none yet synced
- **WHEN** the sync runs
- **THEN** seven `create` intentions are printed and no create, update or property request is sent

#### Scenario: one failing page does not hide the others

- **GIVEN** seven live apps of which one has a guide that fails XML validation
- **WHEN** the sync runs live
- **THEN** six pages are created or updated, the seventh is reported as failed by name, and the job exits non-zero

### Requirement: Credentials are least-privilege and never exposed

The sync SHALL read `CONFLUENCE_BASE_URL`, `CONFLUENCE_USER_EMAIL`, `CONFLUENCE_API_TOKEN` and `KB_SPACE_KEY` from environment variables only; SHALL be documented and set up to run as a dedicated service account with space permissions only on the knowledge base space and a scoped API token limited to page, content-property and space read/write; and SHALL redact the `Authorization` header from every log line and error message. The workflow SHALL declare `permissions: contents: read`, pin actions by commit SHA, and use a concurrency group.

#### Scenario: an API error is logged without the token

- **GIVEN** a Confluence request that fails with a 4xx response
- **WHEN** the error is reported
- **THEN** the output contains the status, the request path and the response body, and contains neither the token nor the Basic-auth header value

#### Scenario: the workflow cannot write to the repository

- **GIVEN** the committed `kb-sync.yml`
- **WHEN** its `permissions` block is read
- **THEN** it grants `contents: read` and nothing else
