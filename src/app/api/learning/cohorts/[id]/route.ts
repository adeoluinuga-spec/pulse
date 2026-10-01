import {
  cohortFor,
  json,
  learningBody,
  learningContext,
  LearningError,
  learningHandled,
  learningRows,
  learningText,
  newLearningLink,
  revealLearningLink,
} from "@/lib/learningServer";
import { parseLearningTrainees, validateLearningConfig } from "@/lib/learning";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  return learningHandled(async () => {
    const { id } = await params;
    const { admin, orgId } = await learningContext();
    const cohort = await cohortFor(admin, id, orgId);
    const [trainees, activities, submissions, rooms, members] =
      await Promise.all([
        learningRows(admin, "learning_trainees", "cohort_id", id),
        learningRows(admin, "learning_activities", "cohort_id", id),
        learningRows(admin, "learning_submissions", "cohort_id", id),
        learningRows(admin, "learning_rooms", "cohort_id", id),
        learningRows(admin, "learning_room_members", "cohort_id", id),
      ]);
    const messages = (
      await Promise.all(
        rooms.map((r) =>
          learningRows(admin, "learning_messages", "room_id", String(r.id)),
        ),
      )
    ).flat();
    return json({
      cohort,
      trainees: trainees.map((t) => {
        let token: string | null = null;
        if (!t.revoked_at && Date.parse(String(t.expires_at)) > Date.now()) {
          try {
            token = revealLearningLink(String(t.token_ciphertext));
          } catch {
            /* HR can rotate links after a key change. */
          }
        }
        return {
          id: t.id,
          display_name: t.display_name,
          email: t.email,
          last_seen_at: t.last_seen_at,
          expires_at: t.expires_at,
          revoked_at: t.revoked_at,
          token,
        };
      }),
      activities,
      submissions,
      rooms,
      members,
      messages,
    });
  });
}
export async function POST(request: Request, { params }: Context) {
  return learningHandled(async () => {
    const { id } = await params;
    const { admin, orgId } = await learningContext();
    await cohortFor(admin, id, orgId);
    const b = await learningBody(request);
    if (b.action === "trainees") {
      let parsed;
      try {
        parsed = parseLearningTrainees(String(b.text ?? ""));
      } catch (e) {
        throw new LearningError((e as Error).message);
      }
      const { count, error: countError } = await admin
        .from("learning_trainees")
        .select("id", { count: "exact", head: true })
        .eq("cohort_id", id);
      if (countError) throw countError;
      if ((count ?? 0) + parsed.length > 300)
        throw new LearningError("A programme supports up to 300 trainees.");
      const { error } = await admin
        .from("learning_trainees")
        .insert(
          parsed.map((t) => ({ ...t, cohort_id: id, ...newLearningLink() })),
        );
      if (error?.code === "23505")
        throw new LearningError(
          "One of these emails is already in this programme. No trainees were added.",
        );
      if (error) throw error;
    } else if (b.action === "rotate" || b.action === "revoke") {
      const { data, error } = await admin
        .from("learning_trainees")
        .update(
          b.action === "rotate"
            ? newLearningLink()
            : { revoked_at: new Date().toISOString() },
        )
        .eq("id", String(b.traineeId))
        .eq("cohort_id", id)
        .select("id");
      if (error) throw error;
      if (!data.length) throw new LearningError("Trainee not found.", 404);
    } else if (b.action === "status") {
      if (!["active", "archived"].includes(String(b.status)))
        throw new LearningError("Choose active or archived.");
      const { error } = await admin
        .from("learning_cohorts")
        .update({ status: b.status })
        .eq("id", id)
        .eq("org_id", orgId);
      if (error) throw error;
    } else if (b.action === "activity") {
      let config;
      try {
        config = validateLearningConfig(String(b.type), b.config);
      } catch (e) {
        throw new LearningError((e as Error).message);
      }
      const activity = {
        type: b.type,
        title: learningText(b.title, "Activity title"),
        summary: typeof b.summary === "string" ? b.summary.slice(0, 300) : null,
        config,
      };
      if (b.activityId) {
        const [s, r] = await Promise.all([
          admin
            .from("learning_submissions")
            .select("id", { count: "exact", head: true })
            .eq("activity_id", String(b.activityId))
            .eq("cohort_id", id),
          admin
            .from("learning_rooms")
            .select("id", { count: "exact", head: true })
            .eq("activity_id", String(b.activityId))
            .eq("cohort_id", id),
        ]);
        if (s.error || r.error) throw new Error("usage");
        if (s.count || r.count)
          throw new LearningError(
            "This activity already has answers or groups. Create a new activity to change its questions or scenario.",
          );
        const { data, error } = await admin
          .from("learning_activities")
          .update(activity)
          .eq("id", String(b.activityId))
          .eq("cohort_id", id)
          .select("id");
        if (error) throw error;
        if (!data.length) throw new LearningError("Activity not found.", 404);
      } else {
        const { count, error: countError } = await admin
          .from("learning_activities")
          .select("id", { count: "exact", head: true })
          .eq("cohort_id", id);
        if (countError) throw countError;
        if ((count ?? 0) >= 50)
          throw new LearningError("A programme supports up to 50 activities.");
        const { error } = await admin
          .from("learning_activities")
          .insert({
            ...activity,
            cohort_id: id,
            position: Date.now() % 2000000000,
          });
        if (error) throw error;
      }
    } else if (["release", "delete", "position"].includes(String(b.action))) {
      if (b.action === "delete") {
        const [s, r] = await Promise.all([
          admin
            .from("learning_submissions")
            .select("id", { count: "exact", head: true })
            .eq("activity_id", String(b.activityId))
            .eq("cohort_id", id),
          admin
            .from("learning_rooms")
            .select("id", { count: "exact", head: true })
            .eq("activity_id", String(b.activityId))
            .eq("cohort_id", id),
        ]);
        if (s.error || r.error) throw new Error("usage");
        if (s.count || r.count)
          throw new LearningError(
            "This activity has work attached. Hide it using Released instead of deleting it.",
          );
        const { error } = await admin
          .from("learning_activities")
          .delete()
          .eq("id", String(b.activityId))
          .eq("cohort_id", id);
        if (error) throw error;
      } else {
        if (b.action === "release" && typeof b.released !== "boolean")
          throw new LearningError("Choose a release state.");
        if (
          b.action === "position" &&
          (!Number.isInteger(b.position) ||
            Number(b.position) < 0 ||
            Number(b.position) > 2000000000)
        )
          throw new LearningError("Invalid position.");
        const { error } = await admin
          .from("learning_activities")
          .update(
            b.action === "release"
              ? { released: b.released }
              : { position: b.position },
          )
          .eq("id", String(b.activityId))
          .eq("cohort_id", id);
        if (error) throw error;
      }
    } else if (b.action === "reorder") {
      if (
        !Array.isArray(b.activityIds) ||
        b.activityIds.length > 50 ||
        b.activityIds.some(
          (v) => typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v),
        )
      )
        throw new LearningError("Invalid activity order.");
      const { error } = await admin.rpc("learning_reorder", {
        p_cohort: id,
        p_ids: b.activityIds,
      });
      if (error)
        throw new LearningError(
          "The activity list changed. Refresh and try again.",
          409,
        );
    } else if (b.action === "room") {
      if (
        !Array.isArray(b.members) ||
        b.members.length < 2 ||
        b.members.length > 7
      )
        throw new LearningError("Assign the trainees to their roles.");
      const { error } = await admin.rpc("learning_create_room", {
        p_cohort: id,
        p_activity: b.activityId,
        p_name: learningText(b.name, "Group name", 100),
        p_members: b.members,
      });
      if (error)
        throw new LearningError(
          "Could not create the group. Assign each role once, using different trainees from this programme who are not already assigned to this activity.",
        );
    } else if (b.action === "close_room") {
      const { error } = await admin
        .from("learning_rooms")
        .update({ status: "completed" })
        .eq("id", String(b.roomId))
        .eq("cohort_id", id);
      if (error) throw error;
    } else throw new LearningError("Unknown action.");
    return json({ saved: true });
  });
}
