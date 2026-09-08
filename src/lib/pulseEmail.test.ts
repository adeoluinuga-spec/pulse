import test from "node:test";
import assert from "node:assert/strict";

import { assessmentParticipantEmail, resolveReplyTo } from "./pulseEmail.ts";

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
