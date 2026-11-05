# guides Specification

## Purpose
A stream of standalone how-to articles at `/guides/<slug>`, one question and one app each, written by a person for people and carrying a machine-readable layer, kept apart from the news feeds and the knowledge base mirror.

## Requirements
### Requirement: Guides are a collection served extensionless under one configurable segment

The site SHALL build every `_guides/<slug>.md` as a page at `<segment>/<slug>` (today
`/guides/<slug>`), where the segment is set once by the collection permalink in `_config.yml`,
and SHALL serve the stream's index as a directory index at `<segment>/`. Every link to the
index and every mention of the stream's display name SHALL be derived from `_config.yml`
(`collections.guides.permalink` and `guides_name`), never repeated in copy or tests.

#### Scenario: Served form
- **GIVEN** `_guides/original-email-on-jira-work-items-created-by-email.md`
- **WHEN** the site is built
- **THEN** `_site/guides/original-email-on-jira-work-items-created-by-email.html` exists
- **AND** its canonical href is `https://cloudscript.io/guides/original-email-on-jira-work-items-created-by-email` with no `.html` and no trailing slash

#### Scenario: Index and links
- **GIVEN** the built site
- **THEN** `_site/guides/index.html` exists with canonical `https://cloudscript.io/guides/`
- **AND** the nav and the footer of every layout page link to `/guides/` with the text `guides_name`, next to the `/news/` link

### Requirement: Guide front matter drives the page

A guide SHALL carry `layout: guide`, `title`, `description`, `app` (a live registry slug),
`date`, `checked` and `image`, and MAY carry `see_also` and `faq`. The layout SHALL render the
title as the `<h1>`, a byline naming the author only (no email address anywhere on the page),
a "Checked on <date>" line from `checked`, the app chip from the registry, a CTA to the
Marketplace listing and the app page, and a "See also" list from `see_also`.

#### Scenario: Placeholder guide renders
- **GIVEN** the placeholder guide with `app: email-viewer-jira`, `checked: 2026-11-05` and two `see_also` items
- **WHEN** its page is built
- **THEN** the `<h1>` is its title, the page contains "By Natasha Roumanoff" and "Checked on 5 November 2026", an `.app-chip` link to `/apps/email-viewer-jira`, a link to the registry `marketplace_url`, and a "See also" list of two links whose hrefs are the two items
- **AND** no `mailto:` link and no email address appears in the page

#### Scenario: See-also item that matches nothing
- **GIVEN** a `see_also` item that is neither a guide slug nor the `url` of a page or post
- **THEN** it is rendered as a link whose text is the raw item, so a typo is visible in review

### Requirement: The index groups guides by product

`<segment>/` SHALL list every guide under a heading per product (Confluence, then Jira, as the
home page orders them; a product with no guide is skipped), newest `checked` first within a
product, each entry with its title linked, its `description` and its app chip.

#### Scenario: One Jira guide
- **GIVEN** the placeholder guide only
- **THEN** the index has one product heading, `Jira`, and under it the guide's title linked to its URL, its description and the MSG/EML Email Viewer for Jira chip
- **AND** no `Confluence` heading

### Requirement: Each app page lists its own guides

Every `apps/<slug>/index.html` SHALL include `guides-list.html` for its slug, which renders
`<h2 id="guides">` and the app's guides (newest `checked` first) or nothing at all when the app
has none.

#### Scenario: App with guides
- **GIVEN** the placeholder guide with `app: email-viewer-jira`
- **THEN** `/apps/email-viewer-jira/` contains `<h2 id="guides">` and a link to the guide

#### Scenario: App without guides
- **GIVEN** no guide with `app: mermaid`
- **THEN** `/apps/mermaid/` contains no `id="guides"` and no link under `/guides/`

### Requirement: Guides never enter the feeds or the knowledge base

Guides SHALL NOT appear in `news/feed.xml`, `news/linkedin.xml` or `/news/`, and SHALL NOT be
read by kb-sync, which mirrors `apps/<slug>/index.html` only.

#### Scenario: Feeds and news index
- **GIVEN** the built site
- **THEN** neither feed contains the guides URL segment, and the news stream list on `news/index.html` links to no guide
- **AND** both feeds are byte-identical to the baseline built before this change
