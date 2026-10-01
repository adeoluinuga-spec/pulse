# Running a learning programme in Pulse

A guide for whoever delivers the training: how to build a programme, what each kind of activity is for, how to put materials in front of people, and how to read what comes back.

**Last updated:** 2 October 2026

Trainees need no Pulse account and no password. Each person gets a private web link. Everything they do is attached to that link.

---

## Contents

1. Before you start
2. Creating a programme
3. Adding trainees and sending links
4. The seven kinds of activity
5. Building an activity, field by field
6. Uploading materials
7. Role-play: acted out, or written
8. Releasing work, and the order people see it
9. Reading what comes back
10. Managing links and closing a programme
11. Limits, and what to do at the edges
12. What trainees see

---

## 1. Before you start

**Where it is.** Sign in to Pulse, then **Talent development → Learning area** in the sidebar. On a phone, it's in the profile menu. Only HR administrators and super admins can open it.

**What it is for.** Delivering training to people who are not on Pulse — a client's staff, for instance. Their organisation never has to be set up in Pulse; a programme belongs to *your* workspace.

**What to have ready.**
- Your list of trainees: names, and emails if you have them (emails are optional).
- Your materials: slides, handouts, scenarios.
- The questions you want answered, roughly. You can change them freely until the first person answers.

---

## 2. Creating a programme

**New programme** asks for three things:

| Field | What to put |
|---|---|
| Programme name | What you call it internally: "Manager Development Programme" |
| Client name | Who it is for: "Bracken Media Solutions" |
| Starter activities | Leave ticked to get six ready-made activities |

The six starter activities are a worked example of a manager development programme: a reading on difficult conversations, a placeholder for your own scenarios, a commitment form, a role-play reflection, an Individual Development Plan, and a role-play. **Three of them start hidden**, because they contain placeholder text you are meant to replace.

Programmes are listed with their trainee and activity counts. Open one to get three tabs: **Trainees**, **Activities**, **Responses**.

---

## 3. Adding trainees and sending links

In **Trainees → Add trainees**, paste one person per line:

```
Ada Okafor, ada@example.com
Bode Udo
Chi Eze, chi@example.com
```

The email is optional. Name alone is fine.

**One bad line rejects the whole batch**, naming the line number — so you fix it and paste again, rather than discovering half a list went in. A repeated email is also refused.

**Pulse does not email anyone when you add them.** You copy each link and send it yourself, however you normally reach people. **Copy all links** gives you the lot.

> **Send links individually.** A link *is* the person's identity here. Anyone holding it can see and change that person's work. Don't post the set in a group chat.

Each link lasts **180 days**. The Trainees tab shows when each person last opened theirs, and their progress.

---

## 4. The seven kinds of activity

When you add an activity, the first thing you choose is its kind. It cannot be changed afterwards — the answers people give depend on it — so if you pick wrong before anyone has answered, delete it and add another.

| Kind | What it does | Use it for |
|---|---|---|
| **Reading material** | Formatted text, written by you | Pre-reading, a summary after a session, a model or framework |
| **Video or link** | A link to something held elsewhere, with optional text | A recorded session, a YouTube or Vimeo video, a shared drive document |
| **Questionnaire** | Questions with ratings and choices | A pulse check, a knowledge check, a pre-session diagnostic |
| **Reflection** | Open questions | "What will you do differently?" after a session |
| **Development plan** | Repeating goal rows, plus questions asked once | An IDP: several goals, each with the same fields |
| **Role-play — acted out** | A scenario and roles; the conversation happens in the room, feedback is written afterwards | A facilitated workshop where people are together or on a call |
| **Role-play — written turns** | The conversation happens in Pulse, in ordered turns | People in different places and time zones |

All seven can carry uploaded files (section 6).

---

## 5. Building an activity, field by field

**Activities → Add activity.**

**Title** is what trainees see in their list. **Summary** is the line underneath it — use it to say how long it takes, or what it is for.

### Reading material and Video or link

- **The material** is the main text. It understands Markdown:
  - `## Heading` makes a heading
  - `**bold**` makes bold
  - `- item` makes a bulleted list
  - `| a | b |` with a `| --- | --- |` row underneath makes a table
- **Link (https)** is the address of the recording or document. It must start `https://`.
- **What the link is** is the wording trainees click: "Watch the 12-minute recording".

A trainee marks reading material as read, which is what counts as completing it.

### Questionnaire, Reflection and Development plan

These are all questions; the difference is how they are laid out.

For each question you set:

| Setting | Meaning |
|---|---|
| **Question** | The wording the trainee reads |
| **Answer type** | Long answer, Short answer, Choose one, or Rating 1–5 |
| **Options** | For "Choose one": one option per line |
| **Label for 1 / Label for 5** | For a rating: "Not at all" to "Completely" |
| **Must be answered** | Stops them submitting until it is filled in. Doesn't block saving a draft |

**Introduction** appears above the questions. **Message after they submit** is the confirmation they see — use it to say what happens next.

For a **Development plan**, you also set **How many goal rows**. The questions under "Asked for each goal row" repeat that many times; the ones under "Asked once, at the end" appear once, for things like strengths and support needed.

### Preview before you release

**Preview what trainees see** shows the title, any scenario or link, and every question with its answer type, in order. Use it before releasing — it costs nothing and catches wording you'd regret.

### Changing an activity later

You can edit freely **until the first person answers**. After that the questions are locked, and Pulse will tell you so. This is deliberate: changing a question after people have answered it makes their answers mean something different from what they were asked.

If you need different wording after collection starts, add a new activity. You can hide the old one by unticking **Released** — hiding keeps the answers; deleting is only possible while an activity is unused.

---

## 6. Uploading materials

Every activity has **Attach a file** underneath it in the Activities tab.

### What you can upload

| Type | Opens how |
|---|---|
| PDF | Opens in the browser |
| Images (PNG, JPEG, WebP) | Open in the browser |
| Word (.docx) | Downloads |
| PowerPoint (.pptx) | Downloads |
| Excel (.xlsx), CSV | Downloads |
| Plain text | Opens in the browser |

**Up to 25 MB per file, up to 10 files per activity.** Anything else — programs, zips, web pages — is refused by name, not by guesswork.

### How files are protected

- Files sit in **private storage**. There is no public address, and no address that keeps working.
- When someone clicks a file, Pulse checks first — the trainee's own link is still valid and the activity is released, or you are signed in — and then issues a link that **works for five minutes**.
- A link forwarded to someone else stops working almost immediately. That is the point.
- Trainees only ever see files on activities you have released.

### Practical advice

- **A 40 MB deck won't upload.** Export it smaller, split it, or put it on a drive and use **Video or link** instead.
- **For a video, use a link.** Pulse does not host video. Put it on YouTube (unlisted), Vimeo or your drive, and link to it.
- **Name files as the trainee should see them** — "Session 2 handout.pdf", not "v3_FINAL_draft.pdf". The name you upload is the name they read.
- Remove a file with the bin icon beside it. It goes from storage as well as from the list.

---

## 7. Role-play: acted out, or written

Both kinds start the same way: a **scenario** everyone reads, and **roles** (two to six). Each role goes to a different person. An observer is optional.

### Acted out (recommended for a workshop)

1. Write the scenario and the roles.
2. Set the questions each person answers afterwards. Pulse starts you with two sets:
   - **Participants** are asked what they *experienced*: did you feel heard, could you disagree, what would you do differently.
   - **The observer** is asked what they *saw*: did people listen without interrupting, what observable behaviour, what should each person practise.
   - Edit both freely. Keep the distinction — experience from the inside, behaviour from the outside — because that is what makes the comparison worth reading.
3. **Assign role-play groups**: name the group, give each role to a different trainee, and optionally add an observer.
4. Release the activity.
5. **The conversation happens away from Pulse** — in the room, or on whatever call you already use. Each person's page tells them this.
6. Afterwards each person writes their own account, without seeing anyone else's.

**Why nobody sees anyone else's answers:** if the manager reads "I felt interrupted" before writing, they write a different, more careful account. The disagreement between accounts is the coaching material, and it only survives if everyone writes blind.

### Written turns

The conversation happens in Pulse. Each person speaks when it's their turn; the activity completes when the rounds are used up. You set **Rounds** — each person speaks once per round. An observer can add feedback during or after. Use this when people genuinely cannot meet.

### Group rules

- Each trainee is in **at most one group per role-play activity**. For a second pairing, add a second role-play activity.
- A group needs every role filled, each by a different person.
- You can finish an active written role-play early.

---

## 8. Releasing work, and the order people see it

**Released** is the tick beside each activity. Unticked, trainees never see it — the activity doesn't exist as far as they're concerned.

Work in this order:

1. Build the activity and attach its files.
2. Preview it.
3. Assign role-play groups, if it is a role-play.
4. Tick **Released**.

The arrows reorder activities, and that order is what trainees see. Put reading before the thing it prepares people for.

**The three hidden starter activities** — practice scenarios, the IDP and the role-play — hold placeholder text. Replace it with your own material before releasing them.

---

## 9. Reading what comes back

The **Responses** tab, one activity at a time.

**For questionnaires, reflections and development plans:** every trainee, whether they've submitted, when they last saved, and their answers. Drafts are visible to you and marked as drafts; trainees are told this on their own page.

**For an acted-out role-play:** each group, with every person's account side by side — the manager's, the team member's, the observer's — and a count of who has written theirs. Read across the columns: the gap between what one person intended, what the other experienced, and what the observer saw is the conversation to have.

**For a written role-play:** the full transcript in order, with who said what.

**Copy all** puts the table on your clipboard. **CSV export** downloads it for a spreadsheet. The export is the aggregate of that activity; it opens safely in Excel.

> Pulse reports what people wrote and what was observed. It does not score anyone's emotional intelligence or produce a psychological profile, and it shouldn't — a single role-play is not an assessment. The interpretation is yours.

---

## 10. Managing links and closing a programme

Under each trainee, **Manage link**:

| Action | What it does | When |
|---|---|---|
| Copy | Copies their personal link | Sending or re-sending |
| **Issue new link** | Replaces the link; the old one stops working | They forwarded it, or it reached the wrong person |
| **Revoke** | Switches the link off, keeping their work | They've left, or the programme ended for them |

Revoked and expired links show the person a plain message telling them to ask you for a new one.

**Archiving a programme** (the status selector at the top) closes it for everyone: links stop working, and the work stays for your records. Set it back to Active to reopen.

---

## 11. Limits, and what to do at the edges

| Limit | Number | If you hit it |
|---|---|---|
| Trainees per programme | 300 | Run a second programme per cohort |
| Activities per programme | 50 | Split by module |
| Files per activity | 10 | Combine into one PDF |
| File size | 25 MB | Compress, split, or link to it |
| Link life | 180 days | Issue a new link |
| Roles per role-play | 2 to 6 | — |
| Goal rows in a plan | 1 to 10 | — |

Someone opening their link many times a minute is slowed down briefly. Normal use never reaches it.

---

## 12. What trainees see

Worth knowing, because they will ask you.

- **A list** of released activities, each marked Done, Draft saved, Feedback to write, Awaiting group or To do, with a count of how many they've finished.
- **Reading material** with a **Mark as read** button.
- **Forms** with **Save draft** and **Submit**. Drafts survive closing the browser; reopening the link restores what they wrote. Required questions are enforced on submit, not on draft.
- **Files** listed above the material, opening on click.
- **A role-play** shows their role, who else is in the group, and instructions to act it out, then their own feedback questions.
- **A footer** telling them plainly that you can see their work including drafts, that role-play messages are shared with their group, and to keep their link private.
- **An email receipt** after they submit a form or role-play feedback, if they gave an email. It contains a link back to their dashboard — never their answers.

Nothing they do requires an account, a password or an app.
