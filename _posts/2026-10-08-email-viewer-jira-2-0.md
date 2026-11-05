---
layout: post
title: "MSG/EML Email Viewer for Jira: read the attached email on the issue"
description: "MSG/EML Email Viewer for Jira, new on the Atlassian Marketplace, renders the .msg and .eml files attached to a Jira issue as email cards in an Emails tab, read from your own Jira as you and parsed in your browser."
app: email-viewer-jira
version: "2.0"
image: /apps/email-viewer-jira/guide-emails-tab.png
linkedin: |
  Emails usually get attached to Jira issues to record something important, such as the details of a client's approval or the correspondence behind a support request. Until now, reading one meant downloading the .msg or .eml file and opening it in a mail application.

  MSG/EML Email Viewer for Jira, now on the Atlassian Marketplace, renders every email attached to an issue in an Emails tab (pictured): subject, sender, recipients, date, body, inline images and the email's own attachments, any of which can be attached to the work item with one click. The issue sidebar counts the attached emails and lists each by filename, date and who attached it. Both appear on every issue in every project from the moment the app is installed, with nothing to configure.

  Each file is read from your own Jira and is visible according to your existing permissions. The email stays attached to the issue where it was filed: the app keeps no copy of it, and no email content reaches Cloudscript. In Jira Service Management the tab is for agents and other internal users only (rendered emails are not visible to customers using the portal).

  It joins MSG/EML Email Viewer for Confluence, which has rendered attached emails on Confluence pages since September.

---

MSG/EML Email Viewer for Jira is now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/463039643/msg-eml-email-viewer-for-jira). An email attached to a Jira issue is frequently the record of what was agreed, whether a client's instruction or the correspondence behind a support request, and until now it has been a download link: reading it meant saving the file and opening it in a mail application. This app renders every .msg and .eml file attached to an issue in place, as the person viewing it and under Jira's own permissions, so the attached original can be read where it was filed.

## The Emails tab

The Emails tab appears on every issue in every project from the moment the app is installed, with nothing to configure. It lists each attached email as a card showing the subject, sender, recipients, date and body, with inline images in place and the email's own attachments shown as tiles. Where a message cannot be rendered in full, the card states the reason rather than silently omitting data. Each tile offers a download and an Attach to work item action: one click attaches the file from inside the email to the issue as an ordinary Jira attachment, or all of them at once, so a document that arrived inside an email becomes an attachment in its own right without being downloaded and uploaded again.

## Counted and listed in the sidebar

The issue's right-hand column gains an Attached emails group. It reads "3 emails attached:" above an index that names each file with the date it was attached and who attached it, followed by a pointer to the Emails tab. The dates agree with Jira's own attachments panel to the instant and the time zone and differ only in format.

## Jira Service Management

In Jira Service Management the app is for agents and other internal users. The Emails tab is in the issue's Activity section, and rendered emails are not visible to customers using the portal. An email attached to an internal note is visible to the same people who can see the attachment itself, because every call the app makes runs as the viewing user.

## Permissions and data handling

The app requests eleven granular Jira permissions: ten reads, and one write that is used only when you click Attach. Every call runs as the viewing user, so Jira's permissions decide what renders. Files are read from your own Jira and parsed in your browser, only the first 1,024 bytes of each are read on Atlassian-hosted compute to classify its format, then discarded. Nothing is stored, apart from a file you choose to attach, which becomes an ordinary attachment on the issue in your own Jira, and no email content reaches Cloudscript. The app operates no server and holds no store of its own, which is what the Runs on Atlassian badge on the listing attests. The [privacy policy](/apps/email-viewer-jira/privacy), [terms](/apps/email-viewer-jira/terms) and a [data processing agreement](/apps/email-viewer-jira/dpa) are published alongside the guide.

The app joins [MSG/EML Email Viewer for Confluence](/apps/email-viewer), released in September, which renders the same file formats on Confluence pages. The two apps are listed and licensed separately.

Read more in our [User guide](/apps/email-viewer-jira).
