import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

  // 1. Query-param routing (works when Supabase preserves it)
  if (next === "onboarding") {
    return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
  }
  if (next === "welcome") {
    return NextResponse.redirect(new URL("/welcome", requestUrl.origin));
  }

  // 2. Metadata routing — reliable fallback when query params are stripped
  const invitedAs = (user?.user_metadata as Record<string, string> | null)?.invited_as;
  if (invitedAs === "hr_admin" || invitedAs === "executive_view") {
    return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
  }
  if (invitedAs === "employee") {
    return NextResponse.redirect(new URL("/welcome", requestUrl.origin));
  }

  // 3. Returning user — check employee record and route by platform_role
  if (user) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id, platform_role")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (!emp) {
      const loginUrl = new URL("/auth/login", requestUrl.origin);
      loginUrl.searchParams.set("error", "Your account isn't set up yet. Contact your HR admin.");
      return NextResponse.redirect(loginUrl);
    }

    const role = (emp as { platform_role?: string }).platform_role;
    if (role === "hr_admin") return NextResponse.redirect(new URL("/hr", requestUrl.origin));
    if (role === "executive_view") return NextResponse.redirect(new URL("/executive", requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
