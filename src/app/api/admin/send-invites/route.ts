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

interface EmployeeImport {
  name: string;
  email: string;
  department: string;
  team: string;
  cadre: string;
  peopleResponsibility: string;
  lineManagerEmail: string;
  band: string;
  joinDate: string;
}

export async function POST(request: NextRequest) {
  // ── Verify caller is authenticated ──────────────────────────────────────
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
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Caller must be hr_admin or super_admin
  const { data: callerEmp } = await supabase
    .from("employees")
    .select("platform_role, org_id")
    .eq("user_id", user.id)
    .single();

  const caller = callerEmp as { platform_role: string; org_id: string } | null;
  const isHR =
    caller?.platform_role === "hr_admin" ||
    caller?.platform_role === "super_admin" ||
    user.email === process.env.SUPER_ADMIN_EMAIL;

  if (!isHR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const { orgId, employees } = (await request.json()) as {
    orgId: string;
    employees: EmployeeImport[];
  };

  if (!orgId || !employees?.length) {
    return NextResponse.json(
      { error: "orgId and employees are required" },
      { status: 400 },
    );
  }

  const admin = getAdminClient();
  const origin =
    request.headers.get("origin") ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const results: Array<{ email: string; status: "sent" | "error"; error?: string }> = [];

  for (const emp of employees) {
    try {
      // Create employee DB record (no user_id yet)
      const { data: newEmp, error: empError } = await admin
        .from("employees")
        .insert({
          org_id: orgId,
          name: emp.name,
          email: emp.email,
          department: emp.department || null,
          team: emp.team || null,
          cadre: emp.cadre || "entry",
          people_responsibility: emp.peopleResponsibility || "none",
          platform_role: "standard",
          band_current: emp.band || null,
          join_date: emp.joinDate || null,
          initials: emp.name
            .split(" ")
            .map((p: string) => p[0])
            .join("")
            .toUpperCase()
            .slice(0, 2),
        })
        .select("id")
        .single();

      if (empError) {
        results.push({ email: emp.email, status: "error", error: empError.message });
        continue;
      }

      const employeeId = (newEmp as { id: string }).id;

      // Send auth invite
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        emp.email,
        {
          redirectTo: `${origin}/auth/callback?next=welcome`,
          data: {
            org_id: orgId,
            employee_id: employeeId,
            invited_as: "employee",
          },
        },
      );

      if (inviteError) {
        results.push({ email: emp.email, status: "error", error: inviteError.message });
      } else {
        results.push({ email: emp.email, status: "sent" });
      }
    } catch (err) {
      results.push({
        email: emp.email,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, sent, failed });
}
