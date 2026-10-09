# sync-app-options-to-jira-form — proposal

## Why

On 8 Oct 2026 the Cloudscript Support help centre gained a "Contact a person" form whose
required "Which app is this about?" dropdown is a Jira select field ("Cloudscript app",
`customfield_10458`, context `10632` scoped to the CUS space). Its options were typed in by hand
from the registry names. Every app launch since July has shipped on its own schedule, and the
launch process already flips `_data/apps/<slug>.yml` to `status: live` on go-live day (it did so
for MSG/EML Email Viewer for Jira on 8 Oct). A hand-kept list on the form will be missed on some
launch, and a customer of the new app then has to pick a wrong app or "Not app-specific", which
mis-routes the ticket. This change makes the registry the only list: the form follows it on every
push to `main`.

## What Changes

- **A Node script** (`scripts/jira-options-sync/`, Node built-ins only) that reads the live
  registry entries with kb-sync's parser, reads the options of the CUS-scoped context, plans the
  difference and applies it: create, re-enable, rename in place (via an optional registry key
  `former_names`), disable (never delete) and reorder. Every live run ends with a read-back and a
  second plan that must be empty.
- **A GitHub Actions workflow** (`.github/workflows/jira-options-sync.yml`), separate from
  kb-sync, running on push to `main` when a registry file or the sync changes, and on manual
  dispatch with `dry_run` defaulting to on. It uses its own GitHub Environment, `jira`.
- **Tests** (`tests/jira-options-sync/`): planning rules, client request shapes and redaction,
  orchestration against an in-memory Jira, and the workflow file.
- **Not changing:** the website, kb-sync's behaviour (its registry parser is imported, not
  modified), the "Request kind" field, the form layout, the automation flows, and the field's
  global context.

## Capabilities

### New Capabilities

- `jira-app-options`: the registry drives the options of the contact form's app field.

### Modified Capabilities

- none.

## Impact

- **Code:** `scripts/jira-options-sync/{sync,plan,jira,mock-jira}.mjs` and `README.md`;
  `.github/workflows/jira-options-sync.yml`; `tests/jira-options-sync/*.test.mjs`. No
  dependency, no lockfile.
- **Registry:** one optional key, `former_names` (flow list), read only by this sync. No existing
  entry needs it today.
- **Existing users:** help-centre customers see the same list as today; the first live run plans
  no change (checked on 8 Oct 2026 against the live field: "intended writes: none").
- **Affected teams:** Natasha (service account, scoped token, GitHub Environment, first dry run);
  Patrick (review of the workflow and the token's privilege); anyone running `launch-app`, whose
  go-live registry flip now also updates the form.

## Adversarial security review

- **What the credential can do.** Editing field options needs the *Administer Jira* global
  permission, so the service account is a Jira administrator. The containment is the token, not
  the account: it carries only `read:field:jira`, `read:field.option:jira` and
  `write:field.option:jira`, so a leaked token can read fields and change select options site-wide
  but cannot read or change issues, users, permissions, workflows or automation. The classic
  `manage:jira-configuration` scope is rejected for that reason. Worst case with the granular
  token: someone renames or disables options on any select field until the token is revoked;
  annoying, visible, and reversible from the field's settings.
- **Where it can leak.** The repository is public. The token exists only as a secret of the
  `jira` Environment, restricted to `main`, so pull requests from forks and other branches never
  receive it. The workflow has `contents: read` only and checks out with
  `persist-credentials: false`. The script reads the token from the environment, builds the
  header once, never logs it, and redacts both the token and the header from every error,
  including network errors; tests assert this.
- **Where requests go.** Only to `JIRA_BASE_URL` (https enforced). Pagination advances by
  `startAt` and never follows a server-supplied `nextPage` link, so the Authorization header
  cannot be carried to another host; a test feeds it a hostile link.
- **Blast radius of a bad registry commit.** Anyone who can push to `main` can already publish
  the website; this adds the ability to change the dropdown's options on one context. The script
  refuses to act on the global context or on an ambiguous project mapping, never deletes, and
  rejects names that are empty, padded, longer than 255 characters, duplicated or equal to a
  preserved option.
- **Supply chain.** No npm dependencies; actions are pinned to commit SHAs (tested).
- **Kept separate from kb-sync** so the Confluence token never shares a job with a Jira-admin
  token, and a failure in one never blocks the other.

## Test plan

- Unit: every rule in the spec has a test in `plan.test.mjs`; client shapes, auth selection,
  pagination and redaction in `jira.test.mjs`; orchestration, idempotency, refusal paths, write
  failure and silent-drop detection in `sync.test.mjs`; workflow triggers, permissions, pinning
  and environment in `workflow.test.mjs`.
- Offline gate: `node scripts/jira-options-sync/sync.mjs --dry-run` with no settings exits 0
  and plans one create per live entry.
- Live, read-only: a planning pass against the real field's current options (done 8 Oct 2026:
  no intended writes).
- Live, after setup: a manual dispatch with `dry_run` on must report "No changes"; the next app
  launch's go-live push is the first real write, verified by its own read-back and by opening the
  form.
