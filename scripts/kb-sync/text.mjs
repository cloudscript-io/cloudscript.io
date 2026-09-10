// Small shared helpers: whitespace normalisation, XML escaping and URL resolution.

/** Collapse every run of whitespace to one space and trim the ends. */
export function normaliseText(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/** Escape a string for use as XML character data. */
export function escapeText(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape a string for use inside a double-quoted XML attribute value. */
export function escapeAttr(text) {
  return escapeText(text).replace(/"/g, "&quot;");
}

/**
 * Resolve a link or image reference against the guide's own URL so that every reference in
 * the synced page is absolute. `base` is `https://www.cloudscript.io/apps/<slug>/`, so
 * `render-maths.png` resolves next to the guide and `/apps/x/privacy` resolves at the root.
 * Absolute URLs pass through untouched.
 */
export function absoluteUrl(reference, base) {
  return new URL(reference, base).href;
}

/** The absolute URL of a guide directory on the website, the base for its relative links. */
export function guideUrl(siteBase, slug) {
  return `${siteBase.replace(/\/+$/, "")}/apps/${slug}/`;
}
