// Spec jira-app-options: the planning rules, tested without any I/O.
import test from "node:test";
import assert from "node:assert/strict";
import { planOptions, isEmptyPlan, PlanError, PRESERVED_OPTIONS } from "../../scripts/jira-options-sync/plan.mjs";

const app = (slug, name, extra = {}) => ({ slug, name, ...extra });
const opt = (id, value, disabled = false) => ({ id: String(id), value, disabled });

const APPS = [app("mermaid", "CloudScript Mermaid Diagrams for Confluence"), app("nikoniko", "NikoNiko Calendar"), app("typst-renderer", "Cloudscript Typst Renderer")];
const IN_STEP = [
  opt(1, "CloudScript Mermaid Diagrams for Confluence"),
  opt(3, "Cloudscript Typst Renderer"),
  opt(2, "NikoNiko Calendar"),
  opt(9, "Not app-specific"),
];

test("the preserved list is exactly the agreed escape option", () => {
  assert.deepEqual([...PRESERVED_OPTIONS], ["Not app-specific"]);
});

test("scenario: options already in step produce an empty plan", () => {
  const plan = planOptions({ apps: APPS, options: IN_STEP });
  assert.ok(isEmptyPlan(plan), JSON.stringify(plan));
});

test("scenario: a newly live app gets an option, placed by name before the preserved option", () => {
  const apps = [...APPS, app("wavedrom", "WaveDrom Renderer for Confluence")];
  const plan = planOptions({ apps, options: IN_STEP });
  assert.deepEqual(plan.create, [{ slug: "wavedrom", value: "WaveDrom Renderer for Confluence" }]);
  assert.deepEqual(plan.order.slice(-2), ["WaveDrom Renderer for Confluence", "Not app-specific"]);
});

test("scenario: an app that is no longer live has its option disabled, not deleted", () => {
  const plan = planOptions({ apps: APPS.filter((a) => a.slug !== "nikoniko"), options: IN_STEP });
  assert.deepEqual(plan.disable, [{ id: "2", value: "NikoNiko Calendar" }]);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.order, ["CloudScript Mermaid Diagrams for Confluence", "Cloudscript Typst Renderer", "Not app-specific", "NikoNiko Calendar"]);
});

test("scenario: an app that comes back re-enables its old option instead of adding a second one", () => {
  const options = [opt(1, "CloudScript Mermaid Diagrams for Confluence"), opt(3, "Cloudscript Typst Renderer"), opt(9, "Not app-specific"), opt(2, "NikoNiko Calendar", true)];
  const plan = planOptions({ apps: APPS, options });
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.update, [{ id: "2", slug: "nikoniko", from: "NikoNiko Calendar", value: "NikoNiko Calendar", disabled: false }]);
});

test("scenario: a renamed app with former_names renames its option in place", () => {
  const apps = [app("mermaid", "Mermaid Diagrams for Confluence", { former_names: ["CloudScript Mermaid Diagrams for Confluence"] }), APPS[1], APPS[2]];
  const plan = planOptions({ apps, options: IN_STEP });
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.disable, []);
  assert.deepEqual(plan.update, [{ id: "1", slug: "mermaid", from: "CloudScript Mermaid Diagrams for Confluence", value: "Mermaid Diagrams for Confluence", disabled: false }]);
});

test("a case-only rename is treated as a rename, never as a second option", () => {
  const apps = [app("mermaid", "Cloudscript Mermaid Diagrams for Confluence"), APPS[1], APPS[2]];
  const plan = planOptions({ apps, options: IN_STEP });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.update[0].id, "1");
});

test("a rename without former_names adds the new option and disables the old one", () => {
  const apps = [app("mermaid", "Mermaid Diagrams for Confluence"), APPS[1], APPS[2]];
  const plan = planOptions({ apps, options: IN_STEP });
  assert.deepEqual(plan.create, [{ slug: "mermaid", value: "Mermaid Diagrams for Confluence" }]);
  assert.deepEqual(plan.disable, [{ id: "1", value: "CloudScript Mermaid Diagrams for Confluence" }]);
});

test("scenario: the preserved option is never disabled, renamed or created", () => {
  const plan = planOptions({ apps: [], options: IN_STEP });
  assert.ok(!plan.disable.some((d) => d.value === "Not app-specific"));
  assert.ok(!plan.update.some((u) => u.from === "Not app-specific"));
  const none = planOptions({ apps: APPS, options: IN_STEP.filter((o) => o.value !== "Not app-specific") });
  assert.ok(!none.create.some((c) => c.value === "Not app-specific"));
});

test("an exact match is never stolen by another app's former_names", () => {
  const apps = [app("a", "Alpha"), app("b", "Beta", { former_names: ["Alpha"] })];
  const plan = planOptions({ apps, options: [opt(1, "Alpha")] });
  assert.deepEqual(plan.create, [{ slug: "b", value: "Beta" }]);
  assert.deepEqual(plan.update, []);
});

test("ordering is case-insensitive by name, preserved next, disabled last", () => {
  const options = [opt(5, "zeta"), opt(9, "Not app-specific"), opt(4, "Alpha"), opt(7, "Old", true)];
  const plan = planOptions({ apps: [app("z", "zeta"), app("a", "Alpha")], options });
  assert.deepEqual(plan.order, ["Alpha", "zeta", "Not app-specific", "Old"]);
});

test("refuses duplicate registry names, a name that collides with a preserved option, and over-long names", () => {
  assert.throws(() => planOptions({ apps: [app("a", "X"), app("b", "x")], options: [] }), PlanError);
  assert.throws(() => planOptions({ apps: [app("a", "Not App-Specific")], options: [] }), PlanError);
  assert.throws(() => planOptions({ apps: [app("a", "y".repeat(256))], options: [] }), PlanError);
  assert.throws(() => planOptions({ apps: [app("a", " padded")], options: [] }), PlanError);
});

test("refuses a context that already holds two options differing only in case", () => {
  assert.throws(() => planOptions({ apps: [], options: [opt(1, "Alpha"), opt(2, "alpha")] }), PlanError);
});
