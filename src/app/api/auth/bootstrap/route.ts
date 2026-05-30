import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function hasCompletedOnboarding(row?: Record<string, unknown> | null, meta?: Record<string, unknown> | null) {
  if (meta?.onboarding_completed === true) return true;
  if (row?.onboarding_completed === true) return true;
  return Boolean(row?.phone && row?.home_address && row?.emergency_contact);
}

// Called after every successful OTP verification.
// The client passes its access token in the Authorization header so we
// don't depend on cookies being flushed yet (timing issue after verifyOtp).
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace("Bearer ", "").trim();

  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 401 });
  }

  const admin = getAdminClient();

  // Verify the token and get the user
  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const meta = user.user_metadata as Record<string, unknown> | null;
  const orgId = typeof meta?.org_id === "string" ? meta.org_id : undefined;

  // Already linked by user_id?
  const { data: existing } = await admin
    .from("employees")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const emp = existing as Record<string, unknown>;
    return NextResponse.json({
      status: "exists",
      role: emp.platform_role,
      onboardingCompleted: hasCompletedOnboarding(emp, meta),
    });
  }

  // Look for a pre-created record by email (no user_id yet) — created when org was set up
  let emailQuery = admin
    .from("employees")
    .select("*")
    .eq("email", user.email ?? "")
    .is("user_id", null);

  if (orgId) {
    emailQuery = emailQuery.eq("org_id", orgId);
  }

  const { data: emailMatch } = await emailQuery.maybeSingle();

  if (emailMatch) {
    const emp = emailMatch as Record<string, unknown>;
    const { error: linkError } = await admin
      .from("employees")
      .update({ user_id: user.id })
      .eq("id", emp.id);

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
    return NextResponse.json({
      status: "linked",
      role: emp.platform_role,
      onboardingCompleted: hasCompletedOnboarding(emp, meta),
    });
  }

  return NextResponse.json({ status: "no_record", onboardingCompleted: false });
}
