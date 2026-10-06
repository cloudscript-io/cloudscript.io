# sync-guides-to-confluence-kb — run report

Tasks 5.2 and 5.3 are recorded here: what was verified, by whom and when.

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

- GitHub Actions run 37404772062, commit `09e6074` (`apps/mcp-renderer/index.html`,
  "contained" → "contains"), 2026-10-06, triggered by push. All steps green.
- Page 3201433602 (`mcp-renderer`) is now at version 2 with version message `kb-sync 09e6074`;
  the other six pages are unchanged at version 1 (verified by reading the space through the
  Confluence API, 6 Oct 2026).

## Token scopes granted and any v1 endpoint refusals

- Scopes granted exactly as designed: `read:page:confluence`, `write:page:confluence`,
  `read:content.property:confluence`, `write:content.property:confluence`,
  `read:space:confluence`.
- The first live run's log shows no "CQL lookup unavailable" line, so the v1 search endpoint
  accepted the scoped token.
- The page-move endpoint was not exercised (all seven pages were created in registry order and
  nothing has been archived), so its behaviour under a scoped token remains unverified.
- The token expires 6 Oct 2027; rotation is tracked in the Operations Obligations Register.

## Space home page

The `CUSKB` home page content was written by Natasha on 6 Oct 2026: an overview, links to the
seven guides by page id, and help and security contact guidance. The sync never touches it.

## 5.3 help centre and virtual agent results

- **Knowledge base permissions** (Jira settings → Products → Knowledge base permissions):
  "All logged-in users" on, "Anyone" off (Natasha, 6 Oct 2026, after adding
  Natasha's Cloudscript admin account to the Confluence product-admin group).
- **Help centre test as a customer with no product access** (a plus-addressed test account on
  a Cloudscript-controlled mailbox, admitted via a test organisation, 6 Oct 2026): landing page
  visible; KB articles searchable
  and readable; images render; the article view shows title, breadcrumb and body only (no
  author, so the service account's display name is internal-only); the generated-from credit
  line appears at the end of each article.
- **Footer.** Restyled as a credit line in task 4.4 (rule + muted text); verified live in the
  help centre after run 37419026438 (all seven pages updated, message `kb-sync 0f6d77d`).
- **Confluence site footer** changed 6 Oct 2026 (Confluence settings → Header and footer) to
  "© 2026 Cloudscript Pty Ltd. Questions about an app? Raise a support request." with the link
  to the help centre home; applies to every Confluence page on the site, not only the KB. The
  year is hard-coded and needs a hand edit each January.
- **Virtual service agent:** turned off and out of scope for this change (Natasha, 6 Oct 2026).
- **Customer access on the Support Site experience:** still limited to added organisations.
- **Test customer (a plus-addressed test account on a Cloudscript-controlled mailbox) and its
  test organisation:** retained for future testing.
