import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface NotificationInput {
  employeeId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string;
  email?: {
    recipientEmail: string;
    recipientName: string;
    data?: Record<string, string>;
  };
}

export async function sendNotification(input: NotificationInput): Promise<void> {
  const admin = getAdminClient();

  // Persist in-app notification
  await admin.from("notifications").insert({
    employee_id: input.employeeId,
    title: input.title,
    body: input.body,
    type: input.type,
    action_url: input.actionUrl ?? null,
  });

  // Fire email via Edge Function (non-blocking — we don't throw on email failure)
  if (input.email) {
    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`;
    try {
      await fetch(edgeFnUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "x-pulse-secret": process.env.PULSE_EDGE_SECRET ?? "",
        },
        body: JSON.stringify({
          type: input.type,
          recipientEmail: input.email.recipientEmail,
          recipientName: input.email.recipientName,
          data: input.email.data ?? {},
        }),
      });
    } catch {
      // Email failure should never break the calling flow
    }
  }
}
