import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_AUTH_BYPASS } from "@/lib/devAuth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/assessments",
  "/goals",
  "/strategy",
  "/kpis",
  "/payroll",
  "/payslips",
  "/reports",
  "/appraisal",
  "/team",
  "/hr",
  "/executive",
  "/onboarding",
  "/welcome",
  "/admin",
  "/settings",
];

export async function proxy(request: NextRequest) {
  if (DEV_AUTH_BYPASS) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // No session on a protected route → redirect to login
  if (!session && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in → don't show login page
  if (session && pathname === "/auth/login") {
    const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.toLowerCase();
    const sessionEmail = session.user.email?.toLowerCase();
    if (superAdminEmail && sessionEmail === superAdminEmail) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/auth/login",
    "/dashboard/:path*",
    "/assessments/:path*",
    "/assessments",
    "/goals/:path*",
    "/goals",
    "/strategy/:path*",
    "/kpis/:path*",
    "/payroll/:path*",
    "/payslips/:path*",
    "/reports/:path*",
    "/reports",
    "/appraisal/:path*",
    "/appraisal",
    "/team/:path*",
    "/team",
    "/hr/:path*",
    "/hr",
    "/executive/:path*",
    "/executive",
    "/onboarding/:path*",
    "/onboarding",
    "/welcome/:path*",
    "/welcome",
    "/admin",
    "/settings/:path*",
    "/settings",
  ],
};
