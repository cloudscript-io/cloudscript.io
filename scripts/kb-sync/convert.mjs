// Conversion: kept guide HTML to Confluence storage format (design D4).
//
// Element mapping: `p`, `h2`..`h4`, `ul`/`ol`/`li`, `table`/`thead`/`tbody`/`tr`/`th`/`td`,
// `strong`/`em`/`code`, `a` (href made absolute), `br` and `blockquote` pass through as XHTML.
// `pre > code` becomes the `code` macro (language from a `language-*` class). A `figure` becomes
// an `ac:image` pointing at the website image, centred, followed by its caption as an italic
// paragraph; an `img` outside a figure becomes a plain `ac:image`. Every other element (`div`,
// `section`, `span`, `details`, `summary`, `video`, `dialog`, ...) is unwrapped to its children,
// with block-level unknowns acting as paragraph boundaries, so no text is ever dropped: the
// converter checks that invariant itself, then checks the result is well-formed XML, and refuses
// the page otherwise. Attributes other than `href`, `src`, `colspan` and `rowspan` are removed.
// Every `href` and `src` is resolved against `https://cloudscript.io/apps/<slug>/`.
import { createHash } from "node:crypto";
import {
  SITE_BASE,
  attr,
  buildFooter,
  classList,
  extractGuide,
  guideSourcePath,
  isElement,
  isText,
} from "./extract.mjs";
import { absoluteUrl, escapeAttr, escapeText, guideUrl, normaliseText } from "./text.mjs";
import { parseXmlFragment, xmlTextOf } from "./xml.mjs";

export class ConvertError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ConvertError";
  }
}

/** Block-level elements that pass through with their own converter. */
const BLOCK_PASS = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "blockquote"]);
/** HTML phrasing elements: in block context they join the surrounding inline run. */
const INLINE_HTML = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "img", "kbd", "label",
  "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);
const CELL_ATTRS = ["colspan", "rowspan"];

const inlineText = (value) => escapeText(value.replace(/\s+/g, " "));

function rawTextOf(node) {
  if (isText(node)) return node.value;
  return (node.childNodes ?? []).map(rawTextOf).join("");
}

function cellAttrs(node) {
  return CELL_ATTRS.filter((name) => attr(node, name) != null)
    .map((name) => ` ${name}="${escapeAttr(attr(node, name))}"`)
    .join("");
}

function image(node, ctx, { center }) {
  const src = attr(node, "src");
  if (!src || src.trim() === "") return null;
  const url = absoluteUrl(src.trim(), ctx.base);
  return `<ac:image${center ? ' ac:align="center"' : ""}><ri:url ri:value="${escapeAttr(url)}"/></ac:image>`;
}

function cdata(text) {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function codeMacro(pre, ctx) {
  const code = (pre.childNodes ?? []).find((n) => isElement(n) && n.tagName === "code");
  const language = code ? classList(code).find((c) => c.startsWith("language-"))?.slice("language-".length) : undefined;
  const parameter = language ? `<ac:parameter ac:name="language">${escapeText(language)}</ac:parameter>` : "";
  return `<ac:structured-macro ac:name="code">${parameter}<ac:plain-text-body>${cdata(rawTextOf(pre))}</ac:plain-text-body></ac:structured-macro>`;
}

/** Inline context: returns a string of phrasing content. */
function inlineChildren(children, ctx) {
  return children.map((node) => inlineNode(node, ctx)).join("");
}

function inlineNode(node, ctx) {
  if (isText(node)) return inlineText(node.value);
  if (!isElement(node)) return "";
  const inner = () => inlineChildren(node.childNodes ?? [], ctx);
  switch (node.tagName) {
    case "a": {
      const href = attr(node, "href");
      if (href == null || href.trim() === "") return inner();
      return `<a href="${escapeAttr(absoluteUrl(href.trim(), ctx.base))}">${inner()}</a>`;
    }
    case "strong":
    case "em":
    case "code":
      return `<${node.tagName}>${inner()}</${node.tagName}>`;
    case "br":
      return "<br/>";
    case "img":
      return image(node, ctx, { center: false }) ?? "";
    case "pre":
      return inlineText(rawTextOf(node));
    default:
      return inner();
  }
}

/**
 * Block context: appends block-level chunks to `out`. Runs of inline content become `<p>`
 * paragraphs; unknown block-level elements are unwrapped with a paragraph boundary on each side.
 */
function blockChildren(children, ctx, out) {
  let run = [];
  const flush = () => {
    const text = run.join("").trim();
    run = [];
    if (normaliseText(text) !== "") out.push(`<p>${text}</p>`);
  };
  for (const node of children) {
    if (isText(node)) {
      run.push(inlineText(node.value));
      continue;
    }
    if (!isElement(node)) continue;
    const tag = node.tagName;
    if (INLINE_HTML.has(tag) && tag !== "img") {
      run.push(inlineNode(node, ctx));
      continue;
    }
    flush();
    if (BLOCK_PASS.has(tag)) {
      const chunk = blockElement(node, ctx);
      if (chunk) out.push(chunk);
    } else if (tag === "pre") {
      out.push(codeMacro(node, ctx));
    } else if (tag === "figure") {
      out.push(...figureBlocks(node, ctx));
    } else if (tag === "img") {
      const chunk = image(node, ctx, { center: false });
      if (chunk) out.push(chunk);
    } else {
      blockChildren(node.childNodes ?? [], ctx, out);
    }
  }
  flush();
}

/**
 * Mixed context (`li`, `td`, `th`, `blockquote`): inline runs stay bare, block children are
 * emitted as blocks, unknown block-level elements become paragraphs inside the container.
 */
function mixedChildren(children, ctx) {
  const out = [];
  let run = [];
  const flush = () => {
    const text = run.join("").trim();
    run = [];
    if (normaliseText(text) !== "") out.push(text);
  };
  for (const node of children) {
    if (isText(node)) {
      run.push(inlineText(node.value));
      continue;
    }
    if (!isElement(node)) continue;
    const tag = node.tagName;
    if (INLINE_HTML.has(tag) && tag !== "img") {
      run.push(inlineNode(node, ctx));
      continue;
    }
    flush();
    if (BLOCK_PASS.has(tag)) {
      const chunk = blockElement(node, ctx);
      if (chunk) out.push(chunk);
    } else if (tag === "pre") {
      out.push(codeMacro(node, ctx));
    } else if (tag === "figure") {
      out.push(...figureBlocks(node, ctx));
    } else if (tag === "img") {
      const chunk = image(node, ctx, { center: false });
      if (chunk) out.push(chunk);
    } else {
      blockChildren(node.childNodes ?? [], ctx, out);
    }
  }
  flush();
  return out.join("");
}

/** List container: only `li` children; anything else is wrapped in one so no text is lost. */
function listChildren(children, ctx) {
  const out = [];
  for (const node of children) {
    if (isText(node)) {
      if (node.value.trim() !== "") out.push(`<li>${inlineText(node.value).trim()}</li>`);
      continue;
    }
    if (!isElement(node)) continue;
    if (node.tagName === "li") {
      out.push(blockElement(node, ctx));
    } else if (BLOCK_PASS.has(node.tagName) || node.tagName === "pre" || node.tagName === "figure") {
      const inner = [];
      blockChildren([node], ctx, inner);
      out.push(`<li>${inner.join("")}</li>`);
    } else if (INLINE_HTML.has(node.tagName)) {
      const text = inlineNode(node, ctx).trim();
      if (text) out.push(`<li>${text}</li>`);
    } else {
      out.push(listChildren(node.childNodes ?? [], ctx));
    }
  }
  return out.join("");
}

/** Table containers: rows and cells pass through; stray content is wrapped so it survives. */
function tableChildren(node, ctx) {
  const rowWrap = node.tagName === "tr" ? (s) => `<td>${s}</td>` : (s) => `<tr><td>${s}</td></tr>`;
  const allowed = node.tagName === "tr" ? new Set(["th", "td"]) : new Set(["thead", "tbody", "tr"]);
  const out = [];
  for (const child of node.childNodes ?? []) {
    if (isText(child)) {
      if (child.value.trim() !== "") out.push(rowWrap(inlineText(child.value).trim()));
      continue;
    }
    if (!isElement(child)) continue;
    if (allowed.has(child.tagName)) {
      out.push(blockElement(child, ctx));
    } else if (child.tagName === "tfoot") {
      out.push(tableChildren({ ...child, tagName: "tbody" }, ctx));
    } else {
      const inner = [];
      blockChildren([child], ctx, inner);
      const text = inner.join("");
      if (text) out.push(rowWrap(text));
    }
  }
  return out.join("");
}

function figureBlocks(figure, ctx) {
  const out = [];
  let caption = null;
  let imageEmitted = false;
  const rest = [];
  for (const child of figure.childNodes ?? []) {
    if (isElement(child) && child.tagName === "figcaption") {
      caption = child;
    } else if (isElement(child) && child.tagName === "img" && !imageEmitted) {
      const chunk = image(child, ctx, { center: true });
      if (chunk) {
        out.push(chunk);
        imageEmitted = true;
      }
    } else {
      rest.push(child);
    }
  }
  blockChildren(rest, ctx, out);
  if (caption) {
    const text = inlineChildren(caption.childNodes ?? [], ctx).trim();
    if (normaliseText(text) !== "") out.push(`<p><em>${text}</em></p>`);
  }
  return out;
}

function blockElement(node, ctx) {
  const tag = node.tagName;
  switch (tag) {
    case "p":
    case "h2":
    case "h3":
    case "h4": {
      const text = inlineChildren(node.childNodes ?? [], ctx).trim();
      return normaliseText(text) === "" ? "" : `<${tag}>${text}</${tag}>`;
    }
    case "ul":
    case "ol":
      return `<${tag}>${listChildren(node.childNodes ?? [], ctx)}</${tag}>`;
    case "li":
    case "blockquote":
      return `<${tag}>${mixedChildren(node.childNodes ?? [], ctx)}</${tag}>`;
    case "th":
    case "td":
      return `<${tag}${cellAttrs(node)}>${mixedChildren(node.childNodes ?? [], ctx)}</${tag}>`;
    case "table":
    case "thead":
    case "tbody":
    case "tr":
      return `<${tag}>${tableChildren(node, ctx)}</${tag}>`;
    default:
      throw new ConvertError(`no block converter for <${tag}>`);
  }
}

/** Convert kept parse5 nodes to storage format. `ctx.base` is the guide's absolute URL. */
export function convertNodes(nodes, ctx) {
  const out = [];
  blockChildren(nodes, ctx, out);
  return out.join("\n");
}

/** Design D5: the content hash that decides whether a page needs a new version. */
export function hashContent(body, title) {
  return createHash("sha256").update(`${body}\n${title}`, "utf8").digest("hex");
}

function firstDifference(a, b) {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k += 1;
  return `expected "...${a.slice(Math.max(0, k - 40), k + 40)}" but converted "...${b.slice(Math.max(0, k - 40), k + 40)}"`;
}

/**
 * Extract, convert, append the footer, then verify: the body must be well-formed XML and must
 * carry exactly the kept text plus the footer. Returns the page title (registry name), body,
 * content hash and source path; throws ExtractError or ConvertError before any write can happen.
 */
export function convertGuide(source, app, { siteBase = SITE_BASE } = {}) {
  const base = guideUrl(siteBase, app.slug);
  const extracted = extractGuide(source, { slug: app.slug });
  const footer = buildFooter(app, { siteBase });
  const body = `${convertNodes(extracted.nodes, { base })}\n${footer.xml}`;
  let parsed;
  try {
    parsed = parseXmlFragment(body);
  } catch (err) {
    throw new ConvertError(`${app.slug}: converted body is not well-formed XML: ${err.message}`, { cause: err });
  }
  // The footer's plain text is derived through the same boundary-space rule as the body.
  const expected = normaliseText(`${extracted.text} ${xmlTextOf(parseXmlFragment(footer.xml))}`);
  const actual = xmlTextOf(parsed);
  if (actual !== expected) {
    throw new ConvertError(`${app.slug}: text was lost or reordered in conversion: ${firstDifference(expected, actual)}`);
  }
  const title = app.name;
  return {
    title,
    body,
    contentHash: hashContent(body, title),
    rootKind: extracted.rootKind,
    sourcePath: guideSourcePath(app.slug),
  };
}
