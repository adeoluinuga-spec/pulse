import { randomBytes } from "node:crypto";

import {
  cohortFor,
  json,
  learningContext,
  LearningError,
  learningHandled,
} from "@/lib/learningServer";
import {
  FILE_LINK_SECONDS,
  LEARNING_BUCKET,
  filePath,
  validateUpload,
} from "@/lib/learningFiles";

/**
 * Material files on an activity: uploading, listing a link, and removing one.
 *
 * The facilitator uploads here rather than straight to storage, so the file is
 * checked before it exists: type, size, and that the activity really belongs to
 * their own programme. Nothing in the response carries a bucket path.
 */

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return learningHandled(async () => {
    const { id } = await params;
    const { admin, orgId, employeeId } = await learningContext();
    const cohort = await cohortFor(admin, id, orgId);

    const form = await request.formData().catch(() => null);
    if (!form) throw new LearningError("Send the file as a form upload.");
    const file = form.get("file");
    const activityId = String(form.get("activityId") ?? "");
    if (!(file instanceof File)) throw new LearningError("Choose a file to upload.");
    if (!/^[0-9a-f-]{36}$/i.test(activityId)) throw new LearningError("Choose the activity to attach it to.");

    const checked = validateUpload({ name: file.name, mime: file.type, size: file.size });
    if (!checked.ok) throw new LearningError(checked.error);

    // The activity has to be in this programme — otherwise a facilitator could
    // attach a file to somebody else's tenant by passing its id.
    const { data: activity, error: activityError } = await admin
      .from("learning_activities")
      .select("id")
      .eq("id", activityId)
      .eq("cohort_id", cohort.id)
      .maybeSingle<{ id: string }>();
    if (activityError) throw activityError;
    if (!activity) throw new LearningError("Activity not found.", 404);

    const { count, error: countError } = await admin
      .from("learning_files")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", activityId);
    if (countError) throw countError;
    if ((count ?? 0) >= 10) throw new LearningError("An activity holds up to 10 files.");

    const path = filePath(cohort.id, activityId, randomBytes(12).toString("hex"), checked.extension);
    const { error: uploadError } = await admin.storage
      .from(LEARNING_BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: checked.mime, upsert: false });
    if (uploadError) {
      throw new LearningError(
        uploadError.message.toLowerCase().includes("bucket")
          ? "File storage is not set up yet. Run scripts/learning/create-bucket.mjs once."
          : "The upload did not finish. Please try again.",
        503,
      );
    }

    const { error } = await admin.from("learning_files").insert({
      cohort_id: cohort.id,
      activity_id: activityId,
      name: checked.name,
      path,
      mime: checked.mime,
      size_bytes: checked.size,
      uploaded_by: employeeId,
    });
    if (error) {
      // The row is what makes the file reachable; without it the bytes are litter.
      await admin.storage.from(LEARNING_BUCKET).remove([path]);
      throw error;
    }

    return json({ saved: true }, 201);
  });
}

export async function PUT(request: Request, { params }: Context) {
  return learningHandled(async () => {
    const { id } = await params;
    const { admin, orgId } = await learningContext();
    const cohort = await cohortFor(admin, id, orgId);
    const body = (await request.json().catch(() => ({}))) as { fileId?: unknown; action?: unknown };
    const fileId = String(body.fileId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new LearningError("Choose a file.");

    const { data: file, error } = await admin
      .from("learning_files")
      .select("id, path, name, mime")
      .eq("id", fileId)
      .eq("cohort_id", cohort.id)
      .maybeSingle<{ id: string; path: string; name: string; mime: string }>();
    if (error) throw error;
    if (!file) throw new LearningError("File not found.", 404);

    if (body.action === "delete") {
      const { error: removeError } = await admin.storage.from(LEARNING_BUCKET).remove([file.path]);
      if (removeError) throw new LearningError("The file could not be removed. Please retry.", 503);
      const { error: rowError } = await admin.from("learning_files").delete().eq("id", file.id);
      if (rowError) throw rowError;
      return json({ deleted: true });
    }

    const { data: link, error: linkError } = await admin.storage
      .from(LEARNING_BUCKET)
      .createSignedUrl(file.path, FILE_LINK_SECONDS);
    if (linkError || !link) throw new LearningError("That file could not be opened. Please retry.", 503);
    return json({ url: link.signedUrl, name: file.name, mime: file.mime, expiresIn: FILE_LINK_SECONDS });
  });
}
