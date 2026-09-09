import test from "node:test";
import assert from "node:assert/strict";

import {
  assessmentCycleLaunchEmail,
  assessmentParticipantEmail,
  assessmentReminderEmail,
  assessmentReviewerInviteEmail,
  resolveReplyTo,
} from "./pulseEmail.ts";

test("resolveReplyTo prefers the organisation mailbox", () => {
  assert.equal(
    resolveReplyTo({
      orgReplyTo: " hr@stuartdavidson.org ",
      hrAdminEmails: ["admin@stuartdavidson.org"],
    }),
    "hr@stuartdavidson.org",
  );
});

test("resolveReplyTo falls back to the first HR admin email", () => {
  assert.equal(
    resolveReplyTo({
      orgReplyTo: " ",
      hrAdminEmails: [null, " hrlead@stuartdavidson.org ", "backup@stuartdavidson.org"],
    }),
    "hrlead@stuartdavidson.org",
  );
});

test("resolveReplyTo returns undefined when no tenant mailbox exists", () => {
  assert.equal(resolveReplyTo({ orgReplyTo: null, hrAdminEmails: [null, ""] }), undefined);
});

test("assessmentParticipantEmail escapes tenant supplied content", () => {
  const email = assessmentParticipantEmail({
    participantName: "<Moses>",
    cycleName: "Leadership <script>alert(1)</script>",
    organisationName: "Stuart & Davidson",
  });

  assert.equal(email.subject, "You have been included in Leadership <script>alert(1)</script>");
  assert.match(email.html, /Hi &lt;Moses&gt;/);
  assert.match(email.html, /Stuart &amp; Davidson/);
  assert.match(email.html, /Leadership &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /<script>alert\(1\)<\/script>/);
});

test("assessmentReminderEmail tells reviewers to use their original secure link", () => {
  const email = assessmentReminderEmail({
    reviewerName: "Jane Okafor",
    subjectName: "Kehinde White",
    cycleName: "Leadership 360",
    contactUrl: "https://pulse.example/review/contact",
  });

  assert.equal(email.subject, "Reminder: feedback for Kehinde White");
  assert.match(email.html, /original assessment invitation link/);
  assert.match(email.html, /https:\/\/pulse\.example\/review\/contact/);
});

test("assessmentCycleLaunchEmail separates launch notice from secure review invites", () => {
  const email = assessmentCycleLaunchEmail({
    employeeName: "Moses Vaughan",
    cycleName: "Stuart Davidson Leadership 360",
    organisationName: "Stuart Davidson",
    appUrl: "https://pulse.example",
  });

  assert.equal(email.subject, "Stuart Davidson Leadership 360 has started");
  assert.match(email.html, /separate secure invitation/);
  assert.match(email.html, /https:\/\/pulse\.example\/dashboard/);
});

test("a rater invitation names the person being assessed, not the rater", () => {
  const mail = assessmentReviewerInviteEmail({
    reviewerName: "Adeolu Osinuga",
    subjectName: "Taiwo Ogba",
    secureLink: "https://pulse.example/review/tok",
    queueLink: "https://pulse.example/review/queue/tok",
    expiresAt: "2026-09-22T12:00:00Z",
  });

  assert.equal(mail.subject, "Your Pulse 360 feedback on Taiwo Ogba");
  assert.match(mail.html, /give feedback on <strong>Taiwo Ogba<\/strong>/);
  assert.match(mail.html, /Hi Adeolu,/);
  assert.match(mail.html, /https:\/\/pulse\.example\/review\/tok/);
  assert.match(mail.html, /22 September 2026/);
});

test("a self-assessment is not phrased as feedback on somebody else", () => {
  const mail = assessmentReviewerInviteEmail({
    reviewerName: "Iyanu Maza",
    subjectName: "Iyanu Maza",
    isSelfAssessment: true,
    secureLink: "https://pulse.example/review/tok",
    expiresAt: "2026-09-22T12:00:00Z",
  });

  assert.equal(mail.subject, "Your Pulse 360 self-assessment");
  assert.match(mail.html, /your own self-assessment/);
  assert.doesNotMatch(mail.html, /give feedback on/);
});

test("the queue link is omitted rather than rendered empty", () => {
  const mail = assessmentReviewerInviteEmail({
    reviewerName: "Kehinde White",
    subjectName: "Taiwo Ogba",
    secureLink: "https://pulse.example/review/tok",
    expiresAt: "2026-09-22T12:00:00Z",
  });

  assert.doesNotMatch(mail.html, /review queue/i);
});

test("a name carrying markup cannot break out of the invitation body", () => {
  const mail = assessmentReviewerInviteEmail({
    reviewerName: "Ada",
    subjectName: '<script>alert("x")</script>',
    secureLink: "https://pulse.example/review/tok",
    expiresAt: "2026-09-22T12:00:00Z",
  });

  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /&lt;script&gt;/);
});
