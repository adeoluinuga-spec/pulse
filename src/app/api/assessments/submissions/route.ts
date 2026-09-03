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

type CompetencyRow = {
  id: string;
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
  const submittedAt = new Date().toISOString();
  const summary = buildReviewSubmissionSummary(responses);

  if (DEV_AUTH_BYPASS) {
    return NextResponse.json({
      submission: {
        persisted: false,
        status: "submitted",
        submittedAt,
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

  const { data: competencies, error: competenciesError } = await admin
    .from("assessment_competencies")
    .select("id")
    .eq("cycle_id", reviewer.cycle_id)
    .returns<CompetencyRow[]>();

  if (competenciesError) {
    return NextResponse.json({ error: competenciesError.message }, { status: 500 });
  }

  const validCompetencyIds = new Set((competencies ?? []).map((competency) => competency.id));
  const invalidResponse = responses.find((response) => !validCompetencyIds.has(response.competencyId!));

  if (invalidResponse) {
    return NextResponse.json(
      { error: "Review response includes a competency outside this assessment cycle" },
      { status: 400 },
    );
  }

  const responseRows = responses.map((response) => ({
    cycle_id: reviewer.cycle_id,
    subject_id: reviewer.subject_id,
    reviewer_id: reviewer.id,
    competency_id: response.competencyId!,
    rating: response.score,
    comment: response.comment.trim(),
    submitted_at: submittedAt,
  }));

  const { error: responseError } = await admin
    .from("assessment_responses")
    .upsert(responseRows, { onConflict: "reviewer_id,competency_id" });

  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }

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

  await admin.from("assessment_audit_events").insert({
    cycle_id: reviewer.cycle_id,
    subject_id: reviewer.subject_id,
    reviewer_id: reviewer.id,
    action: "review_submitted",
    metadata: {
      ip,
      userAgent,
      responseCount: responses.length,
      averageScore: summary.average,
    },
  });

  return NextResponse.json({
    submission: {
      persisted: true,
      status: "submitted",
      submittedAt,
      summary,
    },
  });
}
