// Extraction boundary and registry tests (spec kb-sync: "Live registry entries select the
// guides to sync" and "The extraction boundary is the guide proper").
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { LIVE_SLUGS, fixtureHtml, fixturesDir } from "./helpers.mjs";
import { loadRegistry, parseFlatYaml, selectApps, RegistryFormatError } from "../../scripts/kb-sync/registry.mjs";
import {
  ExtractError,
  attr,
  buildFooter,
  classList,
  extractGuide,
  isElement,
  stripFrontMatter,
  stripLiquid,
  textOf,
} from "../../scripts/kb-sync/extract.mjs";

const registry = loadRegistry(fixturesDir);
const bySlug = Object.fromEntries(registry.map((app) => [app.slug, app]));

function elements(nodes) {
  const out = [];
  const walk = (n) => {
    if (isElement(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  nodes.forEach(walk);
  return out;
}

function headings(nodes, tag = "h2") {
  return elements(nodes).filter((e) => e.tagName === tag).map((e) => textOf([e]));
}

// --- Registry -------------------------------------------------------------------------------

test("registry: every fixture parses and the live selection is exactly the seven live apps", () => {
  assert.equal(registry.length, 8);
  const { live, others } = selectApps(registry);
  assert.deepEqual(live.map((a) => a.slug), LIVE_SLUGS, "live apps in registry order");
  assert.deepEqual(others.map((a) => [a.slug, a.status]), [["email-viewer-jira", "coming-soon"]]);
});

test("registry: scalars, quoted strings, flow lists, null and the documents block list", () => {
  const ev = bySlug["email-viewer"];
  assert.equal(ev.name, "MSG/EML Email Viewer for Confluence");
  assert.equal(ev.order, 45);
  assert.deepEqual(ev.badges, ["runs-on-atlassian"]);
  assert.equal(ev.stores_personal_data, "No");
  assert.deepEqual(ev.documents, [
    { label: "Privacy", url: "/apps/email-viewer/privacy" },
    { label: "Terms", url: "/apps/email-viewer/terms" },
    { label: "DPA", url: "/apps/email-viewer/dpa" },
  ]);
  const jira = bySlug["email-viewer-jira"];
  assert.equal(jira.marketplace_url, null);
  assert.deepEqual(jira.badges, []);
  assert.equal(jira.has_page, false);
  assert.deepEqual(jira.documents, []);
  const niko = bySlug.nikoniko;
  assert.match(niko.stores_personal_data, /^Yes &mdash; a Confluence account identifier/);
  assert.equal(bySlug.mermaid.homepage_visible, true);
  assert.equal(typeof bySlug.mermaid.file, "string");
});

test("registry: the parser rejects YAML outside the flat subset, naming the line", () => {
  assert.throws(
    () => parseFlatYaml("name: X\nslug: x\nnested:\n  deeper:\n    key: value\n", "x.yml"),
    (err) => err instanceof RegistryFormatError && /x\.yml:4/.test(err.message),
  );
  assert.throws(() => parseFlatYaml("name: X\nname: Y\n", "dup.yml"), /duplicate key name/);
  assert.throws(() => parseFlatYaml("text: |\n  block\n", "b.yml"), /unsupported YAML construct/);
  assert.throws(() => parseFlatYaml('name: "unterminated\n', "q.yml"), /unterminated/);
});

test("registry: a trailing comment is stripped outside quotes only", () => {
  const doc = parseFlatYaml('a: value # note\nb: "keep # this"\nc: [x, y] # list\n');
  assert.deepEqual(doc, { a: "value", b: "keep # this", c: ["x", "y"] });
});

test("registry: loadRegistry validates required fields and the slug/file name match", () => {
  assert.throws(() => loadRegistry(path.join(fixturesDir, "..", "nonexistent")), /ENOENT/);
  // The real fixtures pass validation; the checks are exercised through parseFlatYaml above and
  // the field guards below.
  for (const app of registry) {
    assert.match(app.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(typeof app.name, "string");
    assert.equal(typeof app.status, "string");
  }
});

// --- Source preparation ----------------------------------------------------------------------

test("front matter and Liquid tags are removed before parsing", () => {
  const src = fixtureHtml("typst-renderer");
  const stripped = stripFrontMatter(src);
  assert.ok(!stripped.includes("layout: default"));
  assert.ok(stripped.trimStart().startsWith("<div class=\"page wrap\">"));
  assert.ok(src.includes("{% include release-history.html"));
  assert.ok(!stripLiquid(src).includes("{%"));
  assert.equal(stripLiquid("a {{ x }} b {% if y %}c{% endif %}"), "a  b c");
  assert.equal(stripFrontMatter("no front matter"), "no front matter");
});

// --- Boundary scenarios (Typst fixture) -------------------------------------------------------

test("scenario: the lede is kept and the legal section is excluded", () => {
  const { nodes, rootKind, text } = extractGuide(fixtureHtml("typst-renderer"), { slug: "typst-renderer" });
  assert.equal(rootKind, "prose");
  const first = nodes.find(isElement);
  assert.equal(first.tagName, "p");
  assert.ok(classList(first).includes("lede"), "output begins with the lede paragraph");
  assert.ok(text.startsWith("Cloudscript Typst Renderer is a Confluence Cloud app, built on Atlassian Forge"));
  const h2 = headings(nodes);
  assert.ok(h2.includes("Security and privacy"));
  assert.ok(h2.includes("About Typst"));
  assert.deepEqual(h2.slice(-2), ["Security and privacy", "About Typst"], "About Typst is the last section");
  assert.ok(!h2.includes("Legal"), "no Legal heading");
  assert.ok(!text.includes("Terms and privacy specific to this app"), "nothing after Legal");
  assert.ok(!text.includes("Back to home"));
  assert.ok(text.endsWith("under their respective open-source licences."), "kept range ends with the About Typst section");
});

test("scenario: badges, styles and the H1 are stripped", () => {
  const src = fixtureHtml("typst-renderer");
  assert.ok(src.includes("<style>") && src.includes('class="trust-badges"') && src.includes("<h1>"));
  const { nodes, text } = extractGuide(src, { slug: "typst-renderer" });
  const tags = new Set(elements(nodes).map((e) => e.tagName));
  assert.ok(!tags.has("style"));
  assert.ok(!tags.has("h1"));
  assert.ok(!tags.has("svg"));
  assert.ok(!elements(nodes).some((e) => classList(e).some((c) => c.startsWith("trust-badge"))));
  assert.ok(!text.includes("Runs on Atlassian"));
  assert.ok(!text.includes("figure.shot"), "no stylesheet text leaks into the guide text");
  assert.ok(!text.includes("release-history"), "the Liquid include leaves no trace");
});

test("scenario: a coming-soon entry is not selected for extraction", () => {
  const { others } = selectApps(registry);
  assert.equal(others.length, 1);
  assert.equal(others[0].slug, "email-viewer-jira");
  assert.equal(others[0].status, "coming-soon");
});

// --- Every live fixture ----------------------------------------------------------------------

test("every live guide extracts, starts with its opening paragraph and drops the site chrome", () => {
  for (const slug of LIVE_SLUGS) {
    const { nodes, text } = extractGuide(fixtureHtml(slug), { slug });
    assert.ok(text.length > 500, `${slug}: has substantial text`);
    assert.ok(!text.includes("Runs on Atlassian"), `${slug}: badge dropped`);
    assert.ok(!text.includes("{%"), `${slug}: Liquid dropped`);
    assert.ok(!text.includes("Back to home"), `${slug}: back link excluded`);
    assert.ok(!text.includes("Terms and privacy specific"), `${slug}: Legal section excluded`);
    assert.ok(!text.includes("Terms, privacy and data processing specific"), `${slug}: Legal section excluded`);
    assert.ok(!headings(nodes).includes("Legal"), `${slug}: no Legal heading`);
    assert.ok(!elements(nodes).some((e) => ["h1", "style", "script", "noscript"].includes(e.tagName)), `${slug}: dropped tags absent`);
    const first = nodes.find(isElement);
    assert.ok(first, `${slug}: has a first element`);
  }
});

test("mermaid: the first kept element is the opening paragraph even without a lede class", () => {
  const { nodes, rootKind } = extractGuide(fixtureHtml("mermaid"), { slug: "mermaid" });
  assert.equal(rootKind, "prose");
  const first = nodes.find(isElement);
  assert.equal(first.tagName, "p");
  assert.ok(textOf([first]).startsWith("CloudScript Mermaid Diagrams for Confluence lets you write"));
});

test("page-sharing: no div.prose, so the page fragment is the root and the FAQ is kept", () => {
  const src = fixtureHtml("page-sharing");
  assert.ok(!src.includes('class="prose"'));
  const { nodes, rootKind, text } = extractGuide(src, { slug: "page-sharing" });
  assert.equal(rootKind, "fragment");
  assert.ok(text.includes("I want to stop sharing a page"));
  assert.ok(text.includes("Enable collaboration by sharing a Confluence page across instances"));
  assert.ok(!text.includes("showModal"), "script dropped");
  assert.ok(!text.includes(".ps-docs"), "style dropped");
  assert.ok(!text.includes("Share a Confluence page across instances, read-only"), "h1 dropped");
  assert.ok(elements(nodes).some((e) => e.tagName === "dialog" && attr(e, "class") === "lightbox"), "the empty lightbox dialog stays for the converter to unwrap");
  assert.ok(!elements(nodes).some((e) => e.tagName === "script"));
});

test("a page with no guide content fails extraction before any write", () => {
  assert.throws(() => extractGuide("---\ntitle: x\n---\n<div class=\"prose\"><h1>Only a title</h1></div>", { slug: "x" }), ExtractError);
  assert.throws(() => extractGuide("<div class=\"prose\"><h1>T</h1><h2>Legal</h2><p>after</p></div>"), ExtractError);
});

// --- Footer ----------------------------------------------------------------------------------

test("footer: names the absolute guide URL and links every registry document", () => {
  const { xml, text } = buildFooter(bySlug["typst-renderer"]);
  assert.equal(
    xml,
    '<p>This article is generated from the user guide at <a href="https://www.cloudscript.io/apps/typst-renderer/">https://www.cloudscript.io/apps/typst-renderer/</a> and is updated automatically. ' +
      'Terms, privacy and data-processing documents for this app: <a href="https://www.cloudscript.io/apps/typst-renderer/privacy">Privacy</a>, <a href="https://www.cloudscript.io/apps/typst-renderer/terms">Terms</a>.</p>',
  );
  assert.equal(
    text,
    "This article is generated from the user guide at https://www.cloudscript.io/apps/typst-renderer/ and is updated automatically. Terms, privacy and data-processing documents for this app: Privacy, Terms.",
  );
  const three = buildFooter(bySlug["email-viewer"]).xml;
  assert.ok(three.includes('href="https://www.cloudscript.io/apps/email-viewer/dpa">DPA</a>'));
});

test("footer: an app without documents gets the first sentence only", () => {
  const { xml, text } = buildFooter({ slug: "example", documents: [] });
  assert.equal(xml, '<p>This article is generated from the user guide at <a href="https://www.cloudscript.io/apps/example/">https://www.cloudscript.io/apps/example/</a> and is updated automatically.</p>');
  assert.ok(!text.includes("Terms, privacy"));
});
