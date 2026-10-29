---
layout: post
title: "MSG/EML Email Viewer for Jira 2.3.0: control characters stripped from email details and file names"
description: "Version 2.3.0 removes control characters from an email's sender, recipients, subject and attachment names before display, and downloads attachments under a file name with path separators and hidden characters removed."
app: email-viewer-jira
version: "2.3.0"
---

Version 2.3.0 updates the shared render core. Control characters in an email's sender, recipients, subject and attachment names are now removed before display, and an attachment downloads under a file name with path separators and hidden characters removed. Permissions, modules and data handling are unchanged; the full description of what the app reads and keeps is in the [user guide](/apps/email-viewer-jira).
