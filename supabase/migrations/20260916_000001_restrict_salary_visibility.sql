-- SALARIES ARE NOT PUBLIC WITHIN AN ORGANISATION
--
-- `employees_read_same_org` lets every signed-in employee read every colleague's
-- row, and the row carries `compensation`: basic, housing, transport, medical,
-- total gross and bonus structure. 07_security_fixes stopped people *editing*
-- their own pay; nothing stopped them *reading* everyone else's, straight from
-- the browser with the public anon key.
--
-- Row-level security cannot hide one column, so the fix is a column grant:
-- the browser roles lose table-wide SELECT and get it back on every column
-- except `compensation`. Salary is then reachable only through the server,
-- where the payroll routes decide who may see whose.
--
-- APPLY ORDER MATTERS. Deploy the application first: the profile loader used to
-- `select("*")` on the signed-in user's own row, and `*` includes the revoked
-- column, so running this against the old code fails every login. The new code
-- selects named columns and fetches its own pay from /api/payroll/me.
--
-- MAINTENANCE NOTE. A column added to `employees` after this migration is NOT
-- readable from the browser until it is granted. That is deliberate — new
-- columns on a table holding pay data should be private until someone decides
-- otherwise — but it will look like a bug the first time it happens:
--
--     grant select (new_column) on public.employees to authenticated;
--
-- Nothing is dropped or retyped. The data stays where it is.

do $$
declare
  readable text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into readable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name <> 'compensation';

  if readable is null then
    raise exception 'public.employees has no columns to grant; refusing to revoke access.';
  end if;

  revoke select on public.employees from anon, authenticated;
  execute format('grant select (%s) on public.employees to authenticated', readable);
end $$;

-- The server still reads everything.
grant select on public.employees to service_role;
