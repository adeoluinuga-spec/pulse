import type { SupabaseClient } from "@supabase/supabase-js";

import { assessmentParticipantEmail, resolveReplyTo, sendPulseEmail } from "./pulseEmail";

type ParticipantRecipient = {
  employeeId: string | null;
  name: string;
  email: string;
};

export type ParticipantNotificationSummary = {
  inApp: number;
  emailed: number;
  emailFailed: number;
};

/** Delivers the same notice whether HR adds one participant or a whole cadre. */
export async function notifyAssessmentParticipants(input: {
  admin: SupabaseClient;
  orgId: string;
  cycleId: string;
  participants: ParticipantRecipient[];
  origin: string;
}): Promise<ParticipantNotificationSummary> {
  if (!input.participants.length) return { inApp: 0, emailed: 0, emailFailed: 0 };

  try {
    const [cycleResult, orgResult, hrResult] = await Promise.all([
      input.admin.from("assessment_cycles").select("name, closes_on").eq("id", input.cycleId).eq("org_id", input.orgId).maybeSingle<{ name: string | null; closes_on: string | null }>(),
      input.admin.from("organisations").select("name, reply_to_email").eq("id", input.orgId).maybeSingle<{ name: string | null; reply_to_email: string | null }>(),
      input.admin.from("employees").select("email").eq("org_id", input.orgId).eq("platform_role", "hr_admin").returns<Array<{ email: string | null }>>(),
    ]);

    const cycleName = cycleResult.data?.name?.trim() || "a 360 assessment";
    const organisationName = orgResult.data?.name?.trim() || "Your organisation";
    const replyTo = resolveReplyTo({
      orgReplyTo: orgResult.data?.reply_to_email,
      hrAdminEmails: (hrResult.data ?? []).map((row) => row.email),
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? input.origin;

    const notificationRows = input.participants
      .filter((participant) => participant.employeeId)
      .map((participant) => ({
        employee_id: participant.employeeId!,
        title: "You are part of a 360 assessment",
        body: `${organisationName} has included you in ${cycleName}. Colleagues will be asked for confidential feedback. Your report follows once it has been reviewed.`,
        type: "assessment_participant",
        action_url: "/dashboard",
      }));

    let inApp = 0;
    if (notificationRows.length) {
      const { error } = await input.admin.from("notifications").insert(notificationRows);
      if (!error) inApp = notificationRows.length;
    }

    const results = await Promise.all(input.participants.map(async (participant) => {
      const message = assessmentParticipantEmail({
        participantName: participant.name,
        cycleName,
        organisationName,
        closesOn: cycleResult.data?.closes_on ?? null,
        appUrl,
      });
      return sendPulseEmail({ to: participant.email, subject: message.subject, html: message.html, replyTo });
    }));

    return {
      inApp,
      emailed: results.filter((result) => result.ok).length,
      emailFailed: results.filter((result) => !result.ok).length,
    };
  } catch {
    // A delivery outage must not undo the successful cohort change.
    return { inApp: 0, emailed: 0, emailFailed: input.participants.length };
  }
}
