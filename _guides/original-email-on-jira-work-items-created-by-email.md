---
layout: guide
title: "How do I keep the original email on a Jira work item created by email?"
description: "Jira's built-in mail handler keeps the subject, the text and the attached files of an email, but not the email itself. Forwarding the email as an attachment keeps the original on the work item, where a viewer app can show it with its headers and attachments. How to do it from Outlook, Gmail and Apple Mail, how to automate it, and what changes in Jira Service Management."
app: email-viewer-jira
date: 2026-11-05
checked: 2026-11-05
image: /apps/email-viewer-jira/guide-emails-tab.png
see_also: ["/news/email-viewer-jira-2-6", "/apps/email-viewer-jira/#which-files-are-shown"]
faq:
  - q: "Does Jira's mail handler keep the original email?"
    a: "No. Forward the email as an attachment and Jira saves that copy on the work item."
  - q: "What does the mail handler throw away?"
    a: "The email's formatting, its headers, and the record of who really sent it. Only the subject, the plain text and the attached files reach the work item."
  - q: "Does the work item still get the original's subject and text?"
    a: "Not from the forward: Jira uses your forwarding email's subject and body. Keep or retype the subject, add a note in the body, and read the original in the Emails tab. To get both, forward normally from Outlook and attach the original to that forward, or use a flow or a mail handler app."
  - q: "Can this be automated?"
    a: "Yes. A mailbox rule that forwards as an attachment, a Power Automate or Apps Script flow that sends the text and the .eml together, or a mail handler app that attaches the original itself."
  - q: "Why does the saved email have no file extension?"
    a: "Outlook sends a forwarded message without a filename, and Jira names it after the subject. Gmail and Apple Mail add .eml."
  - q: "Can the customer be the reporter?"
    a: "Only if their address matches a Jira account. Otherwise the Default Reporter is used, and the real sender is visible in the attached original."
  - q: "Does this work in Jira Service Management?"
    a: "Yes. The forward becomes a request with the original attached, under a generated filename."
  - q: "Do the original's attachments end up on the work item?"
    a: "Not by themselves. In MSG & EML Email Viewer for Jira, each one has an Attach to work item button."
  - q: "How can I check whether the email was genuine?"
    a: "From the original's headers, which survive a forward as an attachment: open the file in a mail program and view the headers, or read them in the viewer's Details panel, which shows the recorded SPF, DKIM and DMARC results, the Reply-To, and where each link goes."
  - q: "Does the app fetch emails from a mailbox?"
    a: "No. It shows emails already attached to the work item."
---

Jira's built-in mail handler turns an email into a work item, but it does not keep the email. The email subject becomes the summary, the body becomes the description, and files on the email become attachments. The email itself, with its headers, its formatting and the name of whoever really sent it, is gone.

If you need a record of the original email, the reliable way to keep it without another app is to forward the email to your Jira address as an attachment, not as an ordinary forward. Jira then saves the original on the work item it creates, and a viewer app can show it there, headers included. There is a trade-off: Jira builds the summary and description from your forwarding email, not from the original, so this guide also covers how to keep the work item useful and how to automate the whole thing.

This guide covers what the handler keeps and discards, how to forward as an attachment from Outlook, Gmail and Apple Mail, how to do it for every email automatically, what is different in Jira Service Management, how to check an email is genuine, and how to get the original's attachments onto the work item.

## What does Jira's mail handler keep?

A mail handler is set up under Settings, System, Incoming mail. It reads each email and creates a work item from it ([Atlassian: Create issues and comments from email](https://support.atlassian.com/jira-cloud-administration/docs/create-issues-and-comments-from-email/){:target="_blank" rel="noopener"}). It keeps the subject as the summary, the body as plain text in the description, and any attached files as attachments on the work item.

## What does Jira's mail handler discard?

Everything else. The email itself is not saved, so the work item holds a copy of the words and nothing of the message they came in.

The formatting goes. Tables, columns, colours and layout are flattened into plain text or lost, which matters when the email was a quote, an order or a report laid out as a table.

The headers go. Every email carries a block of headers that most people never see: who actually sent it and from which mail server, the address replies would go to, when it was sent, the unique message identifier, and the results of the checks your own mail server ran when it arrived to confirm the sending domain was allowed to send it. Mail programs use these to flag a suspicious message. On the work item they are gone.

The sender's identity goes with them. If the sender has no Jira account, the work item's reporter is your handler's default account, not the person who wrote the email. Jira adds the sender's address in a short note at the end of the description, but that is the address the sender claimed, with nothing left to check it against. Anyone reading the work item later has no way to tell whether the original came from the customer it claims, from a lookalike address one letter off, or from someone forging a request to change bank details. Jira creates the work item just the same in each case.

There is a second reason to keep the original beyond checking it. Audits and compliance reviews ask for the email that triggered a piece of work, and when the work item holds only a copy of the text, someone has to go back to a mailbox months later and match the two up. With the original attached, the evidence sits on the work item that tracks the work.

Forwarding the email as an attachment keeps all of this, because the original travels as a complete file and Jira saves it unchanged. A viewer app can then show the formatting as sent and the headers as recorded, which is the subject of the rest of this guide.

## Who is shown as the reporter on a work item created by Jira's email handler?

If the sender's address matches a Jira account, that account is the reporter. If not, the handler's Default Reporter is used, and the sender's address is noted at the end of the description. If there is no Default Reporter, the email is ignored and nothing is created ([Atlassian: Create issues and comments from email](https://support.atlassian.com/jira-cloud-administration/docs/create-issues-and-comments-from-email/){:target="_blank" rel="noopener"}).

So a work item created from a customer's email usually shows your own default account as the reporter. The customer's name survives only inside the original email, which is another reason to keep it.

## How do I forward an email as an attachment?

An ordinary forward copies the text into a new message. Forwarding as an attachment sends the whole original email as a file inside the new message. That file is what Jira saves.

- Outlook on the web: open the message, choose More actions, then Forward as attachment. In Outlook for Windows, choose Forward, then Forward as Attachment. Outlook sends the file without a name, so Jira names it after the subject, with no file extension ([Atlassian tracker JRACLOUD-40477](https://jira.atlassian.com/browse/JRACLOUD-40477){:target="_blank" rel="noopener"}).
- Gmail: open the message's three-dot menu and choose Forward as attachment. The file is named after the subject, ending in .eml.
- Apple Mail: select the message, then Message, Forward as Attachment. The file is named like Gmail's.

Send the forward to the address your mail handler reads. The work item appears within a minute, with the original email attached.

Jira makes the summary from your forward's subject and the description from your forward's body, because the original is now a file rather than the message. Outlook keeps the original subject with "FW:" in front; Gmail and Apple Mail leave it for you to type. Write a one-line note in the body, since that note becomes the description. The original's full text is in the attached email.

If you want the original's text in the description as well, forward the email normally from Outlook for Windows and attach the original to that forward with Insert, then Outlook Item. Jira then gets both the text and the file. In our tests, a forward with an empty body produced a work item whose description held only the forwarder's signature.

The original's own attachments are not copied onto the work item. They stay inside the saved email. How to get them out is covered below.

One thing to avoid: do not save the email as a file, rename it and attach that. In our tests on 5 November 2026, an email whose only attachments were email files with no extension was dropped by the handler. No work item, no bounce. Forward the message as a message.

## How do I do this for every email, without forwarding each one by hand?

Forwarding one email at a time is fine for the occasional approval. For a mailbox that receives work every day there are three ways to automate it.

- **A mailbox rule.** Outlook on the web and Exchange Online rules include a "Forward as attachment" action ([Microsoft: New-InboxRule, ForwardAsAttachmentTo](https://learn.microsoft.com/en-us/powershell/module/exchange/new-inboxrule){:target="_blank" rel="noopener"}). A rule on the shared mailbox forwards every matching email to your Jira address as an attachment, with no one involved. The work item gets the original's subject, with "FW:" in front, and the original email attached. Its description is empty, because an automatic forward has no body of its own; the original's text is in the attached email.
- **A flow.** A Power Automate flow on Microsoft 365 ([Microsoft: Office 365 Outlook connector, Export email](https://learn.microsoft.com/en-us/connectors/office365/){:target="_blank" rel="noopener"}), or an Apps Script on Google Workspace, can take each new email, export it as an .eml file, and send Jira a new email with the original's subject and body and the .eml attached. Jira then creates a work item with the subject, the text and the original email. This takes a flow someone owns, and it is the complete answer without another Jira app.
- **A mail handler app.** Apps such as JEMH Cloud and Email This Issue read the mailbox themselves, create the work item from the email, and attach the original in the same step, with their own settings for reporters and routing. For a desk that lives on inbound email this is the purpose-built route.

In each case the viewer shows the attached original on the work item, with its headers and attachments, exactly as for an email forwarded by hand.

## What is different in Jira Service Management?

A Service Management project reads its email channel the same way. The original email is kept only in the project's email processing log, where a project admin can download it until the log is cleaned ([Atlassian: View the email processing and connectivity logs](https://support.atlassian.com/jira-service-management-cloud/docs/view-the-email-processing-and-connectivity-logs/){:target="_blank" rel="noopener"}). Saving it on the request automatically is a long-standing request on Atlassian's tracker ([JRACLOUD-42402](https://jira.atlassian.com/browse/JRACLOUD-42402){:target="_blank" rel="noopener"}).

Forwarding as an attachment works here too. The forward becomes a request with the original email attached, and the request's summary is your forward's subject, as in any other project. The one difference is the saved file's name: in our tests on 5 November 2026, Service Management gave the attached email a random eight-character name instead of the subject, so look for it in the request's attachments rather than by name. It renders in the Emails tab like any other email.

## How can a reader tell whether the email is genuine?

This assumes the original email is on the work item as an attachment, forwarded as described above. Without it there is nothing to check: the description is the sender's words with the evidence stripped off.

With the attachment there, anyone can check it without any app. Download the file and open it in a mail program, then view the headers (in Outlook, File, then Properties, shows them under Internet headers; Gmail's "Show original" does the same for an email in a mailbox). Three things tell most of the story. First, the From address and the Reply-To address: if replies would go somewhere other than the sender, ask why. Second, the Authentication-Results line, which records whether the sending domain passed the SPF, DKIM and DMARC checks when the email arrived; a fail or a missing result on an email asking for money or a change of details is a reason to pick up the phone. Third, where the links go: hover over each one and compare the real address with the text.

To make this verification easier, an app like [MSG & EML Email Viewer for Jira](/apps/email-viewer-jira) can be used to view details about emails attached to a work item from within Jira. MSG & EML Email Viewer for Jira shows each attached email in an Emails tab on the work item, and its Details panel can be opened to view the email headers without a download: the SPF, DKIM and DMARC results the receiving mail server recorded, the Reply-To address if it differs from the sender, where each link in the body really goes, and any hidden or lookalike characters in the names shown. It shows those facts, so a work item reader can check the email details themself rather than take the description on trust.

## How do I read the attached email and get its attachments onto the work item?

Jira has no viewer for email files. An .eml opens as raw text and a .msg as unreadable code, so readers download the file and open it in a mail program ([Atlassian tracker JRACLOUD-77500](https://jira.atlassian.com/browse/JRACLOUD-77500){:target="_blank" rel="noopener"}).

Our app, [MSG & EML Email Viewer for Jira](/apps/email-viewer-jira), is built to solve this problem. It adds an Emails tab to the work item, where it shows the saved email as it was sent: subject, real sender and recipients, date, body with its tables and images, and the email's attachments as tiles. Each tile has an Attach to work item button, and there is an Attach all button for the email. The invoice that arrived inside the original goes onto the work item with one click, no download and upload. Everything in the email is visible, and only what you choose is attached, so the work item's attachment list stays short. A viewer that only displays the email leaves those files inside it.

Since version 2.6 the app recognises an email by its content as well as its name, so the file Jira saves from an Outlook forward, and the renamed file from Service Management, show like any other email. Every read runs as the person viewing the work item, under Jira's own permissions. The file is read in that person's browser and no email data is stored or sent outside of your Atlassian environment.

## What we checked, and when

On 5 November 2026 we sent test emails from Gmail and Apple Mail to a Jira Cloud mail handler and to a Service Management email channel, and read what Jira stored. The Outlook naming is reported by a customer and matches the tracker issue above. We have not yet reproduced it with a mailbox of our own, and will update this page when we have.

## Short answers

**Does Jira's mail handler keep the original email?** No. Forward the email as an attachment and Jira saves that copy on the work item.

**What does the mail handler throw away?** The email's formatting, its headers, and the record of who really sent it. Only the subject, the plain text and the attached files reach the work item.

**Does the work item still get the original's subject and text?** Not from the forward: Jira uses your forwarding email's subject and body. Keep or retype the subject, add a note in the body, and read the original in the Emails tab. To get both, forward normally from Outlook and attach the original to that forward, or use a flow or a mail handler app.

**Can this be automated?** Yes. A mailbox rule that forwards as an attachment, a Power Automate or Apps Script flow that sends the text and the .eml together, or a mail handler app that attaches the original itself.

**Why does the saved email have no file extension?** Outlook sends a forwarded message without a filename, and Jira names it after the subject. Gmail and Apple Mail add .eml.

**Can the customer be the reporter?** Only if their address matches a Jira account. Otherwise the Default Reporter is used, and the real sender is visible in the attached original.

**Does this work in Jira Service Management?** Yes. The forward becomes a request with the original attached, under a generated filename.

**Do the original's attachments end up on the work item?** Not by themselves. In MSG & EML Email Viewer for Jira, each one has an Attach to work item button.

**How can I check whether the email was genuine?** From the original's headers, which survive a forward as an attachment: open the file in a mail program and view the headers, or read them in the viewer's Details panel, which shows the recorded SPF, DKIM and DMARC results, the Reply-To, and where each link goes.

**Does the app fetch emails from a mailbox?** No. It shows emails already attached to the work item.
