import { NextRequest, NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/anthropic";
import { findQuotationInSynthesis } from "@/lib/assessmentSynthesis";
import {
  ACTION_COHORT,
  ACTION_GENERATED,
  SynthesisError,
  authoriseCaller,
  cycleBelongsToOrg,
  getAdminClient,
  loadSynthesisEvents,
  synthesiseCohort,
} from "../synthesisRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SubjectRow = {
  id: string;
  level: string | null;
  function_name: string | null;
  region: string | null;
};

/**
 * Second pass: organisation-level themes, capability gaps and interventions,
 * segmented by level, function and region.
 *
 * It reads the per-subject syntheses rather than the raw comments. That keeps
 * the cohort prompt to a manageable size across 71 subjects, and it means the
 * anti-quotation and n<3 gates have already been applied to everything the
 * cohort pass sees — a rater's wording cannot reach the organisation-level
 * report through a side door.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await authoriseCaller();
  if (!caller) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = (await request.json()) as { cycleId?: string };
  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (!(await cycleBelongsToOrg(admin, body.cycleId, caller.orgId))) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  try {
    const events = await loadSynthesisEvents(admin, body.cycleId);
    const perSubject = events.filter(
      (event) => event.action === ACTION_GENERATED && event.subject_id,
    );

    if (!perSubject.length) {
      return NextResponse.json(
        { error: "Run the per-subject pass before the cohort pass." },
        { status: 409 },
      );
    }

    const { data: subjects } = await admin
      .from("assessment_subjects")
      .select("id, level, function_name, region")
      .eq("cycle_id", body.cycleId)
      .returns<SubjectRow[]>();

    const segmentById = new Map(
      (subjects ?? []).map((row) => [
        row.id,
        {
          level: row.level ?? "unspecified",
          function: row.function_name ?? "unspecified",
          region: row.region ?? "unspecified",
        },
      ]),
    );

    // Latest synthesis wins if a subject was regenerated.
    const latest = new Map<string, (typeof perSubject)[number]>();
    for (const event of perSubject) latest.set(event.subject_id as string, event);

    const digest = [
      "Per-leader feedback syntheses from one assessment cycle. Each entry is already anonymised and aggregated; no rater identities are present.",
      "",
      ...[...latest.entries()].map(([subjectId, event], index) => {
        const segment = segmentById.get(subjectId);
        const synthesis = event.metadata.synthesis as
          | { themes?: Array<{ title: string; description: string }>; strengths?: string[]; developmentAreas?: string[] }
          | undefined;

        return [
          `Leader ${index + 1} — level: ${segment?.level}, function: ${segment?.function}, region: ${segment?.region}`,
          ...(synthesis?.themes ?? []).map((theme) => `  theme: ${theme.title} — ${theme.description}`),
          ...(synthesis?.strengths ?? []).map((entry) => `  strength: ${entry}`),
          ...(synthesis?.developmentAreas ?? []).map((entry) => `  development: ${entry}`),
        ].join("\n");
      }),
      "",
      "Produce organisation-level themes, capability gaps and recommended interventions, with observations segmented by level, function and region. Report a segment only where several leaders in it show the same pattern.",
    ].join("\n");

    const client = getAnthropicClient();
    const { synthesis, usage } = await synthesiseCohort(client, digest);

    // The digest is already sanitised, but the check is cheap and this output
    // travels furthest — it is the one an executive sponsor reads.
    const quoted = findQuotationInSynthesis(synthesis, [digest]);
    if (quoted) {
      return NextResponse.json(
        { error: "Cohort synthesis reused source wording", span: quoted },
        { status: 422 },
      );
    }

    await admin.from("assessment_audit_events").insert({
      cycle_id: body.cycleId,
      subject_id: null,
      action: ACTION_COHORT,
      metadata: {
        synthesis,
        usage,
        model: "claude-opus-5",
        subjectCount: latest.size,
        generatedBy: caller.userId,
        state: "draft",
      },
    });

    return NextResponse.json({ synthesis, usage, subjectCount: latest.size }, { status: 201 });
  } catch (thrown) {
    const status = thrown instanceof SynthesisError ? 422 : 500;
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : "Cohort synthesis failed" },
      { status },
    );
  }
}
