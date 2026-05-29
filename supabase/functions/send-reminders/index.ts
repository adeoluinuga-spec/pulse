import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (_req) => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // All employees who submitted a report in the last 7 days
  const { data: recentReports } = await admin
    .from("reports")
    .select("employee_id")
    .gte("submitted_at", sevenDaysAgo);

  const recentIds = new Set((recentReports ?? []).map((r: { employee_id: string }) => r.employee_id));

  // All active employees
  const { data: allEmployees, error } = await admin
    .from("employees")
    .select("id, name, email")
    .not("email", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Filter to those who haven't submitted
  const dueEmployees = (allEmployees ?? []).filter(
    (e: { id: string }) => !recentIds.has(e.id)
  );

  const results: Array<{ email: string; status: string }> = [];

  for (const emp of dueEmployees as Array<{ id: string; name: string; email: string }>) {
    // Send email via send-notification
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "report_due",
        recipientEmail: emp.email,
        recipientName: emp.name,
      }),
    });

    // Insert in-app notification record
    await admin.from("notifications").insert({
      employee_id: emp.id,
      title: "Your weekly report is due",
      body: "Your weekly check-in is due today by 5PM. It takes about 5 minutes.",
      type: "report_due",
      action_url: "/reports/submit",
    });

    results.push({ email: emp.email, status: emailRes.ok ? "sent" : "error" });
  }

  return new Response(
    JSON.stringify({ reminded: results.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
