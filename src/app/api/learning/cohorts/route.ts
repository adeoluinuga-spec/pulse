import {
  json,
  learningBody,
  learningContext,
  learningHandled,
  learningText,
} from "@/lib/learningServer";
import { learningStarter } from "@/lib/learningTemplate";
export const dynamic = "force-dynamic";
export async function GET() {
  return learningHandled(async () => {
    const { admin, orgId } = await learningContext();
    const { data, error } = await admin
      .from("learning_cohorts")
      .select("*,learning_trainees(count),learning_activities(count)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return json({ cohorts: data });
  });
}
export async function POST(request: Request) {
  return learningHandled(async () => {
    const { admin, orgId, employeeId } = await learningContext();
    const body = await learningBody(request);
    const { data, error } = await admin
      .from("learning_cohorts")
      .insert({
        org_id: orgId,
        created_by: employeeId,
        name: learningText(body.name, "Programme name"),
        client_name: learningText(body.clientName, "Client name"),
      })
      .select("id")
      .single();
    if (error) throw error;
    if (body.starter === true) {
      const { error: seedError } = await admin
        .from("learning_activities")
        .insert(
          learningStarter.map((a, position) => ({
            ...a,
            position,
            cohort_id: data.id,
          })),
        );
      if (seedError) {
        await admin
          .from("learning_cohorts")
          .delete()
          .eq("id", data.id)
          .eq("org_id", orgId);
        throw seedError;
      }
    }
    return json({ id: data.id }, 201);
  });
}
