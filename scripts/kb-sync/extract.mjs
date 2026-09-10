// Extraction: from an app page's raw source to the guide proper (design D3).
//
// The page is read as committed (front matter and Jekyll tags included, since the sync does not
// run the site build). The guide root is `div.prose`; Page Sharing, whose page is a bespoke
// section layout without that wrapper, falls back to the whole page fragment as the root so the
// same drop rules and boundary apply. Inside the root, the `<h1>` (Confluence shows the title),
// the `.trust-badges` block, `<style>`, `<script>`, `<noscript>` and comments are dropped; then
// everything from the first remaining element up to but excluding the `<h2>Legal</h2>` heading
// is kept. The fixed footer that closes every synced page is built here too, from the registry.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFragment } from "parse5";
import { absoluteUrl, escapeAttr, escapeText, guideUrl, normaliseText } from "./text.mjs";

export const SITE_BASE = "https://www.cloudscript.io";
export const GUIDE_ROOT_CLASS = "prose";
export const LEGAL_HEADING = "Legal";
const DROP_TAGS = new Set(["h1", "style", "script", "noscript"]);
const DROP_CLASSES = new Set(["trust-badges"]);

export class ExtractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractError";
  }
}

export const isElement = (node) => typeof node?.tagName === "string";
export const isText = (node) => node?.nodeName === "#text";

export function attr(node, name) {
  const found = node.attrs?.find((a) => a.name === name);
  return found ? found.value : null;
}

export function classList(node) {
  return (attr(node, "class") ?? "").split(/\s+/).filter(Boolean);
}

/** The repository-relative path of an app's guide, as recorded in the page property. */
export function guideSourcePath(slug) {
  return path.posix.join("apps", slug, "index.html");
}

export function readGuideSource(repoRoot, slug) {
  const file = path.join(repoRoot, "apps", slug, "index.html");
  if (!existsSync(file)) throw new ExtractError(`guide not found: ${guideSourcePath(slug)}`);
  return readFileSync(file, "utf8");
}

/** Remove the leading Jekyll front matter block, if any. */
export function stripFrontMatter(source) {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  return m ? source.slice(m[0].length) : source;
}

/**
 * Remove Jekyll Liquid tags and expressions. The app pages carry one
 * `{% include release-history.html %}` inside the guide range; it is a build instruction, not
 * guide text, and the sync reads the source rather than the built site.
 */
export function stripLiquid(source) {
  return source.replace(/\{%[\s\S]*?%\}/g, "").replace(/\{\{[\s\S]*?\}\}/g, "");
}

/**
 * Text content of a node list with a space at every element boundary, whitespace-normalised.
 * Used for the no-text-lost invariant, so the storage-format side must apply the same rule
 * (see xml.mjs).
 */
export function textOf(nodes) {
  const parts = [];
  const walk = (node) => {
    if (isText(node)) parts.push(node.value);
    else if (node.nodeName === "#comment") return;
    else {
      parts.push(" ");
      for (const child of node.childNodes ?? []) walk(child);
      parts.push(" ");
    }
  };
  for (const node of nodes) walk(node);
  return normaliseText(parts.join(""));
}

function findFirst(node, predicate) {
  for (const child of node.childNodes ?? []) {
    if (predicate(child)) return child;
    const nested = findFirst(child, predicate);
    if (nested) return nested;
  }
  return null;
}

function shouldDrop(node) {
  if (node.nodeName === "#comment") return true;
  if (!isElement(node)) return false;
  if (DROP_TAGS.has(node.tagName)) return true;
  return classList(node).some((c) => DROP_CLASSES.has(c));
}

/** Remove dropped nodes everywhere under `node`, in place. */
function prune(node) {
  node.childNodes = (node.childNodes ?? []).filter((child) => {
    if (shouldDrop(child)) return false;
    if (isElement(child)) prune(child);
    return true;
  });
}

function trimWhitespaceText(nodes) {
  const isBlank = (n) => isText(n) && n.value.trim() === "";
  let start = 0;
  let end = nodes.length;
  while (start < end && isBlank(nodes[start])) start += 1;
  while (end > start && isBlank(nodes[end - 1])) end -= 1;
  return nodes.slice(start, end);
}

/**
 * Extract the guide proper from a page source. Returns the kept parse5 nodes, which root was
 * used (`prose` or the `fragment` fallback) and the normalised text of the kept range.
 */
export function extractGuide(source, { slug = "" } = {}) {
  const fragment = parseFragment(stripLiquid(stripFrontMatter(source)));
  const prose = findFirst(
    fragment,
    (n) => isElement(n) && n.tagName === "div" && classList(n).includes(GUIDE_ROOT_CLASS),
  );
  const root = prose ?? fragment;
  prune(root);
  const children = root.childNodes;
  let end = children.findIndex(
    (n) => isElement(n) && n.tagName === "h2" && textOf([n]) === LEGAL_HEADING,
  );
  if (end < 0) end = children.length;
  const nodes = trimWhitespaceText(children.slice(0, end));
  if (!nodes.some(isElement)) {
    throw new ExtractError(`no guide content found in ${slug ? guideSourcePath(slug) : "the source"}`);
  }
  return { nodes, rootKind: prose ? "prose" : "fragment", text: textOf(nodes) };
}

/**
 * The fixed footer appended to every synced page: the guide's absolute URL and a link to each
 * document in the registry's `documents` list. Returns the storage-format XML and its plain
 * text (for the no-text-lost invariant).
 */
export function buildFooter(app, { siteBase = SITE_BASE } = {}) {
  const base = guideUrl(siteBase, app.slug);
  const documents = (app.documents ?? []).map((d) => ({ label: d.label, url: absoluteUrl(d.url, base) }));
  let xml = `<p>This article is generated from the user guide at <a href="${escapeAttr(base)}">${escapeText(base)}</a> and is updated automatically.`;
  let text = `This article is generated from the user guide at ${base} and is updated automatically.`;
  if (documents.length > 0) {
    const links = documents.map((d) => `<a href="${escapeAttr(d.url)}">${escapeText(d.label)}</a>`).join(", ");
    xml += ` Terms, privacy and data-processing documents for this app: ${links}.`;
    text += ` Terms, privacy and data-processing documents for this app: ${documents.map((d) => d.label).join(", ")}.`;
  }
  xml += "</p>";
  return { xml, text };
}
