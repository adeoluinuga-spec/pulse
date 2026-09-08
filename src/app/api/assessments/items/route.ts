import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { normalizeInstrumentBody } from "@/lib/assessmentInstrument";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns whatever the instrument builder calls a competency into a real
 * assessment_competencies row on this cycle.
 *
 * A framework stores its competencies as a jsonb array with author-chosen keys
 * like "sets_direction". Items, though, carry a uuid foreign key into
 * assessment_competencies — and nothing in the product ever created those rows
 * for a new cycle, so every attempt to add an item failed with
 * `invalid input syntax for type uuid`. That is why a freshly built instrument
 * came out empty.
 *
 * Materialising here is what assessment_competencies.framework_id and
 * .framework_version were added for: the cycle keeps its own copy of the
 * competency, stamped with the framework version it came from, so editing the
 * framework later cannot silently rewrite a cycle that has already collected
 * responses.
 */
async function resolveCycleCompetency(
  admin: ReturnType<typeof getAdminClient>,
  cycleId: string,
  orgId: string,
  competencyKey: string,
): Promise<{ id: string } | { error: string }> {
  // Already a real cycle competency: nothing to do.
  if (UUID.test(competencyKey)) {
    const { data } = await admin
      .from("assessment_competencies")
      .select("id")
      .eq("id", competencyKey)
      .eq("cycle_id", cycleId)
      .maybeSingle<{ id: string }>();
    if (data) return { id: data.id };
  }

  type FrameworkRow = {
    id: string;
    framework_version: number | null;
    competencies: Array<{ id?: string; name?: string; description?: string }> | null;
  };

  const { data: frameworks } = await admin
    .from("assessment_frameworks")
    .select("id, framework_version, competencies")
    .eq("org_id", orgId)
    .returns<FrameworkRow[]>();

  let match: { name: string; description?: string; frameworkId: string; version: number | null } | null = null;
  for (const framework of frameworks ?? []) {
    const found = (framework.competencies ?? []).find((c) => c.id === competencyKey);
    if (found?.name) {
      match = {
        name: found.name,
        description: found.description,
        frameworkId: framework.id,
        version: framework.framework_version,
      };
      break;
    }
  }

  if (!match) {
    return { error: `No competency "${competencyKey}" found in this organisation's frameworks.` };
  }

  // Match on name so a second item under the same competency reuses the row
  // rather than creating a duplicate.
  const { data: existing } = await admin
    .from("assessment_competencies")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("name", match.name)
    .maybeSingle<{ id: string }>();

  if (existing) return { id: existing.id };

  const { count } = await admin
    .from("assessment_competencies")
    .select("*", { count: "exact", head: true })
    .eq("cycle_id", cycleId);

  const { data: created, error } = await admin
    .from("assessment_competencies")
    .insert({
      cycle_id: cycleId,
      framework_id: match.frameworkId,
      framework_version: match.version,
      name: match.name,
      description: match.description ?? null,
      sort_order: count ?? 0,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };
  return { id: created.id };
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireHrAccess() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("org_id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (employee as { platform_role?: string } | null)?.platform_role;
  const orgId = (employee as { org_id?: string } | null)?.org_id;

  if (!orgId || !role || (role !== "hr_admin" && role !== "super_admin")) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }

  return { ok: true, user, orgId, admin } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireHrAccess();
  if (!auth.ok) return auth.response;

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const { data: items, error } = await auth.admin
    .from("assessment_items")
    .select("id, cycle_id, competency_id, item_type, body, display_order, is_active, created_at, updated_at")
    .eq("cycle_id", cycleId)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: items ?? [] }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireHrAccess();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as {
    cycleId?: string;
    competencyId?: string | null;
    itemType?: "scale" | "text";
    body?: string;
    displayOrder?: number;
    isActive?: boolean;
  };

  const cycleId = body.cycleId?.trim();
  const itemType = (body.itemType ?? "scale").trim();
  const normalizedBody = normalizeInstrumentBody(body.body);

  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  if (!["scale", "text"].includes(itemType)) return NextResponse.json({ error: "itemType must be scale or text" }, { status: 400 });
  if (!normalizedBody) return NextResponse.json({ error: "Item body is required" }, { status: 400 });
  if (itemType === "scale" && !body.competencyId?.trim()) {
    return NextResponse.json({ error: "Scale items must belong to a competency" }, { status: 400 });
  }

  let competencyId: string | null = null;
  if (itemType === "scale") {
    const resolved = await resolveCycleCompetency(auth.admin, cycleId, auth.orgId, body.competencyId!.trim());
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    competencyId = resolved.id;
  }

  // A standalone text item has no competency, and PostgREST cannot express
  // "= null" — it needs `is null`. Using eq here made every open-text item fail.
  const siblingQuery = auth.admin
    .from("assessment_items")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("item_type", itemType);

  const { data: items, error: itemsError } = await (competencyId
    ? siblingQuery.eq("competency_id", competencyId)
    : siblingQuery.is("competency_id", null));

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const displayOrder = typeof body.displayOrder === "number" ? body.displayOrder : (items ?? []).length;

  const { data, error } = await auth.admin
    .from("assessment_items")
    .insert({
      cycle_id: cycleId,
      competency_id: competencyId,
      item_type: itemType,
      body: normalizedBody,
      display_order: displayOrder,
      is_active: body.isActive ?? true,
    })
    .select("id, cycle_id, competency_id, item_type, body, display_order, is_active, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireHrAccess();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as {
    id?: string;
    competencyId?: string | null;
    itemType?: "scale" | "text";
    body?: string;
    displayOrder?: number;
    isActive?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const itemType = (body.itemType ?? "scale").trim();
  const normalizedBody = normalizeInstrumentBody(body.body);

  if (!["scale", "text"].includes(itemType)) {
    return NextResponse.json({ error: "itemType must be scale or text" }, { status: 400 });
  }
  if (!normalizedBody) {
    return NextResponse.json({ error: "Item body is required" }, { status: 400 });
  }
  if (itemType === "scale" && !body.competencyId?.trim()) {
    return NextResponse.json({ error: "Scale items must belong to a competency" }, { status: 400 });
  }

  // An edit can move an item to a different competency, so resolve here too.
  // The item's own cycle is the authority — the caller does not send one.
  const { data: current } = await auth.admin
    .from("assessment_items")
    .select("cycle_id")
    .eq("id", body.id)
    .maybeSingle<{ cycle_id: string }>();

  if (!current) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  let competencyId: string | null = null;
  if (itemType === "scale") {
    const resolved = await resolveCycleCompetency(
      auth.admin,
      current.cycle_id,
      auth.orgId,
      body.competencyId!.trim(),
    );
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    competencyId = resolved.id;
  }

  const { data, error } = await auth.admin
    .from("assessment_items")
    .update({
      competency_id: competencyId,
      item_type: itemType,
      body: normalizedBody,
      display_order: body.displayOrder ?? 0,
      is_active: body.isActive ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("id, cycle_id, competency_id, item_type, body, display_order, is_active, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHrAccess();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = request.nextUrl.searchParams.get("id") ?? body.id;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("assessment_items")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, is_active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 200 });
}
