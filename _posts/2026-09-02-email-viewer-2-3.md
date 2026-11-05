---
layout: post
title: "MSG/EML Email Viewer for Confluence: read the attached email on the page"
description: "MSG/EML Email Viewer for Confluence, new on the Atlassian Marketplace, renders a .msg or .eml file attached to a Confluence page as an email card, parsed in the reader's browser."
app: email-viewer
version: "2.3"
image: /apps/email-viewer/guide-hero.png
---

MSG/EML Email Viewer for Confluence is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/2052211522/msg-eml-email-viewer-for-confluence). An email filed on a Confluence page is often the documentation itself, whether an approval, a client instruction or a piece of incident correspondence, and until now it has been a download link: reading it meant saving the file and opening it in a mail application. This macro renders the attached .msg or .eml file on the page as an email card, under the page's own permissions, making the email contents more readily accessible to anyone who can already see the page.

## The email card

The card shows the subject, sender, recipients, date and body, with inline images in place. Message attachements are displayed as tiles with a download option available for each. Setup is one screen: users can choose to display the Confluence page's existing .msg and .eml attachments or use a drag-and-drop area to upload an email file (50 MiB attachment cap).

## Rendered afresh, from your own Confluence

Your selected email file is read and parsed again on every page view, so the card shows what the attached file contains at the time of viewing. Remote images in a message body are blocked until the reader chooses to load them.  Where a message cannot be rendered in full the card displays plain english error messages describing what happened rather than silently omitting data.

## Permissions and data handling

Email files are read from your own Confluence page, remain only on Atlassian's platform and are parsed in the reader's browser inside the macro's sandboxed iframe. The macro stores only the attachment's id, its filename and an optional user-provided label. The app operates no server, has no store of its own, declares no external network destinations and holds no Forge app storage. It requests two Confluence permissions, one to read the page's attachments and one to attach a file you upload; the [privacy policy](/apps/email-viewer/privacy), [terms](/apps/email-viewer/terms) and a [data processing agreement](/apps/email-viewer/dpa) are published alongside the guide.

Read more in our [User guide](/apps/email-viewer).
