import test from "node:test";
import assert from "node:assert/strict";
import { sendPulseEmail } from "./pulseEmail.ts";

test("learning invitations use existing sender, tenant reply-to and retry key", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.FROM_EMAIL;
  process.env.RESEND_API_KEY = "test-only";
  process.env.FROM_EMAIL = "Pulse <pulse@example.com>";
  const requests: RequestInit[] = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    requests.push(options!);
    return new Response("{}", { status: requests.length === 1 ? 200 : 429 });
  };
  try {
    const mail = {
      to: "trainee@example.com",
      subject: "Training",
      html: "Private link",
      replyTo: "hr@tenant.example",
      idempotencyKey: "stable-retry-key",
      timeoutMs: 15000,
    };
    assert.deepEqual(await sendPulseEmail(mail), { ok: true, status: "sent" });
    assert.equal((await sendPulseEmail(mail)).ok, false);
    assert.equal(
      new Headers(requests[0].headers).get("Idempotency-Key"),
      "stable-retry-key",
    );
    assert.equal(
      new Headers(requests[1].headers).get("Idempotency-Key"),
      "stable-retry-key",
    );
    const body = JSON.parse(String(requests[0].body));
    assert.deepEqual(body.to, ["trainee@example.com"]);
    assert.deepEqual(body.reply_to, ["hr@tenant.example"]);
    assert.equal(body.from, "Pulse <pulse@example.com>");
    assert.ok(requests[0].signal);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.FROM_EMAIL;
    else process.env.FROM_EMAIL = previousFrom;
  }
});
