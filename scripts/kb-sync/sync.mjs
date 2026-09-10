#!/usr/bin/env node
// Orchestration: one Confluence page per live app, created, updated, left alone or archived
// (design D2, D5, D6, D7, D9, D10, D11).
//
//   node scripts/kb-sync/sync.mjs --dry-run     reads only, prints every intended write
//   KB_SYNC_DRY_RUN=1 node scripts/kb-sync/sync.mjs   the same, as the workflow sets it
//   node scripts/kb-sync/sync.mjs               live run; needs the four environment variables
//
// With no credentials in the environment a dry run uses an empty in-memory space, so it needs
// no network and doubles as the commit gate. A live run without credentials is refused. Pages
// are processed independently: one failure never blocks the others, every failure is named in
// the result table, and the process exits non-zero if any page failed. Every live write is
// followed by a read-back (title, version, property hash) before it is reported as done.
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadRegistry, selectApps } from "./registry.mjs";
import { readGuideSource } from "./extract.mjs";
import { convertGuide } from "./convert.mjs";
import { ConfluenceClient, credentialsFromEnv } from "./confluence.mjs";
import { MockConfluence } from "./mock-confluence.mjs";

export const ARCHIVED_PREFIX = "[Archived] ";
export const DEFAULT_SPACE_KEY = "CSHELP";
const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");

const shortCommit = (commit) => (commit === "local" ? commit : String(commit).slice(0, 7));

/** The commit named in version messages and the page property. */
export function resolveCommit(env = process.env) {
  for (const name of ["GITHUB_SHA", "KB_SYNC_COMMIT"]) {
    if (typeof env[name] === "string" && env[name].trim() !== "") return env[name].trim();
  }
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local";
  } catch {
    return "local";
  }
}

function result(slug, action, fields = {}) {
  return { slug, action, title: "", pageId: null, version: null, hash: "", detail: "", ...fields };
}

/**
 * Run the sync. Everything that touches the outside world is injectable so the tests and the
 * offline dry run can substitute it: `client` (a ConfluenceClient or MockConfluence),
 * `registry` and `readSource` (default: the repository's own files), `convert` and `now`.
 * Returns `{ results, failed }`; never throws for a single page's problem.
 */
export async function runSync({
  client,
  spaceKey,
  dryRun = false,
  commit = "local",
  repoRoot = REPO_ROOT,
  registry = loadRegistry(path.join(repoRoot, "_data", "apps")),
  readSource = (slug) => readGuideSource(repoRoot, slug),
  convert = convertGuide,
  now = () => new Date(),
  log = () => {},
}) {
  const { live, others } = selectApps(registry);
  const message = `kb-sync ${shortCommit(commit)}`;
  const results = [];

  const space = await client.getSpace(spaceKey);
  const index = await client.indexSyncedPages(space.id);
  log(`space ${space.key} (id ${space.id}, home ${space.homepageId}): ${index.size} synced page(s) found`);

  const propertyValue = (app, contentHash, sourcePath, extra = {}) => ({
    slug: app.slug,
    sourcePath,
    contentHash,
    syncedAt: now().toISOString(),
    commit,
    ...extra,
  });

  /** Read a page back after a write and check what was written is what is stored. */
  const verify = async (pageId, { title, version, contentHash }) => {
    const page = await client.getPage(pageId);
    const property = await client.getProperty(pageId);
    const problems = [];
    if (page.title !== title) problems.push(`title is "${page.title}", expected "${title}"`);
    if (version != null && page.version.number !== version) problems.push(`version is ${page.version.number}, expected ${version}`);
    if (contentHash != null && property?.value?.contentHash !== contentHash) problems.push("property hash does not match");
    if (problems.length) throw new Error(`read-back of page ${pageId} failed: ${problems.join("; ")}`);
    return page;
  };

  /** Locate the page for a slug: the D2 CQL lookup first, then the property index. */
  const locate = async (slug) => {
    const indexed = index.get(slug) ?? null;
    const cqlId = await client.searchPageIdBySlug(space.key, slug);
    if (cqlId && indexed && cqlId !== indexed.page.id) {
      throw new Error(`CQL found page ${cqlId} for slug ${slug} but the property index has page ${indexed.page.id}; resolve by hand`);
    }
    if (cqlId && !indexed) {
      const page = await client.getPage(cqlId);
      const property = await client.getProperty(cqlId);
      if (property?.value?.slug !== slug) throw new Error(`CQL found page ${cqlId} for slug ${slug} but its property says "${property?.value?.slug}"`);
      return { page, property, via: "cql" };
    }
    return indexed ? { ...indexed, via: cqlId ? "cql" : "index" } : null;
  };

  /** D7: on create only, place the new page before the first live sibling with a higher order. */
  const nextSibling = (app) => {
    let best = null;
    for (const candidate of live) {
      if (candidate.slug === app.slug || candidate.order <= app.order) continue;
      const entry = index.get(candidate.slug);
      if (!entry || entry.property?.value?.archivedAt) continue;
      if (!best || candidate.order < best.app.order) best = { app: candidate, entry };
    }
    return best;
  };

  for (const app of live) {
    try {
      const { title, body, contentHash, sourcePath } = convert(readSource(app.slug), app);
      const found = await locate(app.slug);
      const hash = contentHash.slice(0, 12);

      if (!found) {
        const sibling = nextSibling(app);
        const detail = sibling ? `under home, before ${sibling.app.slug}` : "under home, last";
        if (dryRun) {
          results.push(result(app.slug, "create", { title, hash, detail: `intended: ${detail}` }));
          continue;
        }
        const page = await client.createPage({ spaceId: space.id, parentId: space.homepageId, title, body });
        await client.setProperty(page.id, propertyValue(app, contentHash, sourcePath), { message });
        if (sibling) await client.movePage(page.id, "before", sibling.entry.page.id);
        const stored = await verify(page.id, { title, version: 1, contentHash });
        index.set(app.slug, { page: stored, property: { value: { slug: app.slug, contentHash } } });
        results.push(result(app.slug, "create", { title, pageId: page.id, version: stored.version.number, hash, detail: `${detail}; read back` }));
        continue;
      }

      const { page, property, via } = found;
      const stored = property?.value ?? {};
      if (stored.archivedAt) {
        const detail = `was archived ${stored.archivedAt}; back under home`;
        if (dryRun) {
          results.push(result(app.slug, "unarchive", { title, pageId: page.id, version: page.version.number, hash, detail: `intended: ${detail} (found via ${via})` }));
          continue;
        }
        const next = page.version.number + 1;
        await client.updatePage({ id: page.id, title, body, versionNumber: next, message });
        await client.movePage(page.id, "append", space.homepageId);
        await client.setProperty(page.id, propertyValue(app, contentHash, sourcePath), { message });
        const after = await verify(page.id, { title, version: next, contentHash });
        results.push(result(app.slug, "unarchive", { title, pageId: page.id, version: after.version.number, hash, detail: `${detail}; read back` }));
        continue;
      }

      if (stored.contentHash === contentHash) {
        results.push(result(app.slug, "unchanged", { title: page.title, pageId: page.id, version: page.version.number, hash, detail: `found via ${via}` }));
        continue;
      }

      const renamed = page.title !== title ? `; title "${page.title}" becomes "${title}"` : "";
      if (dryRun) {
        results.push(result(app.slug, "update", { title, pageId: page.id, version: page.version.number, hash, detail: `intended: version ${page.version.number} to ${page.version.number + 1}${renamed} (found via ${via})` }));
        continue;
      }
      const next = page.version.number + 1;
      await client.updatePage({ id: page.id, title, body, versionNumber: next, message });
      await client.setProperty(page.id, propertyValue(app, contentHash, sourcePath), { message });
      const after = await verify(page.id, { title, version: next, contentHash });
      results.push(result(app.slug, "update", { title, pageId: page.id, version: after.version.number, hash, detail: `version ${page.version.number} to ${after.version.number}${renamed}; read back` }));
    } catch (err) {
      log(`${app.slug}: ${err?.message ?? err}`);
      results.push(result(app.slug, "failed", { title: app.name, detail: String(err?.message ?? err).split("\n")[0].slice(0, 300) }));
    }
  }

  // D6: anything in the space that is no longer live is archived, never deleted.
  const liveSlugs = new Set(live.map((app) => app.slug));
  const retired = [];
  for (const app of others) retired.push({ slug: app.slug, status: app.status, entry: index.get(app.slug) ?? null });
  for (const [slug, entry] of index) {
    if (!liveSlugs.has(slug) && !others.some((app) => app.slug === slug)) retired.push({ slug, status: "absent from registry", entry });
  }
  for (const { slug, status, entry } of retired) {
    try {
      if (!entry) {
        results.push(result(slug, "skipped", { detail: `status: ${status}` }));
        continue;
      }
      const { page, property } = entry;
      if (property?.value?.archivedAt) {
        results.push(result(slug, "unchanged", { title: page.title, pageId: page.id, version: page.version.number, detail: `archived ${property.value.archivedAt}` }));
        continue;
      }
      const title = page.title.startsWith(ARCHIVED_PREFIX) ? page.title : `${ARCHIVED_PREFIX}${page.title}`;
      if (dryRun) {
        results.push(result(slug, "archive", { title, pageId: page.id, version: page.version.number, detail: `intended: status ${status}; retitle and move under "Archived guides"` }));
        continue;
      }
      const parent = await client.ensureArchiveParent(space.id, space.homepageId);
      const current = await client.getPage(page.id);
      const next = current.version.number + 1;
      await client.updatePage({ id: page.id, title, body: current.body, versionNumber: next, message });
      await client.movePage(page.id, "append", parent.id);
      await client.setProperty(page.id, { ...(property?.value ?? { slug }), archivedAt: now().toISOString(), commit }, { message });
      const after = await verify(page.id, { title, version: next });
      results.push(result(slug, "archive", { title, pageId: page.id, version: after.version.number, detail: `status ${status}; under "Archived guides"; read back` }));
    } catch (err) {
      log(`${slug}: ${err?.message ?? err}`);
      results.push(result(slug, "failed", { detail: String(err?.message ?? err).split("\n")[0].slice(0, 300) }));
    }
  }

  return { results, failed: results.some((r) => r.action === "failed"), dryRun, space: { id: space.id, key: space.key } };
}

// --- Reporting -------------------------------------------------------------------------------

const COLUMNS = [
  ["slug", (r) => r.slug],
  ["action", (r) => r.action],
  ["title", (r) => r.title],
  ["page", (r) => r.pageId ?? ""],
  ["version", (r) => (r.version == null ? "" : String(r.version))],
  ["hash", (r) => r.hash],
  ["detail", (r) => r.detail],
];

export function formatTable(results) {
  const rows = results.map((r) => COLUMNS.map(([, get]) => String(get(r))));
  const widths = COLUMNS.map(([name], i) => Math.max(name.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  return [line(COLUMNS.map(([name]) => name)), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

export function formatMarkdown(results, { dryRun, commit }) {
  const escape = (s) => String(s).replace(/\|/g, "\\|");
  const lines = [
    `### kb-sync ${dryRun ? "dry run" : "live run"} (${shortCommit(commit)})`,
    "",
    `| ${COLUMNS.map(([name]) => name).join(" | ")} |`,
    `| ${COLUMNS.map(() => "---").join(" | ")} |`,
    ...results.map((r) => `| ${COLUMNS.map(([, get]) => escape(get(r))).join(" | ")} |`),
    "",
  ];
  const failed = results.filter((r) => r.action === "failed");
  lines.push(failed.length ? `**${failed.length} page(s) failed: ${failed.map((r) => r.slug).join(", ")}**` : "All pages processed without error.");
  return `${lines.join("\n")}\n`;
}

// --- CLI -------------------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({ args: argv, options: { "dry-run": { type: "boolean", default: false }, verbose: { type: "boolean", default: false } } });
  const dryRun = values["dry-run"] || env.KB_SYNC_DRY_RUN === "1";
  const log = values.verbose || env.KB_SYNC_VERBOSE === "1" ? (line) => console.error(line) : () => {};
  const commit = resolveCommit(env);

  const credentials = credentialsFromEnv(env);
  let client;
  let spaceKey;
  if (credentials) {
    client = new ConfluenceClient({ ...credentials, log });
    spaceKey = credentials.spaceKey;
    console.log(`${dryRun ? "Dry run" : "Live run"} against ${credentials.baseUrl} space ${spaceKey} as ${credentials.email} (commit ${shortCommit(commit)})`);
  } else if (dryRun) {
    client = new MockConfluence({ spaceKey: DEFAULT_SPACE_KEY });
    spaceKey = DEFAULT_SPACE_KEY;
    console.log(`Dry run with no Confluence credentials in the environment: using an empty in-memory space ${spaceKey}, nothing is read from or written to Confluence (commit ${shortCommit(commit)})`);
  } else {
    console.error("Refusing a live run: CONFLUENCE_BASE_URL, CONFLUENCE_USER_EMAIL, CONFLUENCE_API_TOKEN and KB_SPACE_KEY are not set. Use --dry-run to run without them.");
    return 2;
  }

  const { results, failed } = await runSync({ client, spaceKey, dryRun, commit, log });
  if (dryRun) {
    console.log("");
    console.log("Intended writes (none performed):");
    for (const r of results.filter((x) => ["create", "update", "archive", "unarchive"].includes(x.action))) {
      console.log(`  ${r.action.padEnd(9)} ${r.slug.padEnd(18)} "${r.title}"${r.hash ? `  hash=${r.hash}` : ""}  ${r.detail.replace(/^intended: /, "")}`);
    }
  }
  console.log("");
  console.log(formatTable(results));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, formatMarkdown(results, { dryRun, commit }));
  if (failed) {
    console.error(`\n${results.filter((r) => r.action === "failed").length} page(s) failed; see the table above.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err?.message ?? err);
      process.exit(1);
    },
  );
}
