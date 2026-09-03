const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

(async () => {
  const orgId = 'ac0a9bf7-9342-428c-bca1-d846f62da717';
  const email = 'adeolu@stuartdavidson.org';

  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
  if (usersErr) throw usersErr;

  const authUser = (usersData.users || []).find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (!authUser) throw new Error(`No auth user found for ${email}`);

  const { data: rows, error: rowsErr } = await supabase
    .from('employees')
    .select('id,name,email,org_id,platform_role,user_id,department,team,onboarding_completed,created_at')
    .eq('org_id', orgId)
    .eq('email', email)
    .order('created_at', { ascending: true });

  if (rowsErr) throw rowsErr;
  if (!rows || !rows.length) throw new Error(`No employee rows for ${email}`);

  const canonical = (rows.filter((r) => r.user_id === authUser.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]) || rows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const staleIds = rows.filter((r) => r.id !== canonical.id).map((r) => r.id);

  const { error: updateErr } = await supabase
    .from('employees')
    .update({
      user_id: authUser.id,
      platform_role: 'executive_view',
      name: canonical.name || email.split('@')[0],
      department: canonical.department || null,
      team: canonical.team || null,
      onboarding_completed: canonical.onboarding_completed ?? false,
    })
    .eq('id', canonical.id);

  if (updateErr) throw updateErr;

  if (staleIds.length) {
    const { error: deleteErr } = await supabase.from('employees').delete().in('id', staleIds);
    if (deleteErr) throw deleteErr;
  }

  const { data: finalRows, error: finalErr } = await supabase
    .from('employees')
    .select('id,name,email,org_id,platform_role,user_id,department,team,onboarding_completed,created_at')
    .eq('org_id', orgId)
    .eq('email', email)
    .order('created_at', { ascending: true });

  if (finalErr) throw finalErr;

  console.log(JSON.stringify({
    canonicalId: canonical.id,
    authUserId: authUser.id,
    staleIds,
    finalRows,
  }, null, 2));
})();
