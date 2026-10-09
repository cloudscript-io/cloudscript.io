// Checks over the committed workflow file, read line by line as tests/kb-sync/workflow.test.mjs does.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const text = readFileSync(path.join(repoRoot, ".github", "workflows", "jira-options-sync.yml"), "utf8");
const lines = text.split("\n");

function block(key) {
  const start = lines.findIndex((l) => l.trimEnd() === key);
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

function pathMatches(pattern, filePath) {
  const re = pattern
    .split("**")
    .map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${re}$`).test(filePath);
}

const paths = () => block("    paths:").map((l) => l.replace(/^- /, "").replace(/^"|"$/g, ""));

test("scenario: the workflow cannot write to the repository", () => {
  assert.deepEqual(block("permissions:"), ["contents: read"]);
  assert.ok(!/GITHUB_TOKEN|github\.token/.test(text));
  assert.ok(/persist-credentials: false/.test(text));
});

test("scenario: the Jira credential lives in its own environment, not kb-sync's", () => {
  assert.ok(/^\s+environment: jira$/m.test(text));
  assert.ok(!/CONFLUENCE_/.test(text), "no Confluence secret is passed to this job");
});

test("triggers: push to main on registry and sync paths; manual dispatch defaults to a dry run", () => {
  assert.deepEqual(block("    branches:"), ["- main"]);
  for (const p of ["_data/apps/*.yml", "scripts/jira-options-sync/**", "scripts/kb-sync/registry.mjs"]) assert.ok(paths().includes(p), p);
  const dryRun = block("      dry_run:");
  assert.ok(dryRun.includes("type: boolean") && dryRun.includes("default: true"));
  assert.match(text, /JIRA_OPTIONS_DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run == true && '1' \|\| '0' \}\}/);
});

test("scenario: a release that flips a registry entry to live triggers the sync; a guide edit does not", () => {
  const runsFor = (changed) => paths().some((p) => pathMatches(p, changed));
  assert.equal(runsFor("_data/apps/wavedrom.yml"), true);
  assert.equal(runsFor("apps/typst-renderer/index.html"), false);
  assert.equal(runsFor("news/index.html"), false);
});

test("actions are pinned to commit SHAs and the tests run before the sync", () => {
  for (const m of text.matchAll(/uses: (\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, m[1]);
  assert.ok(text.indexOf("node --test tests/jira-options-sync") < text.indexOf("node scripts/jira-options-sync/sync.mjs"));
});
