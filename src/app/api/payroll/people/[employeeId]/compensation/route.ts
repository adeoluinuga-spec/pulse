import { toPayrollProfile, validateCompensation, type ProfileRow } from "@/lib/payrollInputs";
import { splitAnnualGross } from "@/lib/payrollSalaryStructure";
import { calculatePayLine } from "@/lib/payrollGrossToNet";
import { ruleSetFor } from "@/lib/payrollRules";
import { databaseFailure, employeeInOrg, loadSettings, logEvent, payrollContext, reply, handled } from "@/lib/payrollServer";

/**
 * Adding and withdrawing compensation records.
 *
 * There is no edit. A pay rise is a new record from the date it takes effect,
 * so any past month can still be recalculated from what was true then. A record
 * can be withdrawn only while no approved run has relied on it — the database
 * refuses otherwise, and that refusal is passed straight back.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ employeeId: string }> };

async function postHandler(request: Request, { params }: Params) {
  const { employeeId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canPrepare) return reply({ error: "Only somebody who prepares payroll can set pay." }, 403);

  const person = await employeeInOrg(admin, orgId, employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const automatic = body.mode === "automatic";
  const settings = await loadSettings(admin, orgId);
  let annualGrossKobo: number | null = null;
  let structureVersion: number | null = null;
  let input: Record<string, unknown> = body;
  if (automatic) {
    if (!settings.salaryStructure?.length) return reply({ error: "Set up this organisation's salary structure before entering annual gross." }, 422);
    if (body.structureVersion !== settings.salaryStructureVersion) return reply({ error: "The salary structure changed. Refresh this page and review the new breakdown." }, 409);
    try {
      const split = splitAnnualGross(Number(body.annualGross), settings.salaryStructure);
      annualGrossKobo = split.annualGrossKobo;
      structureVersion = settings.salaryStructureVersion;
      input = { ...body, components: split.components.map((component) => ({ ...component, amount: component.amountKobo / 100 })) };
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "Annual gross is invalid." }, 422);
    }
  }
  const validation = validateCompensation(input);
  if (!validation.ok) return reply({ error: "This pay record is not complete.", errors: validation.errors }, 422);

  if (body.previewOnly === true) {
    const { data: profile, error: profileError } = await admin.from("employee_payroll_profiles")
      .select("*").eq("org_id", orgId).eq("employee_id", employeeId).maybeSingle<ProfileRow>();
    if (profileError) return databaseFailure(profileError);
    const date = validation.record.effectiveFrom;
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const line = calculatePayLine({
      employee: {
        employeeId, name: person.name ?? "Employee", components: validation.record.components,
        adjustments: [], profile: toPayrollProfile(profile, settings.defaultTaxState), joinDate: null, exitDate: null,
      },
      period: { year, month }, ruleSet: ruleSetFor(date), settings: settings.settings,
    });
    return reply({
      preview: {
        annualGrossKobo, monthlyGrossKobo: line.grossKobo, netKobo: line.netKobo,
        deductions: line.deductions, blockers: line.blockers, components: validation.record.components,
        salaryStructureVersion: structureVersion,
      },
    });
  }

  const { data, error } = await admin
    .from("employee_compensation")
    .insert({
      org_id: orgId,
      employee_id: employeeId,
      effective_from: validation.record.effectiveFrom,
      components: validation.record.components,
      ...(automatic ? { annual_gross_kobo: annualGrossKobo, salary_structure_version: structureVersion } : {}),
      grade: validation.record.grade,
      reason: validation.record.reason,
      created_by: actor.employeeId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "This person already has a pay record starting on that date. Choose another date, or withdraw that record first." }, 409);
    }
    return databaseFailure(error);
  }

  await logEvent(admin, {
    orgId,
    runId: null,
    actorId: actor.employeeId,
    action: "compensation_added",
    payload: { employeeId, name: person.name, effectiveFrom: validation.record.effectiveFrom, reason: validation.record.reason, annualGrossKobo, salaryStructureVersion: structureVersion },
  });

  return reply({ id: data.id }, 201);
}

async function deleteHandler(request: Request, { params }: Params) {
  const { employeeId } = await params;
  const auth = await payrollContext();
  if (!auth.ok) return auth.response;
  const { admin, orgId, actor, can } = auth.ctx;

  if (!can.canPrepare) return reply({ error: "Only somebody who prepares payroll can change pay." }, 403);

  const recordId = new URL(request.url).searchParams.get("id");
  if (!recordId) return reply({ error: "Say which pay record to withdraw." }, 400);

  const person = await employeeInOrg(admin, orgId, employeeId);
  if (!person) return reply({ error: "That person is not in your organisation." }, 404);

  const { data, error } = await admin
    .from("employee_compensation")
    .delete()
    .eq("id", recordId)
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .select("id, effective_from");

  if (error) return databaseFailure(error);
  if (!data?.length) return reply({ error: "That pay record was not found." }, 404);

  await logEvent(admin, {
    orgId,
    runId: null,
    actorId: actor.employeeId,
    action: "compensation_withdrawn",
    payload: { employeeId, name: person.name, effectiveFrom: data[0].effective_from },
  });

  return reply({ withdrawn: true });
}

export const POST = handled(postHandler);
export const DELETE = handled(deleteHandler);
