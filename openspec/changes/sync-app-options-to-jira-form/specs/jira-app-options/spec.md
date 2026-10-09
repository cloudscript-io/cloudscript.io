## ADDED Requirements

### Requirement: Live registry entries define the app options

The sync SHALL treat `_data/apps/<slug>.yml` entries with `status: live` as the only source of
the app options on the CUS-scoped context of the configured field, using each entry's `name` as
the option value. Options SHALL NOT be deleted.

#### Scenario: a newly live app is added to the form

- **GIVEN** `_data/apps/wavedrom.yml` changes to `status: live` with `name: WaveDrom Renderer for Confluence`, and the field has no such option
- **WHEN** the change is pushed to `main` and the sync runs live
- **THEN** an enabled option `WaveDrom Renderer for Confluence` exists, ordered by name among the app options and before `Not app-specific`

#### Scenario: an app that is no longer live is disabled, not deleted

- **GIVEN** an enabled option `NikoNiko Calendar` and no live registry entry with that name or former name
- **WHEN** the sync runs live
- **THEN** the option is disabled, still exists, and is placed after the preserved options

#### Scenario: an app that returns re-enables its old option

- **GIVEN** a disabled option `NikoNiko Calendar` and a live entry with that name
- **WHEN** the sync runs live
- **THEN** that same option (same id) is enabled and no second option is created

#### Scenario: options already in step produce no writes

- **GIVEN** the context's options already match the live registry, the preserved option and the order rule
- **WHEN** the sync runs
- **THEN** no create, update or reorder request is sent

### Requirement: Renames keep the option

When a live entry's `name` has no option but one of its `former_names` (or a case-only variant of
its `name`) does, the sync SHALL rename that option in place. An option exactly matching another
live entry's `name` SHALL NOT be taken by a former name.

#### Scenario: a renamed app keeps its tickets

- **GIVEN** an option `CloudScript Mermaid Diagrams for Confluence` and a live entry with `name: Mermaid Diagrams for Confluence` and `former_names: [CloudScript Mermaid Diagrams for Confluence]`
- **WHEN** the sync runs live
- **THEN** the option with the same id now reads `Mermaid Diagrams for Confluence`, and no option is created or disabled

### Requirement: Preserved options are never managed

Options listed in `PRESERVED_OPTIONS` (`Not app-specific`) SHALL never be created, renamed or
disabled by the sync, and a registry name equal to one of them SHALL be refused.

#### Scenario: the escape option survives an empty registry

- **GIVEN** no live registry entries and an enabled option `Not app-specific`
- **WHEN** the sync plans
- **THEN** `Not app-specific` is not in the disable list

### Requirement: Only the project-scoped context is written

The sync SHALL write only to the single non-global context of `JIRA_APP_FIELD_ID` mapped to
`JIRA_PROJECT_ID`, and SHALL stop before any write if there is none or more than one.

#### Scenario: the global context is never a target

- **GIVEN** the field's only mapping is its global context
- **WHEN** the sync runs
- **THEN** it fails with "refusing to touch the global context" and sends no write

### Requirement: Dry run and read-back

A dry run (`--dry-run`, or `JIRA_OPTIONS_DRY_RUN=1`, the default for manual dispatch) SHALL read
and print every intended write and send none. With no settings, a dry run SHALL plan against an
empty in-memory context and use no network. A live run SHALL read the options back after
writing and SHALL fail unless a second plan is empty.

#### Scenario: a write Jira accepts but does not apply fails the run

- **GIVEN** a create request that returns success but adds no option
- **WHEN** the sync runs live
- **THEN** the run fails naming the missing option, and is not reported as done

### Requirement: Credentials are least-privilege and never exposed

The workflow SHALL read the Jira settings only from the `jira` GitHub Environment, SHALL have
`contents: read` only, and SHALL not receive kb-sync's Confluence secrets. The script SHALL never
print the token or the Authorization header, SHALL redact both from every error, and SHALL never
send a request outside `JIRA_BASE_URL`.

#### Scenario: an error that echoes the token is redacted

- **GIVEN** Jira responds 403 with a body containing the token
- **WHEN** the client raises the error
- **THEN** the message contains `[REDACTED]` and neither the token nor the Basic credential

#### Scenario: a hostile pagination link is not followed

- **GIVEN** a page of options whose `nextPage` points at another host
- **WHEN** the client lists the options
- **THEN** every request goes to the base URL's origin
