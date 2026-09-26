-- Tenant salary formulas and the annual gross agreed for each new pay record.
-- Existing compensation and approved runs remain unchanged.
alter table public.payroll_settings
  add column if not exists salary_structure jsonb,
  add column if not exists salary_structure_version integer not null default 0;

alter table public.employee_compensation
  add column if not exists annual_gross_kobo bigint,
  add column if not exists salary_structure_version integer;

alter table public.employee_compensation
  add constraint employee_compensation_annual_gross_positive
  check (annual_gross_kobo is null or annual_gross_kobo > 0);
