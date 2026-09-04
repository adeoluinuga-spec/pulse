import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { DEV_AUTH_BYPASS } from "@/lib/devAuth";
import { buildReviewSubmissionSummary, getReviewPayloadErrors, type ReviewSubmissionPayload } from "@/lib/reviewSubmission";

export const dynamic = "force-dynamic";

type ReviewerRow = {
  id: string;
  cycle_id: string;
  subject_id: string;
  status: string;
  token_expires_at: string | null;
};

type ItemRow = {
  id: string;
  item_type: string;
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

function clientMetadata(request: NextRequest) {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  };
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as ReviewSubmissionPayload;
  const errors = getReviewPayloadErrors(payload);

  if (errors.length) {
    return NextResponse.json({ error: "Invalid review submission", errors }, { status: 400 });
  }

  const token = payload.token!.trim();
  const responses = payload.responses!;
  const isDraft = payload.mode === "draft";
  const submittedAt = new Date().toISOString();
  const summary = buildReviewSubmissionSummary(responses);

  if (DEV_AUTH_BYPASS) {
    return NextResponse.json({
      submission: {
        persisted: false,
        status: isDraft ? "in_progress" : "submitted",
        submittedAt: isDraft ? null : submittedAt,
        summary,
      },
    });
  }

  const admin = getAdminClient();
  const tokenHash = hashToken(token);
  const { ip, userAgent } = clientMetadata(request);

  const { data: reviewer, error: reviewerError } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, status, token_expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<ReviewerRow>();

  if (reviewerError) {
    return NextResponse.json({ error: reviewerError.message }, { status: 500 });
  }

  if (!reviewer) {
    return NextResponse.json({ error: "Invalid reviewer token" }, { status: 404 });
  }

  if (reviewer.token_expires_at && new Date(reviewer.token_expires_at).getTime() < Date.now()) {
    await admin
      .from("assessment_reviewers")
      .update({ invite_status: "expired" })
      .eq("id", reviewer.id);

    await admin.from("assessment_audit_events").insert({
      cycle_id: reviewer.cycle_id,
      subject_id: reviewer.subject_id,
      reviewer_id: reviewer.id,
      action: "review_token_expired",
      metadata: { ip, userAgent },
    });

    return NextResponse.json({ error: "Reviewer token has expired" }, { status: 410 });
  }

  if (reviewer.status === "submitted") {
    return NextResponse.json({ error: "This reviewer has already submitted" }, { status: 409 });
  }

  const { data: items, error: itemsError } = await admin
    .from("assessment_items")
    .select("id, item_type")
    .eq("cycle_id", reviewer.cycle_id)
    .eq("is_active", true)
    .returns<ItemRow[]>();

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const itemsById = new Map((items ?? []).map((item) => [item.id, item]));

  const unknownItem = responses.find((response) => !itemsById.has(response.itemId!));
  if (unknownItem) {
    return NextResponse.json(
      { error: "Review response includes an item outside this assessment cycle" },
      { status: 400 },
    );
  }

  // The client declares itemType; the cycle's own items are authoritative, so a
  // mismatch means the payload was built against a stale instrument.
  const mismatchedItem = responses.find(
    (response) => itemsById.get(response.itemId!)!.item_type !== response.itemType,
  );
  if (mismatchedItem) {
    return NextResponse.json(
      { error: "Review response item type does not match the assessment item" },
      { status: 400 },
    );
  }

  const responseRows = responses.map((response) => {
    const isScale = itemsById.get(response.itemId!)!.item_type === "scale";
    const notObserved = isScale && response.notObserved === true;

    return {
      cycle_id: reviewer.cycle_id,
      subject_id: reviewer.subject_id,
      reviewer_id: reviewer.id,
      item_id: response.itemId!,
      rating: !isScale || notObserved ? null : response.score,
      not_observed: notObserved,
      comment: response.comment?.trim() || null,
      submitted_at: isDraft ? null : submittedAt,
    };
  });

  const { error: responseError } = await admin
    .from("assessment_responses")
    .upsert(responseRows, { onConflict: "reviewer_id,item_id" });

  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }

  // A draft leaves the reviewer writable. The assessment_responses_touch_draft
  // trigger has already advanced not_started -> in_progress and stamped
  // last_saved_at, so there is nothing further to update here.
  if (!isDraft) {
    const { error: updateError } = await admin
      .from("assessment_reviewers")
      .update({
        status: "submitted",
        invite_status: "submitted",
        submitted_at: submittedAt,
      })
      .eq("id", reviewer.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  await admin.from("assessment_audit_events").insert({
    cycle_id: reviewer.cycle_id,
    subject_id: reviewer.subject_id,
    reviewer_id: reviewer.id,
    action: isDraft ? "review_draft_saved" : "review_submitted",
    metadata: {
      ip,
      userAgent,
      responseCount: responses.length,
      scoredCount: summary.scored,
      notObservedCount: summary.notObserved,
      averageScore: summary.average,
    },
  });

  return NextResponse.json({
    submission: {
      persisted: true,
      status: isDraft ? "in_progress" : "submitted",
      submittedAt: isDraft ? null : submittedAt,
      summary,
    },
  });
}
