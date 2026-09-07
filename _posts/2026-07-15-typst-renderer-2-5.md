---
layout: post
title: "Cloudscript Typst Renderer: Typst documents and mathematics on the page"
description: "Cloudscript Typst Renderer, new on the Atlassian Marketplace, compiles Typst source in the reader's browser and renders documents and mathematics directly on a Confluence Cloud page."
app: typst-renderer
version: "2.5"
image: /apps/typst-renderer/render-maths.png
---

Cloudscript Typst Renderer is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/1871294913/cloudscript-typst-renderer). Teams that need mathematics in Confluence commonly maintain a LaTeX-and-screenshot workflow, in which a formula is typeset elsewhere and pasted in as an image that nobody can edit or search. This macro replaces the screenshot with source: paste Typst into the macro, and the document is compiled and drawn on the page each time it is viewed, so an edit to the source is what the next reader sees.

## What renders

Typst covers the same ground as LaTeX, and the macro renders the full document rather than formulas alone: headings, prose, tables and code blocks alongside mathematics set in Typst's own maths font as vector output that can be selected and zoomed. The bundled sample shows the Cauchy-Schwarz inequality, a Gaussian integral, a matrix and Maxwell's equations on one page with prose and a highlighted code block. The macro is found by typing /typst in the editor, and the macro browser also returns it for "latex", "math", "equation" and "typesetting".

## Compiled in the browser

The Typst compiler runs as WebAssembly in the reader's browser rather than on a server, so your data is never sent to Cloudscript or to any third party. As such, the app requests no Confluence scopes, declares no egress and stores nothing outside the macro on your page; its one content-security directive exists solely to instantiate the WebAssembly module.

## Limits

The above security posture means a page exported to PDF or Word cannot carry the rendered output, since rendering happens on the live page; the export carries the Typst source in a captioned code block instead. This first release renders self-contained documents only, without package imports (`@preview`), `image()` or `#include`, and caps source at 64 KiB with a 10-second compile budget, which a size meter in the editor tracks as you paste. The app is an independent integration, not affiliated with or endorsed by Typst, and bundles typst.ts and the Typst fonts under their open licences.

Read more in our [User guide](/apps/typst-renderer).
