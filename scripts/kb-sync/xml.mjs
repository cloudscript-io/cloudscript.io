// A strict well-formedness parser for the storage-format fragments the converter produces.
//
// Confluence storage format is XML with undeclared `ac:` and `ri:` prefixes, so a namespace-aware
// parser would reject it and Node ships no XML parser at all. This one accepts exactly what a
// well-formed fragment may contain (elements with quoted attributes, character data with the five
// XML entities and numeric references, CDATA sections and comments) and throws XmlError on
// anything else: unbalanced or mismatched tags, unquoted or duplicated attributes, a stray `<` or
// `&`, an HTML entity such as `&nbsp;`, a declaration or processing instruction. Design D4 requires
// the converted body to pass this check before any write.
import { normaliseText } from "./text.mjs";

export class XmlError extends Error {
  constructor(message, offset) {
    super(offset == null ? message : `${message} (at offset ${offset})`);
    this.name = "XmlError";
    this.offset = offset;
  }
}

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9._:]/;
const REFERENCE = /^&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/;

function decode(text) {
  return text.replace(/&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/g, (_, ref) => {
    switch (ref) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      default: return String.fromCodePoint(ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
    }
  });
}

/**
 * Parse an XML fragment (any number of top-level nodes) into a plain tree of
 * `{ type: "element", name, attrs, children }`, `{ type: "text" | "cdata" | "comment", value }`.
 * Throws XmlError if the fragment is not well-formed.
 */
export function parseXmlFragment(xml) {
  const s = String(xml);
  let i = 0;
  const root = { type: "root", name: "", children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const fail = (message, at = i) => {
    throw new XmlError(message, at);
  };
  const skipWhitespace = () => {
    while (i < s.length && /\s/.test(s[i])) i += 1;
  };
  const readName = () => {
    if (i >= s.length || !NAME_START.test(s[i])) fail("expected a name");
    const start = i;
    i += 1;
    while (i < s.length && NAME_CHAR.test(s[i])) i += 1;
    return s.slice(start, i);
  };
  const checkCharData = (text, at) => {
    for (let k = 0; k < text.length; k += 1) {
      const ch = text[k];
      if (ch === "<") fail("'<' is not allowed in character data", at + k);
      if (ch === "&") {
        const m = REFERENCE.exec(text.slice(k));
        if (!m) fail("undefined or malformed entity reference", at + k);
        k += m[0].length - 1;
      }
    }
    if (text.includes("]]>")) fail("']]>' is not allowed in character data", at);
  };

  while (i < s.length) {
    if (s[i] !== "<") {
      const start = i;
      while (i < s.length && s[i] !== "<") i += 1;
      const raw = s.slice(start, i);
      checkCharData(raw, start);
      top().children.push({ type: "text", value: decode(raw) });
      continue;
    }
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end < 0) fail("unterminated comment");
      const body = s.slice(i + 4, end);
      if (body.includes("--")) fail("'--' is not allowed inside a comment", i);
      top().children.push({ type: "comment", value: body });
      i = end + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i + 9);
      if (end < 0) fail("unterminated CDATA section");
      top().children.push({ type: "cdata", value: s.slice(i + 9, end) });
      i = end + 3;
      continue;
    }
    if (s.startsWith("</", i)) {
      const at = i;
      i += 2;
      const name = readName();
      skipWhitespace();
      if (s[i] !== ">") fail("expected '>' after the end tag name");
      i += 1;
      const open = top();
      if (open.type !== "element") fail(`end tag </${name}> with no open element`, at);
      if (open.name !== name) fail(`end tag </${name}> does not match <${open.name}>`, at);
      stack.pop();
      continue;
    }
    if (s.startsWith("<?", i) || s.startsWith("<!", i)) {
      fail("declarations and processing instructions are not allowed in a fragment");
    }
    // Start tag.
    const at = i;
    i += 1;
    const name = readName();
    const attrs = {};
    let selfClosing = false;
    for (;;) {
      const before = i;
      skipWhitespace();
      if (i >= s.length) fail("unterminated start tag", at);
      if (s[i] === ">") {
        i += 1;
        break;
      }
      if (s.startsWith("/>", i)) {
        i += 2;
        selfClosing = true;
        break;
      }
      if (i === before) fail("expected whitespace before an attribute");
      const attrName = readName();
      skipWhitespace();
      if (s[i] !== "=") fail(`expected '=' after attribute ${attrName}`);
      i += 1;
      skipWhitespace();
      const quote = s[i];
      if (quote !== '"' && quote !== "'") fail(`attribute ${attrName} must be quoted`);
      i += 1;
      const end = s.indexOf(quote, i);
      if (end < 0) fail(`unterminated value for attribute ${attrName}`);
      const raw = s.slice(i, end);
      checkCharData(raw, i);
      if (Object.hasOwn(attrs, attrName)) fail(`duplicate attribute ${attrName}`, at);
      attrs[attrName] = decode(raw);
      i = end + 1;
    }
    const element = { type: "element", name, attrs, children: [] };
    top().children.push(element);
    if (!selfClosing) stack.push(element);
  }
  if (stack.length !== 1) fail(`unclosed element <${top().name}>`, s.length);
  return root.children;
}

/** Throws XmlError unless the fragment is well-formed; returns the parsed tree otherwise. */
export function assertWellFormed(xml) {
  return parseXmlFragment(xml);
}

/**
 * Text content of a parsed fragment with a space at every element boundary, whitespace-
 * normalised: the same rule extract.mjs applies to the source, so the two sides of the
 * no-text-lost invariant are comparable. CDATA counts as text; comments do not.
 */
export function xmlTextOf(nodes) {
  const parts = [];
  const walk = (node) => {
    if (node.type === "text" || node.type === "cdata") parts.push(node.value);
    else if (node.type === "element") {
      parts.push(" ");
      for (const child of node.children) walk(child);
      parts.push(" ");
    }
  };
  for (const node of nodes) walk(node);
  return normaliseText(parts.join(""));
}
