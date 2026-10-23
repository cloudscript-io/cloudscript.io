// Requirement: guide sections are addressable (specs/site-discovery/spec.md, design D5).
// Every <h2> in a guide has an id, unless its enclosing <section> already has one, in which
// case the section's id is the address and the <h2> carries none. Ids are not required to
// match the heading text: a published id must survive a reworded heading.
// Reads the built site as well as the sources; see helpers.mjs for the fresh-build gate.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { headings, idsOf, liveApps, read, readSource, repoRoot, sourceFiles } from "./helpers.mjs";

const guides = sourceFiles().filter((rel) => /^apps\/[^/]+\/index\.html$/.test(rel));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEGACY = [
  ["apps/email-viewer-jira/index.html", "attach", "Attaching a file from an email to the work item"],
  ["apps/email-viewer/index.html", "page-exports", "Page exports (PDF and Word)"],
  ["apps/mermaid/index.html", "mermaid-versions", "Supported engines"],
  ["apps/radar-renderer/index.html", "formats", "Accepted Data Formats"],
];
const PAGE_SHARING_SECTIONS = ["how", "data-flow", "publisher", "subscriber", "space-admin", "admin", "faq"];

/** The D5 rule for one page's headings; `where` names the file in failure messages. */
function assertAddressable(list, where) {
  assert.ok(list.length > 0, `${where}: has <h2> headings`);
  for (const h of list) {
    if (h.sectionId) {
      assert.match(h.sectionId, ID, `${where}: section id "${h.sectionId}"`);
      assert.equal(h.id, null, `${where}: "${h.text}" sits in <section id="${h.sectionId}"> and must carry no id of its own`);
    } else {
      assert.ok(h.id, `${where}: "${h.text}" needs an id`);
      assert.match(h.id, ID, `${where}: id "${h.id}"`);
    }
  }
}

test("there is a guide for every live app", () => {
  const apps = liveApps();
  assert.ok(apps.length > 0);
  for (const app of apps) assert.ok(guides.includes(`apps/${app.slug}/index.html`), app.slug);
});

test("every <h2> in every guide source is addressable", () => {
  for (const rel of guides) assertAddressable(headings(readSource(rel)), rel);
});

test("every <h2> in every built guide is addressable, headings from includes among them", () => {
  for (const rel of guides) assertAddressable(headings(read(rel)), `_site/${rel}`);
});

test("ids are unique within each built guide", () => {
  for (const rel of guides) {
    const ids = idsOf(read(rel));
    const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(repeated, [], `_site/${rel}`);
  }
});

test("the four ids that predate this rule stay on their headings", () => {
  for (const [rel, id, text] of LEGACY) {
    for (const [html, where] of [[readSource(rel), rel], [read(rel), `_site/${rel}`]]) {
      const matches = headings(html).filter((h) => h.id === id);
      assert.equal(matches.length, 1, `${where}: one <h2 id="${id}">`);
      assert.equal(matches[0].text, text, `${where}: #${id}`);
    }
  }
});

test("the Legal heading is #legal wherever a guide has one", () => {
  let seen = 0;
  for (const rel of guides) {
    for (const h of headings(readSource(rel)).filter((x) => x.text === "Legal")) {
      assert.equal(h.id, "legal", rel);
      seen += 1;
    }
  }
  assert.ok(seen > 0);
});

test("scenario: deep link to a section (Mermaid, Layout engines)", () => {
  const rel = "apps/mermaid/index.html";
  const heading = headings(read(rel)).find((h) => h.text === "Layout engines (Dagre and ELK)");
  assert.ok(heading, "the heading is on the built page");
  assert.match(heading.id ?? "", ID);
  assert.equal(idsOf(read(rel)).filter((id) => id === heading.id).length, 1, `#${heading.id} names one element`);
});

test("scenario: heading inside a section that already has an id (Page Sharing)", () => {
  for (const html of [readSource("apps/page-sharing/index.html"), read("apps/page-sharing/index.html")]) {
    const list = headings(html);
    assert.deepEqual(list.map((h) => h.sectionId), PAGE_SHARING_SECTIONS);
    for (const h of list) assert.equal(h.id, null, `"${h.text}" carries no id of its own`);
    for (const id of PAGE_SHARING_SECTIONS) assert.equal(idsOf(html).filter((x) => x === id).length, 1, `#${id} names one element`);
  }
});

test("scenario: knowledge base unaffected (heading ids never change a guide's kb-sync content hash)", async () => {
  // kb-sync decides whether to write a Confluence page by this hash, so equal hashes mean a
  // dry run plans no update. Its converter needs parse5, kb-sync's one dependency.
  const load = (name) => import(pathToFileURL(path.join(repoRoot, "scripts", "kb-sync", name)).href);
  let extract;
  let convert;
  try {
    extract = await load("extract.mjs");
    convert = await load("convert.mjs");
  } catch (err) {
    assert.fail(`kb-sync's dependency is not installed (run \`npm ci\` in scripts/kb-sync): ${err.message}`);
  }
  const apps = liveApps();
  assert.ok(apps.length > 0);
  let stripped = 0;
  for (const app of apps) {
    const source = extract.readGuideSource(repoRoot, app.slug);
    const without = source.replace(/<h2\b[^>]*>/g, (tag) => {
      const bare = tag.replace(/\sid="[^"]*"/, "");
      if (bare !== tag) stripped += 1;
      return bare;
    });
    assert.equal(convert.convertGuide(source, app).contentHash, convert.convertGuide(without, app).contentHash, app.slug);
  }
  assert.ok(stripped > 0, "the comparison removed at least one heading id");
});
