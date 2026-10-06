# sync-guides-to-confluence-kb — run report

Task 5.2 is in progress. This file records what has been verified so far; the empty sections
below are filled in as each step is done.

## First live run

- GitHub Actions run 37403831897, commit `2a838c5`, 2026-10-06 13:22 AEDT, triggered by push.
  All steps green.

### Result

Seven pages created in `CUSKB` (space id 3190194178), all at version 1, all children of the
space home page 3190194383. `email-viewer-jira` was skipped (`status: coming-soon`). There are
no other pages in the space.

| slug             | page id    | version |
| ---------------- | ---------- | ------- |
| `mermaid`        | 3201466369 | 1       |
| `mcp-renderer`   | 3201433602 | 1       |
| `typst-renderer` | 3201564673 | 1       |
| `email-viewer`   | 3201531947 | 1       |
| `nikoniko`       | 3201433636 | 1       |
| `page-sharing`   | 3201531905 | 1       |
| `radar-renderer` | 3201597441 | 1       |

### Credential

Service account with Confluence access through the group `kb-sync-access`; scoped API token,
sent as Bearer, at the Atlassian gateway base URL. The secrets are in the GitHub Environment
`confluence`, restricted to `main`; `CONFLUENCE_USER_EMAIL` is unset.

### Visual check

Natasha: images render from cloudscript.io and the layouts are intact.

### Body-to-golden check

Satisfied by the run's read-back of every write together with the golden tests.

## Second run (no guide change): expected seven unchanged

- GitHub Actions run 37404409097, commit `b32e95d`, 2026-10-06 about 13:27 AEDT, triggered by
  the push of task 4.3 and this run report. All steps green.
- All seven pages remain at version 1, verified by reading the space through the Confluence
  API. Expected result met.

## One-word edit: expected one page at version 2

## Token scopes granted and any v1 endpoint refusals

## 5.3 help centre and virtual agent results
