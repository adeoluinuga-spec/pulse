import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  // ── Verify caller is the super admin ────────────────────────────────────
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== process.env.SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const { name, slug, currency, cadence, hrAdminEmail, firstInviteeRole } = (await request.json()) as {
    name: string;
    slug: string;
    currency: string;
    cadence: string;
    hrAdminEmail: string;
    firstInviteeRole?: string;
  };

  if (!name || !slug || !hrAdminEmail) {
    return NextResponse.json(
      { error: "name, slug and hrAdminEmail are required" },
      { status: 400 },
    );
  }

  const admin = getAdminClient();

  // ── Create organisation ───────────────────────────────────────────────────
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({
      name,
      slug,
      currency: currency || "NGN",
      appraisal_cadence: cadence || "quarterly",
    })
    .select()
    .single();

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  // ── Invite HR admin via Supabase auth ────────────────────────────────────
  const origin =
    request.headers.get("origin") ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    hrAdminEmail,
    {
      redirectTo: `${origin}/auth/callback?next=onboarding`,
      data: {
        org_id: (org as { id: string }).id,
        platform_role: firstInviteeRole ?? "hr_admin",
        invited_as: firstInviteeRole ?? "hr_admin",
      },
    },
  );

  if (inviteError) {
    // Roll back org creation on invite failure
    await admin.from("organisations").delete().eq("id", (org as { id: string }).id);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  return NextResponse.json({
    org,
    message: `Organisation created. Invite sent to ${hrAdminEmail}.`,
  });
}
