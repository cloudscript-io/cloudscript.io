# sync-app-options-to-jira-form — tasks

A task is complete only when its automated verification passes.

## 1. Build (Claude, 8 Oct 2026)

- [x] 1.1 `plan.mjs`: planning rules D5 to D8, refusals. Verified: `node --test tests/jira-options-sync/plan.test.mjs`.
- [x] 1.2 `jira.mjs`: five operations, Bearer/Basic selection, redaction, offset pagination (D3, D10). Verified: `jira.test.mjs`.
- [x] 1.3 `sync.mjs` and `mock-jira.mjs`: context resolution (D4), apply, read-back re-plan (D9), dry run, CLI exit codes. Verified: `sync.test.mjs`.
- [x] 1.4 Workflow `.github/workflows/jira-options-sync.yml` (D2). Verified: `workflow.test.mjs`.
- [x] 1.5 Offline gate: `node scripts/jira-options-sync/sync.mjs --dry-run` exits 0 with one create per live entry.
- [x] 1.6 Read-only planning pass against the live field's options (8 Oct 2026): context 10632, intended writes none.
- [x] 1.7 kb-sync unaffected: `node --test tests/kb-sync/*.test.mjs` all pass.

## 2. Review and commit (Natasha; Patrick reviews the workflow and token privilege)

- [ ] 2.1 Review the change and commit it (author Natasha only, no trailer, per CLAUDE.md).
- [ ] 2.2 Push to `main`. Expected: the jira-options-sync run fails at "Sync" with "Refusing a live run" until 3.3; nothing is written.

## 3. One-off setup (Natasha; see scripts/jira-options-sync/README.md)

- [ ] 3.1 Service account in a group holding *Administer Jira*.
- [ ] 3.2 Scoped token: `read:field:jira`, `read:field.option:jira`, `write:field.option:jira` only; expiry set; renewal in the Obligations Register.
- [ ] 3.3 GitHub Environment `jira` restricted to `main`, with `JIRA_BASE_URL` (gateway), `JIRA_API_TOKEN`, `JIRA_APP_FIELD_ID`, `JIRA_PROJECT_ID`.
- [ ] 3.4 Manual dispatch with `dry_run` on. Pass: the job summary says "No changes".
- [ ] 3.5 Manual dispatch with `dry_run` off. Pass: "No changes" and "Read-back verified".
- [ ] 3.6 First real write at the next app launch: the go-live push's run shows the create and "Read-back verified", and the app appears on the live form.
- [ ] 3.7 Archive this change and move the spec to `openspec/specs/jira-app-options/`.
