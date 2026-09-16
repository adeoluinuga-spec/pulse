// Generates PAYROLL_TAX_EXAMPLES.md from the payroll engine itself.
//
// The worked examples a payroll professional signs off must be the engine's
// actual output, not a description written beside it — otherwise the document
// can be right while the code is wrong. Regenerate after any rule change:
//
//   node --experimental-strip-types scripts/payroll/examples.mjs
//   node scripts/md-to-pdf.mjs PAYROLL_TAX_EXAMPLES.pdf "Pulse payroll — tax examples" PAYROLL_TAX_EXAMPLES.md
import { writeFile } from "node:fs/promises";
import { calculatePayLine } from "../../src/lib/payrollGrossToNet.ts";
import { RULE_SETS, ruleSetById } from "../../src/lib/payrollRules.ts";
import { formatNaira } from "../../src/lib/payrollMoney.ts";

const N = (naira) => Math.round(naira * 100);
const money = (kobo) => formatNaira(kobo);
const pct = (bps) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;

const NTA = ruleSetById("ng-nta-2026");
const PITA = ruleSetById("ng-pita-2024");
const PITA_ON_GROSS = { ...PITA, paye: { ...PITA.paye, consolidatedRelief: { ...PITA.paye.consolidatedRelief, base: "gross" } } };
const ALL_ON = { pensionEnabled: true, nhfEnabled: true, nsitfEnabled: true, itfEnabled: true };

const component = (code, label, naira, pensionable = ["basic", "housing", "transport"].includes(code)) => ({
  code, label, amountKobo: N(naira), taxable: true, pensionable, isBasic: code === "basic",
});

const standard = [component("basic", "Basic salary", 300_000), component("housing", "Housing allowance", 150_000), component("transport", "Transport allowance", 50_000)];

const profile = (overrides = {}) => ({
  taxState: "Lagos", annualRentKobo: 0, nhisMonthlyKobo: 0, lifeAssuranceAnnualKobo: 0,
  pensionExempt: false, nhfExempt: false, hasBankDetails: true, hasPensionDetails: true, hasTin: true, ...overrides,
});

const SCENARIOS = [
  {
    id: "A", title: "Reference case — NTA 2026",
    explain: "Basic ₦300,000, housing ₦150,000, transport ₦50,000. Full month, no rent declared.",
    ruleSet: NTA, period: { year: 2026, month: 9 },
    employee: { components: standard, adjustments: [], profile: profile(), joinDate: "2020-01-01", exitDate: null },
  },
  {
    id: "B", title: "Rent relief — NTA 2026",
    explain: "As A, with ₦1,200,000 annual rent declared. Relief is 20% of rent, capped at ₦500,000.",
    ruleSet: NTA, period: { year: 2026, month: 9 },
    employee: { components: standard, adjustments: [], profile: profile({ annualRentKobo: N(1_200_000) }), joinDate: "2020-01-01", exitDate: null },
  },
  {
    id: "C", title: "Minimum wage earner — NTA 2026",
    explain: "Basic ₦70,000 only (₦840,000 a year, the national minimum wage). Exempt from PAYE; pension and NHF still deducted.",
    ruleSet: NTA, period: { year: 2026, month: 9 },
    employee: { components: [component("basic", "Basic salary", 70_000)], adjustments: [], profile: profile(), joinDate: "2020-01-01", exitDate: null },
  },
  {
    id: "D", title: "High earner reaching the 25% band — NTA 2026",
    explain: "Basic ₦3,000,000, housing ₦2,000,000, transport ₦1,000,000.",
    ruleSet: NTA, period: { year: 2026, month: 9 },
    employee: {
      components: [component("basic", "Basic salary", 3_000_000), component("housing", "Housing allowance", 2_000_000), component("transport", "Transport allowance", 1_000_000)],
      adjustments: [], profile: profile(), joinDate: "2020-01-01", exitDate: null,
    },
  },
  {
    id: "F", title: "One-off bonus — NTA 2026",
    explain: "As A, plus a taxable, non-pensionable bonus of ₦1,000,000 paid this month. Taxed as the increase in annual tax it causes, all in this month.",
    ruleSet: NTA, period: { year: 2026, month: 9 },
    employee: {
      components: standard,
      adjustments: [{ id: "bonus", label: "Performance bonus", kind: "earning", amountKobo: N(1_000_000), taxable: true, pensionable: false }],
      profile: profile(), joinDate: "2020-01-01", exitDate: null,
    },
  },
  {
    id: "G", title: "Joiner mid-month — NTA 2026",
    explain: "As A, joining on 16 September 2026: paid for 15 of 30 calendar days. Annual tax is worked out on the full-month position, then prorated.",
    ruleSet: NTA, period: { year: 2026, month: 9 },
    employee: { components: standard, adjustments: [], profile: profile(), joinDate: "2026-09-16", exitDate: null },
  },
  {
    id: "E", title: "Pre-2026 PITA — CRA on gross less exempt items",
    explain: "As A, paid in June 2025 under PITA. Consolidated Relief Allowance computed on gross income after pension and NHF (Pulse's current reading of the Finance Act 2020).",
    ruleSet: PITA, period: { year: 2025, month: 6 },
    employee: { components: standard, adjustments: [], profile: profile(), joinDate: "2020-01-01", exitDate: null },
  },
  {
    id: "E2", title: "Pre-2026 PITA — CRA on gross income (alternative reading)",
    explain: "Identical to E, but with CRA computed on gross income before pension and NHF. Shown only so the two readings can be compared.",
    ruleSet: PITA_ON_GROSS, period: { year: 2025, month: 6 },
    employee: { components: standard, adjustments: [], profile: profile(), joinDate: "2020-01-01", exitDate: null },
  },
  {
    id: "M", title: "Pre-2026 PITA — minimum tax",
    explain: "Basic ₦75,000 only, with ₦500,000 annual life assurance declared. Banded tax falls below 1% of gross income, so minimum tax applies.",
    ruleSet: PITA, period: { year: 2025, month: 6 },
    employee: {
      components: [component("basic", "Basic salary", 75_000)], adjustments: [],
      profile: profile({ lifeAssuranceAnnualKobo: N(500_000) }), joinDate: "2020-01-01", exitDate: null,
    },
  },
];

const monthName = (m) => new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });

function bandTable(bands) {
  let floor = 0;
  const rows = bands.map((band) => {
    const from = floor;
    const to = band.widthKobo === null ? null : floor + band.widthKobo;
    floor = to ?? floor;
    return `| ${money(from)} | ${to === null ? "and above" : money(to)} | ${pct(band.rateBps)} |`;
  });
  return ["| From | To | Rate |", "|---|---|---|", ...rows].join("\n");
}

function scenarioSection(scenario) {
  const line = calculatePayLine({
    employee: { employeeId: scenario.id, name: `Example ${scenario.id}`, ...scenario.employee },
    period: scenario.period,
    ruleSet: scenario.ruleSet,
    settings: ALL_ON,
  });
  const w = line.taxWorking;
  const out = [];

  out.push(`## ${scenario.id}. ${scenario.title}`, "", scenario.explain, "");
  out.push(`**Period:** ${monthName(scenario.period.month)} ${scenario.period.year} · **Rules:** \`${scenario.ruleSet.id}\` · **Days paid:** ${line.daysPaid} of ${line.daysInPeriod}`, "");

  out.push("### Annual tax working", "");
  out.push("| Step | Amount |", "|---|---|");
  out.push(`| Annual gross income (taxable recurring pay × 12${line.payeOneOffKobo ? ", plus the one-off" : ""}) | ${money(w.annualGrossKobo)} |`);
  for (const relief of w.reliefs) out.push(`| less ${relief.label} | (${money(relief.amountKobo)}) |`);
  out.push(`| **Chargeable income** | **${money(w.chargeableKobo)}** |`, "");

  if (w.bands.length) {
    out.push("| Band | Rate | Tax |", "|---|---|---|");
    for (const band of w.bands) {
      out.push(`| ${money(band.fromKobo)} – ${band.toKobo === null ? "above" : money(band.toKobo)} | ${pct(band.rateBps)} | ${money(band.taxKobo)} |`);
    }
    out.push(`| **Banded tax** | | **${money(w.bandedTaxKobo)}** |`, "");
  }

  const notes = [];
  if (w.exempt) notes.push(`Annual gross ${money(w.annualGrossKobo)} is at or below the minimum-wage threshold of ${money(scenario.ruleSet.minimumWageExemptionAnnualKobo)}, so **no PAYE is charged**.`);
  if (w.minimumTaxKobo !== null) notes.push(`Minimum tax (${pct(scenario.ruleSet.paye.minimumTaxBps)} of gross) is ${money(w.minimumTaxKobo)}${w.minimumTaxApplied ? " — **higher than banded tax, so it applies**" : ", lower than banded tax, so it does not apply"}.`);
  notes.push(`**Annual tax: ${money(w.annualTaxKobo)}.**`);
  if (line.payeOneOffKobo) {
    notes.push(`Of this month's PAYE, ${money(line.payeRecurringKobo)} is the recurring monthly share and ${money(line.payeOneOffKobo)} is the extra annual tax caused by the one-off.`);
  } else if (line.daysPaid < line.daysInPeriod) {
    notes.push(`Monthly PAYE = annual tax × ${line.daysPaid} ÷ (12 × ${line.daysInPeriod}) = ${money(line.payeKobo)}.`);
  } else {
    notes.push(`Monthly PAYE = annual tax ÷ 12 = ${money(line.payeKobo)}.`);
  }
  out.push(...notes.map((n) => `- ${n}`), "");

  out.push("### Payslip", "");
  out.push("| | Amount |", "|---|---|");
  for (const e of line.earnings) out.push(`| ${e.label} | ${money(e.amountKobo)} |`);
  out.push(`| **Gross pay** | **${money(line.grossKobo)}** |`);
  for (const d of line.deductions) out.push(`| less ${d.label} | (${money(d.amountKobo)}) |`);
  out.push(`| **Net pay** | **${money(line.netKobo)}** |`, "");
  out.push("| Employer costs | Amount |", "|---|---|");
  for (const c of line.employer) out.push(`| ${c.label} | ${money(c.amountKobo)} |`);
  out.push(`| **Total cost to employer** | **${money(line.employerCostKobo)}** |`, "");

  out.push(`- [ ] **Example ${scenario.id} checked.** Correct as shown / needs correction: ______________________`, "", "---", "");
  return { markdown: out.join("\n"), line };
}

const parts = [];
parts.push(
  "# Pulse payroll — worked tax examples",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/payroll/examples.mjs\` from the payroll engine's own output. Nothing below was typed by hand, so what is checked here is exactly what Pulse calculates.`,
  "",
  "> **Status: UNVERIFIED.** No real payroll should be run until every example below has been checked against current law and state IRS guidance, and the points in *What most needs checking* have been answered.",
  "",
  "## What most needs checking",
  "",
  "These are the places where the law is ambiguous, recently changed, or where Pulse had to choose a method. Each is worth an explicit answer.",
  "",
  "1. **PITA Consolidated Relief Allowance base (examples E and E2).** Pulse computes CRA on gross income *less* pension, NHF, NHIS and life assurance, reading the Finance Act 2020 amendment that way. The alternative reading — CRA on gross income — is shown in E2. They differ by about ₦2,280 a month on a ₦500,000 salary. Which is correct? (Only matters for periods up to December 2025.)",
  "2. **PITA minimum tax (example M).** Pulse charges 1% of gross income whenever banded tax is lower than that. Is that the right trigger?",
  "3. **NTA minimum-wage exemption (example C).** Pulse exempts anyone whose annual gross is at or below ₦840,000 (₦70,000 × 12) from PAYE, but still deducts pension and NHF. Is the threshold right, and should pension and NHF still apply?",
  "4. **NHF.** Pulse deducts 2.5% of basic salary from every employee who is not marked exempt. Does NHF apply to everyone, or only above a threshold?",
  "5. **Pension base.** Pulse takes 8% (employee) and 10% (employer) of basic + housing + transport. Should any other allowance be pensionable?",
  "6. **Bonuses (example F).** A one-off is taxed as the increase in *annual* tax it causes, charged entirely in the month it is paid. Is this acceptable to the relevant state IRS, or is a different method expected?",
  "7. **Proration (example G).** Pay is prorated by calendar days. PAYE is worked out on the full monthly salary and then prorated the same way. Is calendar-day proration acceptable, or should working days be used?",
  "8. **NSITF and ITF.** Both are charged to the employer at 1% of monthly gross pay. ITF only applies to employers with five or more staff or a large enough turnover; Pulse leaves that decision to a setting. Are both bases right?",
  "9. **Reliefs Pulse treats as declared rather than deducted.** Rent (NTA) and life assurance are reliefs the employee declares; nothing is deducted from pay. NHIS is both deducted and relieved. Is that the right treatment?",
  "",
  "## Rule sets",
  "",
);

for (const set of RULE_SETS) {
  parts.push(`### \`${set.id}\` — ${set.label}`, "");
  parts.push(`In force **${set.effectiveFrom}** to **${set.effectiveTo ?? "further notice"}**, chosen by the last day of the pay period. Verification: **${set.verification}**.`, "");
  parts.push(`Source relied on: ${set.source}.`, "");
  parts.push(bandTable(set.paye.bands), "");
  const rows = [
    `| PAYE regime | ${set.paye.regime === "nta" ? "Nigeria Tax Act 2025" : "Personal Income Tax Act"} |`,
    `| Minimum-wage exemption (annual gross) | ${money(set.minimumWageExemptionAnnualKobo)} |`,
    `| Pension | employee ${pct(set.pension.employeeBps)}, employer ${pct(set.pension.employerBps)} |`,
    `| NHF | employee ${pct(set.nhf.employeeBps)} of basic |`,
    `| NSITF | employer ${pct(set.nsitf.employerBps)} of gross |`,
    `| ITF | employer ${pct(set.itf.employerBps)} of gross |`,
  ];
  if (set.paye.regime === "pita") {
    const cra = set.paye.consolidatedRelief;
    rows.push(`| Consolidated Relief Allowance | higher of ${money(cra.fixedKobo)} or ${pct(cra.percentBps)} of base, plus ${pct(cra.additionalPercentBps)} of base; base = ${cra.base === "gross" ? "gross income" : "gross income less exempt items"} |`);
    rows.push(`| Minimum tax | ${pct(set.paye.minimumTaxBps)} of gross income |`);
  } else {
    rows.push(`| Rent relief | ${pct(set.paye.rentRelief.percentBps)} of annual rent, capped at ${money(set.paye.rentRelief.capKobo)} |`);
    rows.push("| Consolidated Relief Allowance | abolished |");
    rows.push("| Minimum tax | none |");
  }
  parts.push("| Item | Rule |", "|---|---|", ...rows, "");
}

parts.push("# Worked examples", "");
for (const scenario of SCENARIOS) parts.push(scenarioSection(scenario).markdown);

parts.push(
  "## Sign-off",
  "",
  "- [ ] All examples checked, or corrections listed against each.",
  "- [ ] Each question in *What most needs checking* answered.",
  "",
  "Checked by: ______________________  Role: ______________________  Date: ____________",
  "",
  "Once signed off, the rule sets are changed from `unverified` to `verified` in `src/lib/payrollRules.ts`, and this document regenerated.",
  "",
);

await writeFile("PAYROLL_TAX_EXAMPLES.md", parts.join("\n"));
console.log(`Wrote PAYROLL_TAX_EXAMPLES.md with ${SCENARIOS.length} worked examples across ${RULE_SETS.length} rule sets.`);
