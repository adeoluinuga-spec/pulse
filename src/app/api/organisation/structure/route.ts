import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteUser } from "@/lib/apiAuth";
import { parseStructure, validateStructure, type StructureEmployee } from "@/lib/organisationStructure";

const headers = { "Cache-Control": "private, no-store" };
function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }

async function context() {
  const user = await getRouteUser();
  if (!user) return { error: reply({ error: "Sign in to manage your organisation structure." }, 401) };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: employee, error } = await admin.from("employees").select("org_id, platform_role").eq("user_id", user.id).maybeSingle();
  if (error) return { error: reply({ error: "Unable to verify your organisation access." }, 500) };
  if (!employee?.org_id || !["hr_admin", "super_admin"].includes(employee.platform_role)) {
    return { error: reply({ error: "Only your organisation's HR administrators can manage this structure." }, 403) };
  }
  return { admin, user, orgId: employee.org_id as string };
}

function databaseError(error: { code?: string; message: string }) {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "")) {
    return reply({ error: "Organisation structure is not enabled in this environment yet. Ask your deployment administrator to apply the organisation structure migration.", code: "migration_required" }, 503);
  }
  if (error.code === "40001") return reply({ error: error.message }, 409);
  if (error.code === "22023") return reply({ error: error.message }, 422);
  if (error.code === "42501") return reply({ error: "You no longer have permission to edit this organisation." }, 403);
  return reply({ error: "The structure could not be saved or loaded. Please retry." }, 500);
}

export async function GET() {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { admin, orgId } = ctx;
  const [roster, structure, org, history] = await Promise.all([
    admin.rpc("organisation_structure_roster", { p_org: orgId }),
    admin.from("organisation_structures").select("draft, roster_baseline, revision, published_at, published").eq("org_id", orgId).maybeSingle(),
    admin.from("organisations").select("name").eq("id", orgId).single(),
    admin.from("organisation_structure_versions").select("revision, published_at").eq("org_id", orgId).order("revision", { ascending: false }).limit(10),
  ]);
  const error = roster.error || structure.error || org.error || history.error;
  if (error) return databaseError(error);
  return reply({ employees: roster.data, organisationName: org.data?.name, structure: structure.data, history: history.data });
}

export async function PUT(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  let body;
  let document;
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return reply({ error: "This structure is too large." }, 413);
    body = JSON.parse(raw);
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
        !["save", "publish"].includes(body.action) || !Array.isArray(body.rosterBaseline)) throw new Error("Invalid save request.");
    document = parseStructure(body.document);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "Invalid structure request." }, 400); }
  const { data: roster, error } = await ctx.admin.rpc("organisation_structure_roster", { p_org: ctx.orgId });
  if (error) return databaseError(error);
  const errors = validateStructure(document, roster as StructureEmployee[], body.action === "publish");
  if (errors.length) return reply({ error: errors.join(" "), errors }, 422);
  const result = await ctx.admin.rpc("save_organisation_structure", {
    p_org: ctx.orgId, p_user: ctx.user.id, p_revision: body.revision,
    p_document: document, p_roster_baseline: body.rosterBaseline, p_publish: body.action === "publish",
  });
  if (result.error) return databaseError(result.error);
  return reply(result.data);
}
