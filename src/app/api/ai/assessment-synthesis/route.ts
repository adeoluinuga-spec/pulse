import { NextRequest, NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/anthropic";
import { sumUsage } from "@/lib/assessmentSynthesis";
import {
  ACTION_FAILED,
  ACTION_GENERATED,
  SynthesisError,
  authoriseCaller,
  buildComments,
  cycleBelongsToOrg,
  foldDrafts,
  getAdminClient,
  inputFingerprint,
  loadSynthesisEvents,
  loadVerbatims,
  synthesiseSubject,
} from "./synthesisRunner";

export const dynamic = "force-dynamic";
// A synthesis pass is many sequential model calls; the default serverless
// ceiling is far too short even for one chunk.
export const maxDuration = 300;

/** Subjects per request. The caller chunks; the pass resumes where it stopped. */
const DEFAULT_BATCH = 10;

/**
 * GET  — the current drafts for a cycle, plus token spend.
 * POST — run the per-subject pass. Resumable: subjects that already have a
 *        generated event are skipped unless `force` is set, so a failure at
 *        subject 50 does not re-run the first 49.
 */
export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const { caller, error } = await authoriseCaller();
  if (!caller) return NextResponse.json({ error: error.message }, { status: error.status });

  const admin = getAdminClient();
  if (!(await cycleBelongsToOrg(admin, cycleId, caller.orgId))) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  try {
    const events = await loadSynthesisEvents(admin, cycleId);
    const drafts = [...foldDrafts(events).values()];

    return NextResponse.json({
      drafts: drafts.filter((draft) => draft.subjectId),
      cohort: drafts.find((draft) => !draft.subjectId) ?? null,
      usage: sumUsage(
        events
          .filter((event) => event.metadata?.usage)
          .map((event) => event.metadata.usage as Record<string, number>),
      ),
      failures: events
        .filter((event) => event.action === ACTION_FAILED)
        .map((event) => ({
          subjectId: event.subject_id,
          reason: event.metadata.reason,
          at: event.created_at,
        })),
    });
  } catch (thrown) {
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : "Failed to load drafts" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { caller, error } = await authoriseCaller();
  if (!caller) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string;
    limit?: number;
    force?: boolean;
  };

  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!(await cycleBelongsToOrg(admin, body.cycleId, caller.orgId))) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  let verbatimsBySubject;
  let alreadyDone: Set<string>;
  try {
    verbatimsBySubject = await loadVerbatims(admin, body.cycleId, body.subjectId);
    const events = await loadSynthesisEvents(admin, body.cycleId);
    alreadyDone = new Set(
      events
        .filter((event) => event.action === ACTION_GENERATED && event.subject_id)
        .map((event) => event.subject_id as string),
    );
  } catch (thrown) {
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : "Failed to load cycle data" },
      { status: 500 },
    );
  }

  const pending = [...verbatimsBySubject.keys()].filter(
    (subjectId) => body.force || !alreadyDone.has(subjectId),
  );
  const batch = pending.slice(0, Math.max(1, body.limit ?? DEFAULT_BATCH));

  const client = getAnthropicClient();
  const completed: string[] = [];
  const failed: Array<{ subjectId: string; reason: string; code: string }> = [];
  const usages: Array<Record<string, number>> = [];

  for (const subjectId of batch) {
    const entry = verbatimsBySubject.get(subjectId)!;
    const comments = buildComments(entry.verbatims, entry.names);

    if (!comments.length) {
      failed.push({ subjectId, reason: "No usable comments after redaction.", code: "empty" });
      continue;
    }

    try {
      const { synthesis, usage, retries } = await synthesiseSubject(client, comments);

      await admin.from("assessment_audit_events").insert({
        cycle_id: body.cycleId,
        subject_id: subjectId,
        action: ACTION_GENERATED,
        metadata: {
          synthesis,
          usage,
          retries,
          model: "claude-opus-5",
          commentCount: comments.length,
          inputFingerprint: inputFingerprint(comments),
          generatedBy: caller.userId,
          // Draft until a consultant reviews it. Nothing here is releasable.
          state: "draft",
        },
      });

      usages.push(usage as unknown as Record<string, number>);
      completed.push(subjectId);
    } catch (thrown) {
      const code = thrown instanceof SynthesisError ? thrown.code : "api";
      const reason = thrown instanceof Error ? thrown.message : "Unknown failure";

      // Recorded, not thrown: one bad subject must not abandon the pass.
      await admin.from("assessment_audit_events").insert({
        cycle_id: body.cycleId,
        subject_id: subjectId,
        action: ACTION_FAILED,
        metadata: { reason, code, attemptedBy: caller.userId },
      });

      failed.push({ subjectId, reason, code });
    }
  }

  return NextResponse.json({
    completed,
    failed,
    processed: batch.length,
    remaining: Math.max(0, pending.length - batch.length),
    skipped: [...verbatimsBySubject.keys()].length - pending.length,
    usage: sumUsage(usages),
  });
}
