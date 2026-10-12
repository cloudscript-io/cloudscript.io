// Requirement: app guide pages carry SoftwareApplication structured data, and the home page
// Organization and WebSite (specs/site-discovery/spec.md). Reads the built site; see
// helpers.mjs for the fresh-build gate.
import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL, built, builtHtml, canonicalOf, jsonLdBlocks, liveApps, read, readSource } from "./helpers.mjs";

const apps = liveApps();
const guidePath = (slug) => `apps/${slug}/index.html`;
const FORBIDDEN = ["offers", "aggregateRating", "review"];

/** The single JSON-LD object on a page; fails unless there is exactly one block and it parses. */
function block(rel) {
  const blocks = jsonLdBlocks(read(rel));
  assert.equal(blocks.length, 1, `${rel}: exactly one application/ld+json block`);
  return JSON.parse(blocks[0]);
}

/** Every key at any depth of a parsed JSON value. */
function keysOf(value, out = new Set()) {
  if (Array.isArray(value)) for (const item of value) keysOf(item, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

test("each live app's guide has one SoftwareApplication block built from its registry entry", () => {
  assert.ok(apps.length > 0);
  for (const app of apps) {
    const rel = guidePath(app.slug);
    const data = block(rel);
    const expected = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: app.name,
      description: app.description,
      url: canonicalOf(read(rel)),
      applicationCategory: "BusinessApplication",
      operatingSystem: `Atlassian ${app.product} Cloud`,
      ...(app.feature_image ? { image: `${CANONICAL}${app.feature_image}` } : {}),
      ...(app.marketplace_url ? { installUrl: app.marketplace_url, sameAs: app.marketplace_url } : {}),
      publisher: { "@type": "Organization", name: "CloudScript.io", url: CANONICAL },
    };
    // Exact equality: every field comes from the registry or site config, and nothing else is emitted.
    assert.deepEqual(data, expected, rel);
    assert.equal(data.url, `${CANONICAL}/apps/${app.slug}/`);
    if (data.image) assert.ok(built(data.image.slice(CANONICAL.length + 1)), `${rel}: image ${data.image} is a built file`);
  }
});

test("scenario: live app (Tech Adoption Radar)", () => {
  const app = apps.find((a) => a.slug === "radar-renderer");
  const data = block(guidePath("radar-renderer"));
  assert.equal(data["@type"], "SoftwareApplication");
  assert.equal(data.name, app.name);
  assert.equal(data.operatingSystem, "Atlassian Confluence Cloud");
  assert.equal(data.url, canonicalOf(read(guidePath("radar-renderer"))));
  assert.equal(data.installUrl, app.marketplace_url);
  for (const key of FORBIDDEN) assert.ok(!keysOf(data).has(key), key);
});

test("scenario: Jira app", () => {
  assert.equal(apps.find((a) => a.slug === "email-viewer-jira").product, "Jira");
  assert.equal(block(guidePath("email-viewer-jira")).operatingSystem, "Atlassian Jira Cloud");
});

test("no page carries price, rating or review data", () => {
  for (const rel of builtHtml()) {
    for (const raw of jsonLdBlocks(read(rel))) {
      for (const key of FORBIDDEN) assert.ok(!keysOf(JSON.parse(raw)).has(key), `${rel}: ${key}`);
    }
  }
});

test("scenario: script breakout prevented (no </ inside any block, and every block parses)", () => {
  let seen = 0;
  for (const rel of builtHtml()) {
    const html = read(rel);
    const blocks = jsonLdBlocks(html);
    assert.equal(blocks.length, (html.match(/application\/ld\+json/g) ?? []).length, `${rel}: every JSON-LD script tag is a complete block`);
    for (const raw of blocks) {
      assert.ok(!raw.includes("</"), `${rel}: "</" inside a JSON-LD block`);
      assert.doesNotThrow(() => JSON.parse(raw), `${rel}: block parses as JSON`);
      seen += 1;
    }
  }
  assert.ok(seen > 0);
});

test("the include escapes every value it emits: jsonify, then </ to <\\/", () => {
  const include = readSource("_includes/structured-data.html").replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/, "");
  const outputs = include.match(/\{\{[\s\S]*?\}\}/g) ?? [];
  assert.ok(outputs.length > 0);
  for (const output of outputs) assert.match(output, /\| jsonify \| replace: "<\/", "<\\\/" \}\}$/, output);
  // A registry string that tried to close the block would come out harmless, and unchanged once parsed.
  const hostile = 'x</script><script>alert(1)</script>';
  const emitted = JSON.stringify(hostile).replaceAll("</", "<\\/");
  assert.ok(!emitted.includes("</"));
  assert.equal(JSON.parse(emitted), hostile);
});

test("scenario: home page has Organization and WebSite, both with the canonical url", () => {
  const data = block("index.html");
  const things = data["@graph"] ?? [data];
  const organization = things.find((t) => t["@type"] === "Organization");
  const website = things.find((t) => t["@type"] === "WebSite");
  assert.ok(organization && website);
  assert.equal(organization.url, "https://cloudscript.io");
  assert.equal(website.url, "https://cloudscript.io");
  assert.equal(organization.name, "CloudScript.io");
  assert.equal(website.name, "CloudScript.io");
  assert.match(organization.logo, /^https:\/\/cloudscript\.io\/.+\.png$/);
  assert.ok(built(organization.logo.slice(CANONICAL.length + 1)), `logo ${organization.logo} is a built file`);
});

test("Organization.sameAs lists only profiles the home page already links", () => {
  const html = read("index.html");
  const [raw] = jsonLdBlocks(html);
  const organization = JSON.parse(raw)["@graph"].find((t) => t["@type"] === "Organization");
  const page = html.replace(raw, "");
  assert.ok(Array.isArray(organization.sameAs) && organization.sameAs.length > 0);
  for (const url of organization.sameAs) assert.ok(page.includes(`href="${url}"`), `${url} is linked on the home page`);
});

test("only the home page and live app guides carry structured data", () => {
  const withBlocks = builtHtml().filter((rel) => jsonLdBlocks(read(rel)).length > 0);
  assert.deepEqual(withBlocks, ["index.html", ...apps.map((a) => guidePath(a.slug))].sort());
});
