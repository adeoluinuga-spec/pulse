import test from "node:test";
import assert from "node:assert/strict";

import {
  canAssignTask,
  canProgressEscalation,
  canSeeEscalation,
  canSeeRaiser,
  canUpdateTask,
  canUseChannel,
  channelMembers,
  directChannel,
  groupChannelsFor,
  parseChannel,
  reportingTree,
  routeEscalation,
  teamScope,
  validateEscalation,
  validateEscalationUpdate,
  validateMessage,
  type RosterMember,
} from "./teamWorkspace.ts";

const person = (id: string, manager: string | null, extra: Partial<RosterMember> = {}): RosterMember => ({
  id,
  name: id.toUpperCase(),
  line_manager_id: manager,
  department: "Ops",
  people_responsibility: "none",
  platform_role: "standard",
  ...extra,
});

// ceo → dir → mgr → (a, b); dir → c; hr sits apart.
const roster = [
  person("ceo", null, { people_responsibility: "director", department: "CEO" }),
  person("dir", "ceo", { people_responsibility: "director" }),
  person("mgr", "dir", { people_responsibility: "manager" }),
  person("a", "mgr"),
  person("b", "mgr"),
  person("c", "dir", { department: "Finance" }),
  person("hr", "ceo", { platform_role: "hr_admin", department: "People" }),
];
const get = (id: string) => roster.find((member) => member.id === id) as RosterMember;

test("the reporting tree follows the chart all the way down", () => {
  assert.deepEqual(reportingTree("dir", roster).sort(), ["a", "b", "c", "mgr"]);
  assert.deepEqual(reportingTree("a", roster), []);
});

test("a loop in the data cannot hang the tree", () => {
  const looped = [person("x", "y"), person("y", "x")];
  assert.deepEqual(reportingTree("x", looped), ["y"]);
});

test("a manager sees direct reports; a director sees the whole line", () => {
  assert.deepEqual(teamScope(get("mgr"), roster).ids.sort(), ["a", "b"]);
  const director = teamScope(get("dir"), roster);
  assert.equal(director.wholeLine, true);
  assert.deepEqual(director.ids.sort(), ["a", "b", "c", "mgr"]);
});

test("somebody nobody reports to has an empty team, not an invented one", () => {
  assert.deepEqual(teamScope(get("a"), roster).ids, []);
  assert.deepEqual(teamScope(person("lonely", null, { people_responsibility: "director" }), roster).ids, []);
});

test("tasks go to yourself or down your reporting line, never sideways or up", () => {
  assert.equal(canAssignTask(get("dir"), "a", roster), true, "a director can task someone two levels down");
  assert.equal(canAssignTask(get("a"), "a", roster), true);
  assert.equal(canAssignTask(get("a"), "b", roster), false, "not a peer");
  assert.equal(canAssignTask(get("mgr"), "dir", roster), false, "not your manager");
  assert.equal(canAssignTask(get("mgr"), "c", roster), false, "not someone in another branch");
});

test("the assignee and the setter can both update a task", () => {
  assert.equal(canUpdateTask("a", { assignee_id: "a", created_by: "mgr" }), true);
  assert.equal(canUpdateTask("mgr", { assignee_id: "a", created_by: "mgr" }), true);
  assert.equal(canUpdateTask("b", { assignee_id: "a", created_by: "mgr" }), false);
});

test("a team channel is a manager and their direct reports", () => {
  assert.deepEqual(channelMembers("team:mgr", roster).sort(), ["a", "b", "mgr"]);
  assert.equal(canUseChannel("dir", "team:mgr", roster), false, "the manager's manager is not in it");
  assert.deepEqual(channelMembers("team:a", roster), [], "somebody with no reports has no team channel");
});

test("people get the team they lead, the team they sit in, and their department", () => {
  assert.deepEqual(
    groupChannelsFor(get("mgr"), roster).map((channel) => [channel.id, channel.label]),
    [["team:mgr", "My team"], ["team:dir", "DIR's team"], ["department:Ops", "Ops"]],
  );
  assert.deepEqual(groupChannelsFor(get("a"), roster).map((channel) => channel.id), ["team:mgr", "department:Ops"]);
});

test("direct channels are the same from both ends and closed to everyone else", () => {
  assert.equal(directChannel("b", "a"), directChannel("a", "b"));
  const dm = directChannel("a", "c");
  assert.equal(canUseChannel("a", dm, roster), true);
  assert.equal(canUseChannel("c", dm, roster), true);
  assert.equal(canUseChannel("b", dm, roster), false);
  assert.equal(canUseChannel("a", directChannel("a", "outsider"), roster), false, "not with someone outside the organisation");
});

test("malformed channel ids are refused, including unsorted direct ids", () => {
  assert.equal(parseChannel("dm:b:a"), null);
  assert.equal(parseChannel("dm:a:a"), null);
  assert.equal(parseChannel("team:"), null);
  assert.equal(parseChannel("general"), null);
  assert.deepEqual(channelMembers("nonsense", roster), []);
});

test("messages must say something and not too much", () => {
  assert.equal(validateMessage("  ").ok, false);
  assert.equal(validateMessage("x".repeat(4001)).ok, false);
  assert.deepEqual(validateMessage(" hello "), { ok: true, text: "hello" });
});

test("operational concerns go to the line manager; people and wellbeing go to HR", () => {
  assert.equal(routeEscalation("operational", get("a")), "mgr");
  assert.equal(routeEscalation("general", get("a")), "mgr");
  assert.equal(routeEscalation("people", get("a")), null);
  assert.equal(routeEscalation("wellbeing", get("a")), null);
  assert.equal(routeEscalation("operational", get("ceo")), null, "no line manager means HR");
});

test("only a people concern can be anonymous", () => {
  const people = validateEscalation({ title: "Manager conduct", type: "people", anonymous: true });
  assert.ok(people.ok && people.value.anonymous);
  const ops = validateEscalation({ title: "Printer broken", type: "operational", anonymous: true });
  assert.ok(ops.ok && !ops.value.anonymous);
  const bad = validateEscalation({ title: "x", type: "gossip", urgency: "extreme" });
  assert.equal(bad.ok, false);
  assert.equal(bad.ok ? 0 : bad.errors.length, 3);
});

test("an anonymous raiser is hidden from the manager but not from HR or themselves", () => {
  const row = { id: "e1", raised_by: "a", assigned_to: "mgr", escalation_type: "people", is_anonymous: true, status: "raised" };
  assert.equal(canSeeRaiser(get("mgr"), row), false);
  assert.equal(canSeeRaiser(get("hr"), row), true);
  assert.equal(canSeeRaiser(get("a"), row), true);
});

test("escalations are visible to the raiser, the assignee and HR only", () => {
  const row = { id: "e1", raised_by: "a", assigned_to: "mgr", escalation_type: "operational", is_anonymous: false, status: "raised" };
  assert.equal(canSeeEscalation(get("a"), row), true);
  assert.equal(canSeeEscalation(get("mgr"), row), true);
  assert.equal(canSeeEscalation(get("hr"), row), true);
  assert.equal(canSeeEscalation(get("b"), row), false, "not a colleague");
  assert.equal(canSeeEscalation(get("dir"), row), false, "not the manager's manager");
  assert.equal(canProgressEscalation(get("a"), row), false, "the raiser watches, the assignee acts");
  assert.equal(canProgressEscalation(get("mgr"), row), true);
});

test("an escalation moves forward only, and resolving it needs a note", () => {
  assert.equal(validateEscalationUpdate("raised", "acknowledged", "").ok, true);
  assert.equal(validateEscalationUpdate("in_progress", "acknowledged", "").ok, false);
  assert.equal(validateEscalationUpdate("in_progress", "resolved", "").ok, false);
  assert.equal(validateEscalationUpdate("in_progress", "resolved", "Access restored").ok, true);
  assert.equal(validateEscalationUpdate("resolved", "resolved", "again").ok, false);
});
