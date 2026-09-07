---
layout: post
title: "Tech Adoption Radar 2.5: build a radar in a table"
description: "Version 2.5 of Tech Adoption Radar for Confluence adds a Table View to the macro editor, a numbered legend on downloaded images, and clearer handling of crowded quadrants."
app: radar-renderer
version: "2.5"
image: /apps/radar-renderer/share-radar-legend.png
linkedin: |
  Tech Adoption Radar for Confluence draws a Thoughtworks-style technology radar inside a Confluence page from a blip list stored in the page itself. Most tech radars are built in a separate tool and pasted into Confluence as an image that goes stale the moment a blip moves, but with Tech Adoption Radar for Confluence updating your radar is as easy as editing the list in your Confluence page.

  Version 2.5, now on the Atlassian Marketplace, provides more options for how a radar is created. In addition to the ability to paste CSV or JSON into the macro, the editor now has a Table View in which a user can add blips one row at a time, paste them straight from a spreadsheet, or upload a file. Text View remains one click away, and both views read and write the same stored source.

  Additionally, downloaded images of your tech radar now carry a numbered legend grouped by quadrant and ring (pictured), so a PNG or SVG version of the radar can be easily obtained for adding to a slide or other document.

  Tech Adoption Radar for Confluence renders data in the reader's browser from the list that is stored on the Confluence page, sending nothing outside Atlassian and requesting no permissions, keeping your data secure. Existing installations update automatically.


---

Version 2.5 of Tech Adoption Radar for Confluence is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/2543668212/tech-adoption-radar-for-confluence). The release changes how a radar is authored: until now the macro took its blip list as a block of CSV or radar.js JSON text, which suited people who already kept their radar in a file and left everyone else assembling one first. The macro editor now opens in a Table View, where a radar can be built without leaving Confluence.

## Table View

In Table View each blip is a row with its name, ring, quadrant and movement, and a row expands to hold a description and a link. Rows can be typed in one at a time, pasted straight from a spreadsheet (the editor recognises the paste and reports how many rows it added, flagging any ring or quadrant value it does not recognise), or loaded by uploading a CSV or JSON file. The table enforces the 400-blip ceiling as data is entered, and a paste or upload that exceeds it is truncated to the first 400 rows with a warning naming the number discarded.

The previous editor is still there as Text View, one click away, for anyone who prefers to paste CSV or radar.js JSON directly. Both views read and write the same stored source, so a radar built in one can be edited in the other, and macros inserted with earlier versions keep rendering and editing exactly as before.

## Images that read on their own

A radar downloaded as an image now carries the numbered legend beneath the chart, grouped by quadrant and ring, so the picture can be dropped into a slide or a document without the page it came from.

## Crowded quadrants and accessibility

Below the 400-blip limit a quadrant can still hold more blips than can be drawn without overlap. The radar provides a detailed warning when some items cannot be displayed, while retaining these blips in the numbered legend beneath the chart. The release also includes accessibility fixes to the authoring surface, including a live blip count that screen readers announce as rows are added.

## What has not changed

The app still requests no permissions and sends nothing outside Atlassian: the blip list is stored in the macro on your page and the chart is drawn in the reader's browser. This release makes no change to the app's scopes or data handling, so existing installations update automatically and no administrator action is needed.

Read more in our updated [User guide](/apps/radar-renderer).
