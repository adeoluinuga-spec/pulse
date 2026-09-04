import { NextRequest, NextResponse } from "next/server";

import { findQuotationInSynthesis } from "@/lib/assessmentSynthesis";
import {
  ACTION_EDITED,
  ACTION_RELEASED,
  authoriseCaller,
  buildComments,
  cycleBelongsToOrg,
  foldDrafts,
  getAdminClient,
  loadSynthesisEvents,
  loadVerbatims,
} from "../synthesisRunner";

export const dynamic = "force-dynamic";

/**
 * The consultant review step.
 *
 * Human review is the product, not a process note: "AI-generated,
 * consultant-reviewed" is contractually promised, so the review has to be
 * demonstrable from the data. Every edit is appended as its own event carrying
 * the editor's id, and the generated version is never overwritten — the two can
 * always be diffed to show what a human changed.
 *
 * PATCH { cycleId, subjectId?, synthesis }  — record a consultant edit
 * PATCH { cycleId, subjectId?, release: true } — release a reviewed draft
 *
 * Omit subjectId to act on the cohort synthesis.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await authoriseCaller();
  if (!caller) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = (await request.json()) as {
    cycleId?: string;
    subjectId?: string | null;
    synthesis?: unknown;
    release?: boolean;
    note?: string;
  };

  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }
  if (!body.synthesis && !body.release) {
    return NextResponse.json(
      { error: "Provide an edited synthesis, or release: true" },
      { status: 400 },
    );
  }

  const admin = getAdminClient();
  if (!(await cycleBelongsToOrg(admin, body.cycleId, caller.orgId))) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const key = body.subjectId ?? "__cohort__";

  try {
    const drafts = foldDrafts(await loadSynthesisEvents(admin, body.cycleId));
    const draft = drafts.get(key);

    if (!draft?.generated) {
      return NextResponse.json(
        { error: "There is no generated synthesis to review yet" },
        { status: 404 },
      );
    }

    if (body.release) {
      if (!draft.edited) {
        // The promise is consultant-reviewed, so an untouched draft cannot be
        // released. Re-saving it unchanged is a deliberate act of review.
        return NextResponse.json(
          { error: "This draft has not been reviewed yet. Save a reviewed version before releasing." },
          { status: 409 },
        );
      }

      await admin.from("assessment_audit_events").insert({
        cycle_id: body.cycleId,
        subject_id: body.subjectId ?? null,
        action: ACTION_RELEASED,
        metadata: { releasedBy: caller.userId, note: body.note ?? null },
      });

      return NextResponse.json({ status: "released", subjectId: body.subjectId ?? null });
    }

    // A consultant may legitimately paste in a rater's phrasing while editing.
    // We do not silently strip it, but we do refuse to store it — the whole
    // anonymity guarantee would otherwise be one careless paste from failing.
    if (body.subjectId) {
      const entry = (await loadVerbatims(admin, body.cycleId, body.subjectId)).get(body.subjectId);
      if (entry) {
        const sources = buildComments(entry.verbatims, entry.names).map((c) => c.text);
        const quoted = findQuotationInSynthesis(body.synthesis, sources);
        if (quoted) {
          return NextResponse.json(
            {
              error:
                "This edit reuses a rater's wording closely enough to identify them. Please rephrase.",
              span: quoted,
            },
            { status: 422 },
          );
        }
      }
    }

    await admin.from("assessment_audit_events").insert({
      cycle_id: body.cycleId,
      subject_id: body.subjectId ?? null,
      action: ACTION_EDITED,
      metadata: {
        synthesis: body.synthesis,
        editedBy: caller.userId,
        note: body.note ?? null,
      },
    });

    return NextResponse.json({ status: "edited", subjectId: body.subjectId ?? null });
  } catch (thrown) {
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : "Failed to record review" },
      { status: 500 },
    );
  }
}
