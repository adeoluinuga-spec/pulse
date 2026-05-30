import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Called after every successful OTP verification.
// Creates the employee record if it doesn't exist yet (bypasses RLS).
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const admin = getAdminClient();

  // Already has a record linked by user_id?
  const { data: existing } = await admin
    .from("employees")
    .select("id, platform_role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ status: "exists", role: (existing as { platform_role: string }).platform_role });
  }

  const meta = user.user_metadata as Record<string, string> | null;
  const orgId = meta?.org_id;
  const invitedAs = meta?.invited_as;

  // Try to link to a pre-created employee record by email
  if (orgId) {
    const { data: emailMatch } = await admin
      .from("employees")
      .select("id, platform_role")
      .eq("email", user.email ?? "")
      .eq("org_id", orgId)
      .is("user_id", null)
      .maybeSingle();

    if (emailMatch) {
      const emp = emailMatch as { id: string; platform_role: string };
      await admin.from("employees").update({ user_id: user.id }).eq("id", emp.id);
      return NextResponse.json({ status: "linked", role: emp.platform_role });
    }
  }

  // Create a fresh record for HR admin or executive invited as first person
  if (orgId && (invitedAs === "hr_admin" || invitedAs === "executive_view")) {
    const emailName = (user.email ?? "").split("@")[0];
    const { error } = await admin.from("employees").insert({
      user_id: user.id,
      org_id: orgId,
      email: user.email,
      name: emailName,
      initials: emailName.slice(0, 2).toUpperCase(),
      platform_role: invitedAs,
      cadre: "senior",
      people_responsibility: "manager",
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "created", role: invitedAs });
  }

  return NextResponse.json({ status: "no_record" });
}
