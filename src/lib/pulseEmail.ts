import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Outbound email for Pulse.
 *
 * Pulse sends from its own verified domain, because the links it carries are
 * per-assignment single-use secrets that must not be forwarded or mail-merged by
 * hand. Replies, though, belong to the client organisation — so every message
 * carries a per-tenant Reply-To.
 *
 * The resolution below is deliberately fallback-first: a newly onboarded
 * organisation needs no configuration for replies to reach a human.
 */

export type ReplyToInput = {
  /** organisations.reply_to_email — set only when a tenant overrides the default. */
  orgReplyTo?: string | null;
  /** Addresses of that organisation's hr_admin employees. */
  hrAdminEmails?: Array<string | null | undefined>;
};

/**
 * Where replies to a Pulse-sent message should go, for one organisation.
 *
 * 1. The organisation's explicit reply_to_email, if set.
 * 2. Otherwise the organisation's HR admin — so a new tenant is covered from the
 *    moment they are created, with no setup step.
 * 3. Otherwise nothing: better no Reply-To header than one pointing at a mailbox
 *    nobody reads.
 */
export function resolveReplyTo(input: ReplyToInput): string | undefined {
  const explicit = input.orgReplyTo?.trim();
  if (explicit) return explicit;

  const hrAdmin = (input.hrAdminEmails ?? [])
    .map((email) => email?.trim())
    .find((email) => Boolean(email));

  return hrAdmin || undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeText(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, " ") || fallback;
}

export type PulseEmail = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export type SendResult =
  | { ok: true; status: "sent" }
  | { ok: false; status: "delivery_failed"; error: string };

/**
 * Sends one message through Resend.
 *
 * The sender must be on a domain verified in Resend or every send is rejected,
 * which is why FROM_EMAIL has no silent default here — an unset variable is
 * reported rather than swapped for a guess that will fail at the provider.
 */
export async function sendPulseEmail(email: PulseEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;

  if (!apiKey) {
    return { ok: false, status: "delivery_failed", error: "RESEND_API_KEY is not configured" };
  }
  if (!fromEmail) {
    return {
      ok: false,
      status: "delivery_failed",
      error: "FROM_EMAIL is not configured. It must be an address on a domain verified in Resend.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      ...(email.replyTo ? { reply_to: [email.replyTo] } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, status: "delivery_failed", error: text || "Resend rejected the message" };
  }

  return { ok: true, status: "sent" };
}

/** Shared shell so Pulse mail looks like one product. */
export function pulseEmailShell(body: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
      <p style="margin:0 0 16px;color:#6b7280;">Pulse 360 assessment</p>
      ${body}
    </div>
  `;
}

/**
 * Told to the person being assessed, when they are added to a cycle.
 *
 * Carries no link to their feedback: nothing is visible to a participant until
 * a consultant reviews and releases it, and promising otherwise would be the
 * wrong expectation to set on day one.
 */
export function assessmentParticipantEmail(input: {
  participantName: string;
  cycleName: string;
  organisationName: string;
  closesOn?: string | null;
  appUrl?: string;
}): { subject: string; html: string } {
  const participantName = safeText(input.participantName, "there");
  const cycleName = safeText(input.cycleName, "a 360 assessment");
  const organisationName = safeText(input.organisationName, "Your organisation");
  const firstName = participantName.split(/\s+/)[0] || "there";
  const closing = input.closesOn
    ? `<p style="margin:0 0 12px;line-height:1.6;">Feedback is being collected until <strong>${new Date(input.closesOn).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>.</p>`
    : "";
  const signIn = input.appUrl
    ? `<p style="margin:0 0 24px;"><a href="${input.appUrl}/dashboard" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Open Pulse</a></p>`
    : "";

  return {
    subject: `You have been included in ${cycleName}`,
    html: pulseEmailShell(`
      <h2 style="margin:0 0 16px;font-size:24px;">You are part of a 360 assessment</h2>
      <p style="margin:0 0 12px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(organisationName)} has included you in <strong>${escapeHtml(cycleName)}</strong>. Colleagues who work with you will be asked to give confidential, developmental feedback.</p>
      ${closing}
      <p style="margin:0 0 12px;line-height:1.6;">You do not need to do anything right now. If a self-assessment is part of this cycle, it will arrive as a separate invitation with its own link.</p>
      <p style="margin:0 0 12px;line-height:1.6;">Individual responses stay confidential. You will receive your report once it has been reviewed and released.</p>
      ${signIn}
      <p style="margin:0;line-height:1.6;color:#6b7280;font-size:13px;">Questions about this assessment? Reply to this email and it will reach your HR team.</p>
    `),
  };
}

export function assessmentReminderEmail(input: {
  reviewerName: string;
  subjectName: string;
  cycleName: string;
  closesOn?: string | null;
  contactUrl: string;
}): { subject: string; html: string } {
  const reviewerName = safeText(input.reviewerName, "there");
  const subjectName = safeText(input.subjectName, "this assessment");
  const cycleName = safeText(input.cycleName, "the current 360 assessment");
  const firstName = reviewerName.split(/\s+/)[0] || "there";
  const closing = input.closesOn
    ? `<p style="margin:0 0 12px;line-height:1.6;">The assessment window closes on <strong>${new Date(input.closesOn).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>.</p>`
    : "";

  return {
    subject: `Reminder: feedback for ${subjectName}`,
    html: pulseEmailShell(`
      <h2 style="margin:0 0 16px;font-size:24px;">360 feedback reminder</h2>
      <p style="margin:0 0 12px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;line-height:1.6;">This is a reminder to complete your feedback for <strong>${escapeHtml(subjectName)}</strong> in <strong>${escapeHtml(cycleName)}</strong>.</p>
      ${closing}
      <p style="margin:0 0 12px;line-height:1.6;">Please use your original assessment invitation link. If you cannot find it or the link has expired, contact the HR team.</p>
      <p style="margin:0 0 24px;"><a href="${input.contactUrl}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Contact support</a></p>
      <p style="margin:0;line-height:1.6;color:#6b7280;font-size:13px;">Replies to this message go to the HR team managing this assessment.</p>
    `),
  };
}

export function assessmentCycleLaunchEmail(input: {
  employeeName: string;
  cycleName: string;
  organisationName: string;
  closesOn?: string | null;
  appUrl: string;
}): { subject: string; html: string } {
  const employeeName = safeText(input.employeeName, "there");
  const cycleName = safeText(input.cycleName, "a 360 assessment");
  const organisationName = safeText(input.organisationName, "Your organisation");
  const firstName = employeeName.split(/\s+/)[0] || "there";
  const closing = input.closesOn
    ? `<p style="margin:0 0 12px;line-height:1.6;">The assessment window closes on <strong>${new Date(input.closesOn).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>.</p>`
    : "";

  return {
    subject: `${cycleName} has started`,
    html: pulseEmailShell(`
      <h2 style="margin:0 0 16px;font-size:24px;">A 360 assessment cycle has started</h2>
      <p style="margin:0 0 12px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(organisationName)} has opened <strong>${escapeHtml(cycleName)}</strong>.</p>
      ${closing}
      <p style="margin:0 0 12px;line-height:1.6;">If you are selected to give feedback, you will receive a separate secure invitation. If you are listed as an assessment participant, Pulse will also notify you directly.</p>
      <p style="margin:0 0 24px;"><a href="${input.appUrl}/dashboard" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Open Pulse</a></p>
      <p style="margin:0;line-height:1.6;color:#6b7280;font-size:13px;">Questions about this assessment? Reply to this email and it will reach your HR team.</p>
    `),
  };
}

/**
 * Looks up where replies should go for one organisation, then resolves them.
 *
 * Kept here so every sender reaches the same answer: a rater replying "this link
 * won't open" and a participant replying "what is this?" should both land in the
 * same HR inbox.
 */
export async function resolveOrgReplyTo(
  admin: SupabaseClient,
  orgId: string,
): Promise<string | undefined> {
  try {
    const [org, hr] = await Promise.all([
      admin
        .from("organisations")
        .select("reply_to_email")
        .eq("id", orgId)
        .maybeSingle<{ reply_to_email: string | null }>(),
      admin
        .from("employees")
        .select("email")
        .eq("org_id", orgId)
        .eq("platform_role", "hr_admin")
        .returns<Array<{ email: string | null }>>(),
    ]);

    return resolveReplyTo({
      orgReplyTo: org.data?.reply_to_email,
      hrAdminEmails: (hr.data ?? []).map((row) => row.email),
    });
  } catch {
    // A missing reply-to is a smaller problem than a failed send.
    return undefined;
  }
}
