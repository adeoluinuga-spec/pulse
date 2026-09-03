export type AppraisalMode = "360" | "performance" | "integrated";

export type PerformanceAppraisalInput = {
  mode?: string;
  cycleName?: string;
  goalScore?: number;
  kpiScore?: number;
  managerScore?: number;
  peerScore?: number;
  selfScore?: number;
  competencyScore?: number;
  hasGoals?: boolean;
  hasKpis?: boolean;
  hasManagerReview?: boolean;
  hasSelfAssessment?: boolean;
  hasCompetencyReview?: boolean;
};

export type PerformanceAppraisalSummary = {
  mode: AppraisalMode;
  overallScore: number;
  ready: boolean;
  requiredSections: string[];
  missingSections: string[];
  notes: string[];
};

export function normalizeAppraisalMode(mode?: string): AppraisalMode {
  const normalized = (mode ?? "performance").trim().toLowerCase();

  if (normalized === "360" || normalized === "assessment") return "360";
  if (normalized === "integrated" || normalized === "hybrid") return "integrated";
  return "performance";
}

export function validatePerformanceAppraisalConfig(input: PerformanceAppraisalInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const mode = normalizeAppraisalMode(input.mode);

  if (!input.cycleName?.trim()) {
    errors.push("A cycle name is required for performance appraisal.");
  }

  if (mode === "performance" || mode === "integrated") {
    if (!input.hasGoals && typeof input.goalScore !== "number") {
      errors.push("Performance appraisal requires goal progress or a goal score.");
    }

    if (!input.hasKpis && typeof input.kpiScore !== "number") {
      errors.push("Performance appraisal requires KPI performance data.");
    }

    if (!input.hasManagerReview && typeof input.managerScore !== "number") {
      errors.push("Performance appraisal requires a manager review score.");
    }
  }

  if (mode === "360" || mode === "integrated") {
    if (!input.hasCompetencyReview && typeof input.competencyScore !== "number") {
      errors.push("360 and integrated reviews require a competency score.");
    }

    if (!input.hasSelfAssessment && typeof input.selfScore !== "number") {
      errors.push("360 and integrated reviews require a self-assessment score.");
    }
  }

  if (mode === "integrated" && typeof input.peerScore !== "number") {
    errors.push("Integrated appraisal requires peer review data.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildPerformanceAppraisalSummary(input: PerformanceAppraisalInput): PerformanceAppraisalSummary {
  const mode = normalizeAppraisalMode(input.mode);
  const requiredSections = [
    ...(mode === "360" || mode === "integrated" ? ["competency review", "self-assessment"] : []),
    "goal performance",
    "KPI performance",
    "manager review",
    ...(mode === "integrated" ? ["peer feedback"] : []),
  ];

  const missingSections = requiredSections.filter((section) => {
    switch (section) {
      case "competency review":
        return !input.hasCompetencyReview && typeof input.competencyScore !== "number";
      case "self-assessment":
        return !input.hasSelfAssessment && typeof input.selfScore !== "number";
      case "goal performance":
        return !input.hasGoals && typeof input.goalScore !== "number";
      case "KPI performance":
        return !input.hasKpis && typeof input.kpiScore !== "number";
      case "manager review":
        return !input.hasManagerReview && typeof input.managerScore !== "number";
      case "peer feedback":
        return typeof input.peerScore !== "number";
      default:
        return false;
    }
  });

  const scores = [
    typeof input.goalScore === "number" ? input.goalScore : 0,
    typeof input.kpiScore === "number" ? input.kpiScore : 0,
    typeof input.managerScore === "number" ? input.managerScore : 0,
    typeof input.peerScore === "number" ? input.peerScore : 0,
    typeof input.selfScore === "number" ? input.selfScore : 0,
    typeof input.competencyScore === "number" ? input.competencyScore : 0,
  ].filter((score) => Number.isFinite(score));

  const overallScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const ready = missingSections.length === 0 && Boolean(input.cycleName?.trim());

  return {
    mode,
    overallScore,
    ready,
    requiredSections,
    missingSections,
    notes: [
      mode === "integrated" ? "This appraisal combines goal, KPI, competency, and peer inputs into one evaluation." : mode === "360" ? "This appraisal is competency-led and development oriented." : "This appraisal is focused on achievement and performance outcomes.",
      ready ? "The review is ready for manager or HR sign-off." : "Additional data must be captured before the appraisal can be finalised.",
    ],
  };
}
