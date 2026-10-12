// Requirement: canonical URLs use the canonical host (specs/site-discovery/spec.md).
// Reads the built site; see helpers.mjs for the fresh-build gate.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CANONICAL,
  builtHtml,
  builtPathOf,
  built,
  canonicalOf,
  configValue,
  layoutPages,
  metaOf,
  posts,
  read,
  readBytes,
} from "./helpers.mjs";

const WWW = "https://www.cloudscript.io";
const FEEDS = ["feed.xml", "linkedin.xml"];

test("config: canonical_url is the apex and url: is still www (the feeds' entry ids depend on it)", () => {
  assert.equal(CANONICAL, "https://cloudscript.io");
  assert.equal(configValue("url"), WWW);
});

test("every layout page declares canonical, og:url, og:image and twitter:image on the canonical host", () => {
  const pages = layoutPages();
  assert.ok(pages.length > 0);
  for (const rel of pages) {
    const html = read(rel);
    const canonical = canonicalOf(html);
    assert.ok(canonical, `${rel}: has a canonical`);
    assert.ok(canonical.startsWith(`${CANONICAL}/`), `${rel}: canonical ${canonical} is on ${CANONICAL}`);
    // The canonical names this very file, at the URL GitHub Pages serves it from.
    assert.equal(builtPathOf(canonical.slice(CANONICAL.length)), rel, `${rel}: canonical ${canonical}`);
    if (rel !== "404.html") assert.ok(!canonical.endsWith(".html"), `${rel}: canonical has no .html`);
    assert.equal(metaOf(html, "property", "og:url"), canonical, `${rel}: og:url equals the canonical`);
    for (const [key, name] of [["property", "og:image"], ["name", "twitter:image"]]) {
      const image = metaOf(html, key, name);
      assert.ok(image, `${rel}: has ${name}`);
      assert.ok(image.startsWith(`${CANONICAL}/`), `${rel}: ${name} ${image} is on ${CANONICAL}`);
      // Fails if a page ever sets `image:` to something other than a root-relative path.
      assert.ok(built(image.slice(CANONICAL.length + 1)), `${rel}: ${name} ${image} is a built file`);
    }
  }
});

test("no built page names the www host in a canonical, og: or twitter: tag", () => {
  for (const rel of builtHtml()) {
    const tags = read(rel).match(/<(?:link rel="canonical"|meta (?:property="og:|name="twitter:))[^>]*>/g) ?? [];
    for (const tag of tags) assert.ok(!tag.includes("www.cloudscript.io"), `${rel}: ${tag}`);
  }
});

test("scenario: app page canonical", () => {
  const html = read("apps/radar-renderer/index.html");
  assert.equal(canonicalOf(html), "https://cloudscript.io/apps/radar-renderer/");
  assert.equal(metaOf(html, "property", "og:url"), "https://cloudscript.io/apps/radar-renderer/");
});

test("scenario: flat page canonical is extensionless", () => {
  assert.equal(canonicalOf(read("support.html")), "https://cloudscript.io/support");
});

test("the home page and every post have apex canonicals", () => {
  assert.equal(canonicalOf(read("index.html")), "https://cloudscript.io/");
  const all = posts();
  assert.ok(all.length > 0);
  for (const post of all) assert.equal(canonicalOf(read(builtPathOf(post.url))), `${CANONICAL}${post.url}`, post.file);
});

test("the feeds still build every id on www, so the LinkedIn Zap sees no new items", () => {
  for (const feed of FEEDS) {
    const ids = [...read(`news/${feed}`).matchAll(/<id>([^<]*)<\/id>/g)].map((m) => m[1]);
    assert.ok(ids.length > 1, `${feed}: has entry ids`);
    for (const id of ids) assert.ok(id.startsWith(`${WWW}/`), `${feed}: ${id}`);
  }
});

// The baseline is a directory holding feed.xml and linkedin.xml built from the commit before
// a change (openspec task 0.2). Without it there is nothing to compare against, so the check
// is skipped and says so.
const baseline = process.env.SITE_DISCOVERY_FEED_BASELINE;
const skip = baseline ? false : "SITE_DISCOVERY_FEED_BASELINE is not set, so feed byte-identity was NOT checked";

test("scenario: feeds are untouched (byte-identical to the baseline build)", { skip }, () => {
  for (const feed of FEEDS) {
    const before = path.join(baseline, feed);
    assert.ok(existsSync(before), `baseline ${before} exists`);
    assert.ok(readFileSync(before).equals(readBytes(`news/${feed}`)), `news/${feed} is byte-identical to ${before}`);
  }
});
