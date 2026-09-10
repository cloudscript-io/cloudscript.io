// Orchestration tests with the in-memory client (spec kb-sync: "Live registry entries select
// the guides to sync", "Writes are idempotent and change-only", "Triggers, dry run and failure
// reporting"), plus the command line entry points.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LIVE_SLUGS, fixtureHtml, fixturesDir, repoRoot, scriptsDir } from "./helpers.mjs";
import { loadRegistry } from "../../scripts/kb-sync/registry.mjs";
import { ConvertError, convertGuide, hashContent } from "../../scripts/kb-sync/convert.mjs";
import { ARCHIVE_PARENT_TITLE, ConfluenceError } from "../../scripts/kb-sync/confluence.mjs";
import { MockConfluence } from "../../scripts/kb-sync/mock-confluence.mjs";
import { ARCHIVED_PREFIX, formatMarkdown, formatTable, main, runSync } from "../../scripts/kb-sync/sync.mjs";

const registry = loadRegistry(fixturesDir);
const bySlug = Object.fromEntries(registry.map((app) => [app.slug, app]));
const NOW = new Date("2026-09-10T10:00:00.000Z");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const MESSAGE = "kb-sync 0123456";
const converted = Object.fromEntries(LIVE_SLUGS.map((slug) => [slug, convertGuide(fixtureHtml(slug), bySlug[slug])]));

function run(client, overrides = {}) {
  return runSync({ client, spaceKey: "CSHELP", commit: COMMIT, registry, readSource: fixtureHtml, now: () => NOW, ...overrides });
}

function seedSynced(mock, slug, { title = bySlug[slug].name, contentHash = converted[slug].contentHash, body = converted[slug].body, parentId, extra = {} } = {}) {
  return mock.seedPage({
    title,
    body,
    parentId,
    property: { slug, sourcePath: `apps/${slug}/index.html`, contentHash, syncedAt: "2026-09-01T00:00:00.000Z", commit: "old", ...extra },
  });
}

const slugsWith = (results, action) => results.filter((r) => r.action === action).map((r) => r.slug);
const ops = (mock, op) => mock.writes.filter((w) => w.op === op);
const ALLOWED_OPS = new Set(["createPage", "updatePage", "movePage", "setProperty"]);

// --- Dry run ---------------------------------------------------------------------------------

test("scenario: dry run writes nothing (seven create intentions, coming-soon skipped)", async () => {
  const mock = new MockConfluence();
  const { results, failed } = await run(mock, { dryRun: true });
  assert.equal(failed, false);
  assert.deepEqual(slugsWith(results, "create"), LIVE_SLUGS);
  const skipped = results.find((r) => r.slug === "email-viewer-jira");
  assert.equal(skipped.action, "skipped");
  assert.equal(skipped.detail, "status: coming-soon");
  assert.equal(results.length, 8);
  for (const r of results.filter((x) => x.action === "create")) {
    assert.equal(r.title, bySlug[r.slug].name);
    assert.match(r.hash, /^[0-9a-f]{12}$/);
    assert.match(r.detail, /^intended: under home/);
  }
  assert.deepEqual(mock.writes, [], "no create, update or property request is sent");
  assert.ok(mock.reads.some((r) => r.op === "getSpace") && mock.reads.some((r) => r.op === "listPages"), "reads happen");
});

test("dry run against existing state prints update and archive intentions, still writes nothing", async () => {
  const mock = new MockConfluence();
  seedSynced(mock, "typst-renderer", { contentHash: "stale" });
  seedSynced(mock, "nikoniko");
  mock.seedPage({ title: "Example App", property: { slug: "example", contentHash: "x" } });
  const { results } = await run(mock, { dryRun: true });
  assert.equal(results.find((r) => r.slug === "typst-renderer").action, "update");
  assert.match(results.find((r) => r.slug === "typst-renderer").detail, /^intended: version 1 to 2/);
  assert.equal(results.find((r) => r.slug === "nikoniko").action, "unchanged");
  assert.equal(results.find((r) => r.slug === "example").action, "archive");
  assert.equal(results.find((r) => r.slug === "example").title, `${ARCHIVED_PREFIX}Example App`);
  assert.equal(slugsWith(results, "create").length, 5);
  assert.deepEqual(mock.writes, []);
});

// --- Create, then idempotent ------------------------------------------------------------------

test("scenario: a live entry is synced: one page per live app, property set, read back, then unchanged", async () => {
  const mock = new MockConfluence();
  const first = await run(mock);
  assert.equal(first.failed, false);
  assert.deepEqual(slugsWith(first.results, "create"), LIVE_SLUGS);
  for (const slug of LIVE_SLUGS) {
    const app = bySlug[slug];
    const pages = mock.pagesByTitle(app.name);
    assert.equal(pages.length, 1, `${slug}: exactly one page titled with the registry name`);
    const page = mock.inspect(pages[0].id);
    assert.equal(page.parentId, "2", "created under the space home page");
    assert.equal(page.version.number, 1);
    assert.equal(page.body, converted[slug].body);
    assert.deepEqual(page.property, { slug, sourcePath: `apps/${slug}/index.html`, contentHash: converted[slug].contentHash, syncedAt: NOW.toISOString(), commit: COMMIT });
    const r = first.results.find((x) => x.slug === slug);
    assert.equal(r.pageId, pages[0].id);
    assert.equal(r.version, 1);
    assert.match(r.detail, /read back$/);
  }
  assert.equal(ops(mock, "createPage").length, 7);
  assert.equal(ops(mock, "setProperty").length, 7);
  assert.equal(ops(mock, "movePage").length, 0, "created in registry order, so no ordering move is needed");
  assert.ok(mock.writes.every((w) => ALLOWED_OPS.has(w.op)));
  assert.ok(ops(mock, "setProperty").every((w) => w.message === MESSAGE));

  const before = mock.writes.length;
  const second = await run(mock);
  assert.equal(second.failed, false);
  assert.deepEqual(slugsWith(second.results, "unchanged"), LIVE_SLUGS);
  assert.equal(mock.writes.length, before, "a second run sends no write at all");
  for (const slug of LIVE_SLUGS) assert.equal(mock.inspect(mock.pagesByTitle(bySlug[slug].name)[0].id).version.number, 1);
});

test("scenario: an unchanged guide creates no new version (found via CQL, and via the index when CQL is silent)", async () => {
  for (const cqlWorks of [true, false]) {
    const mock = new MockConfluence();
    mock.cqlWorks = cqlWorks;
    const ids = Object.fromEntries(LIVE_SLUGS.map((slug) => [slug, seedSynced(mock, slug)]));
    const { results, failed } = await run(mock);
    assert.equal(failed, false);
    assert.deepEqual(slugsWith(results, "unchanged"), LIVE_SLUGS);
    assert.deepEqual(mock.writes, [], "no update request is sent");
    for (const slug of LIVE_SLUGS) {
      assert.equal(mock.inspect(ids[slug]).version.number, 1, "version number unchanged");
      assert.equal(results.find((r) => r.slug === slug).detail, `found via ${cqlWorks ? "cql" : "index"}`);
    }
  }
});

// --- Update paths -----------------------------------------------------------------------------

test("scenario: a changed guide creates exactly one new version with the commit in the message", async () => {
  const mock = new MockConfluence();
  // The stored page was synced from a version of the guide that differed in one paragraph.
  const older = fixtureHtml("typst-renderer").replace("A size meter tracks how close", "A meter tracks how close");
  const olderConverted = convertGuide(older, bySlug["typst-renderer"]);
  assert.notEqual(olderConverted.contentHash, converted["typst-renderer"].contentHash);
  const typstId = seedSynced(mock, "typst-renderer", { contentHash: olderConverted.contentHash, body: olderConverted.body });
  for (const slug of LIVE_SLUGS) if (slug !== "typst-renderer") seedSynced(mock, slug);

  const { results, failed } = await run(mock);
  assert.equal(failed, false);
  assert.deepEqual(slugsWith(results, "update"), ["typst-renderer"]);
  assert.equal(slugsWith(results, "unchanged").length, 6);
  const updates = ops(mock, "updatePage");
  assert.equal(updates.length, 1, "exactly one update request");
  assert.deepEqual(updates[0], { op: "updatePage", id: typstId, title: bySlug["typst-renderer"].name, versionNumber: 2, message: MESSAGE });
  const page = mock.inspect(typstId);
  assert.equal(page.version.number, 2, "version increments by one");
  assert.equal(page.version.message, MESSAGE);
  assert.equal(page.body, converted["typst-renderer"].body);
  assert.equal(page.property.contentHash, converted["typst-renderer"].contentHash, "property hash equals the new computed hash");
  assert.equal(page.property.commit, COMMIT);
  assert.equal(ops(mock, "setProperty").length, 1);
  assert.equal(ops(mock, "createPage").length, 0);
  const r = results.find((x) => x.slug === "typst-renderer");
  assert.equal(r.version, 2);
  assert.match(r.detail, /^version 1 to 2; read back$/);
});

test("scenario: a renamed app keeps its page (same id, new title, no second page)", async () => {
  const mock = new MockConfluence();
  const oldTitle = "CloudScript Mermaid Diagrams (old name)";
  const mermaidId = seedSynced(mock, "mermaid", { title: oldTitle, contentHash: hashContent(converted.mermaid.body, oldTitle) });
  const { results, failed } = await run(mock);
  assert.equal(failed, false);
  const r = results.find((x) => x.slug === "mermaid");
  assert.equal(r.action, "update");
  assert.equal(r.pageId, mermaidId);
  assert.match(r.detail, /title "CloudScript Mermaid Diagrams \(old name\)" becomes "CloudScript Mermaid Diagrams for Confluence"/);
  assert.equal(mock.inspect(mermaidId).title, bySlug.mermaid.name);
  assert.equal(mock.inspect(mermaidId).version.number, 2);
  assert.equal(mock.pagesByTitle(bySlug.mermaid.name).length, 1);
  assert.equal(mock.pagesByTitle(oldTitle).length, 0);
  assert.equal(ops(mock, "createPage").filter((w) => w.title.includes("Mermaid")).length, 0, "no second page is created");
});

// --- Archive ----------------------------------------------------------------------------------

test("scenario: a retired entry is archived, not deleted (registry drop and coming-soon alike)", async () => {
  const mock = new MockConfluence();
  for (const slug of LIVE_SLUGS) seedSynced(mock, slug);
  const exampleId = mock.seedPage({ title: "Example App", body: "<p>old</p>", property: { slug: "example", sourcePath: "apps/example/index.html", contentHash: "e" } });
  const jiraId = mock.seedPage({ title: "MSG/EML Email Viewer for Jira", body: "<p>jira</p>", property: { slug: "email-viewer-jira", contentHash: "j" } });

  const { results, failed } = await run(mock);
  assert.equal(failed, false);
  assert.deepEqual(slugsWith(results, "archive").sort(), ["email-viewer-jira", "example"]);
  const parents = mock.pagesByTitle(ARCHIVE_PARENT_TITLE);
  assert.equal(parents.length, 1, "the Archived guides parent is created once, on demand");
  assert.equal(parents[0].parentId, "2", "under the space home page");
  for (const [id, oldTitle] of [[exampleId, "Example App"], [jiraId, "MSG/EML Email Viewer for Jira"]]) {
    const page = mock.inspect(id);
    assert.equal(page.title, `${ARCHIVED_PREFIX}${oldTitle}`);
    assert.equal(page.parentId, parents[0].id, "moved under the Archived guides parent");
    assert.equal(page.property.archivedAt, NOW.toISOString());
    assert.equal(page.version.number, 2);
    assert.equal(page.body.includes("old") || page.body.includes("jira"), true, "the body is kept as it was");
  }
  assert.ok(mock.writes.every((w) => ALLOWED_OPS.has(w.op)), "no delete operation exists, let alone is used");
  assert.equal(results.find((r) => r.slug === "example").detail, 'status absent from registry; under "Archived guides"; read back');
  assert.equal(results.find((r) => r.slug === "email-viewer-jira").detail, 'status coming-soon; under "Archived guides"; read back');

  const before = mock.writes.length;
  const again = await run(mock);
  assert.equal(again.failed, false);
  assert.equal(again.results.find((r) => r.slug === "example").action, "unchanged");
  assert.match(again.results.find((r) => r.slug === "example").detail, /^archived 2026-09-10T10:00:00/);
  assert.equal(mock.writes.length, before, "an archived page is left alone on the next run");
});

test("a slug that returns to live is un-archived by the same mechanism in reverse", async () => {
  const mock = new MockConfluence();
  const archiveParent = mock.seedPage({ title: ARCHIVE_PARENT_TITLE });
  const typstId = seedSynced(mock, "typst-renderer", {
    title: `${ARCHIVED_PREFIX}${bySlug["typst-renderer"].name}`,
    parentId: archiveParent,
    extra: { archivedAt: "2026-08-01T00:00:00.000Z" },
  });
  const dry = await run(mock, { dryRun: true });
  assert.equal(dry.results.find((r) => r.slug === "typst-renderer").action, "unarchive");
  assert.deepEqual(mock.writes, []);

  const { results, failed } = await run(mock);
  assert.equal(failed, false);
  const r = results.find((x) => x.slug === "typst-renderer");
  assert.equal(r.action, "unarchive");
  assert.equal(r.pageId, typstId);
  const page = mock.inspect(typstId);
  assert.equal(page.title, bySlug["typst-renderer"].name);
  assert.equal(page.parentId, "2", "back under the space home page");
  assert.equal(page.property.archivedAt, undefined);
  assert.equal(page.property.contentHash, converted["typst-renderer"].contentHash);
  assert.equal(page.version.number, 2);
  assert.equal(mock.pagesByTitle(bySlug["typst-renderer"].name).length, 1);
});

// --- Ordering ---------------------------------------------------------------------------------

test("D7: a page created between existing siblings is moved before the next one by registry order", async () => {
  const mock = new MockConfluence();
  seedSynced(mock, "mermaid");
  const typstId = seedSynced(mock, "typst-renderer");
  const { results, failed } = await run(mock);
  assert.equal(failed, false);
  const ps = results.find((r) => r.slug === "page-sharing");
  assert.equal(ps.action, "create");
  assert.match(ps.detail, /^under home, before typst-renderer; read back$/);
  const moves = ops(mock, "movePage");
  assert.deepEqual(moves, [{ op: "movePage", id: ps.pageId, position: "before", targetId: typstId }]);
  for (const slug of ["mcp-renderer", "radar-renderer", "nikoniko", "email-viewer"]) {
    assert.match(results.find((r) => r.slug === slug).detail, /^under home, last; read back$/);
  }
});

// --- Failure semantics -------------------------------------------------------------------------

test("scenario: one failing page does not hide the others (conversion failure)", async () => {
  const mock = new MockConfluence();
  const convert = (source, app) => {
    if (app.slug === "radar-renderer") throw new ConvertError("radar-renderer: converted body is not well-formed XML: end tag </p> does not match <td>");
    return convertGuide(source, app);
  };
  const { results, failed } = await run(mock, { convert });
  assert.equal(failed, true, "the run exits non-zero");
  assert.equal(slugsWith(results, "create").length, 6, "six pages are created");
  const r = results.find((x) => x.slug === "radar-renderer");
  assert.equal(r.action, "failed");
  assert.equal(r.title, bySlug["radar-renderer"].name, "the failed page is reported by name");
  assert.match(r.detail, /not well-formed XML/);
  assert.equal(mock.pagesByTitle(bySlug["radar-renderer"].name).length, 0, "no write is attempted for it");
  assert.equal(ops(mock, "createPage").length, 6);
});

test("scenario: one failing page does not hide the others (Confluence rejects one update)", async () => {
  const mock = new MockConfluence();
  const mermaidId = seedSynced(mock, "mermaid", { contentHash: "stale" });
  const typstId = seedSynced(mock, "typst-renderer", { contentHash: "stale" });
  mock.failOn = { op: "updatePage", pageId: mermaidId, error: new ConfluenceError({ status: 500, method: "PUT", path: `/wiki/api/v2/pages/${mermaidId}`, body: "internal error" }) };
  const { results, failed } = await run(mock);
  assert.equal(failed, true);
  assert.equal(results.find((r) => r.slug === "mermaid").action, "failed");
  assert.match(results.find((r) => r.slug === "mermaid").detail, /failed with 500/);
  assert.equal(results.find((r) => r.slug === "typst-renderer").action, "update");
  assert.equal(mock.inspect(typstId).version.number, 2);
  assert.equal(mock.inspect(mermaidId).version.number, 1, "the failed page is untouched");
  assert.equal(slugsWith(results, "create").length, 5);
});

test("a write whose read-back disagrees is reported as failed, not as done", async () => {
  const mock = new MockConfluence();
  const original = mock.getPage.bind(mock);
  let tampered = false;
  mock.getPage = async (id) => {
    const page = await original(id);
    if (page.title === bySlug.mermaid.name && !tampered) {
      tampered = true;
      return { ...page, title: "Something else" };
    }
    return page;
  };
  const { results, failed } = await run(mock);
  assert.equal(failed, true);
  assert.match(results.find((r) => r.slug === "mermaid").detail, /read-back of page .* failed: title is "Something else"/);
  assert.equal(slugsWith(results, "create").length, 6);
});

test("a CQL hit that disagrees with the property index fails that page; a hit outside the index is read directly", async () => {
  const mock = new MockConfluence();
  const typstId = seedSynced(mock, "typst-renderer");
  seedSynced(mock, "mermaid");
  // The mock uses private fields, so overrides go on a delegating wrapper rather than a subclass.
  const wrap = (overrides) => {
    const names = ["getSpace", "listPages", "getPage", "findPageByTitle", "createPage", "updatePage", "movePage", "getProperty", "setProperty", "searchPageIdBySlug", "indexSyncedPages", "ensureArchiveParent", "redact"];
    return Object.assign(Object.fromEntries(names.map((n) => [n, (...args) => mock[n](...args)])), overrides);
  };
  const conflicting = wrap({ searchPageIdBySlug: async (spaceKey, slug) => (slug === "typst-renderer" ? "999" : mock.searchPageIdBySlug(spaceKey, slug)) });
  const clash = await run(conflicting);
  assert.equal(clash.failed, true);
  assert.match(clash.results.find((r) => r.slug === "typst-renderer").detail, /CQL found page 999 .* resolve by hand/);
  assert.equal(clash.results.find((r) => r.slug === "mermaid").action, "unchanged");

  const noIndex = wrap({ indexSyncedPages: async () => new Map() });
  const direct = await run(noIndex);
  assert.equal(direct.failed, false);
  const r = direct.results.find((x) => x.slug === "typst-renderer");
  assert.equal(r.action, "unchanged");
  assert.equal(r.pageId, typstId);
  assert.equal(r.detail, "found via cql");
});

// --- Reporting and command line ----------------------------------------------------------------

test("formatTable and formatMarkdown lay out every result and name failures", () => {
  const results = [
    { slug: "mermaid", action: "create", title: "A | B", pageId: "10", version: 1, hash: "abc", detail: "under home, last" },
    { slug: "radar-renderer", action: "failed", title: "Radar", pageId: null, version: null, hash: "", detail: "boom" },
  ];
  const table = formatTable(results);
  assert.match(table, /^slug +action +title +page +version +hash +detail$/m);
  assert.match(table, /^mermaid +create +A \| B +10 +1 +abc +under home, last$/m);
  const md = formatMarkdown(results, { dryRun: true, commit: COMMIT });
  assert.match(md, /^### kb-sync dry run \(0123456\)$/m);
  assert.match(md, /^\| mermaid \| create \| A \\\| B \| 10 \| 1 \| abc \| under home, last \|$/m);
  assert.match(md, /\*\*1 page\(s\) failed: radar-renderer\*\*/);
  assert.match(formatMarkdown(results.slice(0, 1), { dryRun: false, commit: "local" }), /live run \(local\)[\s\S]*All pages processed without error/);
});

test("main: half-configured credentials fail loudly before anything runs", async () => {
  await assert.rejects(main(["--dry-run"], { CONFLUENCE_BASE_URL: "https://cloudscript.atlassian.net" }), /incomplete: missing CONFLUENCE_USER_EMAIL/);
});

test("command line: the offline dry run exits 0 with seven create intentions; a live run without credentials is refused", () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CONFLUENCE_") && !k.startsWith("KB_") && k !== "GITHUB_STEP_SUMMARY" && k !== "GITHUB_SHA"));
  const summary = path.join(mkdtempSync(path.join(os.tmpdir(), "kb-sync-")), "summary.md");
  const script = path.join(scriptsDir, "sync.mjs");

  const dry = spawnSync(process.execPath, [script, "--dry-run"], { cwd: repoRoot, env: { ...env, GITHUB_STEP_SUMMARY: summary }, encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Dry run with no Confluence credentials/);
  assert.equal((dry.stdout.match(/^  create {4}/gm) ?? []).length, 7, "seven create intentions printed");
  assert.match(dry.stdout, /^email-viewer-jira +skipped .*status: coming-soon$/m);
  const md = readFileSync(summary, "utf8");
  assert.match(md, /^### kb-sync dry run/m);
  for (const slug of LIVE_SLUGS) assert.match(md, new RegExp(`^\\| ${slug} \\| create \\|`, "m"));

  const viaEnv = spawnSync(process.execPath, [script], { cwd: repoRoot, env: { ...env, KB_SYNC_DRY_RUN: "1" }, encoding: "utf8" });
  assert.equal(viaEnv.status, 0, viaEnv.stderr);
  assert.match(viaEnv.stdout, /Intended writes \(none performed\)/);

  const live = spawnSync(process.execPath, [script], { cwd: repoRoot, env, encoding: "utf8" });
  assert.equal(live.status, 2);
  assert.match(live.stderr, /Refusing a live run/);
});
