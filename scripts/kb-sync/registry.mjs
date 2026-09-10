// The app registry: one flat YAML file per app in _data/apps/. The files use a small, regular
// subset of YAML (top-level `key: value` scalars, flow lists such as `[a, b]`, and one block list
// of mappings, `documents:`), so they are read with the strict subset parser below instead of a
// YAML dependency, as design task 2.1 allows. Anything outside that subset is an error naming
// the file and line, never a silent misparse: if the registry ever grows a construct this parser
// does not know, pin a YAML library instead of extending it.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export class RegistryFormatError extends Error {
  constructor(message, file, line) {
    super(line ? `${file}:${line}: ${message}` : `${file}: ${message}`);
    this.name = "RegistryFormatError";
    this.file = file;
    this.line = line;
  }
}

const KEY = "[A-Za-z0-9_-]+";

/** Drop a trailing `# comment` that sits outside quotes. */
function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle && line[i - 1] !== "\\") inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw, file, line) {
  const s = raw.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('"')) {
    if (s.length < 2 || !s.endsWith('"')) throw new RegistryFormatError("unterminated double-quoted string", file, line);
    return s.slice(1, -1).replace(/\\(["\\nt])/g, (_, c) => ({ '"': '"', "\\": "\\", n: "\n", t: "\t" })[c]);
  }
  if (s.startsWith("'")) {
    if (s.length < 2 || !s.endsWith("'")) throw new RegistryFormatError("unterminated single-quoted string", file, line);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new RegistryFormatError("unterminated flow list", file, line);
    const inner = s.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => parseScalar(item, file, line));
  }
  if (/^[{&*|>!%@`]/.test(s)) {
    throw new RegistryFormatError(`unsupported YAML construct: ${s}`, file, line);
  }
  return s;
}

/**
 * Parse the flat YAML subset used by the registry into a plain object. Top-level scalars map
 * to strings, numbers, booleans, null or arrays; a top-level key with no value introduces an
 * indented block list whose items are `- key: value` mappings (continued by further indented
 * `key: value` lines) or bare scalars.
 */
export function parseFlatYaml(text, file = "<registry>") {
  const lines = text.split(/\r?\n/);
  const doc = {};
  let i = 0;
  while (i < lines.length) {
    const lineNo = i + 1;
    const line = stripComment(lines[i]);
    if (line.trim() === "") { i += 1; continue; }
    if (/^\s/.test(line)) throw new RegistryFormatError("unexpected indentation", file, lineNo);
    const m = new RegExp(`^(${KEY}):(?:\\s+(.*))?$`).exec(line);
    if (!m) throw new RegistryFormatError(`cannot parse line: ${lines[i].trim()}`, file, lineNo);
    const key = m[1];
    if (Object.hasOwn(doc, key)) throw new RegistryFormatError(`duplicate key ${key}`, file, lineNo);
    if (m[2] !== undefined && m[2].trim() !== "") {
      doc[key] = parseScalar(m[2], file, lineNo);
      i += 1;
      continue;
    }
    // A key with no value on its line introduces an indented block list.
    i += 1;
    const items = [];
    let current = null;
    while (i < lines.length) {
      const ln = i + 1;
      const l = stripComment(lines[i]);
      if (l.trim() === "") { i += 1; continue; }
      if (!/^\s/.test(l)) break;
      const item = /^\s+-\s+(.*)$/.exec(l);
      if (item) {
        const kv = new RegExp(`^(${KEY}):\\s+(.*)$`).exec(item[1]);
        if (kv) {
          current = { [kv[1]]: parseScalar(kv[2], file, ln) };
          items.push(current);
        } else {
          current = null;
          items.push(parseScalar(item[1], file, ln));
        }
        i += 1;
        continue;
      }
      const cont = new RegExp(`^\\s+(${KEY}):\\s+(.*)$`).exec(l);
      if (cont && current) {
        if (Object.hasOwn(current, cont[1])) throw new RegistryFormatError(`duplicate key ${cont[1]}`, file, ln);
        current[cont[1]] = parseScalar(cont[2], file, ln);
        i += 1;
        continue;
      }
      throw new RegistryFormatError(`unsupported YAML construct: ${lines[i].trim()}`, file, ln);
    }
    doc[key] = items.length ? items : null;
  }
  return doc;
}

/**
 * Load every `*.yml` in the registry directory. Each entry is validated for the fields the
 * sync relies on (`name`, `slug`, `status`, and a well-formed `documents` list) and the slug
 * must match the file name. Entries come back sorted by `order`, then name.
 */
export function loadRegistry(dataDir) {
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".yml")).sort();
  const entries = files.map((f) => {
    const file = path.join(dataDir, f);
    const doc = parseFlatYaml(readFileSync(file, "utf8"), file);
    for (const key of ["name", "slug", "status"]) {
      if (typeof doc[key] !== "string" || doc[key].trim() === "") {
        throw new RegistryFormatError(`missing or non-string ${key}`, file);
      }
    }
    if (doc.slug !== path.basename(f, ".yml")) {
      throw new RegistryFormatError(`slug "${doc.slug}" does not match the file name`, file);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug)) {
      throw new RegistryFormatError(`slug "${doc.slug}" is not a lower-case hyphenated slug`, file);
    }
    const documents = doc.documents == null ? [] : doc.documents;
    if (!Array.isArray(documents)) throw new RegistryFormatError("documents must be a list", file);
    for (const d of documents) {
      if (typeof d?.label !== "string" || typeof d?.url !== "string") {
        throw new RegistryFormatError("each documents item needs a label and a url", file);
      }
    }
    const order = typeof doc.order === "number" ? doc.order : Number.MAX_SAFE_INTEGER;
    return { ...doc, documents, order, file };
  });
  return entries.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Split the registry into the entries to sync (`status: live`) and everything else. */
export function selectApps(registry) {
  return {
    live: registry.filter((app) => app.status === "live"),
    others: registry.filter((app) => app.status !== "live"),
  };
}
