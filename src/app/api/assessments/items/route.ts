import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { normalizeInstrumentBody } from "@/lib/assessmentInstrument";

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

  const { data: items, error: itemsError } = await auth.admin
    .from("assessment_items")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("competency_id", body.competencyId ?? null)
    .eq("item_type", itemType);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const displayOrder = typeof body.displayOrder === "number" ? body.displayOrder : (items ?? []).length;

  const { data, error } = await auth.admin
    .from("assessment_items")
    .insert({
      cycle_id: cycleId,
      competency_id: itemType === "scale" ? body.competencyId : null,
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

  const { data, error } = await auth.admin
    .from("assessment_items")
    .update({
      competency_id: itemType === "scale" ? body.competencyId : null,
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
