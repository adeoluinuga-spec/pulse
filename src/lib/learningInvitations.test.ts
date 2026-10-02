import test from "node:test";
import assert from "node:assert/strict";
import {
  invitationUnavailable,
  learningInvitationEmail,
} from "./learningInvitations.ts";

test("invitation eligibility requires email and an active, unexpired link", () => {
  const valid = {
    email: "trainee@example.com",
    revoked_at: null,
    expires_at: "2030-01-01",
  };
  const now = Date.parse("2026-10-02");
  assert.equal(invitationUnavailable(valid, now), null);
  for (const change of [
    { email: null },
    { email: "bad" },
    { revoked_at: "2026-10-01" },
    { expires_at: "invalid" },
    { expires_at: "2026-10-02" },
  ])
    assert.ok(invitationUnavailable({ ...valid, ...change }, now));
});

test("invitation escapes content and uses only the intended private trainee URL", () => {
  const mail = learningInvitationEmail({
    name: '<script>"&',
    programme: "Training\r\nSubject",
    client: "A&B",
    token: "a".repeat(64),
    origin: "https://pulse.example.com/path",
  });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;&quot;&amp;"));
  assert.ok(mail.html.includes("A&amp;B"));
  assert.ok(
    mail.html.includes(`https://pulse.example.com/t/${"a".repeat(64)}`),
  );
  assert.ok(!mail.subject.includes("\n"));
  assert.ok(!mail.html.includes("360 assessment"));
});

test("invitation rejects unsafe origins and malformed tokens", () => {
  const input = {
    name: "Ada",
    programme: "Training",
    client: "Client",
    token: "a".repeat(64),
    origin: "https://pulse.example.com",
  };
  for (const origin of ["javascript:alert(1)", "http://remote.example.com"])
    assert.throws(() => learningInvitationEmail({ ...input, origin }));
  assert.throws(() =>
    learningInvitationEmail({ ...input, token: '"onclick=' }),
  );
  assert.ok(
    learningInvitationEmail({ ...input, origin: "http://localhost:3100" }),
  );
});
