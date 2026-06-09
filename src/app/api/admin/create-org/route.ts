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
  const {
    name,
    slug,
    currency,
    cadence,
    hrAdminEmail,
    executiveEmail,
    firstInviteeRole,
  } = (await request.json()) as {
    name: string;
    slug: string;
    currency: string;
    cadence: string;
    hrAdminEmail?: string;
    executiveEmail?: string;
    firstInviteeRole?: string;
  };

  if (!name || !slug || (!hrAdminEmail && !executiveEmail)) {
    return NextResponse.json(
      { error: "name, slug, and at least one representative email are required" },
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

  const orgId = (org as { id: string }).id;

  const origin =
    request.headers.get("origin") ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const invitees = [
    hrAdminEmail
      ? { email: hrAdminEmail, role: firstInviteeRole ?? "hr_admin" }
      : null,
    executiveEmail
      ? { email: executiveEmail, role: "executive_view" }
      : null,
  ].filter(Boolean) as Array<{ email: string; role: string }>;

  for (const invitee of invitees) {
    const emailName = invitee.email.split("@")[0];
    const { error: empError } = await admin.from("employees").insert({
      org_id: orgId,
      email: invitee.email,
      name: emailName,
      initials: emailName.slice(0, 2).toUpperCase(),
      platform_role: invitee.role,
      cadre: invitee.role === "executive_view" ? "executive" : "senior",
      people_responsibility: invitee.role === "executive_view" ? "director" : "manager",
    });

    if (empError) {
      await admin.from("organisations").delete().eq("id", orgId);
      return NextResponse.json({ error: empError.message }, { status: 500 });
    }

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      invitee.email,
      {
        redirectTo: `${origin}/auth/callback?next=onboarding`,
        data: {
          org_id: orgId,
          platform_role: invitee.role,
          invited_as: invitee.role,
        },
      },
    );

    if (inviteError) {
      await admin.from("organisations").delete().eq("id", orgId);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
  }

  if (!invitees.length) {
    await admin.from("organisations").delete().eq("id", orgId);
    return NextResponse.json({ error: "No invitees provided" }, { status: 400 });
  }

  return NextResponse.json({
    org,
    message: `Organisation created. ${invitees.length} invite${invitees.length === 1 ? "" : "s"} sent.`,
  });
}
