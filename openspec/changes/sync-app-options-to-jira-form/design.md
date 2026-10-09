# sync-app-options-to-jira-form — design

## Context

The help centre's "Contact a person" form (CSM experience "Cloudscript Support", space CUS) has a
required select field, "Cloudscript app" (`customfield_10458`). Jira holds select options per
field context. The field has a global context (`10630`, created with the field; Jira forbids
narrowing or deleting it) and a context scoped to CUS (`10632`). On 8 Oct 2026 the portal was
found to show the options of both contexts, so the global context's options were disabled by
hand and the CUS context is the only one with enabled options. The registry already records which
apps are live and their exact Marketplace names.

## Goals / Non-Goals

Goals: the dropdown lists exactly the live apps plus "Not app-specific", by name, with no manual
step at launch; tickets keep their value when an app retires or is renamed; nothing is written
without a dry-run path and a read-back.

Non-goals: syncing "Request kind"; editing the form; sourcing from the Marketplace; deleting
options; managing the global context.

## Decisions

- **D1. The registry is the source, not the Marketplace or the knowledge base.** The registry
  flips to `live` on go-live day as part of `launch-app`, its `name` is the listing name, and the
  knowledge base is itself generated from it. The Marketplace API would lag approval, adds a
  second source that can disagree, and would need a schedule instead of a push trigger.
- **D2. A separate workflow, not a kb-sync step.** The Jira credential needs Jira-admin rights;
  keeping it in its own job and GitHub Environment (`jira`) means kb-sync's job never holds it and
  a failure in one sync never blocks the other. The registry parser is imported from
  `scripts/kb-sync/registry.mjs` rather than copied, and a change to it triggers this workflow.
- **D3. Least-privilege token at the gateway.** A service-account token with only
  `read:field:jira`, `read:field.option:jira`, `write:field.option:jira` (the granular
  alternatives Atlassian lists for the five operations used; marked Beta), sent as Bearer to
  `https://api.atlassian.com/ex/jira/{cloudId}`. Basic auth with a classic token is supported
  only as a fallback, selected by setting `JIRA_USER_EMAIL`, exactly as kb-sync does. The project
  id is configured rather than looked up, because reading a project needs a much wider scope set.
- **D4. Context resolution refuses ambiguity.** The target is the single non-global context
  mapped to `JIRA_PROJECT_ID`. Zero or several (Jira is rolling out multiple contexts per
  project, CHANGE-3082) is an error before any write.
- **D5. Disable, never delete.** Deleting an option clears it from every ticket that carries it.
  Disabled options are hidden from the form and stay on old tickets; a returning app re-enables
  its old option.
- **D6. Renames by `former_names`.** Jira options carry no metadata, so the link from slug to
  option is the name. An optional registry flow list `former_names` lets a rename update the
  option in place; a case-only change is matched without it. Exact matches are claimed first so a
  former name can never take an option another live app owns.
- **D7. Preserved options.** `PRESERVED_OPTIONS = ["Not app-specific"]` in `plan.mjs`: never
  created, renamed or disabled; placed after the apps. Changing that list is a code change,
  reviewed like any other.
- **D8. Order.** Enabled app options by name (case-insensitive, en-AU collation), then preserved
  options, then disabled options in their existing relative order; applied with one `move` call
  (`position: First`) only when the order differs.
- **D9. Verify by re-planning.** After the writes the run reads the options back and plans again;
  a non-empty second plan fails the run and is printed. This covers a 2xx that Jira did not
  apply.
- **D10. Pagination by offset.** `startAt`/`isLast` on the base URL; `nextPage` is ignored, so
  no request can leave `JIRA_BASE_URL`.

## Risks / Trade-offs

- **Admin-level account.** The account must be a Jira administrator; only the token's scopes
  narrow it. If Atlassian ever drops or changes the Beta granular scopes, the fallback is the
  classic `manage:jira-configuration` scope, which is much wider; that switch must be a conscious
  decision, recorded here, not a silent fix.
- **Name drift.** If a registry `name` is edited without `former_names`, tickets split across
  the old (disabled) and new option. Documented in the README; the plan output names both.
- **Global context.** If someone re-enables options on the global context by hand, customers see
  duplicates again; this sync will not notice because it never reads that context by design.
- **Comma in a name.** The registry parser splits flow lists on commas, so a former name with a
  comma cannot be listed. No current name has one.
