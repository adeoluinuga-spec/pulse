import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getServiceClient() {
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

function dashboardPath(role?: string) {
  if (role === "hr_admin") return "/dashboard/hr";
  if (role === "executive_view") return "/dashboard/executive";
  return "/dashboard";
}

function isOrgRepresentative(role?: string) {
  return role === "hr_admin" || role === "executive_view";
}

function routeAfterAuth(role?: string, onboardingCompleted?: boolean) {
  if (isOrgRepresentative(role) && !onboardingCompleted) return "/onboarding";
  return dashboardPath(role);
}

function isSuperAdminEmail(email?: string | null) {
  return Boolean(
    email &&
      process.env.SUPER_ADMIN_EMAIL &&
      email.toLowerCase() === process.env.SUPER_ADMIN_EMAIL.toLowerCase(),
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "";
  const errorParam = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Supabase may redirect back with an error (e.g. expired invite link)
  if (errorParam) {
    const loginUrl = new URL("/auth/login", requestUrl.origin);
    loginUrl.searchParams.set(
      "error",
      errorDescription ?? "The invite link is invalid or has expired.",
    );
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    // No code and no error → something unexpected, send to login
    const loginUrl = new URL("/auth/login", requestUrl.origin);
    loginUrl.searchParams.set("error", "Invalid link. Please request a new one.");
    return NextResponse.redirect(loginUrl);
  }

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
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

  if (sessionError) {
    const loginUrl = new URL("/auth/login", requestUrl.origin);
    loginUrl.searchParams.set(
      "error",
      sessionError.message ?? "Could not sign you in. Try clicking the link again.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isSuperAdminEmail(user?.email)) {
    return NextResponse.redirect(new URL("/admin", requestUrl.origin));
  }

  // ── Bootstrap employee record for new invites (bypasses RLS) ──────────────
  const meta = user?.user_metadata as Record<string, string> | null;
  const invitedAs = meta?.invited_as;
  const metaOrgId = meta?.org_id;

  let isFirstTimeInvite = false;

  if (user && invitedAs && metaOrgId) {
    const admin = getServiceClient();

    // Check if this user already has an employee record (returning user)
    const { data: existing } = await admin
      .from("employees")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      isFirstTimeInvite = true;

      // For bulk-imported employees: link user_id to pre-created email record
      const { data: emailMatch } = await admin
        .from("employees")
        .select("id")
        .eq("email", user.email ?? "")
        .eq("org_id", metaOrgId)
        .is("user_id", null)
        .maybeSingle();

      if (emailMatch) {
        await admin
          .from("employees")
          .update({ user_id: user.id })
          .eq("id", (emailMatch as { id: string }).id);
      } else if (invitedAs === "hr_admin" || invitedAs === "executive_view") {
        const emailName = (user.email ?? "").split("@")[0];
        await admin.from("employees").insert({
          user_id: user.id,
          org_id: metaOrgId,
          email: user.email,
          name: emailName,
          initials: emailName.slice(0, 2).toUpperCase(),
          platform_role: invitedAs,
          cadre: "senior",
          people_responsibility: "manager",
        });
      }
    }
  }

  // 1. Query-param routing (works when Supabase preserves it)
  if (next === "onboarding") {
    return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
  }
  if (next === "welcome") {
    if (user) {
      const { data: emp } = await supabase
        .from("employees")
        .select("*")
        .or(`user_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();
      const row = emp as Record<string, unknown> | null;
      const role = row?.platform_role as string | undefined;
      if (role) {
        const completed = hasCompletedOnboarding(row, meta as Record<string, unknown> | null);
        return NextResponse.redirect(new URL(routeAfterAuth(role, completed), requestUrl.origin));
      }
    }
    return NextResponse.redirect(new URL("/welcome", requestUrl.origin));
  }

  // 2. First-time invite routing — only when record was just created this request
  if (isFirstTimeInvite) {
    if (isOrgRepresentative(invitedAs)) {
      return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
    }
    if (invitedAs === "employee") {
      return NextResponse.redirect(new URL("/welcome", requestUrl.origin));
    }
  }

  // 3. Returning user — check employee record and route by platform_role
  if (user) {
    const { data: emp } = await supabase
      .from("employees")
      .select("*")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (!emp) {
      const loginUrl = new URL("/auth/login", requestUrl.origin);
      loginUrl.searchParams.set("error", "Your account isn't set up yet. Contact your HR admin.");
      return NextResponse.redirect(loginUrl);
    }

    const row = emp as Record<string, unknown>;
    const role = row.platform_role as string | undefined;
    if (role) {
      const completed = hasCompletedOnboarding(row, meta as Record<string, unknown> | null);
      return NextResponse.redirect(new URL(routeAfterAuth(role, completed), requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
