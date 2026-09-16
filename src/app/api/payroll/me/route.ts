import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getRouteUser } from "@/lib/apiAuth";

/**
 * Your own pay, and nobody else's.
 *
 * Compensation stopped being readable from the browser when row-level security
 * turned out to show every colleague's salary to every employee. This is the
 * one route that returns pay to an ordinary signed-in user, and it takes no
 * parameters: there is no id to change, so there is no way to ask it about
 * somebody else.
 */

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

type LegacyCompensation = {
  basic?: number;
  housing?: number;
  transport?: number;
  medical?: number;
  otherAllowances?: Array<{ label: string; amount: number }>;
  totalGross?: number;
  bonusStructure?: unknown[];
};

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: employee, error } = await admin
    .from("employees")
    .select("id, compensation")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; compensation: LegacyCompensation | null }>();

  if (error) return NextResponse.json({ error: "Could not load your pay." }, { status: 500, headers });
  if (!employee) return NextResponse.json({ compensation: null }, { headers });

  // Payroll's dated records are the source of truth once they exist: the latest
  // one already in force today. The legacy column is only a fallback for
  // somebody whose pay has not been set up in payroll yet.
  const today = new Date().toISOString().slice(0, 10);
  const { data: current } = await admin
    .from("employee_compensation")
    .select("components")
    .eq("employee_id", employee.id)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle<{ components: Array<{ code: string; label: string; amountKobo: number }> }>();

  if (current?.components?.length) {
    const naira = (code: string) => Number(current.components.find((c) => c.code === code)?.amountKobo ?? 0) / 100;
    const known = new Set(["basic", "housing", "transport", "medical"]);
    return NextResponse.json(
      {
        compensation: {
          basic: naira("basic"),
          housing: naira("housing"),
          transport: naira("transport"),
          medical: naira("medical"),
          otherAllowances: current.components
            .filter((c) => !known.has(c.code))
            .map((c) => ({ label: c.label, amount: Number(c.amountKobo) / 100 })),
          totalGross: current.components.reduce((sum, c) => sum + Number(c.amountKobo), 0) / 100,
          bonusStructure: employee.compensation?.bonusStructure ?? [],
        },
      },
      { headers },
    );
  }

  const legacy = employee.compensation;
  if (!legacy || !Object.keys(legacy).length) return NextResponse.json({ compensation: null }, { headers });

  return NextResponse.json(
    {
      compensation: {
        basic: legacy.basic ?? 0,
        housing: legacy.housing ?? 0,
        transport: legacy.transport ?? 0,
        medical: legacy.medical ?? 0,
        otherAllowances: legacy.otherAllowances ?? [],
        totalGross: legacy.totalGross ?? 0,
        bonusStructure: legacy.bonusStructure ?? [],
      },
    },
    { headers },
  );
}
