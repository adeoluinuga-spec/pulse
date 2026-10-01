import {
  FILE_LINK_SECONDS,
  LEARNING_BUCKET,
} from "@/lib/learningFiles";
import {
  json,
  learningAdmin,
  learningBody,
  LearningError,
  learningHandled,
  learningLimit,
  learningRows,
  tokenHash,
  traineeFor,
} from "@/lib/learningServer";
import {
  isLiveRoleplay,
  learningEmailHtml,
  liveRoleplayFields,
  validateLearningAnswers,
  type LearningActivity,
} from "@/lib/learning";
import { resolveOrgReplyTo, sendPulseEmail } from "@/lib/pulseEmail";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(request: Request, { params }: Context) {
  return learningHandled(async () => {
    const { token } = await params;
    const admin = learningAdmin();
    await learningLimit(admin, request, token);
    const { trainee, cohort } = await traineeFor(admin, token);
    const [activities, submissions, members, files] = await Promise.all([
      admin
        .from("learning_activities")
        .select("id,cohort_id,title,summary,type,config,position,released")
        .eq("cohort_id", cohort.id)
        .eq("released", true)
        .order("position")
        .order("id"),
      learningRows(admin, "learning_submissions", "trainee_id", trainee.id),
      learningRows(admin, "learning_room_members", "trainee_id", trainee.id),
      learningRows(admin, "learning_files", "cohort_id", cohort.id),
    ]);
    if (activities.error) throw activities.error;
    const released = new Set(activities.data.map((a) => a.id));
    const rooms = [];
    for (const member of members.filter((m) => released.has(m.activity_id))) {
      const { data: room, error } = await admin
        .from("learning_rooms")
        .select("id,name,activity_id,status,turn_number")
        .eq("id", member.room_id)
        .eq("cohort_id", cohort.id)
        .single();
      if (error) throw error;
      const [players, messages] = await Promise.all([
        learningRows(admin, "learning_room_members", "room_id", room.id),
        learningRows(admin, "learning_messages", "room_id", room.id),
      ]);
      const { data: names, error: nameError } = await admin
        .from("learning_trainees")
        .select("id,display_name")
        .eq("cohort_id", cohort.id)
        .in(
          "id",
          players.map((p) => String(p.trainee_id)),
        );
      if (nameError) throw nameError;
      rooms.push({
        ...room,
        members: players.map((p) => ({
          trainee_id: p.trainee_id,
          role_name: p.role_name,
          seat: p.seat,
          name: names.find((n) => n.id === p.trainee_id)?.display_name,
        })),
        messages: messages.map((m) => ({
          id: m.id,
          trainee_id: m.trainee_id,
          body: m.body,
          created_at: m.created_at,
        })),
      });
    }
    const { error: seenError } = await admin
      .from("learning_trainees")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", trainee.id);
    if (seenError) throw seenError;
    return json({
      trainee: {
        id: trainee.id,
        name: trainee.display_name,
        expiresAt: trainee.expires_at,
      },
      cohort: { name: cohort.name, clientName: cohort.client_name },
      activities: activities.data,
      // Only the files on activities they can open, and never their paths.
      files: files
        .filter((file) => released.has(String(file.activity_id)))
        .map((file) => ({
          id: file.id,
          activity_id: file.activity_id,
          name: file.name,
          mime: file.mime,
          size_bytes: file.size_bytes,
        })),
      submissions: submissions
        .filter((s) => released.has(s.activity_id))
        .map((s) => ({
          activity_id: s.activity_id,
          payload: s.payload,
          status: s.status,
          updated_at: s.updated_at,
        })),
      rooms,
    });
  });
}
export async function POST(request: Request, { params }: Context) {
  return learningHandled(async () => {
    const { token } = await params;
    const admin = learningAdmin();
    await learningLimit(admin, request, token);
    const { trainee, cohort } = await traineeFor(admin, token);
    const body = await learningBody(request);
    if (body.action === "speak") {
      if (
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 4000 ||
        typeof body.requestId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.requestId)
      )
        throw new LearningError("Write a response of up to 4,000 characters.");
      const { error } = await admin.rpc("learning_speak", {
        p_hash: tokenHash(token),
        p_room: body.roomId,
        p_body: body.message,
        p_request: body.requestId,
      });
      if (error)
        throw new LearningError(
          "Your response was not sent. Check that this is your group, the activity is open and it is your turn.",
          409,
        );
      return json({ saved: true });
    }
    if (body.action === "file") {
      const { data: file, error: fileError } = await admin
        .from("learning_files")
        .select("id, path, name, mime, activity_id")
        .eq("id", String(body.fileId ?? ""))
        .eq("cohort_id", cohort.id)
        .maybeSingle<{ id: string; path: string; name: string; mime: string; activity_id: string }>();
      if (fileError) throw fileError;
      if (!file) throw new LearningError("That file is not available.", 404);

      // The activity it belongs to has to be released, or a file could be read
      // before its material is open.
      const { data: activityRow, error: releaseError } = await admin
        .from("learning_activities")
        .select("id")
        .eq("id", file.activity_id)
        .eq("cohort_id", cohort.id)
        .eq("released", true)
        .maybeSingle<{ id: string }>();
      if (releaseError) throw releaseError;
      if (!activityRow) throw new LearningError("That file is not available.", 404);

      const { data: link, error: linkError } = await admin.storage
        .from(LEARNING_BUCKET)
        .createSignedUrl(file.path, FILE_LINK_SECONDS);
      if (linkError || !link) throw new LearningError("That file could not be opened. Please try again.", 503);
      return json({ url: link.signedUrl, name: file.name, mime: file.mime });
    }

    const { data: activity, error } = await admin
      .from("learning_activities")
      .select("*")
      .eq("cohort_id", cohort.id)
      .eq("id", String(body.activityId))
      .eq("released", true)
      .maybeSingle<LearningActivity>();
    if (error) throw error;
    const live = activity ? isLiveRoleplay(activity) : false;
    // A written role-play is answered by taking turns, not by saving a form.
    if (!activity || (activity.type === "roleplay" && !live))
      throw new LearningError("This activity is not available.", 404);
    const draft = body.draft === true;
    let payload = {};
    if (activity.type === "form") {
      try {
        payload = validateLearningAnswers(activity.config, body.payload, draft);
      } catch (e) {
        throw new LearningError((e as Error).message);
      }
    } else if (live) {
      // Which questions this person answers depends on whether they took a role
      // or watched, and that comes from their seat in the group — never from
      // the request.
      const { data: seat, error: seatError } = await admin
        .from("learning_room_members")
        .select("seat")
        .eq("trainee_id", trainee.id)
        .eq("activity_id", activity.id)
        .maybeSingle<{ seat: number }>();
      if (seatError) throw seatError;
      if (!seat)
        throw new LearningError(
          "You are not in a group for this role-play. Your facilitator can add you to one.",
          403,
        );
      try {
        payload = validateLearningAnswers(
          { fields: liveRoleplayFields(activity.config, seat.seat) },
          body.payload,
          draft,
        );
      } catch (e) {
        throw new LearningError((e as Error).message);
      }
    }
    const { data: saved, error: saveError } = await admin.rpc("learning_save", {
      p_hash: tokenHash(token),
      p_activity: activity.id,
      p_payload: payload,
      p_draft: draft,
    });
    if (saveError)
      throw new LearningError(
        "Your work could not be saved. Check that your link and this activity are still open.",
        409,
      );
    let email: "sent" | "failed" | "not_requested" = "not_requested";
    if (!draft && (activity.type === "form" || live) && trainee.email) {
      try {
        const base =
          process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        const result = await sendPulseEmail({
          to: trainee.email,
          subject: `${cohort.name}: submission saved`,
          html: learningEmailHtml(
            trainee.display_name,
            "Your learning submission is saved",
            `${base.replace(/\/$/, "")}/t/${token}`,
          ),
          replyTo: await resolveOrgReplyTo(admin, cohort.org_id),
        });
        email = result.ok ? "sent" : "failed";
      } catch {
        email = "failed";
      }
    }
    return json({
      saved: true,
      updatedAt: saved.updated_at,
      email,
      message: draft
        ? "Draft saved."
        : activity.config.confirmText || "Your work is saved.",
    });
  });
}
