import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { DEV_AUTH_BYPASS } from "@/lib/devAuth";
import { cycleSubmissionClosed } from "@/lib/assessmentRetention";
import { buildReviewInstrument } from "@/lib/reviewInstrument";
import { buildReviewSubmissionSummary, getReviewPayloadErrors, type ReviewSubmissionPayload } from "@/lib/reviewSubmission";

export const dynamic = "force-dynamic";

type ReviewerRow = {
  id: string;
  cycle_id: string;
  subject_id: string;
  status: string;
  reviewer_group: string;
  token_expires_at: string | null;
  submitted_at?: string | null;
  last_saved_at?: string | null;
};

type ItemRow = {
  id: string;
  competency_id: string | null;
  item_type: string;
  body: string;
  display_order: number | null;
};

type CompetencyRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
};

type SubjectRow = {
  name: string;
};

type CycleRow = {
  status: string | null;
  closes_on: string | null;
};

type ResponseRow = {
  item_id: string;
  item_type: string;
  rating: number | null;
  not_observed: boolean;
  comment: string | null;
  updated_at: string | null;
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

async function findReviewerByToken(token: string, admin = getAdminClient()) {
  const tokenHash = hashToken(token);
  const { data, error } = await admin
    .from("assessment_reviewers")
    .select("id, cycle_id, subject_id, status, reviewer_group, token_expires_at, submitted_at, last_saved_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<ReviewerRow>();

  return { reviewer: data, error };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({
      status: "invalid",
      message: "This assessment link is missing its access token. Please contact HR for a fresh link.",
      contactPath: "/review/contact",
    }, { status: 400 });
  }

  if (DEV_AUTH_BYPASS) {
    return NextResponse.json({
      status: "invalid",
      message: "Public review links need a real reviewer token. Please open the secure link sent by HR.",
      contactPath: "/review/contact",
    }, { status: 404 });
  }

  const admin = getAdminClient();
  const { reviewer, error } = await findReviewerByToken(token, admin);

  if (error) {
    return NextResponse.json({
      status: "invalid",
      message: "We could not load this assessment link. Please contact HR for help.",
      contactPath: "/review/contact",
    }, { status: 500 });
  }

  if (!reviewer) {
    return NextResponse.json({
      status: "invalid",
      message: "This assessment link is no longer active. Please contact HR if you still need to complete this review.",
      contactPath: "/review/contact",
    }, { status: 404 });
  }

  const expired = Boolean(reviewer.token_expires_at && new Date(reviewer.token_expires_at).getTime() < Date.now());

  const { data: subject, error: subjectError } = await admin
    .from("assessment_subjects")
    .select("name")
    .eq("id", reviewer.subject_id)
    .maybeSingle<SubjectRow>();

  if (subjectError || !subject) {
    return NextResponse.json({
      status: "invalid",
      message: "We could not find the leader attached to this review. Please contact HR for help.",
      contactPath: "/review/contact",
    }, { status: subjectError ? 500 : 404 });
  }

  if (reviewer.status === "submitted") {
    return NextResponse.json({
      status: "submitted",
      subject: { name: subject.name },
      relationshipType: reviewer.reviewer_group,
      expiresAt: reviewer.token_expires_at,
      submittedAt: reviewer.submitted_at ?? null,
      message: "Thank you. This assessment has already been submitted and the link is now closed.",
      contactPath: "/review/contact",
    });
  }

  if (expired) {
    await admin
      .from("assessment_reviewers")
      .update({ invite_status: "expired" })
      .eq("id", reviewer.id);

    return NextResponse.json({
      status: "expired",
      subject: { name: subject.name },
      relationshipType: reviewer.reviewer_group,
      expiresAt: reviewer.token_expires_at,
      message: "This assessment link has expired. Please contact HR if you need a new link.",
      contactPath: "/review/contact",
    }, { status: 410 });
  }

  const [competenciesResult, itemsResult, responsesResult] = await Promise.all([
    admin
      .from("assessment_competencies")
      .select("id, name, description, sort_order")
      .eq("cycle_id", reviewer.cycle_id)
      .order("sort_order", { ascending: true })
      .returns<CompetencyRow[]>(),
    admin
      .from("assessment_items")
      .select("id, competency_id, item_type, body, display_order")
      .eq("cycle_id", reviewer.cycle_id)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .returns<ItemRow[]>(),
    admin
      .from("assessment_responses")
      .select("item_id, item_type, rating, not_observed, comment, updated_at")
      .eq("reviewer_id", reviewer.id)
      .order("updated_at", { ascending: false })
      .returns<ResponseRow[]>(),
  ]);

  if (competenciesResult.error || itemsResult.error || responsesResult.error) {
    return NextResponse.json({
      status: "invalid",
      message: "We could not load this assessment. Please refresh or contact HR for help.",
      contactPath: "/review/contact",
    }, { status: 500 });
  }

  if (reviewer.status === "not_started") {
    await admin
      .from("assessment_reviewers")
      .update({ invite_status: "opened", opened_at: new Date().toISOString() })
      .eq("id", reviewer.id);
  }

  const safeItems = (itemsResult.data ?? [])
    .filter((item) => item.item_type === "scale" || item.item_type === "text")
    .map((item) => ({ ...item, item_type: item.item_type as "scale" | "text" }));

  return NextResponse.json({
    status: "ready",
    subject: { name: subject.name },
    relationshipType: reviewer.reviewer_group,
    expiresAt: reviewer.token_expires_at,
    lastSavedAt: reviewer.last_saved_at ?? null,
    instrument: buildReviewInstrument(competenciesResult.data ?? [], safeItems),
    draft: {
      responses: (responsesResult.data ?? []).map((response) => ({
        itemId: response.item_id,
        itemType: response.item_type,
        score: response.rating,
        notObserved: response.not_observed,
        comment: response.comment ?? "",
        updatedAt: response.updated_at,
      })),
    },
    contactPath: "/review/contact",
  });
}

async function handleSubmission(request: NextRequest, modeOverride?: "draft" | "submit") {
  const payload = (await request.json()) as ReviewSubmissionPayload;
  if (modeOverride) {
    payload.mode = modeOverride;
  }
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
  const { ip, userAgent } = clientMetadata(request);

  const { reviewer, error: reviewerError } = await findReviewerByToken(token, admin);

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

  const { data: cycle, error: cycleError } = await admin
    .from("assessment_cycles")
    .select("status, closes_on")
    .eq("id", reviewer.cycle_id)
    .maybeSingle<CycleRow>();

  if (cycleError) {
    return NextResponse.json({ error: cycleError.message }, { status: 500 });
  }

  const closeMessage = cycleSubmissionClosed({ status: cycle?.status, closesOn: cycle?.closes_on });
  if (closeMessage) {
    await admin.from("assessment_audit_events").insert({
      cycle_id: reviewer.cycle_id,
      subject_id: reviewer.subject_id,
      reviewer_id: reviewer.id,
      action: "review_submission_rejected_cycle_closed",
      metadata: { ip, userAgent, message: closeMessage, mode: payload.mode ?? "submit" },
    });

    return NextResponse.json({ error: closeMessage }, { status: 410 });
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
  // last_saved_at. We also update explicitly so autosave stays honest if a
  // deployed database is lagging behind the latest trigger migration.
  if (isDraft) {
    const { error: draftTouchError } = await admin
      .from("assessment_reviewers")
      .update({
        status: reviewer.status === "not_started" ? "in_progress" : reviewer.status,
        last_saved_at: submittedAt,
      })
      .eq("id", reviewer.id);

    if (draftTouchError) {
      return NextResponse.json({ error: draftTouchError.message }, { status: 500 });
    }
  } else {
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
      lastSavedAt: isDraft ? submittedAt : null,
      summary,
    },
  });
}

export async function PATCH(request: NextRequest) {
  return handleSubmission(request, "draft");
}

export async function POST(request: NextRequest) {
  return handleSubmission(request, "submit");
}
