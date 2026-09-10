// Shared paths and loaders for the kb-sync tests. Not a test file itself.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..");
export const fixturesDir = path.join(here, "fixtures");
export const goldenDir = path.join(here, "golden");
export const scriptsDir = path.join(repoRoot, "scripts", "kb-sync");

/** The seven live apps, in registry order. */
export const LIVE_SLUGS = [
  "mermaid",
  "page-sharing",
  "typst-renderer",
  "mcp-renderer",
  "radar-renderer",
  "nikoniko",
  "email-viewer",
];

export function fixtureHtml(slug) {
  return readFileSync(path.join(fixturesDir, `${slug}.html`), "utf8");
}

export function fixtureYaml(slug) {
  return readFileSync(path.join(fixturesDir, `${slug}.yml`), "utf8");
}
