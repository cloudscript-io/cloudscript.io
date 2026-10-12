# add-search-and-ai-discovery: tasks

A task is complete only when its verification passes. Keep the verification output for the
completion report.

## 0. Baseline (before any edit)

- [ ] 0.1 Confirm the working tree is clean and on `main` level with `origin/main`
      (`git status -sb`, `git log -1 --oneline`).
- [ ] 0.2 Build the site (`export PATH="/opt/homebrew/opt/ruby/bin:$PATH"; bundle exec jekyll build`)
      and copy `_site/news/feed.xml` and `_site/news/linkedin.xml` to a scratch directory outside
      the repo as the feed baseline. Record their `shasum -a 256`.
- [ ] 0.3 For each `apps/<slug>/index.html`, record the kb-sync content hash of the current
      version using the exported functions in `scripts/kb-sync/convert.mjs` (the same path the
      sync uses to compute `contentHash`). Save as the kb-sync baseline (slug, hash).
- [ ] 0.4 Confirm `site.html_pages` is available on the GitHub Pages Jekyll version (Pages
      dependency versions page, checked in-session, version recorded). If not, use the fallback in
      design D3.

## 1. Canonical host (D1)

- [ ] 1.1 Add `canonical_url: https://cloudscript.io` to `_config.yml` with a comment stating that
      `url:` must not change because the feeds' `<id>`s depend on it (LinkedIn Zap).
- [ ] 1.2 In `_layouts/default.html`, build canonical, `og:url`, `og:image` and `twitter:image`
      from `site.canonical_url` + the root-relative path. Do not touch the feeds.
- [ ] 1.3 Verify: rebuild; canonical of `/`, `/support`, `/apps/radar-renderer/` and one post are
      on `https://cloudscript.io` with no `.html`; `shasum` of both feeds equals the 0.2 baseline.

## 2. robots.txt (D2)

- [ ] 2.1 Add `robots.txt` at the repo root: comment recording the 13 Oct 2026 allow decision,
      `User-agent: *`, `Allow: /`, `Sitemap: https://cloudscript.io/sitemap.xml`. No `Disallow`.
- [ ] 2.2 Verify: present in `_site/robots.txt`; tests in 6.1 pass.

## 3. sitemap.xml (D3)

- [ ] 3.1 Add `sitemap.xml` (`layout: null`, Liquid) per design D3. Add `noindex: true` or
      `sitemap: false` only where the page already intends not to be indexed; do not change any
      page's indexing status.
- [ ] 3.2 Verify: `_site/sitemap.xml` is well-formed; tests in 6.1 pass.

## 4. Structured data (D4)

- [ ] 4.1 Add `_includes/structured-data.html` and include it once in the `<head>` of
      `_layouts/default.html`.
- [ ] 4.2 For the home page `Organization.sameAs`, use only URLs already linked on the live site;
      list which (or state none) in the completion report.
- [ ] 4.3 Verify: tests in 6.1 pass; paste the built JSON-LD of `/apps/radar-renderer/`,
      `/apps/email-viewer-jira/` and `/` into the completion report.

## 5. Section anchors (D5)

- [ ] 5.1 Add an `id` to every `<h2>` in `apps/*/index.html` per the D5 rule, keeping the four
      existing IDs. No other edits to those files.
- [ ] 5.2 Verify: `git diff --stat apps/` shows only `index.html` files; `git diff apps/` contains
      only `id="..."` additions on `<h2>` lines (state how this was checked).
- [ ] 5.3 Verify kb-sync impact offline: recompute each guide's content hash as in 0.3 and confirm
      every hash equals its baseline. If any differs, stop and report the slug and the reason
      before going further.

## 6. Tests

- [ ] 6.1 Add `tests/site-discovery/*.test.mjs` (Node built-ins only) covering every scenario in
      `specs/site-discovery/spec.md`, reading a fresh `_site` build (fail with a clear message if
      `_site` is missing or older than the sources). The feed byte-identity scenario reads the 0.2
      baseline path from an environment variable and is skipped, with a visible notice, when unset.
- [ ] 6.2 Run `node --test tests/site-discovery/*.test.mjs tests/kb-sync/*.test.mjs
      tests/jira-options-sync/*.test.mjs` with the baseline variable set; all pass.

## 7. Docs

- [ ] 7.1 CLAUDE.md §4: add `robots.txt`, `sitemap.xml`, `_includes/structured-data.html` and the
      `canonical_url` rule to the repo structure. §9 publish checklist: a new page appears in the
      sitemap at its canonical URL (or carries `noindex`/`sitemap: false` deliberately), and new
      guide `<h2>`s carry IDs.
- [ ] 7.2 PROJECT_STATUS.md: one dated entry for this change, including the frozen `url:` and why.

## 8. Commit and hand over (no push)

- [ ] 8.1 Commit on `main` in logical checkpoints (no attribution of any kind, CLAUDE.md §8).
      Do not push: Natasha pushes.

## 9. Live verification (after Natasha pushes)

- [ ] 9.1 `curl -sI https://cloudscript.io/robots.txt` and `/sitemap.xml`: 200 and sensible
      `content-type`; `curl -s` both and confirm they match the build.
- [ ] 9.2 `curl -sI https://www.cloudscript.io/support`: a 301 to `https://cloudscript.io/support`.
- [ ] 9.3 Canonical on the live `/`, `/support`, `/apps/mermaid/` and one post equals the apex URL.
- [ ] 9.4 The kb-sync and jira-options-sync runs for the push are green, and the kb-sync log
      reports no page updates.
- [ ] 9.5 The Zapier LinkedIn Zap shows no new runs triggered by the push (Natasha checks; Claude
      Code cannot see Zapier).
- [ ] 9.6 Owner, optional: submit the sitemap in Google Search Console and Bing Webmaster Tools.
