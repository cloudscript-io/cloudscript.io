// The pure part of the sync: given the live apps from the registry and the options currently
// on the CUS context of the "Cloudscript app" field, work out the writes that make the two
// agree. No I/O here, so every rule is tested directly (spec jira-app-options).
//
// Rules, in the order they are applied:
//   1. A live app whose name is already an option is left alone, or re-enabled if disabled.
//   2. A live app whose name is not an option, but whose `former_names` (or a case-only
//      variant of its name) is, has that option renamed in place, so existing tickets follow
//      the app to its new name instead of splitting across two values.
//   3. Any other live app gets a new option.
//   4. An enabled option that matches no live app and is not preserved is disabled, never
//      deleted, so tickets that already carry it keep their value.
//   5. Enabled app options are ordered by name, then the preserved options in their listed
//      order, then every disabled option in its current relative order.
// Preserved options (for example "Not app-specific") are never renamed, disabled or created.

export const PRESERVED_OPTIONS = Object.freeze(["Not app-specific"]);

export class PlanError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanError";
  }
}

const fold = (s) => String(s).trim().toLocaleLowerCase("en-AU");
const byName = (a, b) => a.localeCompare(b, "en-AU", { sensitivity: "base" }) || a.localeCompare(b, "en-AU");

/**
 * @param {{ apps: {slug: string, name: string, former_names?: string[]}[],
 *           options: {id: string, value: string, disabled: boolean}[],
 *           preserved?: string[] }} input
 * @returns {{ create: {slug, value}[], update: {id, slug, from, value, disabled}[],
 *             disable: {id, value}[], order: string[] | null, desired: string[] }}
 *   `order` is the full list of option values in the desired order when the current order
 *   differs (null when it already matches); `desired` is that order regardless.
 */
export function planOptions({ apps, options, preserved = PRESERVED_OPTIONS }) {
  const preservedFolded = new Set(preserved.map(fold));
  const seen = new Map();
  for (const app of apps) {
    if (typeof app.name !== "string" || app.name.trim() === "") throw new PlanError(`registry entry ${app.slug} has no name`);
    if (app.name.trim() !== app.name) throw new PlanError(`registry entry ${app.slug}: name has leading or trailing spaces`);
    if (app.name.length > 255) throw new PlanError(`registry entry ${app.slug}: name is longer than Jira's 255-character option limit`);
    const key = fold(app.name);
    if (preservedFolded.has(key)) throw new PlanError(`registry entry ${app.slug}: name "${app.name}" collides with a preserved option`);
    if (seen.has(key)) throw new PlanError(`registry entries ${seen.get(key)} and ${app.slug} have the same name "${app.name}"`);
    seen.set(key, app.slug);
  }
  const optionKeys = new Map();
  for (const o of options) {
    const key = fold(o.value);
    if (optionKeys.has(key)) throw new PlanError(`the field has two options that differ only in case or spacing: "${optionKeys.get(key).value}" and "${o.value}"; resolve this by hand first`);
    optionKeys.set(key, o);
  }

  const claimed = new Set(); // option ids matched to a live app or preserved
  for (const o of options) if (preservedFolded.has(fold(o.value))) claimed.add(o.id);

  const create = [];
  const update = [];
  const finalValue = new Map(); // option id -> value after the run
  for (const o of options) finalValue.set(o.id, o.value);
  const finalDisabled = new Map(options.map((o) => [o.id, Boolean(o.disabled)]));

  // Exact matches first, so a rename can never steal an option another app owns outright.
  const pending = [];
  for (const app of apps) {
    const exact = options.find((o) => o.value === app.name);
    if (exact) {
      claimed.add(exact.id);
      if (exact.disabled) {
        update.push({ id: exact.id, slug: app.slug, from: exact.value, value: app.name, disabled: false });
        finalDisabled.set(exact.id, false);
      }
    } else {
      pending.push(app);
    }
  }
  for (const app of pending) {
    const candidates = [app.name, ...(Array.isArray(app.former_names) ? app.former_names : [])].map(fold);
    const match = options.find((o) => !claimed.has(o.id) && candidates.includes(fold(o.value)));
    if (match) {
      claimed.add(match.id);
      update.push({ id: match.id, slug: app.slug, from: match.value, value: app.name, disabled: false });
      finalValue.set(match.id, app.name);
      finalDisabled.set(match.id, false);
    } else {
      create.push({ slug: app.slug, value: app.name });
    }
  }

  const disable = [];
  for (const o of options) {
    if (!claimed.has(o.id) && !o.disabled) {
      disable.push({ id: o.id, value: o.value });
      finalDisabled.set(o.id, true);
    }
  }

  // Desired order over values (new options have no id yet, so order is expressed by value).
  const appValues = apps.map((a) => a.name).sort(byName);
  const preservedPresent = preserved.filter((p) => options.some((o) => fold(o.value) === fold(p))).map((p) => options.find((o) => fold(o.value) === fold(p)).value);
  const disabledValues = options.filter((o) => finalDisabled.get(o.id) && !preservedFolded.has(fold(o.value))).map((o) => finalValue.get(o.id));
  const desired = [...appValues, ...preservedPresent, ...disabledValues];
  const current = options.map((o) => finalValue.get(o.id));
  const sameOrder = create.length === 0 && current.length === desired.length && current.every((v, i) => v === desired[i]);
  return { create, update, disable, order: sameOrder ? null : desired, desired };
}

/** True when a plan has nothing to do. */
export const isEmptyPlan = (plan) => plan.create.length === 0 && plan.update.length === 0 && plan.disable.length === 0 && plan.order === null;
