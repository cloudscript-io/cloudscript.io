// Checks over the committed workflow file (spec kb-sync: "Triggers, dry run and failure
// reporting" and "the workflow cannot write to the repository"). The file is small and regular,
// so these read it line by line rather than pulling in a YAML parser.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./helpers.mjs";

const file = path.join(repoRoot, ".github", "workflows", "kb-sync.yml");
const text = readFileSync(file, "utf8");
const lines = text.split("\n");

/** The indented lines that follow a `key:` line, until the indentation returns to its level. */
function block(key, from = 0) {
  const start = lines.findIndex((l, i) => i >= from && l.trimEnd() === key);
  assert.notEqual(start, -1, `${key} block present`);
  const indent = lines[start].search(/\S/);
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() === "" || l.trim().startsWith("#")) continue;
    if (l.search(/\S/) <= indent) break;
    body.push(l.trim());
  }
  return body;
}

/** GitHub's path filter semantics: `**` spans directories, `*` stays within one segment. */
function pathMatches(pattern, filePath) {
  const re = pattern
    .split("**")
    .map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${re}$`).test(filePath);
}

test("scenario: the workflow cannot write to the repository (permissions: contents: read only)", () => {
  assert.deepEqual(block("permissions:"), ["contents: read"]);
  assert.ok(!/permissions:\s*write-all/.test(text));
  assert.ok(!/GITHUB_TOKEN|github\.token/.test(text), "the token is never used");
  assert.ok(/persist-credentials: false/.test(text), "the checkout leaves no credential behind");
});

test("triggers: push to main on guide, registry and sync paths; manual dispatch with dry_run defaulting to true", () => {
  const on = block("on:");
  assert.ok(on.includes("push:") && on.includes("workflow_dispatch:"));
  assert.deepEqual(block("    branches:"), ["- main"]);
  const paths = block("    paths:").map((l) => l.replace(/^- /, "").replace(/^"|"$/g, ""));
  for (const required of ["apps/**/index.html", "_data/apps/*.yml", "scripts/kb-sync/**"]) assert.ok(paths.includes(required), `path filter ${required}`);
  const dryRun = block("      dry_run:");
  assert.ok(dryRun.includes("type: boolean"));
  assert.ok(dryRun.includes("default: true"));
});

test("scenario: a push that touches no guide does not run the sync (path filters)", () => {
  const paths = block("    paths:").map((l) => l.replace(/^- /, "").replace(/^"|"$/g, ""));
  const runsFor = (changed) => paths.some((p) => pathMatches(p, changed));
  assert.equal(runsFor("news/index.html"), false);
  assert.equal(runsFor("index.html"), false);
  assert.equal(runsFor("apps/mermaid/privacy.html"), false, "legal pages are not synced");
  assert.equal(runsFor("_posts/2026-09-07-radar-renderer-2-5.md"), false);
  assert.equal(runsFor("assets/css/styles.css"), false);
  assert.equal(runsFor("apps/mermaid/index.html"), true);
  assert.equal(runsFor("apps/page-sharing/index.html"), true);
  assert.equal(runsFor("_data/apps/typst-renderer.yml"), true);
  assert.equal(runsFor("scripts/kb-sync/convert.mjs"), true);
  assert.equal(runsFor("scripts/kb-sync/package-lock.json"), true);
  assert.equal(runsFor(".github/workflows/kb-sync.yml"), true);
});

test("hardening: concurrency group, actions pinned by full commit SHA, Node 22, npm ci, timeout", () => {
  assert.deepEqual(block("concurrency:"), ["group: kb-sync", "cancel-in-progress: false"]);
  const uses = lines.filter((l) => /^\s*(- )?uses:/.test(l)).map((l) => l.trim());
  assert.equal(uses.length, 2);
  for (const u of uses) assert.match(u, /^(- )?uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${u} is pinned by a 40-character SHA with the version in a comment`);
  assert.ok(uses.some((u) => u.includes("actions/checkout@")) && uses.some((u) => u.includes("actions/setup-node@")));
  assert.match(text, /node-version: 22\b/);
  assert.match(text, /cache-dependency-path: scripts\/kb-sync\/package-lock\.json/);
  assert.match(text, /run: npm ci\b/);
  assert.match(text, /working-directory: scripts\/kb-sync/);
  assert.match(text, /timeout-minutes: 10\b/);
  assert.match(text, /run: node --test tests\/kb-sync\/\*\.test\.mjs/);
  assert.match(text, /run: node scripts\/kb-sync\/sync\.mjs\s*$/m);
});

test("secrets reach the script as the four environment variables, and dispatch maps dry_run to KB_SYNC_DRY_RUN", () => {
  const env = block("        env:");
  for (const name of ["CONFLUENCE_BASE_URL", "CONFLUENCE_USER_EMAIL", "CONFLUENCE_API_TOKEN", "KB_SPACE_KEY"]) {
    assert.ok(env.includes(`${name}: \${{ secrets.${name} }}`), `${name} mapped from the secret of the same name`);
  }
  const dryRun = env.find((l) => l.startsWith("KB_SYNC_DRY_RUN:"));
  assert.ok(dryRun, "KB_SYNC_DRY_RUN is set");
  assert.match(dryRun, /github\.event_name == 'workflow_dispatch' && inputs\.dry_run == true && '1' \|\| '0'/);
  assert.ok(!/echo .*secrets\./.test(text), "no secret is echoed");
  const secretRefs = text.match(/secrets\.[A-Z_]+/g) ?? [];
  assert.deepEqual([...new Set(secretRefs)].sort(), ["secrets.CONFLUENCE_API_TOKEN", "secrets.CONFLUENCE_BASE_URL", "secrets.CONFLUENCE_USER_EMAIL", "secrets.KB_SPACE_KEY"]);
});
