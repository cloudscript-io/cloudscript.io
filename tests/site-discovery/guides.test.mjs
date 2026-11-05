// Requirement: the guides stream (specs/guides/spec.md) and its site-discovery deltas (the
// sitemap lists guides; a guide page carries one TechArticle, plus FAQPage, JSON-LD block; the
// feeds are untouched). Reads the built site; see helpers.mjs for the fresh-build gate. The
// FAQPage, script-breakout, grouping and ordering scenarios need guides the repository does not
// ship, so one test builds a scratch copy of the sources with two fixture guides added and
// reads that build; nothing is written inside the repository.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  CANONICAL,
  GUIDES_NAME,
  GUIDES_URL,
  built,
  builtPathOf,
  canonicalOf,
  guides,
  jsonLdBlocks,
  layoutPages,
  liveApps,
  markupOnly,
  read,
  readSource,
  repoRoot,
  sitemap,
} from "./helpers.mjs";

const BYLINE = "Created by the Cloudscript team";
const all = guides();
const apps = liveApps();
const appBySlug = (slug) => apps.find((a) => a.slug === slug);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const shortDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${iso.slice(0, 4)}`;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const hrefs = (html) => [...markupOnly(html).matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]);

/** The single JSON-LD object on a page; fails unless there is exactly one block and it parses. */
function block(html, where) {
  const blocks = jsonLdBlocks(html);
  assert.equal(blocks.length, 1, `${where}: exactly one application/ld+json block`);
  return JSON.parse(blocks[0]);
}

function assertTechArticle(data, guide, html, where) {
  const app = appBySlug(guide.app);
  assert.ok(app, `${where}: app ${guide.app} is a live registry entry`);
  assert.equal(data["@context"], "https://schema.org", where);
  assert.ok(Array.isArray(data["@graph"]), `${where}: @graph`);
  const article = data["@graph"].find((n) => n["@type"] === "TechArticle");
  assert.ok(article, `${where}: TechArticle node`);
  const expected = {
    "@type": "TechArticle",
    headline: guide.title,
    description: guide.description,
    datePublished: guide.date,
    dateModified: guide.checked,
    ...(guide.image ? { image: `${CANONICAL}${guide.image}` } : {}),
    author: { "@type": "Organization", name: "CloudScript.io", url: CANONICAL },
    publisher: { "@type": "Organization", name: "CloudScript.io", url: CANONICAL },
    about: { "@type": "SoftwareApplication", name: app.name, url: `${CANONICAL}/apps/${app.slug}/` },
    mainEntityOfPage: canonicalOf(html),
  };
  assert.deepEqual(article, expected, where);
  return data["@graph"];
}

// --- the real build -----------------------------------------------------------------------------

test("config: the stream has one display name and one URL segment, read from _config.yml", () => {
  assert.ok(GUIDES_NAME && GUIDES_NAME.trim().length > 0, "guides_name");
  assert.match(GUIDES_URL, /^\/[a-z0-9-]+\/$/, GUIDES_URL);
  assert.ok(all.length > 0, "there is at least one guide");
});

test("scenario: served form (each guide is a flat file under the segment, canonical extensionless)", () => {
  for (const guide of all) {
    const rel = builtPathOf(guide.url);
    assert.equal(rel, `${GUIDES_URL.slice(1)}${guide.slug}.html`, guide.file);
    assert.ok(built(rel), `${guide.file}: built at _site/${rel}`);
    const canonical = canonicalOf(read(rel));
    assert.equal(canonical, `${CANONICAL}${guide.url}`, guide.file);
    assert.ok(!canonical.endsWith(".html") && !canonical.endsWith("/"), canonical);
  }
});

test("scenario: index and links (directory index, nav and footer next to News)", () => {
  const index = read(builtPathOf(GUIDES_URL));
  assert.equal(canonicalOf(index), `${CANONICAL}${GUIDES_URL}`);
  assert.ok(index.includes(`<h1>${GUIDES_NAME}</h1>`), "index h1 is the display name");
  const link = `<a href="${GUIDES_URL}">${GUIDES_NAME}</a>`;
  const pages = layoutPages();
  assert.ok(pages.length > 0);
  for (const rel of pages) {
    const html = read(rel);
    const nav = /<nav class="nav-links"[\s\S]*?<\/nav>/.exec(html)?.[0];
    const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(html)?.[0];
    assert.ok(nav && footer, `${rel}: nav and footer`);
    for (const [name, part] of [["nav", nav], ["footer", footer]]) {
      const news = part.indexOf('<a href="/news/">News</a>');
      const guidesAt = part.indexOf(link);
      assert.ok(news >= 0 && guidesAt > news, `${rel}: ${name} links ${GUIDES_URL} after /news/`);
      assert.equal(part.slice(news, guidesAt).match(/<a\b/g).length, 1, `${rel}: ${name} guides link is next to the news link`);
    }
  }
});

test("scenario: placeholder guide renders (title, byline, checked date, chip, CTA, see also, no email)", () => {
  for (const guide of all) {
    const html = read(builtPathOf(guide.url));
    const article = /<article class="prose post guide">([\s\S]*?)<\/article>/.exec(html)?.[1];
    assert.ok(article, `${guide.file}: article`);
    const app = appBySlug(guide.app);
    assert.ok(app, `${guide.file}: app ${guide.app} is live`);
    assert.match(article, new RegExp(`<h1>${guide.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "&#39;")}</h1>`), `${guide.file}: h1`);
    assert.ok(article.includes(`<span class="byline">${BYLINE}</span>`), `${guide.file}: byline`);
    assert.ok(article.includes(`Checked on <time datetime="${guide.checked}">${longDate(guide.checked)}</time>`), `${guide.file}: checked line`);
    assert.ok(article.includes(`<a class="app-chip" href="/apps/${app.slug}">`), `${guide.file}: app chip`);
    assert.ok(article.includes(`href="${app.marketplace_url}"`), `${guide.file}: Marketplace CTA`);
    assert.ok(article.includes(`<a class="btn btn-ghost" href="/apps/${app.slug}">`), `${guide.file}: app page CTA`);
    assert.ok(article.includes(`<a href="${GUIDES_URL}">${GUIDES_NAME}</a>`), `${guide.file}: kicker links the index`);
    const seeAlso = /<ul class="see-also">([\s\S]*?)<\/ul>/.exec(article)?.[1];
    const fmItems = /^see_also:[ \t]*\[(.*)\][ \t]*$/m.exec(readSource(`_guides/${guide.file}`))?.[1];
    if (fmItems) {
      const items = fmItems.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
      assert.ok(seeAlso, `${guide.file}: see-also list`);
      assert.deepEqual(hrefs(seeAlso), items.map((i) => (i.startsWith("/") ? i : `${GUIDES_URL}${i}`)), `${guide.file}: see-also hrefs`);
      for (const text of [...seeAlso.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1])) {
        assert.ok(text.length > 0 && !text.startsWith("/"), `${guide.file}: see-also "${text}" resolved to a title`);
      }
    } else assert.equal(seeAlso, undefined, `${guide.file}: no see-also list without see_also`);
    assert.ok(!/mailto:/i.test(html), `${guide.file}: no mailto link`);
    assert.doesNotMatch(markupOnly(html), EMAIL, `${guide.file}: no email address`);
  }
  assert.doesNotMatch(markupOnly(read(builtPathOf(GUIDES_URL))), EMAIL, "index: no email address");
});

test("scenario: one Jira guide listed on the index under its product with its chip", () => {
  const index = read(builtPathOf(GUIDES_URL));
  const products = [...index.matchAll(/<h2 id="([a-z]+)">([^<]*)<\/h2>/g)].map((m) => m[2]);
  const wanted = [...new Set(all.map((g) => appBySlug(g.app).product))];
  assert.deepEqual(products, ["Confluence", "Jira"].filter((p) => wanted.includes(p)), "product headings in home-page order, none empty");
  for (const guide of all) {
    const app = appBySlug(guide.app);
    const section = new RegExp(`<h2 id="${app.product.toLowerCase()}">[\\s\\S]*?(?=<h2 id=|<p class="back-link")`).exec(index)?.[0];
    assert.ok(section, `${guide.file}: ${app.product} section`);
    const item = new RegExp(`<li class="news-item">[\\s\\S]*?<a href="${guide.url}">[\\s\\S]*?</li>`).exec(section)?.[0];
    assert.ok(item, `${guide.file}: listed under ${app.product}`);
    assert.ok(item.includes(`<time datetime="${guide.checked}">${shortDate(guide.checked)}</time>`), `${guide.file}: checked date`);
    assert.ok(item.includes(guide.description.replace(/'/g, "&#39;")), `${guide.file}: description`);
    assert.ok(item.includes(`<a class="app-chip" href="/apps/${app.slug}">`), `${guide.file}: app chip`);
  }
});

test("scenario: each app page lists its own guides, and nothing where it has none", () => {
  for (const app of apps) {
    const html = read(`apps/${app.slug}/index.html`);
    const mine = all.filter((g) => g.app === app.slug).sort((a, b) => b.checked.localeCompare(a.checked));
    const list = /<h2 id="guides">([^<]*)<\/h2>\s*<ul class="release-history guides-list">([\s\S]*?)<\/ul>/.exec(html);
    if (mine.length === 0) {
      assert.equal(list, null, `${app.slug}: no guides heading`);
      assert.ok(!markupOnly(html).includes('id="guides"'), `${app.slug}: no id="guides"`);
      assert.ok(!hrefs(html).some((h) => h.startsWith(GUIDES_URL) && h !== GUIDES_URL), `${app.slug}: no guide link`);
    } else {
      assert.ok(list, `${app.slug}: guides list`);
      assert.equal(list[1], GUIDES_NAME, `${app.slug}: heading is the display name`);
      assert.deepEqual(hrefs(list[2]), mine.map((g) => g.url), `${app.slug}: its guides, newest checked first`);
      for (const g of mine) assert.ok(list[2].includes(`<time datetime="${g.checked}">${shortDate(g.checked)}</time>`), `${app.slug}: ${g.slug} date`);
    }
    // The SoftwareApplication block is unchanged by the list: still exactly one block, still that type.
    assert.equal(block(html, app.slug)["@type"], "SoftwareApplication");
  }
});

test("scenario: guide without faq has one block holding exactly one TechArticle", () => {
  for (const guide of all.filter((g) => !g.faq)) {
    const html = read(builtPathOf(guide.url));
    const graph = assertTechArticle(block(html, guide.file), guide, html, guide.file);
    assert.equal(graph.length, 1, `${guide.file}: no FAQPage without faq`);
  }
});

test("scenario: guides present in the sitemap with lastmod on the checked date", () => {
  const { entries } = sitemap();
  for (const guide of all) {
    const entry = entries.find((e) => e.loc === `${CANONICAL}${guide.url}`);
    assert.ok(entry, guide.url);
    assert.equal(entry.lastmod?.slice(0, 10), guide.checked, `${guide.url} lastmod`);
  }
});

test("scenario: every external link in a guide opens in a new tab", () => {
  for (const guide of all) {
    const html = read(`guides/${guide.slug}.html`);
    const article = /<article[\s\S]*?<\/article>/.exec(html)?.[0] ?? "";
    const anchors = [...article.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    const external = anchors.filter((a) => /href="https?:\/\//.test(a) && !a.includes('href="https://cloudscript.io'));
    assert.ok(external.length > 0, `${guide.file}: has at least one external link`);
    for (const a of external) {
      assert.ok(/\starget="_blank"/.test(a), `${guide.file}: external link opens in a new tab: ${a}`);
      assert.ok(/\srel="[^"]*noopener[^"]*"/.test(a), `${guide.file}: external link carries rel=noopener: ${a}`);
    }
  }
});

test("scenario: feeds and the news stream carry no guide", () => {
  // A guide must never be a feed ENTRY. A post's body may link to a guide, so the check reads
  // each entry's <id> and <link href>, not the whole file.
  for (const feed of ["news/feed.xml", "news/linkedin.xml"]) {
    const entries = read(feed).match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    for (const entry of entries) {
      const id = /<id>([^<]*)<\/id>/.exec(entry)?.[1] ?? "";
      const links = [...entry.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(!id.includes(GUIDES_URL), `${feed}: entry id ${id} is not a guide`);
      for (const h of links) assert.ok(!h.includes(GUIDES_URL), `${feed}: entry link ${h} is not a guide`);
    }
  }
  const stream = /<ol class="news-stream">[\s\S]*?<\/ol>/.exec(read("news/index.html"))?.[0];
  assert.ok(stream, "news stream list");
  assert.ok(!hrefs(stream).some((h) => h.startsWith(GUIDES_URL)), "news stream links no guide");
  for (const guide of all) assert.ok(!stream.includes(guide.url), guide.url);
});

// --- a scratch build with fixture guides ----------------------------------------------------------

const FIXTURE_ROOTS = ["_config.yml", "sitemap.xml", "robots.txt", "_layouts", "_includes", "_data", "_posts", "_guides", "apps", "news", "guides"];
const HOSTILE = "Yes</script><script>alert(1)</script>";
const FIXTURES = {
  "zz-fixture-jira-faq.md": `---
layout: guide
title: "Fixture: a Jira question with answers?"
description: "A fixture guide with two faq pairs, older than every real guide."
app: email-viewer-jira
date: 2020-01-01
checked: 2020-01-02
image: /apps/email-viewer-jira/guide-emails-tab.png
see_also: ["/nowhere-at-all", "${all[0]?.slug ?? "missing"}"]
faq:
  - q: "Is the first answer plain?"
    a: "Plain."
  - q: "Does a hostile answer stay inside the block?"
    a: "${HOSTILE}"
---

Fixture body.
`,
  "zz-fixture-confluence.md": `---
layout: guide
title: "Fixture: a Confluence question?"
description: "A fixture guide for a Confluence app, with no faq."
app: mermaid
date: 2020-01-01
checked: 2020-01-01
image: /apps/email-viewer-jira/guide-emails-tab.png
faq: []
---

Fixture body.
`,
};

/** Copy the sources to a scratch directory, add the fixture guides and build there. */
function buildWithFixtures() {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "guides-fixture-"));
  const source = path.join(scratch, "src");
  for (const root of FIXTURE_ROOTS) cpSync(path.join(repoRoot, root), path.join(source, root), { recursive: true });
  for (const f of readdirSync(repoRoot)) if (f.endsWith(".html") && statSync(path.join(repoRoot, f)).isFile()) cpSync(path.join(repoRoot, f), path.join(source, f));
  for (const [name, content] of Object.entries(FIXTURES)) writeFileSync(path.join(source, "_guides", name), content);
  const dest = path.join(scratch, "site");
  const rubyBin = "/opt/homebrew/opt/ruby/bin"; // CLAUDE.md §9: local builds need Homebrew Ruby
  const env = { ...process.env, BUNDLE_GEMFILE: path.join(repoRoot, "Gemfile"), PATH: existsSync(rubyBin) ? `${rubyBin}:${process.env.PATH}` : process.env.PATH };
  const run = spawnSync("bundle", ["exec", "jekyll", "build", "--quiet", "-s", source, "-d", dest], { cwd: repoRoot, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`fixture build failed (bundle exec jekyll build): ${run.stderr || run.stdout || run.error}`);
  return { scratch, dest, read: (rel) => readFileSync(path.join(dest, rel), "utf8") };
}

test("fixture build: FAQPage, script breakout, see-also fallback, grouping and ordering", () => {
  const fx = buildWithFixtures();
  try {
    const segment = GUIDES_URL.slice(1);
    const faqHtml = fx.read(`${segment}zz-fixture-jira-faq.html`);
    const [raw] = jsonLdBlocks(faqHtml);
    assert.equal(jsonLdBlocks(faqHtml).length, 1);
    assert.ok(!raw.includes("</"), 'no "</" inside the block');
    const data = JSON.parse(raw);
    const faq = data["@graph"].find((n) => n["@type"] === "FAQPage");
    assert.ok(faq, "FAQPage node");
    assert.equal(data["@graph"].length, 2, "TechArticle and FAQPage only");
    assert.deepEqual(faq.mainEntity, [
      { "@type": "Question", name: "Is the first answer plain?", acceptedAnswer: { "@type": "Answer", text: "Plain." } },
      { "@type": "Question", name: "Does a hostile answer stay inside the block?", acceptedAnswer: { "@type": "Answer", text: HOSTILE } },
    ]);
    const fixtureGuide = { file: "zz-fixture-jira-faq.md", slug: "zz-fixture-jira-faq", url: `${GUIDES_URL}zz-fixture-jira-faq`, title: "Fixture: a Jira question with answers?", description: "A fixture guide with two faq pairs, older than every real guide.", app: "email-viewer-jira", date: "2020-01-01", checked: "2020-01-02", image: "/apps/email-viewer-jira/guide-emails-tab.png", faq: true };
    assertTechArticle(data, fixtureGuide, faqHtml, fixtureGuide.file);

    // see_also: an unmatched item keeps its raw path as the label; a slug resolves to the guide's title.
    const seeAlso = /<ul class="see-also">([\s\S]*?)<\/ul>/.exec(faqHtml)?.[1];
    const links = [...seeAlso.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    assert.equal(links[0][0], "/nowhere-at-all");
    assert.equal(links[0][1], "/nowhere-at-all");
    if (all[0]) {
      assert.equal(links[1][0], all[0].url);
      assert.equal(links[1][1], all[0].title.replace(/'/g, "&#39;"));
    }

    // Index: Confluence before Jira; within Jira, newest checked first, so the fixture (checked
    // 2020, older than every real guide; a future date would make Jekyll drop the document) is last.
    const index = fx.read(`${segment}index.html`);
    const headings = [...index.matchAll(/<h2 id="([a-z]+)">/g)].map((m) => m[1]);
    assert.deepEqual(headings, ["confluence", "jira"]);
    const jiraPart = index.slice(index.indexOf('<h2 id="jira">'));
    const jiraLinks = hrefs(jiraPart).filter((h) => h.startsWith(GUIDES_URL) && h !== GUIDES_URL);
    const jiraGuides = all.filter((x) => appBySlug(x.app).product === "Jira").sort((a, b) => b.checked.localeCompare(a.checked));
    assert.deepEqual(jiraLinks, [...jiraGuides.map((g) => g.url), `${GUIDES_URL}zz-fixture-jira-faq`]);
    assert.ok(index.slice(index.indexOf('<h2 id="confluence">'), index.indexOf('<h2 id="jira">')).includes(`${GUIDES_URL}zz-fixture-confluence`));

    // App pages: the Jira email viewer lists the fixture last (oldest); Mermaid now has a list; Typst still none.
    const jiraApp = /<ul class="release-history guides-list">([\s\S]*?)<\/ul>/.exec(fx.read("apps/email-viewer-jira/index.html"))?.[1];
    assert.ok(jiraApp);
    assert.deepEqual(hrefs(jiraApp), [...all.filter((g) => g.app === "email-viewer-jira").sort((a, b) => b.checked.localeCompare(a.checked)).map((g) => g.url), `${GUIDES_URL}zz-fixture-jira-faq`]);
    assert.ok(fx.read("apps/mermaid/index.html").includes(`<h2 id="guides">${GUIDES_NAME}</h2>`));
    assert.ok(!fx.read("apps/typst-renderer/index.html").includes('id="guides"'));

    // Sitemap and feeds in the fixture build.
    const sm = fx.read("sitemap.xml");
    assert.ok(sm.includes(`<loc>${CANONICAL}${GUIDES_URL}zz-fixture-jira-faq</loc><lastmod>2020-01-02`));
    for (const feed of ["news/feed.xml", "news/linkedin.xml"]) assert.ok(!fx.read(feed).includes("zz-fixture"), feed);
  } finally {
    rmSync(fx.scratch, { recursive: true, force: true });
  }
});
