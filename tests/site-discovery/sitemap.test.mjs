// Requirement: the sitemap lists every indexable page at its canonical URL
// (specs/site-discovery/spec.md). Reads the built site; see helpers.mjs for the fresh-build gate.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL,
  built,
  builtPathOf,
  canonicalOf,
  frontMatter,
  isNoindex,
  layoutPages,
  liveApps,
  posts,
  read,
  readSource,
  sitemap,
  sourceFiles,
} from "./helpers.mjs";

const { roots, urlset, entries } = sitemap();
const locs = entries.map((e) => e.loc);
const has = (urlPath) => locs.includes(`${CANONICAL}${urlPath}`);
// W3C datetime, the complete-date-plus-time form `date_to_xmlschema` emits.
const W3C_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

/** Built pages whose source front matter opts out with `sitemap: false`. */
function optedOut() {
  return sourceFiles()
    .filter((rel) => rel.endsWith(".html") && !rel.startsWith("_"))
    .filter((rel) => /^sitemap:\s*false\s*$/m.test(frontMatter(readSource(rel))));
}

test("sitemap.xml is a well-formed sitemaps.org urlset of <url><loc> entries and nothing else", () => {
  assert.equal(roots.length, 1, "one root element");
  assert.equal(urlset.name, "urlset");
  assert.deepEqual(urlset.attrs, { xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9" });
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.equal(entry.element, "url");
    assert.equal(entry.locCount, 1, `one <loc> per <url>: ${entry.loc}`);
    assert.deepEqual(entry.others, [], `no <priority>, <changefreq> or other child: ${entry.loc}`);
  }
  assert.equal(new Set(locs).size, locs.length, "no URL is listed twice");
});

test("every <loc> is on the canonical host, extensionless and never on www", () => {
  for (const loc of locs) {
    assert.ok(loc.startsWith(`${CANONICAL}/`), loc);
    assert.ok(!loc.includes(".html"), loc);
    assert.ok(!loc.includes("www."), loc);
  }
});

test("scenario: live app pages and posts are present, posts with a W3C <lastmod>", () => {
  const apps = liveApps();
  assert.ok(apps.length > 0);
  for (const app of apps) {
    for (const urlPath of [`/apps/${app.slug}/`, `/apps/${app.slug}/terms`, `/apps/${app.slug}/privacy`]) assert.ok(has(urlPath), urlPath);
    for (const doc of app.documents) assert.ok(has(doc.url), `${app.slug} registry document ${doc.url}`);
  }
  const all = posts();
  assert.ok(all.length > 0);
  for (const post of all) {
    const entry = entries.find((e) => e.loc === `${CANONICAL}${post.url}`);
    assert.ok(entry, post.url);
    assert.match(entry.lastmod ?? "", W3C_DATETIME, `${post.url} lastmod`);
    assert.equal(entry.lastmod.slice(0, 10), post.date, `${post.url} lastmod is the post's date`);
  }
});

test("only posts carry a <lastmod>", () => {
  const postUrls = new Set(posts().map((p) => `${CANONICAL}${p.url}`));
  for (const entry of entries) assert.equal(entry.lastmod !== null, postUrls.has(entry.loc), entry.loc);
});

test("scenario: non-indexable pages are omitted", () => {
  for (const urlPath of ["/404", "/404.html", "/suggest-thanks", "/share", "/share/"]) assert.ok(!has(urlPath), urlPath);
  for (const loc of locs) assert.ok(!isNoindex(read(builtPathOf(loc.slice(CANONICAL.length)))), `${loc} is not a noindex page`);
});

test("scenario: excluded internal paths are never listed, and are not in the build at all", () => {
  for (const word of ["openspec", "scripts", "tests", "content-drafts", "design-reference", "CLAUDE", "PROJECT_STATUS", "RUNBOOK"]) {
    for (const loc of locs) assert.ok(!loc.includes(word), `${loc} contains ${word}`);
  }
  for (const rel of ["openspec", "scripts", "tests", "content-drafts", "design-reference", "CLAUDE.md", "PROJECT_STATUS.md", "README.md", "apps/page-sharing/RUNBOOK.md"]) {
    assert.ok(!built(rel), `_site/${rel} must not exist`);
  }
});

test("scenario: sitemap and canonical agree", () => {
  for (const loc of locs) {
    const rel = builtPathOf(loc.slice(CANONICAL.length));
    assert.ok(built(rel), `${loc} is served from a built file (${rel})`);
    assert.equal(canonicalOf(read(rel)), loc, `${rel}: canonical equals its <loc>`);
  }
});

test("the sitemap lists every indexable built page, and nothing else", () => {
  const skip = new Set(optedOut());
  const expected = layoutPages()
    .filter((rel) => rel !== "404.html" && !skip.has(rel) && !isNoindex(read(rel)))
    .map((rel) => canonicalOf(read(rel)))
    .sort();
  assert.deepEqual([...locs].sort(), expected);
});
