---
layout: post
title: "MSG & EML Email Viewer for Jira 2.6: emails saved by Jira's mail handler now render"
description: "Version 2.6 of MSG & EML Email Viewer for Jira recognises an email by its content as well as its name, so an email that Jira's built-in mail handler saved without a file extension now renders in the Emails tab, the sidebar index and the Attached emails count."
app: email-viewer-jira
version: "2.6"
image: /apps/email-viewer-jira/guide-emails-tab.png
linkedin: false
---

Jira's built-in mail handler creates a work item from an incoming email but does not keep the email itself. The way round that, without another app, is to forward the email to your Jira address as an attachment: the handler saves the attached original on the work item it creates. Until now, those files were invisible to MSG & EML Email Viewer for Jira when they came from Outlook, because Jira saves an Outlook-forwarded message under its subject with no file extension, and the app recognised emails by their `.msg` or `.eml` name.

Version 2.6, now live on the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/463039643/msg-eml-email-viewer-for-jira), recognises an email by its content as well as its name. A file Jira saved without an extension, or under the generated name Jira Service Management's email channel gives it, now appears in the Emails tab, in the sidebar index and in the Attached emails count like any other email. Nothing changes in your mail flow and nothing needs configuring. The check that decides whether a file is an email reads at most its first kilobyte on Atlassian-hosted compute, as before, and the file itself is still read from your own Jira and parsed in your browser.

## Forwarding an email as an attachment

In Outlook the command is "Forward as attachment" (in the message's More actions menu in Outlook on the web, and under Forward in Outlook for Windows); in Gmail it is "Forward as attachment" in the message's three-dot menu; in Apple Mail it is Message, then Forward as Attachment. The original travels inside the new message as a complete email file, and Jira's mail handler saves it on the work item it creates, where the app renders it. The same works for a Jira Service Management request raised through the project's email channel. The original must travel as an attached message, not as a saved file: an email whose only attachments are files saved without an extension is discarded by Jira's mail handler and creates no work item at all.

The full guide, including who appears as the reporter, how to automate the forwarding for every email, and what is different in Jira Service Management, is [How do I keep the original email on a Jira work item created by email?](/guides/original-email-on-jira-work-items-created-by-email). Which files the app lists is described in the [user guide](/apps/email-viewer-jira/#which-files-are-shown).
