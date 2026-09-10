// Conversion tests (spec kb-sync: "Conversion produces valid Confluence storage format with
// absolute references" and the no-text-lost invariant), plus the frozen goldens.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LIVE_SLUGS, fixtureHtml, fixturesDir, goldenDir } from "./helpers.mjs";
import { loadRegistry } from "../../scripts/kb-sync/registry.mjs";
import { buildFooter, extractGuide } from "../../scripts/kb-sync/extract.mjs";
import { ConvertError, convertGuide, convertNodes, hashContent } from "../../scripts/kb-sync/convert.mjs";
import { XmlError, assertWellFormed, parseXmlFragment, xmlTextOf } from "../../scripts/kb-sync/xml.mjs";
import { parseFragment } from "../../scripts/kb-sync/node_modules/parse5/dist/index.js";

const bySlug = Object.fromEntries(loadRegistry(fixturesDir).map((app) => [app.slug, app]));
const TYPST_BASE = "https://www.cloudscript.io/apps/typst-renderer/";

/** Convert a snippet of HTML as if it were the kept range of a guide under `base`. */
function convertSnippet(html, base = TYPST_BASE) {
  return convertNodes(parseFragment(html).childNodes, { base });
}

const readGolden = (slug) => readFileSync(path.join(goldenDir, `${slug}.storage.xml`), "utf8");

// --- Spec scenarios --------------------------------------------------------------------------

test("scenario: relative links become absolute", () => {
  const { body } = convertGuide(fixtureHtml("typst-renderer"), bySlug["typst-renderer"]);
  assert.ok(body.includes('href="https://www.cloudscript.io/apps/typst-renderer/privacy"'));
  assert.ok(body.includes('href="https://www.cloudscript.io/security"'));
  assert.ok(body.includes('href="https://typst.app/"'), "absolute links pass through");
  assert.ok(!/href="\//.test(body), "no root-relative href survives");
  assert.ok(!/href="[a-z-]+\.(html|png)"/.test(body), "no file-relative href survives");
  assert.equal(
    convertSnippet('<p><a href="/apps/typst-renderer/privacy">x</a></p>'),
    '<p><a href="https://www.cloudscript.io/apps/typst-renderer/privacy">x</a></p>',
  );
  assert.equal(
    convertSnippet('<p><a href="#formats">x</a></p>'),
    '<p><a href="https://www.cloudscript.io/apps/typst-renderer/#formats">x</a></p>',
  );
  assert.equal(
    convertSnippet('<p><a href="privacy.html">x</a></p>', "https://www.cloudscript.io/apps/page-sharing/"),
    '<p><a href="https://www.cloudscript.io/apps/page-sharing/privacy.html">x</a></p>',
  );
});

test("scenario: a screenshot figure becomes an external image with its caption", () => {
  const out = convertSnippet(
    '<figure class="shot"><img src="render-maths.png"><figcaption>Maths rendered on the page</figcaption></figure>',
  );
  assert.equal(
    out,
    '<ac:image ac:align="center"><ri:url ri:value="https://www.cloudscript.io/apps/typst-renderer/render-maths.png"/></ac:image>\n' +
      "<p><em>Maths rendered on the page</em></p>",
  );
  const { body } = convertGuide(fixtureHtml("typst-renderer"), bySlug["typst-renderer"]);
  assert.ok(
    body.includes(
      '<ac:image ac:align="center"><ri:url ri:value="https://www.cloudscript.io/apps/typst-renderer/render-maths.png"/></ac:image>\n' +
        "<p><em>The bundled maths sample rendered live on the page: mathematics, prose and code, set in Typst's own fonts.</em></p>",
    ),
  );
});

test("scenario: malformed output never reaches Confluence (the validator rejects it)", () => {
  const bad = [
    "<p>unclosed",
    "<p>a</b>",
    "<p>&nbsp;</p>",
    "<p>a < b</p>",
    "<p a=b>x</p>",
    '<p a="1" a="2">x</p>',
    '<?xml version="1.0"?><p/>',
    "<p>x</p></p>",
    "<p>]]></p>",
    "<!DOCTYPE x><p/>",
  ];
  for (const xml of bad) {
    assert.throws(() => assertWellFormed(xml), XmlError, `rejects ${JSON.stringify(xml)}`);
  }
  const good = [
    "<p>a &amp; b &lt; c &#233; &#xE9;</p>",
    '<p><br/><a href="x?y=1&amp;z=2">l</a></p>',
    '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[x < y & z]]></ac:plain-text-body></ac:structured-macro>',
    '<ac:image ac:align="center"><ri:url ri:value="https://e/x.png"/></ac:image>',
    "<!-- note --><p>x</p>",
    "",
  ];
  for (const xml of good) {
    assert.doesNotThrow(() => assertWellFormed(xml), `accepts ${JSON.stringify(xml)}`);
  }
});

test("scenario: no text is lost (every live fixture, whitespace-normalised, plus the footer)", () => {
  for (const slug of LIVE_SLUGS) {
    const app = bySlug[slug];
    const extracted = extractGuide(fixtureHtml(slug), { slug });
    const footer = buildFooter(app);
    const { body } = convertGuide(fixtureHtml(slug), app);
    const footerText = xmlTextOf(parseXmlFragment(footer.xml));
    const expected = `${extracted.text} ${footerText}`.replace(/\s+/g, " ").trim();
    const actual = xmlTextOf(parseXmlFragment(body));
    assert.equal(actual, expected, `${slug}: converted text equals kept source text plus the footer`);
    assert.ok(actual.length > 500);
  }
});

test("convertGuide refuses a conversion that would lose or reorder text", () => {
  // A figure whose caption precedes its image and prose reorders text relative to the source
  // (the converter always emits the caption last), which the invariant must catch.
  const page =
    '<div class="prose"><h1>T</h1><p class="lede">Lede.</p>' +
    '<figure><figcaption>Caption first</figcaption><p>Body</p><img src="a.png"></figure></div>';
  assert.throws(() => convertGuide(page, { slug: "x", name: "X", documents: [] }), ConvertError);
  assert.throws(() => convertGuide(page, { slug: "x", name: "X", documents: [] }), /text was lost or reordered/);
});

// --- D4 element mapping ----------------------------------------------------------------------

test("pre > code becomes the code macro, with the language from a language-* class", () => {
  const out = convertSnippet("<pre><code>---\nconfig:\n  layout: elk\n---\nA --&gt; B</code></pre>");
  assert.equal(
    out,
    '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[---\nconfig:\n  layout: elk\n---\nA --> B]]></ac:plain-text-body></ac:structured-macro>',
  );
  const yaml = convertSnippet('<pre><code class="language-yaml">a: 1</code></pre>');
  assert.equal(
    yaml,
    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">yaml</ac:parameter><ac:plain-text-body><![CDATA[a: 1]]></ac:plain-text-body></ac:structured-macro>',
  );
  const tricky = convertSnippet("<pre><code>a]]&gt;b</code></pre>");
  assert.ok(tricky.includes("<![CDATA[a]]]]><![CDATA[>b]]>"), "a ]]> inside the code splits the CDATA section");
  assert.equal(xmlTextOf(parseXmlFragment(tricky)), "a]]>b");
});

test("an img outside a figure becomes a plain ac:image; an img without src is dropped", () => {
  const out = convertSnippet(
    '<img src="/apps/nikoniko/assets/guide-hero.png" alt="x" width="1520" loading="lazy" style="max-width:100%">',
    "https://www.cloudscript.io/apps/nikoniko/",
  );
  assert.equal(out, '<ac:image><ri:url ri:value="https://www.cloudscript.io/apps/nikoniko/assets/guide-hero.png"/></ac:image>');
  assert.equal(convertSnippet('<dialog class="lightbox"><img alt=""></dialog>'), "");
});

test("unknown elements are unwrapped: block-level ones as paragraph boundaries, inline ones transparently", () => {
  assert.equal(
    convertSnippet(
      '<details open><summary>Question <span class="limit">Limitation</span></summary><div class="answer">Answer <em>here</em>.</div></details>',
    ),
    "<p>Question Limitation</p>\n<p>Answer <em>here</em>.</p>",
  );
  assert.equal(convertSnippet('<section><div class="wrap"><h2>Head</h2><p>Para</p></div></section>'), "<h2>Head</h2>\n<p>Para</p>");
  assert.equal(
    convertSnippet('<div class="aside"><strong>Lead</strong><ul style="x"><li>one</li></ul></div>'),
    "<p><strong>Lead</strong></p>\n<ul><li>one</li></ul>",
  );
  assert.equal(
    convertSnippet(
      '<figure class="shot video"><video controls poster="p.jpg"><source src="d.mp4"><track src="d.vtt">Fallback <a href="https://y/">link</a>.</video><figcaption>Cap</figcaption></figure>',
    ),
    '<p>Fallback <a href="https://y/">link</a>.</p>\n<p><em>Cap</em></p>',
  );
  assert.equal(convertSnippet("<p>a<span>b</span>c<kbd>d</kbd></p>"), "<p>abcd</p>");
  assert.equal(convertSnippet("<h5>Deep</h5><hr><p>x</p>"), "<p>Deep</p>\n<p>x</p>");
});

test("the attribute whitelist keeps href, src, colspan and rowspan only", () => {
  const out = convertSnippet(
    '<h2 id="formats" class="x">H</h2>' +
      '<p class="lede" style="color:red">P <a href="https://e/" target="_blank" rel="noopener" class="btn">L</a> <code class="k">c</code></p>' +
      '<table class="t"><thead><tr><th colspan="2" scope="col">A</th></tr></thead><tbody><tr><td rowspan="2" style="x">B</td><td>C</td></tr></tbody></table>',
  );
  assert.equal(
    out,
    "<h2>H</h2>\n" +
      '<p>P <a href="https://e/">L</a> <code>c</code></p>\n' +
      '<table><thead><tr><th colspan="2">A</th></tr></thead><tbody><tr><td rowspan="2">B</td><td>C</td></tr></tbody></table>',
  );
  assert.ok(!/ (class|style|id|target|rel|scope|width|height|loading|alt)=/.test(out));
});

test("lists, tables and quotes keep stray content rather than dropping it", () => {
  assert.equal(
    convertSnippet("<ul><li>a<ul><li>b</li></ul></li>stray<li>c</li></ul>"),
    "<ul><li>a<ul><li>b</li></ul></li><li>stray</li><li>c</li></ul>",
  );
  // An unknown element inside a table is wrapped into a row so its text survives.
  assert.equal(
    convertSnippet("<table><caption>Cap</caption><tbody><tr><td>x</td></tr></tbody></table>"),
    "<table><tr><td><p>Cap</p></td></tr><tbody><tr><td>x</td></tr></tbody></table>",
  );
  // Text directly inside a table is foster-parented before the table by HTML parsing itself
  // (parse5 follows the specification); the converter keeps it as a paragraph.
  assert.equal(
    convertSnippet("<table><tr><td>x</td>loose</tr></table>"),
    "<p>loose</p>\n<table><tbody><tr><td>x</td></tr></tbody></table>",
  );
  assert.equal(
    convertSnippet("<blockquote>Quote <strong>b</strong><div>more</div></blockquote>"),
    "<blockquote>Quote <strong>b</strong><p>more</p></blockquote>",
  );
  assert.equal(convertSnippet("<p>  </p><h3></h3><p>x</p>"), "<p>x</p>", "empty blocks are not emitted");
  assert.equal(convertSnippet("<p>a<br>b</p>"), "<p>a<br/>b</p>");
});

test("entities in the source are emitted as characters, never as HTML entities", () => {
  const out = convertSnippet("<p>a &amp; b &rarr; c &mdash; d &quot;e&quot; &nbsp;f &lt;g&gt;</p>");
  // The non-breaking space is whitespace to the collapser, so it folds into the single space.
  assert.equal(out, '<p>a &amp; b \u2192 c \u2014 d "e" f &lt;g&gt;</p>');
  assert.doesNotThrow(() => assertWellFormed(out));
});

// --- Goldens ---------------------------------------------------------------------------------

test("goldens: every live guide converts to exactly its frozen storage-format document", () => {
  for (const slug of LIVE_SLUGS) {
    const app = bySlug[slug];
    const golden = readGolden(slug);
    const { title, body, contentHash, rootKind } = convertGuide(fixtureHtml(slug), app);
    assert.equal(
      `${body}\n`,
      golden,
      `${slug}: matches golden (run tests/kb-sync/update-goldens.mjs after a deliberate converter change)`,
    );
    assert.equal(title, app.name);
    assert.equal(rootKind, slug === "page-sharing" ? "fragment" : "prose");
    assert.doesNotThrow(() => assertWellFormed(golden));
    const expectedHash = createHash("sha256").update(`${body}\n${title}`).digest("hex");
    assert.equal(contentHash, expectedHash, `${slug}: hash is sha256(body + newline + title)`);
    assert.equal(hashContent(body, title), contentHash, "hashing is stable");
  }
});

test("goldens: only whitelisted storage-format elements appear, all references absolute", () => {
  const allowed = new Set([
    "p", "h2", "h3", "h4", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
    "strong", "em", "code", "a", "br", "blockquote",
    "ac:image", "ri:url", "ac:structured-macro", "ac:parameter", "ac:plain-text-body",
  ]);
  for (const slug of LIVE_SLUGS) {
    const golden = readGolden(slug);
    const names = new Set();
    const walk = (n) => {
      if (n.type === "element") {
        names.add(n.name);
        n.children.forEach(walk);
      }
    };
    parseXmlFragment(golden).forEach(walk);
    for (const name of names) assert.ok(allowed.has(name), `${slug}: <${name}> is in the D4 whitelist`);
    for (const m of golden.matchAll(/(?:href|ri:value)="([^"]*)"/g)) {
      assert.match(m[1], /^https?:\/\//, `${slug}: ${m[1]} is absolute`);
    }
    assert.ok(golden.includes(`href="https://www.cloudscript.io/apps/${slug}/"`), `${slug}: footer names the guide URL`);
    assert.ok(!golden.includes("Runs on Atlassian") && !golden.includes("{%") && !golden.includes("<h1"), `${slug}: chrome absent`);
  }
});

test("goldens: page-specific spot checks", () => {
  const mermaid = readGolden("mermaid");
  assert.ok(
    mermaid.includes(
      '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[---\nconfig:\n  layout: elk\n---\nflowchart TD\n  A --> B --> C\n  A --> C]]></ac:plain-text-body></ac:structured-macro>',
    ),
  );
  assert.ok(mermaid.startsWith('<p>CloudScript Mermaid Diagrams for Confluence lets you write <a href="https://mermaid.js.org/">Mermaid</a>'));
  const radar = readGolden("radar-renderer");
  assert.ok(radar.includes("<table><thead><tr><th>Column</th><th>Values</th><th>Notes</th></tr></thead><tbody><tr><td><code>name</code></td>"));
  assert.ok(
    radar.includes(
      '<p>Your browser does not play embedded video. <a href="https://www.youtube.com/watch?v=X9wxTSpgqzw">Watch the demo on YouTube</a>.</p>',
    ),
  );
  assert.ok(radar.includes("<ol><li><strong>Enter data in a table:</strong> Enter data directly into the table in the macro editor.</li>"));
  const niko = readGolden("nikoniko");
  assert.ok(niko.includes('<ac:image><ri:url ri:value="https://www.cloudscript.io/apps/nikoniko/assets/guide-hero.png"/></ac:image>'));
  assert.ok(niko.includes('href="https://www.cloudscript.io/apps/nikoniko/dpa"'));
  const ps = readGolden("page-sharing");
  assert.ok(ps.includes("<p>I want to stop sharing a page</p>"));
  assert.ok(ps.includes('href="https://www.cloudscript.io/apps/page-sharing/privacy.html"'));
  assert.ok(ps.includes('href="https://www.cloudscript.io/apps/page-sharing/#admin"'));
  assert.ok(
    ps.includes(
      '<ac:image ac:align="center"><ri:url ri:value="https://www.cloudscript.io/apps/page-sharing/network-architecture.svg"/></ac:image>',
    ),
  );
  assert.ok(!ps.includes("showModal") && !ps.includes("ps-docs"));
  const email = readGolden("email-viewer");
  assert.ok(
    email.includes(
      '<ac:image ac:align="center"><ri:url ri:value="https://www.cloudscript.io/apps/email-viewer/guide-hero.png"/></ac:image>\n<p><em>A .eml attachment rendered in place',
    ),
  );
  assert.ok(email.endsWith('<a href="https://www.cloudscript.io/apps/email-viewer/dpa">DPA</a>.</p>\n'));
});
