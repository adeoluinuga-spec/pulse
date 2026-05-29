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

  // Smart routing based on the `next` query param embedded in the invite link
  if (next === "onboarding") {
    return NextResponse.redirect(new URL("/onboarding", requestUrl.origin));
  }

  if (next === "welcome") {
    return NextResponse.redirect(new URL("/welcome", requestUrl.origin));
  }

  // Generic sign-in: check whether the user has an employee record
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (!emp) {
      const loginUrl = new URL("/auth/login", requestUrl.origin);
      loginUrl.searchParams.set(
        "error",
        "Your account isn't set up yet. Contact your HR admin.",
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
