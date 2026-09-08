import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "notifications@usepulse.app";
const APP_URL = Deno.env.get("APP_URL") ?? "https://usepulse.app";
// Shared secret so only our own server/cron can trigger emails.
// Anyone with just the public anon key gets a 401.
const PULSE_EDGE_SECRET = Deno.env.get("PULSE_EDGE_SECRET") ?? "";

interface NotificationPayload {
  type: string;
  recipientEmail: string;
  recipientName: string;
  data?: Record<string, string>;
}

function btn(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#e8440a;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:24px;">${text}</a>`;
}

function wrap(subject: string, preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">Pulse</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px;border-radius:0 0 8px 8px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0;text-align:center;">
            <p style="margin:0;color:#999;font-size:12px;">
              You're receiving this because you're a Pulse user.<br>
              This is an automated notification — no need to reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function p(text: string): string {
  return `<p style="color:#555;line-height:1.6;margin:0 0 8px;">${text}</p>`;
}

function h2(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">${text}</h2>`;
}

function buildEmail(payload: NotificationPayload): { subject: string; html: string } | null {
  const { type, recipientName: name, data = {} } = payload;
  const url = APP_URL;

  switch (type) {
    case "report_due":
      return {
        subject: "⏰ Your weekly report is due today — Pulse",
        html: wrap(
          "Your weekly report is due today",
          "Your weekly check-in is due today by 5PM",
          `${h2("Your report is due today")}
          ${p(`Hi ${name},`)}
          ${p("Your weekly check-in is due today by <strong>5PM</strong>. It takes about 5 minutes and keeps your manager aligned on your progress.")}
          ${btn("Submit Report →", `${url}/reports/submit`)}`
        ),
      };

    case "report_overdue":
      return {
        subject: "📋 Report overdue — Pulse",
        html: wrap(
          "Report overdue",
          "Your weekly report is now overdue",
          `${h2("Your report is overdue")}
          ${p(`Hi ${name},`)}
          ${p("Your weekly report is now overdue. Your <strong>consistency score</strong> is affected for each day it's not submitted.")}
          ${p("Submit it now to minimise the impact.")}
          ${btn("Submit Report →", `${url}/reports/submit`)}`
        ),
      };

    case "leave_approved":
      return {
        subject: "✅ Leave approved — Pulse",
        html: wrap(
          "Leave approved",
          `Your ${data.leaveType} leave has been approved`,
          `${h2("Leave approved")}
          ${p(`Hi ${name},`)}
          ${p(`Your <strong>${data.leaveType}</strong> leave from <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> has been approved by ${data.managerName}.`)}
          ${p("Enjoy your time off.")}
          ${btn("View Leave →", `${url}/team`)}`
        ),
      };

    case "leave_declined":
      return {
        subject: "Leave request update — Pulse",
        html: wrap(
          "Leave request update",
          "Your leave request was not approved",
          `${h2("Leave request not approved")}
          ${p(`Hi ${name},`)}
          ${p("Your leave request was not approved.")}
          ${data.reason ? p(`<strong>Reason:</strong> ${data.reason}`) : ""}
          ${p("Contact your manager if you have questions.")}
          ${btn("View Leave →", `${url}/team`)}`
        ),
      };

    case "appraisal_opening":
      return {
        subject: `📊 ${data.cycleName} Appraisal Cycle is now open — Pulse`,
        html: wrap(
          "Appraisal cycle open",
          `The ${data.cycleName} appraisal cycle is now open`,
          `${h2(`${data.cycleName} Appraisal Cycle is now open`)}
          ${p(`Hi ${name},`)}
          ${p(`The <strong>${data.cycleName}</strong> appraisal cycle has opened. Your self-assessment is due <strong>${data.dueDate}</strong>.`)}
          ${p("Take your time and be honest — your responses inform your final score.")}
          ${btn("Start Self-Assessment →", `${url}/appraisal`)}`
        ),
      };

    case "manager_review_needed":
      return {
        subject: `Action needed: Review ${data.employeeName}'s appraisal — Pulse`,
        html: wrap(
          "Appraisal review needed",
          `${data.employeeName}'s appraisal is ready for your review`,
          `${h2("Appraisal review needed")}
          ${p(`Hi ${name},`)}
          ${p(`<strong>${data.employeeName}</strong>'s appraisal is ready for your review.`)}
          ${p(`Your review is required before the cycle closes on <strong>${data.cycleEndDate}</strong>.`)}
          ${btn("Review Now →", `${url}/appraisal`)}`
        ),
      };

    case "goal_at_risk":
      return {
        subject: "⚠️ Goal at risk — Pulse",
        html: wrap(
          "Goal at risk",
          `Your goal '${data.goalName}' is at risk`,
          `${h2("Goal at risk")}
          ${p(`Hi ${name},`)}
          ${p(`Your goal <strong>'${data.goalName}'</strong> is at <strong>${data.percentComplete}%</strong> with <strong>${data.daysRemaining} days</strong> remaining. It's at risk of not being completed on time.`)}
          ${btn("View Goal →", `${url}/goals`)}`
        ),
      };

    case "assessment_reminder":
      return {
        subject: `Reminder: ${data.subjectName ?? "your assessment"} needs feedback — Pulse`,
        html: wrap(
          "Assessment reminder",
          `Your feedback for ${data.subjectName ?? "this subject"} is due soon`,
          `${h2("Feedback reminder")}
          ${p(`Hi ${name},`)}
          ${p(`This is a reminder that your feedback for <strong>${data.subjectName ?? "this assessment"}</strong> is still outstanding.`)}
          ${p("Your responses help shape the final 360 view and should be completed as soon as possible.")}
          ${p(`The assessment closes on <strong>${data.expiresAt ?? "the current cycle"}</strong>.`)}
          ${btn("Open assessment →", data.assessmentUrl ?? `${url}/review/contact`)}`
        ),
      };

    case "welcome":
      return {
        subject: "Welcome to Pulse 👋",
        html: wrap(
          "Welcome to Pulse",
          `You've been invited to Pulse at ${data.orgName}`,
          `${h2("Welcome to Pulse")}
          ${p(`Hi ${name},`)}
          ${p(`<strong>${data.inviterName}</strong> has invited you to Pulse at <strong>${data.orgName}</strong>.`)}
          ${p("Pulse is your performance hub — track goals, submit reports, and stay connected with your team.")}
          ${btn("Set Up Your Account →", data.inviteUrl ?? `${url}/welcome`)}`
        ),
      };

    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!PULSE_EDGE_SECRET || req.headers.get("x-pulse-secret") !== PULSE_EDGE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json()) as NotificationPayload;
    const email = buildEmail(payload);

    if (!email) {
      return new Response(JSON.stringify({ error: `Unknown type: ${payload.type}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: payload.recipientEmail,
        subject: email.subject,
        html: email.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await res.json() as { id: string };
    return new Response(JSON.stringify({ id: result.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
