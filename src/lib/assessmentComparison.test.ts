import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCohortMovement,
  buildCycleClonePlan,
  buildIndividualMovement,
  compareFrameworkProvenance,
} from "./assessmentComparison.ts";
import type { CohortSubject, SubjectScores } from "./assessmentScoring.ts";

function scores(subjectId: string, values: Record<string, number | null>): SubjectScores {
  return {
    subjectId,
    overall: mean(Object.values(values).filter((value): value is number => value !== null)),
    competencies: Object.entries(values).map(([competencyId, value]) => ({
      competencyId,
      mean: value,
      selfMean: value,
      othersMean: value,
      raterCount: value === null ? 2 : 4,
      responseCount: value === null ? 2 : 12,
      notObservedCount: 0,
      byGroup: [],
      items: [],
    })),
    gaps: [],
    verbatims: [],
    release: { ready: true, hasLineManager: true, qualifyingCategories: ["colleague", "direct_report"], reasons: [] },
    insufficientData: false,
  };
}

function subject(subjectId: string, level: string, value: number): CohortSubject {
  return {
    subjectId,
    level,
    functionName: "Commercial",
    region: "Lagos",
    scores: scores(subjectId, { strategy: value, execution: value + 0.1 }),
  };
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

test("framework provenance flags different versions as not strictly comparable", () => {
  const comparison = compareFrameworkProvenance(
    { frameworkId: "fw-1", frameworkVersion: 1 },
    { frameworkId: "fw-1", frameworkVersion: 2 },
  );

  assert.equal(comparison.comparable, false);
  assert.equal(comparison.reason, "different_version");
  assert.match(comparison.message, /not strictly comparable/i);
});

test("individual movement reports prior, current and delta per competency", () => {
  const movement = buildIndividualMovement({
    subjectId: "current-subject",
    priorSubjectId: "prior-subject",
    prior: scores("prior-subject", { strategy: 3.2, execution: 4.1 }),
    current: scores("current-subject", { strategy: 3.7, execution: 4.0 }),
    priorFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
    currentFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
    labels: new Map([["strategy", "Strategic Leadership"]]),
  });

  assert.equal(movement.comparability.comparable, true);
  assert.deepEqual(
    movement.competencies.find((row) => row.competencyId === "strategy"),
    {
      competencyId: "strategy",
      label: "Strategic Leadership",
      priorScore: 3.2,
      currentScore: 3.7,
      delta: 0.5,
      direction: "improved",
      suppressed: false,
    },
  );
  assert.equal(movement.competencies.find((row) => row.competencyId === "execution")?.direction, "declined");
});

test("individual movement handles missing participants and suppressed scores", () => {
  const missingPrior = buildIndividualMovement({
    subjectId: "current-only",
    current: scores("current-only", { strategy: 3.5 }),
    prior: null,
    priorFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
    currentFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
  });
  assert.equal(missingPrior.competencies[0].direction, "missing_prior");
  assert.equal(missingPrior.competencies[0].delta, null);

  const suppressed = buildIndividualMovement({
    subjectId: "subject",
    current: scores("subject", { strategy: 3.5 }),
    prior: scores("prior", { strategy: null }),
    priorFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
    currentFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
  });
  assert.equal(suppressed.competencies[0].direction, "suppressed");
  assert.equal(suppressed.competencies[0].delta, null);
});

test("cohort movement suppresses thin segments and uses movement as the headline", () => {
  const movement = buildCohortMovement({
    priorSubjects: [subject("p1", "director", 3.1), subject("p2", "director", 3.2), subject("p3", "director", 3.3)],
    currentSubjects: [subject("c1", "director", 3.5), subject("c2", "director", 3.6), subject("c3", "director", 3.7), subject("c4", "assistant_director", 3.9)],
    priorFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
    currentFramework: { frameworkId: "fw-1", frameworkVersion: 1 },
  });

  assert.equal(movement.overall.delta, 0.47);
  assert.match(movement.headline, /improved/i);
  assert.equal(
    movement.segments.find((segment) => segment.dimension === "level" && segment.value === "assistant_director")?.suppressed,
    true,
  );
});

/**
 * The deleted version of this test asserted plan.cycle.prior_cycle_id against a
 * plain object. It passed for the entire period during which the column did not
 * exist in the database, while the clone route returned 500 and year-on-year
 * comparison was silently disabled. Asserting the shape of a fixture proved
 * nothing about whether the row could be stored.
 *
 * This version writes the plan to assessment_cycles and reads it back, so it
 * fails if the column is missing, mistyped, or loses its foreign key. It skips
 * rather than passes when no database is configured — a skip is visible; a
 * fixture assertion that cannot fail is not.
 */
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test(
  "cycle clone writes prior_cycle_id to a real assessment_cycles row",
  { skip: !dbUrl || !dbKey ? "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" : false },
  async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(dbUrl!, dbKey!, { auth: { autoRefreshToken: false, persistSession: false } });

    const stamp = Date.now();
    const orgSlug = `comparison-test-${stamp}`;
    const { data: org, error: orgError } = await admin
      .from("organisations")
      .insert({ name: "[TEST] Comparison", slug: orgSlug })
      .select("id")
      .single<{ id: string }>();
    assert.equal(orgError, null, `org insert failed: ${orgError?.message}`);

    try {
      const { data: baseline, error: baselineError } = await admin
        .from("assessment_cycles")
        .insert({ org_id: org!.id, name: "[TEST] 2026 baseline", status: "closed" })
        .select("id")
        .single<{ id: string }>();
      assert.equal(baselineError, null, `baseline insert failed: ${baselineError?.message}`);

      const plan = buildCycleClonePlan({
        prior: {
          id: baseline!.id,
          name: "[TEST] 2026 baseline",
          clientContext: "Telco",
          assessmentType: "360",
          levels: ["director"],
          reviewerWeights: { self: 0, line_manager: 40, colleague: 30, direct_report: 30, customer: 0 },
          competencyModel: [{ id: "strategy" }],
        },
        name: "[TEST] 2027 follow-up",
        startsOn: "2027-01-01",
        closesOn: "2027-02-01",
      });

      assert.equal(plan.populationMode, "carry_forward");

      // The assertion that matters: the database accepts the plan as written.
      const { data: clone, error: cloneError } = await admin
        .from("assessment_cycles")
        .insert({ org_id: org!.id, ...plan.cycle })
        .select("id, name, levels, prior_cycle_id")
        .single<{ id: string; name: string; levels: string[]; prior_cycle_id: string | null }>();

      assert.equal(cloneError, null, `clone insert failed: ${cloneError?.message}`);
      assert.equal(clone!.prior_cycle_id, baseline!.id, "prior_cycle_id must round-trip through the database");
      assert.equal(clone!.name, "[TEST] 2027 follow-up");
      assert.deepEqual(clone!.levels, ["director"]);

      // on delete set null: losing the baseline must not orphan the clone.
      await admin.from("assessment_cycles").delete().eq("id", baseline!.id);
      const { data: after } = await admin
        .from("assessment_cycles")
        .select("prior_cycle_id")
        .eq("id", clone!.id)
        .single<{ prior_cycle_id: string | null }>();
      assert.equal(after!.prior_cycle_id, null, "deleting the prior cycle must null the pointer, not cascade");
    } finally {
      await admin.from("organisations").delete().eq("id", org!.id);
    }
  },
);
