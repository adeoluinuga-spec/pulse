import { getSupabase } from "@/lib/supabase";
import type { Notification } from "@/types";

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    type: (row.type as Notification["type"]) ?? "info",
    title: row.title as string,
    body: (row.body as string) ?? "",
    date: ((row.created_at as string) ?? "").slice(0, 10),
    read: (row.is_read as boolean) ?? false,
  };
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthEmployeeId(): Promise<string | null> {
  const supabase = getSupabase();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", authUser.id)
    .single();

  return (data as { id: string } | null)?.id ?? null;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getMyNotifications(limit = 30): Promise<Notification[]> {
  try {
    const empId = await getAuthEmployeeId();
    if (!empId) return [];

    const { data, error } = await getSupabase()
      .from("notifications")
      .select("*")
      .eq("employee_id", empId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) return [];
    return (data as Record<string, unknown>[]).map(mapNotification);
  } catch {
    return [];
  }
}

export async function markAllRead(): Promise<boolean> {
  try {
    const { error } = await getSupabase().rpc("mark_all_notifications_read");
    return !error;
  } catch {
    return false;
  }
}

export async function markOneRead(notificationId: string): Promise<boolean> {
  try {
    const empId = await getAuthEmployeeId();
    if (!empId) return false;

    const { error } = await getSupabase()
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("employee_id", empId);

    return !error;
  } catch {
    return false;
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const { data, error } = await getSupabase().rpc(
      "get_unread_notification_count",
    );
    if (error) return 0;
    return (data as number) ?? 0;
  } catch {
    return 0;
  }
}

export async function createNotification(
  employeeId: string,
  notification: {
    title: string;
    body: string;
    type: Notification["type"];
    actionUrl?: string;
  },
): Promise<boolean> {
  try {
    const { error } = await getSupabase().from("notifications").insert({
      employee_id: employeeId,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      action_url: notification.actionUrl ?? null,
      is_read: false,
    });

    return !error;
  } catch {
    return false;
  }
}
