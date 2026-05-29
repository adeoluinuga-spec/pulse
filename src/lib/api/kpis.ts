import { getSupabase } from "@/lib/supabase";
import { employees } from "@/data/mockData";
import type { KPI } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapKPI(row: Record<string, unknown>): KPI {
  return {
    id: row.id as string,
    name: row.name as string,
    target: (row.target_value as number) ?? 0,
    current: (row.current_value as number) ?? 0,
    unit: (row.unit as string) ?? "",
    weight: (row.weight as number) ?? 0,
    trend: (row.trend as KPI["trend"]) ?? "flat",
  };
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthEmployee(): Promise<{
  id: string;
  orgId: string;
} | null> {
  const supabase = getSupabase();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from("employees")
    .select("id, org_id")
    .eq("user_id", authUser.id)
    .single();

  if (!data) return null;
  const emp = data as { id: string; org_id: string };
  return { id: emp.id, orgId: emp.org_id };
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getMyKPIs(cycle?: string): Promise<KPI[]> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    let query = getSupabase()
      .from("kpis")
      .select("*")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false });

    if (cycle) query = query.eq("cycle", cycle);

    const { data, error } = await query;
    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapKPI);
  } catch {
    return [];
  }
}

export async function getKPIsForEmployee(
  employeeId: string,
  cycle?: string,
): Promise<KPI[]> {
  try {
    let query = getSupabase()
      .from("kpis")
      .select("*")
      .eq("employee_id", employeeId);

    if (cycle) query = query.eq("cycle", cycle);

    const { data, error } = await query;
    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapKPI);
  } catch {
    return [];
  }
}

export async function updateKPIValue(
  kpiId: string,
  currentValue: number,
  trend?: KPI["trend"],
): Promise<boolean> {
  try {
    const updates: Record<string, unknown> = { current_value: currentValue };
    if (trend) updates.trend = trend;

    const { error } = await getSupabase()
      .from("kpis")
      .update(updates)
      .eq("id", kpiId);

    return !error;
  } catch {
    return false;
  }
}

export async function createKPI(data: {
  employeeId: string;
  orgId: string;
  name: string;
  description?: string;
  targetValue: number;
  unit: string;
  weight: number;
  cycle?: string;
}): Promise<KPI | null> {
  try {
    const { data: row, error } = await getSupabase()
      .from("kpis")
      .insert({
        org_id: data.orgId,
        employee_id: data.employeeId,
        name: data.name,
        description: data.description ?? null,
        target_value: data.targetValue,
        current_value: 0,
        unit: data.unit,
        weight: data.weight,
        trend: "flat",
        cycle: data.cycle ?? null,
      })
      .select()
      .single();

    if (error || !row) return null;
    return mapKPI(row as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Mock fallbacks ─────────────────────────────────────────────────────────────

export function getMockKPIsForUser(employeeId: string): KPI[] {
  return employees.find((e) => e.id === employeeId)?.kpis ?? [];
}
