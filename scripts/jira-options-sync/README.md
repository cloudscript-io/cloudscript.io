# jira-options-sync: keep the contact form's app list in step with the registry

The Cloudscript Support contact form ("Contact a person", at
`https://cloudscript.atlassian.net/helpcenter/support/contact-us`) asks "Which app is this
about?". That dropdown is the Jira custom field "Cloudscript app" (`customfield_10458`), and its
options live in the field's context scoped to the CUS space (project id `10134`, context
`10632`). This sync makes those options follow `_data/apps/*.yml`: when a release flips an entry
to `status: live` and is pushed to `main`, the app appears on the form with no manual step.

The design is in `openspec/changes/sync-app-options-to-jira-form/` and the requirements in its
`specs/jira-app-options/spec.md`. This file is the operator's view.

## What it does

- **Source:** every registry entry with `status: live`, read with kb-sync's registry parser
  (`scripts/kb-sync/registry.mjs`). The option text is the entry's `name`, which must stay
  identical to the Marketplace listing name.
- **Target:** the single non-global context of `JIRA_APP_FIELD_ID` mapped to `JIRA_PROJECT_ID`.
  The run refuses to start if there is no such context or more than one, and it never touches the
  field's global context (whose options were disabled by hand on 8 Oct 2026 because the portal
  was showing both contexts' options).
- **Writes:** create an option for a newly live app; re-enable an option whose app is live again;
  rename an option in place when the app's registry entry lists its old name in `former_names`;
  disable (never delete) an option whose app is no longer live, so tickets that carry it keep
  their value; order options by name, then `Not app-specific`, then disabled options.
- **Never touched:** `Not app-specific` (the `PRESERVED_OPTIONS` list in `plan.mjs`), the
  "Request kind" field, every other field, issues and projects.
- **Verification:** after writing, the run reads the options back and plans again. It passes only
  if that second plan is empty; otherwise it fails and names what is still out of step.

## Renaming an app

Add the old name to the entry before (or in the same commit as) the rename:

```yaml
name: Mermaid Diagrams for Confluence
former_names: [CloudScript Mermaid Diagrams for Confluence]
```

The option is then renamed in place. Without `former_names` the run adds a new option and
disables the old one, which splits existing tickets across two values. A rename that changes only
letter case is detected without `former_names`. Names containing a comma cannot go in the flow
list (the registry parser splits on commas).

## Running it

```sh
node scripts/jira-options-sync/sync.mjs --dry-run   # no settings: plans against an empty context, no network
node --test tests/jira-options-sync/*.test.mjs       # the tests the workflow runs first
```

In GitHub, `.github/workflows/jira-options-sync.yml` runs live on a push to `main` that changes a
registry file or the sync, and on manual dispatch (Actions, jira-options-sync, Run workflow),
where `dry_run` defaults to on and prints the intended writes against the real field without
writing.

## One-off setup (Natasha)

1. **Service account.** In admin.atlassian.com, create a service account (for example
   `jira-options-sync`). Editing custom field options requires the *Administer Jira* global
   permission, so add it to a group that holds that permission; the token's scopes (step 2) are
   what keep it narrow.
2. **Scoped API token.** Create an API token for the service account with only these granular
   scopes: `read:field:jira`, `read:field.option:jira`, `write:field.option:jira`. Do not use
   the classic `manage:jira-configuration` scope, which covers all Jira configuration. Set an
   expiry and add the renewal to the Obligations Register.
3. **GitHub Environment.** In the repository settings, create the Environment `jira`, restrict it
   to the `main` branch, and add these secrets:
   - `JIRA_BASE_URL`: `https://api.atlassian.com/ex/jira/<cloudId>` (the gateway form a scoped
     token needs; the cloud id is at `https://cloudscript.atlassian.net/_edge/tenant_info`)
   - `JIRA_API_TOKEN`: the token from step 2
   - `JIRA_APP_FIELD_ID`: `customfield_10458`
   - `JIRA_PROJECT_ID`: `10134`
   - `JIRA_USER_EMAIL`: leave unset (Bearer auth). Set it only to fall back to a classic token
     against `https://cloudscript.atlassian.net` with Basic auth.
4. **Dry run, then live.** Run the workflow manually with `dry_run` on; the summary should say
   "No changes". Then a push to `main` (or a manual run with `dry_run` off) runs live.

Until step 3 is done, a push that triggers the workflow fails at the Sync step with "Refusing a
live run". That is deliberate: it is visible, and nothing is written.
