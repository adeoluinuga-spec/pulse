import { createHmac } from "node:crypto";
import { learningLinkKey, tokenHash } from "./learningLinks";
import { LearningError } from "./learning";
export { LearningError, learningText } from "./learning";
export {
  newLearningLink,
  revealLearningLink,
  tokenHash,
} from "./learningLinks";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/apiAuth";

export const learningHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: learningHeaders });
export const learningAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
export type LearningAdmin = ReturnType<typeof learningAdmin>;
export async function learningContext() {
  const user = await getRouteUser();
  if (!user)
    throw new LearningError("Sign in to manage learning programmes.", 401);
  const admin = learningAdmin();
  const { data, error } = await admin
    .from("employees")
    .select("id,org_id,platform_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("identity");
  if (
    !data?.org_id ||
    !["hr_admin", "super_admin"].includes(data.platform_role)
  )
    throw new LearningError(
      "Only your organisation's HR administrators can manage learning programmes.",
      403,
    );
  return { admin, orgId: data.org_id as string, employeeId: data.id as string };
}
export async function learningHandled(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LearningError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          "Learning could not be loaded or saved. Please retry. If this continues, contact your facilitator.",
      },
      503,
    );
  }
}
export async function cohortFor(
  admin: LearningAdmin,
  id: string,
  orgId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new LearningError("Programme not found.", 404);
  const { data, error } = await admin
    .from("learning_cohorts")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error("cohort");
  if (!data) throw new LearningError("Programme not found.", 404);
  return data;
}
export async function traineeFor(admin: LearningAdmin, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token))
    throw new LearningError(
      "This link is not valid. Please ask your facilitator for a new one.",
      404,
    );
  const { data, error } = await admin
    .from("learning_trainees")
    .select("id,cohort_id,display_name,email,expires_at,revoked_at")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (error) throw new Error("trainee");
  if (!data)
    throw new LearningError(
      "This link is not valid. Please ask your facilitator for a new one.",
      404,
    );
  if (data.revoked_at || Date.parse(data.expires_at) <= Date.now())
    throw new LearningError(
      "This learning link has expired or been withdrawn. Please ask your facilitator for a new one.",
      410,
    );
  const { data: cohort, error: cError } = await admin
    .from("learning_cohorts")
    .select("id,org_id,name,client_name,status")
    .eq("id", data.cohort_id)
    .single();
  if (cError) throw new Error("cohort");
  if (cohort.status !== "active")
    throw new LearningError(
      "This programme has closed. Please contact your facilitator for your records.",
      410,
    );
  return { trainee: data, cohort };
}
export async function learningLimit(
  admin: LearningAdmin,
  request: Request,
  token: string,
) {
  const source =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  for (const value of ["ip:" + source, "token:" + token]) {
    const key = createHmac("sha256", learningLinkKey())
      .update(value)
      .digest("hex");
    const { data, error } = await admin.rpc("learning_rate_limit", {
      p_key: key,
      p_max: value.startsWith("ip:") ? 3000 : 90,
    });
    if (error) throw new Error("rate limit");
    if (!data)
      throw new LearningError("Please wait a minute before trying again.", 429);
  }
}
export async function learningBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 100000)
    throw new LearningError("This request is too large.", 413);
  const raw = await request.text();
  if (raw.length > 100000)
    throw new LearningError("This request is too large.", 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new LearningError("Please send valid form data.");
  }
}
export async function learningRows(
  admin: LearningAdmin,
  table: string,
  column: string,
  id: string,
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq(column, id)
      .order(table === "learning_room_members" ? "trainee_id" : "id")
      .range(from, from + 999);
    if (error) throw new Error("read " + table);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
