// Shared paths, the fresh-build gate and small readers for the site-discovery tests. Not a test
// file itself.
//
// These tests read the built site in _site/, so they need a local build first
// (`bundle exec jekyll build`, CLAUDE.md §9). Importing this module checks that the build
// exists and is newer than every source file, and throws a message saying what to do otherwise.
// Node ships no HTML or XML parser: the HTML readers are regular expressions over markup this
// site generates itself, and the sitemap is read with kb-sync's strict XML parser.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, selectApps } from "../../scripts/kb-sync/registry.mjs";
import { parseXmlFragment } from "../../scripts/kb-sync/xml.mjs";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..");
export const siteDir = path.join(repoRoot, "_site");

/** Standalone HTML with no front matter: copied as it is, so no layout and no canonical. */
export const STANDALONE = new Set(["share/index.html"]);

// --- sources and the fresh-build gate ----------------------------------------------------------

const SOURCE_ROOTS = ["_config.yml", "robots.txt", "sitemap.xml", "_layouts", "_includes", "_data", "_posts", "apps", "news", "share"];
const SOURCE_EXTENSIONS = new Set([".html", ".md", ".yml", ".xml", ".txt"]);
const posix = (p) => p.split(path.sep).join("/");

function walk(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

/** Every text file the build reads, as repository-relative paths. */
export function sourceFiles() {
  const out = [];
  const add = (full) => {
    if (SOURCE_EXTENSIONS.has(path.extname(full))) out.push(posix(path.relative(repoRoot, full)));
  };
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) add(path.join(repoRoot, entry.name));
  }
  for (const root of SOURCE_ROOTS) {
    const full = path.join(repoRoot, root);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full, add);
    else add(full);
  }
  return out.sort();
}

export function assertFreshBuild() {
  const marker = path.join(siteDir, "index.html");
  if (!existsSync(marker)) {
    throw new Error("The site-discovery tests read the built site and _site/index.html is missing. Run `bundle exec jekyll build` first.");
  }
  const built = statSync(marker).mtimeMs;
  let newest = null;
  for (const rel of sourceFiles()) {
    const mtimeMs = statSync(path.join(repoRoot, rel)).mtimeMs;
    if (!newest || mtimeMs > newest.mtimeMs) newest = { rel, mtimeMs };
  }
  if (newest && newest.mtimeMs > built) {
    throw new Error(`The site-discovery tests read the built site and _site is older than ${newest.rel}. Run \`bundle exec jekyll build\` again.`);
  }
}

assertFreshBuild();

// --- files --------------------------------------------------------------------------------------

export const read = (rel) => readFileSync(path.join(siteDir, rel), "utf8");
export const readBytes = (rel) => readFileSync(path.join(siteDir, rel));
export const readSource = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
export const built = (rel) => existsSync(path.join(siteDir, rel));

/** Every built `.html` file, as paths relative to _site. */
export function builtHtml() {
  const out = [];
  walk(siteDir, (full) => {
    if (full.endsWith(".html")) out.push(posix(path.relative(siteDir, full)));
  });
  return out.sort();
}

/** The built pages rendered through _layouts/default.html. */
export const layoutPages = () => builtHtml().filter((rel) => !STANDALONE.has(rel));

/** The built file a site path is served from: `/` and `/x/` are directory indexes, `/x` is x.html. */
export function builtPathOf(urlPath) {
  const rel = urlPath.replace(/^\//, "");
  if (urlPath.endsWith("/")) return `${rel}index.html`;
  return rel.endsWith(".html") ? rel : `${rel}.html`;
}

/** A top-level scalar from _config.yml. */
export function configValue(key) {
  const m = new RegExp(`^${key}:[ \\t]*(\\S.*?)[ \\t]*$`, "m").exec(readSource("_config.yml"));
  return m ? m[1].replace(/^"(.*)"$/, "$1") : null;
}

/** `https://cloudscript.io`: the host every canonical URL is built on. */
export const CANONICAL = configValue("canonical_url");

// --- registry and posts -------------------------------------------------------------------------

export const liveApps = () => selectApps(loadRegistry(path.join(repoRoot, "_data", "apps"))).live;

/** Every post, with the date and the `/news/<slug>` URL its file name gives it. */
export function posts() {
  return readdirSync(path.join(repoRoot, "_posts"))
    .filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f))
    .sort()
    .map((f) => ({ file: f, date: f.slice(0, 10), url: `/news/${f.slice(11, -3)}` }));
}

/** The front matter block of a source file as raw text, or "" when it has none. */
export function frontMatter(source) {
  return /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)?.[1] ?? "";
}

// --- HTML readers -------------------------------------------------------------------------------

export const attrOf = (attrs, name) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
export const canonicalOf = (html) => /<link rel="canonical" href="([^"]*)">/.exec(html)?.[1] ?? null;
/** The content of `<meta key="value" content="...">`, e.g. metaOf(html, "property", "og:url"). */
export const metaOf = (html, key, value) => new RegExp(`<meta ${key}="${value}" content="([^"]*)">`).exec(html)?.[1] ?? null;
export const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

/** The raw text of every JSON-LD block in a page. */
export function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/** The page without comments, scripts and styles, so tag patterns only meet real markup. */
export const markupOnly = (html) => html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, "");

const textOf = (html) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every `<h2>` in document order: its own `id` (or null), its text, whether it sits inside a
 * `<section>`, and that nearest enclosing section's `id` (or null).
 */
export function headings(html) {
  const out = [];
  const stack = [];
  for (const m of markupOnly(html).matchAll(/<section\b([^>]*)>|<\/section>|<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)) {
    if (m[0].startsWith("</section")) stack.pop();
    else if (m[0].startsWith("<section")) stack.push(attrOf(m[1], "id"));
    else out.push({ id: attrOf(m[2], "id"), text: textOf(m[3]), inSection: stack.length > 0, sectionId: stack.at(-1) ?? null });
  }
  return out;
}

/** Every `id` attribute value in a page's markup, in document order. */
export const idsOf = (html) => [...markupOnly(html).matchAll(/<[a-zA-Z][^>]*?\sid="([^"]*)"/g)].map((m) => m[1]);

// --- sitemap ------------------------------------------------------------------------------------

/**
 * Parse _site/sitemap.xml strictly (throws XmlError if it is not well-formed) and return the
 * `<urlset>` element plus one `{ loc, lastmod, others }` per `<url>`, `others` naming any child
 * element that is neither.
 */
export function sitemap() {
  const xml = read("sitemap.xml");
  const declaration = /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*/.exec(xml);
  if (!declaration) throw new Error("sitemap.xml does not start with an XML declaration");
  const elements = parseXmlFragment(xml.slice(declaration[0].length)).filter((n) => n.type === "element");
  const text = (node) => node.children.filter((c) => c.type === "text").map((c) => c.value).join("").trim();
  const urlset = elements[0];
  const entries = (urlset?.children ?? [])
    .filter((n) => n.type === "element")
    .map((url) => {
      const kids = url.children.filter((c) => c.type === "element");
      const one = (name) => kids.filter((k) => k.name === name).map(text);
      return {
        element: url.name,
        loc: one("loc")[0] ?? null,
        locCount: one("loc").length,
        lastmod: one("lastmod")[0] ?? null,
        others: kids.map((k) => k.name).filter((n) => n !== "loc" && n !== "lastmod"),
      };
    });
  return { roots: elements, urlset, entries };
}
