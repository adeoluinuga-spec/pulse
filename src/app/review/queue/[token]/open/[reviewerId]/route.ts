import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Hands a rater from their queue into one specific assessment.
 *
 * assessment_reviewers stores only token_hash — the plaintext token exists once,
 * at issuance, and is never recoverable. So the queue cannot simply link to
 * /review/<token> for the rater's other assignments: it does not know, and
 * cannot know, what those tokens are.
 *
 * This route closes that gap by minting a fresh token for the target assignment
 * and redirecting to it, after proving the caller already holds a live token for
 * the same (reviewer_email, cycle). Two consequences worth knowing:
 *
 *   - Opening another assignment from the queue ROTATES that assignment's token,
 *     so its own older invitation link stops working. The newest link wins.
 *   - Opening the assignment whose token addressed the queue does NOT rotate
 *     anything; it reuses the presented token. That keeps the queue URL itself
 *     alive, which would otherwise destroy itself on first use.
 *
 * The expiry window is carried over unchanged rather than extended — lengthening
 * a rater's window is a cycle policy decision, not this route's to make.
 */

type ReviewerRow = {
  id: string;
  cycle_id: string;
  subject_id: string;
  reviewer_email: string;
  status: string;
  token_expires_at: string | null;
};

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const value = new Date(expiresAt).getTime();
  return Number.isFinite(value) && value < Date.now();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; reviewerId: string }> },
) {
  const { token, reviewerId } = await params;
  const presented = token?.trim();
  const origin = request.nextUrl.origin;

  const contact = () => NextResponse.redirect(new URL("/review/contact", origin));
  const backToQueue = () =>
    NextResponse.redirect(new URL(`/review/queue/${encodeURIComponent(presented)}`, origin));

  if (!presented || !reviewerId) return contact();

  const admin = getAdminClient();

  const { data: holder, error: holderError } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, reviewer_email, status, token_expires_at")
    .eq("token_hash", hashToken(presented))
    .maybeSingle<ReviewerRow>();

  if (holderError || !holder || isExpired(holder.token_expires_at)) return contact();

  // Reusing the presented token keeps the queue URL valid.
  if (holder.id === reviewerId) {
    return NextResponse.redirect(new URL(`/review/${encodeURIComponent(presented)}`, origin));
  }

  const { data: target, error: targetError } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, reviewer_email, status, token_expires_at")
    .eq("id", reviewerId)
    .maybeSingle<ReviewerRow>();

  if (targetError || !target) return backToQueue();

  // The holder may only reach assignments belonging to the same address in the
  // same cycle. Without this, one rater's token would open another's assessment.
  const sameCycle = target.cycle_id === holder.cycle_id;
  const sameRater =
    target.reviewer_email.trim().toLowerCase() === holder.reviewer_email.trim().toLowerCase();

  if (!sameCycle || !sameRater) return backToQueue();

  // Nothing to open: already done, or its own window has closed.
  if (target.status === "submitted" || isExpired(target.token_expires_at)) return backToQueue();

  const freshToken = randomBytes(24).toString("base64url");

  const { error: updateError } = await admin
    .from("assessment_reviewers")
    .update({
      token_hash: hashToken(freshToken),
      // Window carried over, not extended.
      token_expires_at: target.token_expires_at,
      invite_status: "opened",
    })
    .eq("id", target.id);

  if (updateError) return backToQueue();

  await admin.from("assessment_audit_events").insert({
    cycle_id: target.cycle_id,
    subject_id: target.subject_id,
    reviewer_id: target.id,
    action: "review_token_reissued_from_queue",
    metadata: {
      viaReviewerId: holder.id,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
  });

  return NextResponse.redirect(new URL(`/review/${encodeURIComponent(freshToken)}`, origin));
}
