---
layout: post
title: "Tech Adoption Radar for Confluence: a tech radar from a pasted blip list"
description: "Tech Adoption Radar for Confluence, new on the Atlassian Marketplace, renders a Thoughtworks-style CSV or radar.js JSON blip list as a quadrant radar directly in a Confluence Cloud page."
app: radar-renderer
version: "2.2"
image: /apps/radar-renderer/guide-hero.png
---

Tech Adoption Radar for Confluence is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/2543668212/tech-adoption-radar-for-confluence). Technology radars in the Thoughtworks style are usually built with a separate tool and pasted into Confluence as an image, which goes stale the moment a blip moves. This macro draws the radar from a blip list stored in the page, so updating the radar means editing the list.

## Two formats, one radar

The macro accepts the Thoughtworks build-your-own-radar CSV convention and the Zalando radar.js JSON dialect, so an existing radar kept in either format pastes in without conversion. Each blip carries a movement marker, and a numbered legend grouped by quadrant and ring sits beneath the chart. The four quadrants can each take a colour from a curated palette of Atlassian accents, and a blip's link opens in Confluence when it points at the same site.

## Export and download

A page exported to PDF or Word carries the radar as a structured table by quadrant and ring rather than a blank space, and a Download as image button on the macro produces the chart itself, drawn client-side, for use in a slide or document.

## Permissions and data handling

The radar is drawn in the reader's browser from the list stored in the macro. The app requests no Forge scopes, declares no egress and stores nothing beyond the page content, so there is nothing for an administrator to review beyond the install itself.

Read more in our [User guide](/apps/radar-renderer).
