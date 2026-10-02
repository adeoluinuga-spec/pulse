import {
  cohortFor,
  json,
  learningBody,
  learningContext,
  learningHandled,
  LearningError,
  revealLearningLink,
} from "@/lib/learningServer";
import {
  invitationUnavailable,
  learningInvitationEmail,
} from "@/lib/learningInvitations";
import {
  emailDeliveryFailureMessage,
  resolveOrgReplyTo,
  sendPulseEmail,
} from "@/lib/pulseEmail";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return learningHandled(async () => {
    const { admin, orgId, employeeId } = await learningContext();
    const { id } = await params;
    const cohort = await cohortFor(admin, id, orgId);
    if (cohort.status !== "active")
      throw new LearningError(
        "Reopen the programme before sending invitations.",
      );
    const body = await learningBody(request);
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      typeof body.traineeId !== "string" ||
      !uuid.test(body.traineeId) ||
      typeof body.requestId !== "string" ||
      !uuid.test(body.requestId)
    )
      throw new LearningError(
        "Choose a trainee and a valid invitation request.",
      );
    const { data: trainee, error } = await admin
      .from("learning_trainees")
      .select(
        "id,display_name,email,token_ciphertext,token_hash,revoked_at,expires_at",
      )
      .eq("cohort_id", id)
      .eq("id", body.traineeId)
      .maybeSingle();
    if (error) throw error;
    if (!trainee) throw new LearningError("Trainee not found.", 404);
    const unavailable = invitationUnavailable(trainee);
    if (unavailable) throw new LearningError(unavailable);
    const limit = await admin.rpc("learning_rate_limit", {
      p_key: `learning-invites:${orgId}:${employeeId}`,
      p_max: 90,
    });
    if (limit.error) throw limit.error;
    if (!limit.data)
      throw new LearningError(
        "Please wait a minute before sending more invitations.",
        429,
      );
    let token: string;
    try {
      token = revealLearningLink(trainee.token_ciphertext);
    } catch {
      throw new LearningError(
        "This link cannot be recovered. Issue a new personal link first.",
      );
    }
    const message = learningInvitationEmail({
      name: trainee.display_name,
      programme: cohort.name,
      client: cohort.client_name,
      token,
      origin: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
    });
    try {
      const result = await sendPulseEmail({
        to: trainee.email!,
        ...message,
        replyTo: await resolveOrgReplyTo(admin, orgId),
        idempotencyKey: `learning-${trainee.id}-${trainee.token_hash}-${body.requestId}`,
        timeoutMs: 15000,
      });
      if (!result.ok)
        return json({ error: emailDeliveryFailureMessage(result.error) }, 502);
    } catch {
      return json(
        {
          error:
            "Delivery could not be confirmed. Retry this invitation; the same request will be reused to avoid duplicate emails.",
        },
        502,
      );
    }
    return json({ status: "accepted", traineeId: trainee.id });
  });
}
