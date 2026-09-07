---
layout: post
title: "Cloudscript Renderer for MCP Documentation: server.json as readable Confluence pages"
description: "New on the Atlassian Marketplace: a Confluence macro that turns a pasted MCP Registry server.json or tools/list result into structured documentation with capability cards, parameter tables and a table of contents."
app: mcp-renderer
version: "2.0"
image: /apps/mcp-renderer/guide-rendered-server-json.png
---

Cloudscript Renderer for MCP Documentation is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/2358641825/cloudscript-renderer-for-mcp-documentation). Teams standing up Model Context Protocol servers, and particularly internal servers that appear in no public registry, tend to document them as a JSON dump in a code block or not at all. This macro takes that JSON as pasted and renders it as documentation on the Confluence pages developers, security reviewers and platform teams already read.

## What it renders

Paste an MCP Registry `server.json` document or a `tools/list` result into the macro and it detects which you pasted, accepting a bare result or one wrapped in a JSON-RPC envelope. A `server.json` renders as a header with name, description and schema link, package tables with environment variables (secrets badged as such) and an install command. A `tools/list` result renders as one capability card per tool, with parameter tables, annotation pills whose tooltips explain what each hint means, and a table of contents. It is purpose-built for MCP: not a generic JSON viewer, and not another MCP server product.

## Your code stays the source of truth

The page holds the pasted JSON rather than a rendering of it, so editing the source in the macro re-renders the Confluence page and every server documents identically. The macro exports to PDF and Word as native content.

## Permissions and data handling

The app requests no Confluence or Jira scopes, declares no egress and has no app-side storage; it works only on the text pasted into its own macro configuration, which is parsed and drawn in the reader's browser. Control characters such as bidirectional overrides are removed from the rendered text with a notice, and the stored source is left unchanged. Source is capped at 512 KiB.

Read more in our [User guide](/apps/mcp-renderer).
