// Spec jira-app-options: the orchestration against the in-memory Jira, plus the CLI's
// dry-run and refusal behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { runSync, resolveContext, main } from "../../scripts/jira-options-sync/sync.mjs";
import { MockJira } from "../../scripts/jira-options-sync/mock-jira.mjs";
import { loadRegistry, selectApps } from "../../scripts/kb-sync/registry.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIELD = "customfield_10458";
const PROJECT = "10134";
const app = (slug, name, extra = {}) => ({ slug, name, ...extra });
const APPS = [app("mermaid", "CloudScript Mermaid Diagrams for Confluence"), app("nikoniko", "NikoNiko Calendar"), app("wavedrom", "WaveDrom Renderer for Confluence")];

function seeded(options) {
  return new MockJira({
    fieldId: FIELD,
    mappings: [{ contextId: "10632", projectId: PROJECT }, { contextId: "10630", isGlobalContext: true }],
    options: options.map(([id, value, disabled = false]) => ({ id: String(id), value, disabled })),
  });
}

test("scenario: a live run adds, disables and orders, then verifies by read-back", async () => {
  const jira = seeded([[1, "CloudScript Mermaid Diagrams for Confluence"], [2, "Retired App"], [9, "Not app-specific"]]);
  const { plan, verified } = await runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS });
  assert.equal(verified, true);
  assert.deepEqual(plan.create.map((c) => c.value), ["NikoNiko Calendar", "WaveDrom Renderer for Confluence"]);
  const after = await jira.listOptions(FIELD, "10632");
  assert.deepEqual(after.map((o) => [o.value, o.disabled]), [
    ["CloudScript Mermaid Diagrams for Confluence", false],
    ["NikoNiko Calendar", false],
    ["WaveDrom Renderer for Confluence", false],
    ["Not app-specific", false],
    ["Retired App", true],
  ]);
  assert.equal(after.length, 5, "nothing deleted");
});

test("scenario: a second run with nothing changed writes nothing", async () => {
  const jira = seeded([[1, "CloudScript Mermaid Diagrams for Confluence"], [9, "Not app-specific"]]);
  await runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS });
  const writes = jira.writes.length;
  await runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS });
  assert.equal(jira.writes.length, writes);
});

test("scenario: a dry run reads but performs no write", async () => {
  const jira = seeded([[9, "Not app-specific"]]);
  const { plan, verified } = await runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS, dryRun: true });
  assert.equal(plan.create.length, 3);
  assert.equal(verified, false);
  assert.deepEqual(jira.writes, []);
});

test("scenario: the global context is never a target", async () => {
  const jira = new MockJira({ fieldId: FIELD, mappings: [{ contextId: "10630", isGlobalContext: true }] });
  await assert.rejects(resolveContext(jira, FIELD, PROJECT), /refusing to touch the global context/);
  await assert.rejects(runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS }), /global context/);
  assert.deepEqual(jira.writes, []);
});

test("refuses when the project has more than one context for the field", async () => {
  const jira = new MockJira({ fieldId: FIELD, mappings: [{ contextId: "1", projectId: PROJECT }, { contextId: "2", projectId: PROJECT }] });
  await assert.rejects(resolveContext(jira, FIELD, PROJECT), /expected exactly one/);
});

test("a failed write fails the run instead of being reported as done", async () => {
  const jira = seeded([[9, "Not app-specific"]]);
  jira.failNext = "reorderOptions";
  await assert.rejects(runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS }), /mock failure/);
});

test("a write that Jira accepts but does not apply is caught by the read-back", async () => {
  const jira = seeded([[9, "Not app-specific"]]);
  jira.createOptions = async () => []; // silently drops the new options
  await assert.rejects(runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, apps: APPS }), /missing; not reordering|read-back does not match/);
});

test("the real registry plans cleanly against an empty context (the commit gate)", async () => {
  const live = selectApps(loadRegistry(path.join(repoRoot, "_data", "apps"))).live;
  assert.ok(live.length > 0);
  const jira = seeded([]);
  const { plan } = await runSync({ client: jira, fieldId: FIELD, projectId: PROJECT, dryRun: true, repoRoot });
  assert.equal(plan.create.length, live.length);
});

test("the CLI refuses a live run without settings and exits 2", async () => {
  const errors = [];
  const original = console.error;
  console.error = (m) => errors.push(String(m));
  try {
    assert.equal(await main([], {}), 2);
  } finally {
    console.error = original;
  }
  assert.match(errors.join("\n"), /Refusing a live run/);
});

test("the CLI dry run without settings exits 0 and touches no network", async () => {
  const logs = [];
  const original = console.log;
  console.log = (m) => logs.push(String(m));
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network used"); };
  try {
    assert.equal(await main(["--dry-run"], {}), 0);
  } finally {
    console.log = original;
    globalThis.fetch = realFetch;
  }
  assert.match(logs.join("\n"), /nothing is read from or written to Jira/);
});
