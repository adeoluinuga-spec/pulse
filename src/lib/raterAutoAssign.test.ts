import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutoRaterPlan,
  cohortFeasibility,
  colleagueCandidates,
  directReportCandidates,
  type RosterMember,
} from "./raterAutoAssign.ts";

/** The live Stuart Davidson chart: ten people, deliberately small. */
function roster(): RosterMember[] {
  const m = (
    id: string,
    name: string,
    tier: RosterMember["tier"],
    department: string,
    team: string,
    lineManagerId: string | null,
  ): RosterMember => ({ id, name, email: `${id}@example.test`, tier, department, team, lineManagerId });

  return [
    m("adeolu", "Adeolu Osinuga", "director", "CEO", "Platform", null),
    m("lola", "Lola Osinuga", "senior_manager", "Human Resource", "Platform", "adeolu"),
    m("titlopa", "Titlopa Kinkade", "senior_manager", "Finance", "Platform", "adeolu"),
    m("iyanu", "Iyanu Maza", "manager", "Business Development", "Platform", "adeolu"),
    m("moses", "Moses Vaughan", "manager", "Operations", "Platform", "adeolu"),
    m("hr", "HR Partner", "manager", "Human Resource", "Platform", "lola"),
    m("taiwo", "Taiwo Ogba", "team_lead", "Business Development", "Platform", "iyanu"),
    m("funmilayo", "Funmilayo Kareem", "team_lead", "Customer Relations", "Business Development", "iyanu"),
    m("david", "David Aloba", "none", "Front Desk", "Customer Service", "funmilayo"),
    m("kehinde", "Kehinde White", "none", "Finance", "Finance", "titlopa"),
  ];
}

const find = (id: string) => roster().find((member) => member.id === id)!;

test("a colleague is anyone who neither manages the subject nor reports to them", () => {
  const candidates = colleagueCandidates(find("iyanu"), roster()).map((member) => member.id);

  assert.ok(!candidates.includes("iyanu"), "not themselves");
  assert.ok(!candidates.includes("adeolu"), "not their line manager");
  assert.ok(!candidates.includes("taiwo"), "not their direct report");
  assert.ok(!candidates.includes("funmilayo"), "not their direct report");
  assert.equal(candidates.length, 6);
});

test("the small-organisation case: three colleagues are reachable for a manager", () => {
  const plan = buildAutoRaterPlan(find("iyanu"), roster());
  const colleagues = plan.raters.filter((rater) => rater.group === "colleague");

  assert.equal(colleagues.length, 3);
  assert.ok(!plan.shortfalls.some((s) => s.group === "colleague"));
});

test("same-tier colleagues are preferred over more distant ones", () => {
  const plan = buildAutoRaterPlan(find("iyanu"), roster());
  const colleagues = plan.raters.filter((rater) => rater.group === "colleague").map((r) => r.employeeId);

  // moses and hr are the other two managers; both must be chosen before any
  // senior manager, team lead or individual contributor.
  assert.ok(colleagues.includes("moses"));
  assert.ok(colleagues.includes("hr"));
});

test("self and line manager come from the chart without being asked for", () => {
  const plan = buildAutoRaterPlan(find("taiwo"), roster());

  assert.equal(plan.raters.filter((r) => r.group === "self").length, 1);
  const manager = plan.raters.find((r) => r.group === "line_manager");
  assert.equal(manager?.employeeId, "iyanu");
});

test("the person at the top of the chart is reported, not silently left without a manager", () => {
  const plan = buildAutoRaterPlan(find("adeolu"), roster());

  assert.ok(!plan.raters.some((r) => r.group === "line_manager"));
  const shortfall = plan.shortfalls.find((s) => s.group === "line_manager");
  assert.match(shortfall?.message ?? "", /top of the organisation chart/);
});

test("direct reports are never padded from elsewhere, and the refusal says why", () => {
  const plan = buildAutoRaterPlan(find("titlopa"), roster());
  const reports = plan.raters.filter((r) => r.group === "direct_report");

  assert.equal(reports.length, 1);
  assert.equal(reports[0].employeeId, "kehinde");

  const shortfall = plan.shortfalls.find((s) => s.group === "direct_report" && s.wanted === 3);
  assert.match(shortfall?.message ?? "", /never filled from elsewhere/);
});

test("nobody outside the reporting line is ever placed in direct_report", () => {
  for (const member of roster()) {
    const plan = buildAutoRaterPlan(member, roster());
    const reports = plan.raters.filter((r) => r.group === "direct_report");
    const actual = directReportCandidates(member, roster()).map((m) => m.id);
    for (const rater of reports) assert.ok(actual.includes(rater.employeeId));
  }
});

test("a thin group is flagged as pooling when the cycle merges", () => {
  const plan = buildAutoRaterPlan(find("titlopa"), roster(), { suppressionMode: "merge" });
  const thin = plan.shortfalls.find((s) => s.group === "direct_report" && /pooled/.test(s.message));

  assert.ok(thin, "expected a pooling notice");
  assert.ok(plan.thinGroups.includes("direct_report"));
});

test("the same thin group is flagged as hidden when the cycle suppresses", () => {
  const plan = buildAutoRaterPlan(find("titlopa"), roster(), { suppressionMode: "suppress" });
  const thin = plan.shortfalls.find((s) => s.group === "direct_report" && /hidden from the report/.test(s.message));

  assert.ok(thin, "expected a suppression warning");
});

test("selection is deterministic: the same subject always gets the same raters", () => {
  const first = buildAutoRaterPlan(find("moses"), roster()).raters.map((r) => r.employeeId);
  const second = buildAutoRaterPlan(find("moses"), roster()).raters.map((r) => r.employeeId);

  assert.deepEqual(first, second);
});

test("different subjects do not all pick the same tie-broken colleague", () => {
  const forDavid = buildAutoRaterPlan(find("david"), roster()).raters
    .filter((r) => r.group === "colleague")
    .map((r) => r.employeeId);
  const forKehinde = buildAutoRaterPlan(find("kehinde"), roster()).raters
    .filter((r) => r.group === "colleague")
    .map((r) => r.employeeId);

  assert.notDeepEqual(forDavid, forKehinde);
});

test("somebody with no email address is never planned as a rater", () => {
  const withoutEmail = roster().map((member) =>
    member.id === "moses" ? { ...member, email: null } : member,
  );
  const plan = buildAutoRaterPlan(find("iyanu"), withoutEmail);

  assert.ok(!plan.raters.some((rater) => rater.employeeId === "moses"));
});

test("a quota of one still works, for the smallest organisations", () => {
  const plan = buildAutoRaterPlan(find("iyanu"), roster(), {
    quota: { colleague: 1, direct_report: 1 },
    minimumPerGroup: 2,
  });

  assert.equal(plan.raters.filter((r) => r.group === "colleague").length, 1);
  assert.equal(plan.raters.filter((r) => r.group === "direct_report").length, 1);
});

test("an organisation too small for anonymity is told so plainly", () => {
  const verdict = cohortFeasibility({ rosterSize: 4, minimumPerGroup: 3 });

  assert.equal(verdict.feasible, false);
  assert.match(verdict.message, /at least 5/);
  assert.match(verdict.message, /attributable by design/);
});

test("ten people on the chart is feasible", () => {
  assert.equal(cohortFeasibility({ rosterSize: 10, minimumPerGroup: 3 }).feasible, true);
});
