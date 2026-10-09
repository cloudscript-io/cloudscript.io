#!/usr/bin/env node
// Keeps the "Which app is this about?" options on the Cloudscript Support contact form in step
// with the app registry (spec jira-app-options).
//
//   node scripts/jira-options-sync/sync.mjs --dry-run        reads only, prints every intended write
//   JIRA_OPTIONS_DRY_RUN=1 node scripts/jira-options-sync/sync.mjs   the same, as the workflow sets it
//   node scripts/jira-options-sync/sync.mjs                  live run; needs the Jira environment
//
// Source of truth: `_data/apps/*.yml` entries with `status: live`, read with kb-sync's registry
// parser. Target: the one non-global context of JIRA_APP_FIELD_ID mapped to JIRA_PROJECT_ID.
// Options are created, renamed, re-enabled, disabled and reordered; never deleted. With no
// credentials a dry run uses an in-memory context holding nothing, so it needs no network and
// doubles as the commit gate. Every live run ends by reading the options back and re-planning:
// the run passes only if that second plan is empty.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadRegistry, selectApps } from "../kb-sync/registry.mjs";
import { planOptions, isEmptyPlan, PRESERVED_OPTIONS } from "./plan.mjs";
import { JiraClient, credentialsFromEnv } from "./jira.mjs";
import { MockJira } from "./mock-jira.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
export const OFFLINE_FIELD_ID = "customfield_10458";
export const OFFLINE_PROJECT_ID = "10134";

/** The single project-scoped context this run may write to; refuses anything ambiguous. */
export async function resolveContext(client, fieldId, projectId) {
  const mappings = await client.listProjectMappings(fieldId);
  const mine = mappings.filter((m) => String(m.projectId) === String(projectId) && !m.isGlobalContext);
  if (mine.length === 0) throw new Error(`field ${fieldId} has no context scoped to project ${projectId}; refusing to touch the global context`);
  if (mine.length > 1) throw new Error(`field ${fieldId} has ${mine.length} contexts scoped to project ${projectId} (${mine.map((m) => m.contextId).join(", ")}); expected exactly one`);
  return String(mine[0].contextId);
}

/** One line per intended or performed write, for the log and the job summary. */
export function describePlan(plan) {
  const lines = [];
  for (const c of plan.create) lines.push(`create   "${c.value}" (${c.slug})`);
  for (const u of plan.update) lines.push(u.from === u.value ? `enable   "${u.value}" (${u.slug})` : `rename   "${u.from}" -> "${u.value}" (${u.slug})`);
  for (const d of plan.disable) lines.push(`disable  "${d.value}"`);
  if (plan.order) lines.push(`reorder  ${plan.order.map((v) => `"${v}"`).join(", ")}`);
  return lines;
}

/**
 * Run the sync. `client` is a JiraClient or MockJira; `apps` defaults to the live registry
 * entries. Returns { plan, verified, contextId }. Throws on any failure; the CLI turns that into
 * a non-zero exit. Writes happen only when dryRun is false.
 */
export async function runSync({ client, fieldId, projectId, dryRun = false, apps, repoRoot = REPO_ROOT, preserved = PRESERVED_OPTIONS, log = () => {} }) {
  const live = apps ?? selectApps(loadRegistry(path.join(repoRoot, "_data", "apps"))).live;
  const contextId = await resolveContext(client, fieldId, projectId);
  log(`context ${contextId} for project ${projectId}`);
  const before = await client.listOptions(fieldId, contextId);
  const plan = planOptions({ apps: live, options: before, preserved });
  if (dryRun || isEmptyPlan(plan)) return { plan, verified: !dryRun, contextId };

  if (plan.create.length) await client.createOptions(fieldId, contextId, plan.create.map((c) => c.value));
  const updates = [
    ...plan.update.map(({ id, value, disabled }) => ({ id, value, disabled })),
    ...plan.disable.map(({ id, value }) => ({ id, value, disabled: true })),
  ];
  if (updates.length) await client.updateOptions(fieldId, contextId, updates);
  if (plan.order) {
    const now = await client.listOptions(fieldId, contextId);
    const idByValue = new Map(now.map((o) => [o.value, o.id]));
    const ids = plan.order.map((value) => {
      const id = idByValue.get(value);
      if (!id) throw new Error(`after the writes, option "${value}" is missing; not reordering`);
      return id;
    });
    await client.reorderOptions(fieldId, contextId, ids);
  }

  // Read back and re-plan: a correct run leaves nothing to do.
  const after = await client.listOptions(fieldId, contextId);
  const residual = planOptions({ apps: live, options: after, preserved });
  if (!isEmptyPlan(residual)) {
    throw new Error(`read-back does not match the registry; still to do:\n  ${describePlan(residual).join("\n  ")}`);
  }
  return { plan, verified: true, contextId };
}

export function formatMarkdown(plan, { dryRun, verified }) {
  const lines = [`### jira-options-sync ${dryRun ? "dry run" : "live run"}`, ""];
  const described = describePlan(plan);
  if (described.length === 0) lines.push("No changes: the form's app options already match the registry.");
  else lines.push(dryRun ? "Intended writes (none performed):" : "Writes performed:", "", "```", ...described, "```");
  if (!dryRun) lines.push("", verified ? "Read-back verified: the options match the registry." : "Read-back NOT verified.");
  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({ args: argv, options: { "dry-run": { type: "boolean", default: false }, verbose: { type: "boolean", default: false } } });
  const dryRun = values["dry-run"] || env.JIRA_OPTIONS_DRY_RUN === "1";
  const log = values.verbose || env.JIRA_OPTIONS_VERBOSE === "1" ? (line) => console.error(line) : () => {};

  const credentials = credentialsFromEnv(env);
  let client;
  let fieldId;
  let projectId;
  if (credentials) {
    client = new JiraClient({ ...credentials, log });
    ({ fieldId, projectId } = credentials);
    const base = new URL(client.baseUrl);
    console.log(`${dryRun ? "Dry run" : "Live run"} with ${client.authMode} auth against ${base.host}${base.pathname} field ${fieldId} project ${projectId}`);
  } else if (dryRun) {
    client = new MockJira({ fieldId: OFFLINE_FIELD_ID, mappings: [{ contextId: "1", projectId: OFFLINE_PROJECT_ID }] });
    fieldId = OFFLINE_FIELD_ID;
    projectId = OFFLINE_PROJECT_ID;
    console.log("Dry run with no Jira settings in the environment: planning against an empty in-memory context; nothing is read from or written to Jira");
  } else {
    console.error("Refusing a live run: JIRA_BASE_URL, JIRA_API_TOKEN, JIRA_APP_FIELD_ID and JIRA_PROJECT_ID are not set (JIRA_USER_EMAIL is optional: set it for Basic auth, leave it unset for Bearer). Use --dry-run to run without them.");
    return 2;
  }

  let outcome;
  try {
    outcome = await runSync({ client, fieldId, projectId, dryRun, log });
  } catch (err) {
    const message = typeof client.redact === "function" ? client.redact(err?.message ?? String(err)) : (err?.message ?? String(err));
    console.error(message);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### jira-options-sync failed\n\n\`\`\`\n${message}\n\`\`\`\n`);
    return 1;
  }
  const described = describePlan(outcome.plan);
  console.log(described.length ? `${dryRun ? "Intended writes (none performed)" : "Writes performed"}:\n  ${described.join("\n  ")}` : "No changes: the form's app options already match the registry.");
  if (!dryRun) console.log(outcome.verified ? "Read-back verified." : "Read-back NOT verified.");
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, formatMarkdown(outcome.plan, { dryRun, verified: outcome.verified }));
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
