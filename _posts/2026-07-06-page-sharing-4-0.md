---
layout: post
title: "Page Sharing for Confluence: read-only pages across Confluence Cloud sites"
description: "Page Sharing for Confluence, new on the Atlassian Marketplace, delivers a page from one Confluence Cloud site to another as a native, read-only replica that follows every publish of the original."
app: page-sharing
version: "4.0"
image: /apps/page-sharing/publisher-share.png
---

Page Sharing for Confluence is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/3283173088/page-sharing-for-confluence). It addresses a gap that consultancies, suppliers and their clients usually fill with exported PDFs or guest accounts: a page maintained on one Confluence Cloud site can be delivered to another site as a real, read-only Confluence page in the recipient's own page tree, refreshed each time the publisher edits the original. When the engagement ends, the publisher withdraws sharing and the replicas are removed.

## How a page is shared

An editor shares a page from its menu and receives a reusable subscription link. On the receiving site, a user subscribes by pasting that link, and the page appears as a replica marked with a byline naming its source. Sharing works in both directions once the app is installed on both sites, and every subscription is revocable by the publisher.

## Admin control at both ends

Sharing is admin-approved: a Confluence administrator on the publishing site enables sharing space by space and maintains an allow-list of partner sites, and a subscribe request from a site not yet on the list lands as pending for approval. Both checks are repeated on every push, so a partner removed from the allow-list stops receiving updates immediately.

## What leaves your site

Replicas carry native content only: text, headings, lists, tables, code blocks and links. Images, attachments and macros are stripped before anything leaves the publishing site, a deliberate control rather than a limitation to be lifted later. The app runs entirely on Atlassian Forge, with compute and storage on Atlassian infrastructure, and the only network destination is the app's own Atlassian-hosted endpoint; the share link, which carries the token, is handed to the subscriber out of band rather than over the app's channel. On the publisher's side the app only reads the shared page and on the subscriber's side it only writes the replica. The only personal data it stores is a user identifier.

Read more in our [User guide](/apps/page-sharing).
