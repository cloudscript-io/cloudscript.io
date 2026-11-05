# add-guides-stream: tasks

A task is complete only when its verification passes. Keep the verification output for the
completion report.

## 0. Baseline (before any edit)

- [x] 0.1 Fetch `main` over HTTPS, confirm the local `main` equals `FETCH_HEAD`, branch
      `feat/guides-stream` from it.
- [x] 0.2 Build the site and copy `_site/news/feed.xml` and `_site/news/linkedin.xml` to a
      directory outside the repo as `SITE_DISCOVERY_FEED_BASELINE`; record their sha256.

## 1. Collection and naming (D1)

- [x] 1.1 `_config.yml`: `collections.guides` with `output: true` and `permalink: /guides/:name`,
      plus `guides_name: Guides`, each with a comment stating the rename recipe.
- [x] 1.2 Verify: after the build, `_site/guides/<slug>.html` exists and the page's canonical is
      `https://cloudscript.io/guides/<slug>` (extensionless, no trailing slash).

## 2. Layout, index, include (D3, D4, D5)

- [x] 2.1 `_layouts/guide.html` per D3.
- [x] 2.2 `guides/index.html` per D4; "Guides" linked in the nav and the footer next to "News".
- [x] 2.3 `_includes/guides-list.html` per D5, included on all eight app pages.
- [x] 2.4 Verify: the index lists the placeholder under Jira with its chip; the Jira email viewer
      page shows the list; the other seven app pages are unchanged in their built output apart
      from nothing (diff of `_site` before and after is empty for them).

## 3. Structured data and sitemap (D6, D7)

- [x] 3.1 Extend `_includes/structured-data.html` with the guide branch.
- [x] 3.2 Extend `sitemap.xml` with the guides loop.
- [x] 3.3 Verify: the tests in 5 pass; paste the built JSON-LD of the placeholder guide into the
      completion report.

## 4. Placeholder guide

- [x] 4.1 `_guides/original-email-on-jira-work-items-created-by-email.md` with the full front
      matter and the one-line comment body.

## 5. Spec and tests

- [x] 5.1 `openspec/specs/site-discovery/spec.md` deltas (sitemap lists guides; guide pages carry
      exactly one block of the D6 shape; the feeds are untouched) and the new `guides` spec.
- [x] 5.2 `tests/site-discovery/guides.test.mjs` covering every scenario in the two specs;
      `helpers.mjs` learns `_guides/` and `guides/` as sources and reads the two config values.
- [x] 5.3 Run `node --test tests/site-discovery/*.test.mjs tests/kb-sync/*.test.mjs
      tests/jira-options-sync/*.test.mjs` with the baseline variable set: all pass, feed
      byte-identity checked and passing.

## 6. Docs

- [x] 6.1 CLAUDE.md §3 "Guides" subsection and §4 repo-structure block.
- [x] 6.2 PROJECT_STATUS.md entry for this change.

## 7. Commit and hand over (no push, no merge)

- [x] 7.1 Small named commits as Natasha (author and email from `git log -1`), no attribution.
- [x] 7.2 Report: branch tip, test totals, served URL form observed in `_site`, anything not
      verified.

## 8. After Natasha publishes (not this change's work)

- [ ] 8.1 Live: `/guides/`, `/guides/<slug>` 200 with apex canonicals; `/sitemap.xml` lists the
      guide; the LinkedIn Zap shows no run; kb-sync reports every page unchanged.
- [ ] 8.2 Structured data checked in validator.schema.org.
