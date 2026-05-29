import { getSupabase } from "@/lib/supabase";
import { employees } from "@/data/mockData";
import type { LeaveRequest, LeaveBalance } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    type: (row.leave_type as string) ?? "",
    startDate: (row.start_date as string) ?? "",
    endDate: (row.end_date as string) ?? "",
    days: (row.days_taken as number) ?? 0,
    status: (row.status as LeaveRequest["status"]) ?? "pending",
    reason: (row.note as string) ?? "",
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

export async function getLeaveHistory(): Promise<LeaveRequest[]> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    const { data, error } = await getSupabase()
      .from("leave_requests")
      .select("*")
      .eq("employee_id", emp.id)
      .order("submitted_at", { ascending: false });

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapLeaveRequest);
  } catch {
    return [];
  }
}

export async function getLeaveBalance(
  employeeId?: string,
): Promise<LeaveBalance | null> {
  try {
    const supabase = getSupabase();
    let id = employeeId;
    if (!id) {
      const emp = await getAuthEmployee();
      id = emp?.id;
    }
    if (!id) return null;

    // Aggregate from leave_requests: count approved days per type
    const { data, error } = await supabase
      .from("leave_requests")
      .select("leave_type, days_taken")
      .eq("employee_id", id)
      .eq("status", "approved");

    if (error) return null;

    const used: Record<string, number> = {};
    for (const row of (data ?? []) as { leave_type: string; days_taken: number }[]) {
      used[row.leave_type.toLowerCase()] =
        (used[row.leave_type.toLowerCase()] ?? 0) + (row.days_taken ?? 0);
    }

    // Default allocations — in production these would come from an org config table
    const alloc = { annual: 20, sick: 10, compassionate: 3 };

    return {
      annual: {
        total: alloc.annual,
        used: used["annual"] ?? 0,
        remaining: alloc.annual - (used["annual"] ?? 0),
      },
      sick: {
        total: alloc.sick,
        used: used["sick"] ?? 0,
        remaining: alloc.sick - (used["sick"] ?? 0),
      },
      compassionate: {
        total: alloc.compassionate,
        used: used["compassionate"] ?? 0,
        remaining: alloc.compassionate - (used["compassionate"] ?? 0),
      },
    };
  } catch {
    return null;
  }
}

export async function submitLeaveRequest(request: {
  leaveType: string;
  startDate: string;
  endDate: string;
  daysTaken: number;
  note?: string;
}): Promise<string | null> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return null;

    const { data, error } = await getSupabase()
      .from("leave_requests")
      .insert({
        employee_id: emp.id,
        org_id: emp.orgId,
        leave_type: request.leaveType,
        start_date: request.startDate,
        end_date: request.endDate,
        days_taken: request.daysTaken,
        note: request.note ?? null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

export async function approveLeave(requestId: string): Promise<boolean> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return false;

    const { error } = await getSupabase()
      .from("leave_requests")
      .update({ status: "approved", approved_by: emp.id })
      .eq("id", requestId);

    return !error;
  } catch {
    return false;
  }
}

export async function declineLeave(
  requestId: string,
  reason: string,
): Promise<boolean> {
  try {
    const { error } = await getSupabase()
      .from("leave_requests")
      .update({ status: "rejected", decline_reason: reason })
      .eq("id", requestId);

    return !error;
  } catch {
    return false;
  }
}

export async function getTeamLeaveCalendar(): Promise<
  Array<LeaveRequest & { employeeName: string }>
> {
  try {
    const emp = await getAuthEmployee();
    if (!emp) return [];

    const { data: directReports } = await getSupabase()
      .from("employees")
      .select("id, name")
      .eq("line_manager_id", emp.id);

    if (!directReports?.length) return [];
    const reportIds = (directReports as { id: string; name: string }[]).map(
      (r) => r.id,
    );
    const nameMap = Object.fromEntries(
      (directReports as { id: string; name: string }[]).map((r) => [
        r.id,
        r.name,
      ]),
    );

    const { data, error } = await getSupabase()
      .from("leave_requests")
      .select("*")
      .in("employee_id", reportIds)
      .in("status", ["approved", "pending"])
      .order("start_date", { ascending: true });

    if (error || !data?.length) return [];

    return (data as Record<string, unknown>[]).map((row) => ({
      ...mapLeaveRequest(row),
      employeeName: nameMap[row.employee_id as string] ?? "Unknown",
    }));
  } catch {
    return [];
  }
}

// ── Mock fallbacks ─────────────────────────────────────────────────────────────

export function getMockLeaveForUser(employeeId: string): {
  balance: LeaveBalance;
  history: LeaveRequest[];
} {
  const emp = employees.find((e) => e.id === employeeId);
  return {
    balance: emp?.leaveBalance ?? {
      annual: { total: 20, used: 0, remaining: 20 },
      sick: { total: 10, used: 0, remaining: 10 },
      compassionate: { total: 3, used: 0, remaining: 3 },
    },
    history: emp?.leaveHistory ?? [],
  };
}
