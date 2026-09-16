# Pulse payroll — worked tax examples

Generated 2026-09-16 by `scripts/payroll/examples.mjs` from the payroll engine's own output. Nothing below was typed by hand, so what is checked here is exactly what Pulse calculates.

> **Status: UNVERIFIED.** No real payroll should be run until every example below has been checked against current law and state IRS guidance, and the points in *What most needs checking* have been answered.

## What most needs checking

These are the places where the law is ambiguous, recently changed, or where Pulse had to choose a method. Each is worth an explicit answer.

1. **PITA Consolidated Relief Allowance base (examples E and E2).** Pulse computes CRA on gross income *less* pension, NHF, NHIS and life assurance, reading the Finance Act 2020 amendment that way. The alternative reading — CRA on gross income — is shown in E2. They differ by about ₦2,280 a month on a ₦500,000 salary. Which is correct? (Only matters for periods up to December 2025.)
2. **PITA minimum tax (example M).** Pulse charges 1% of gross income whenever banded tax is lower than that. Is that the right trigger?
3. **NTA minimum-wage exemption (example C).** Pulse exempts anyone whose annual gross is at or below ₦840,000 (₦70,000 × 12) from PAYE, but still deducts pension and NHF. Is the threshold right, and should pension and NHF still apply?
4. **NHF.** Pulse deducts 2.5% of basic salary from every employee who is not marked exempt. Does NHF apply to everyone, or only above a threshold?
5. **Pension base.** Pulse takes 8% (employee) and 10% (employer) of basic + housing + transport. Should any other allowance be pensionable?
6. **Bonuses (example F).** A one-off is taxed as the increase in *annual* tax it causes, charged entirely in the month it is paid. Is this acceptable to the relevant state IRS, or is a different method expected?
7. **Proration (example G).** Pay is prorated by calendar days. PAYE is worked out on the full monthly salary and then prorated the same way. Is calendar-day proration acceptable, or should working days be used?
8. **NSITF and ITF.** Both are charged to the employer at 1% of monthly gross pay. ITF only applies to employers with five or more staff or a large enough turnover; Pulse leaves that decision to a setting. Are both bases right?
9. **Reliefs Pulse treats as declared rather than deducted.** Rent (NTA) and life assurance are reliefs the employee declares; nothing is deducted from pay. NHIS is both deducted and relieved. Is that the right treatment?

## Rule sets

### `ng-pita-2020` — Personal Income Tax Act (as amended by Finance Act 2020), minimum wage ₦30,000

In force **2020-01-01** to **2024-07-28**, chosen by the last day of the pay period. Verification: **unverified**.

Source relied on: PITA 2011 as amended; Finance Act 2020; Pension Reform Act 2014; NHF Act; Employees' Compensation Act 2010; ITF Act.

| From | To | Rate |
|---|---|---|
| ₦0.00 | ₦300,000.00 | 7% |
| ₦300,000.00 | ₦600,000.00 | 11% |
| ₦600,000.00 | ₦1,100,000.00 | 15% |
| ₦1,100,000.00 | ₦1,600,000.00 | 19% |
| ₦1,600,000.00 | ₦3,200,000.00 | 21% |
| ₦3,200,000.00 | and above | 24% |

| Item | Rule |
|---|---|
| PAYE regime | Personal Income Tax Act |
| Minimum-wage exemption (annual gross) | ₦360,000.00 |
| Pension | employee 8%, employer 10% |
| NHF | employee 2.50% of basic |
| NSITF | employer 1% of gross |
| ITF | employer 1% of gross |
| Consolidated Relief Allowance | higher of ₦200,000.00 or 1% of base, plus 20% of base; base = gross income less exempt items |
| Minimum tax | 1% of gross income |

### `ng-pita-2024` — Personal Income Tax Act (as amended), minimum wage ₦70,000

In force **2024-07-29** to **2025-12-31**, chosen by the last day of the pay period. Verification: **unverified**.

Source relied on: As ng-pita-2020, with the National Minimum Wage (Amendment) Act 2024.

| From | To | Rate |
|---|---|---|
| ₦0.00 | ₦300,000.00 | 7% |
| ₦300,000.00 | ₦600,000.00 | 11% |
| ₦600,000.00 | ₦1,100,000.00 | 15% |
| ₦1,100,000.00 | ₦1,600,000.00 | 19% |
| ₦1,600,000.00 | ₦3,200,000.00 | 21% |
| ₦3,200,000.00 | and above | 24% |

| Item | Rule |
|---|---|
| PAYE regime | Personal Income Tax Act |
| Minimum-wage exemption (annual gross) | ₦840,000.00 |
| Pension | employee 8%, employer 10% |
| NHF | employee 2.50% of basic |
| NSITF | employer 1% of gross |
| ITF | employer 1% of gross |
| Consolidated Relief Allowance | higher of ₦200,000.00 or 1% of base, plus 20% of base; base = gross income less exempt items |
| Minimum tax | 1% of gross income |

### `ng-nta-2026` — Nigeria Tax Act 2025 (in force from 1 January 2026)

In force **2026-01-01** to **further notice**, chosen by the last day of the pay period. Verification: **unverified**.

Source relied on: Nigeria Tax Act 2025, Fourth Schedule; Pension Reform Act 2014; NHF Act; Employees' Compensation Act 2010; ITF Act.

| From | To | Rate |
|---|---|---|
| ₦0.00 | ₦800,000.00 | 0% |
| ₦800,000.00 | ₦3,000,000.00 | 15% |
| ₦3,000,000.00 | ₦12,000,000.00 | 18% |
| ₦12,000,000.00 | ₦25,000,000.00 | 21% |
| ₦25,000,000.00 | ₦50,000,000.00 | 23% |
| ₦50,000,000.00 | and above | 25% |

| Item | Rule |
|---|---|
| PAYE regime | Nigeria Tax Act 2025 |
| Minimum-wage exemption (annual gross) | ₦840,000.00 |
| Pension | employee 8%, employer 10% |
| NHF | employee 2.50% of basic |
| NSITF | employer 1% of gross |
| ITF | employer 1% of gross |
| Rent relief | 20% of annual rent, capped at ₦500,000.00 |
| Consolidated Relief Allowance | abolished |
| Minimum tax | none |

# Worked examples

## A. Reference case — NTA 2026

Basic ₦300,000, housing ₦150,000, transport ₦50,000. Full month, no rent declared.

**Period:** September 2026 · **Rules:** `ng-nta-2026` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦6,000,000.00 |
| less Pension contribution (employee) | (₦480,000.00) |
| less National Housing Fund | (₦90,000.00) |
| **Chargeable income** | **₦5,430,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦800,000.00 | 0% | ₦0.00 |
| ₦800,000.00 – ₦3,000,000.00 | 15% | ₦330,000.00 |
| ₦3,000,000.00 – ₦12,000,000.00 | 18% | ₦437,400.00 |
| **Banded tax** | | **₦767,400.00** |

- **Annual tax: ₦767,400.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦63,950.00.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦300,000.00 |
| Housing allowance | ₦150,000.00 |
| Transport allowance | ₦50,000.00 |
| **Gross pay** | **₦500,000.00** |
| less PAYE | (₦63,950.00) |
| less Pension (employee) | (₦40,000.00) |
| less National Housing Fund | (₦7,500.00) |
| **Net pay** | **₦388,550.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦50,000.00 |
| NSITF | ₦5,000.00 |
| ITF | ₦5,000.00 |
| **Total cost to employer** | **₦560,000.00** |

- [ ] **Example A checked.** Correct as shown / needs correction: ______________________

---

## B. Rent relief — NTA 2026

As A, with ₦1,200,000 annual rent declared. Relief is 20% of rent, capped at ₦500,000.

**Period:** September 2026 · **Rules:** `ng-nta-2026` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦6,000,000.00 |
| less Pension contribution (employee) | (₦480,000.00) |
| less National Housing Fund | (₦90,000.00) |
| less Rent relief | (₦240,000.00) |
| **Chargeable income** | **₦5,190,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦800,000.00 | 0% | ₦0.00 |
| ₦800,000.00 – ₦3,000,000.00 | 15% | ₦330,000.00 |
| ₦3,000,000.00 – ₦12,000,000.00 | 18% | ₦394,200.00 |
| **Banded tax** | | **₦724,200.00** |

- **Annual tax: ₦724,200.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦60,350.00.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦300,000.00 |
| Housing allowance | ₦150,000.00 |
| Transport allowance | ₦50,000.00 |
| **Gross pay** | **₦500,000.00** |
| less PAYE | (₦60,350.00) |
| less Pension (employee) | (₦40,000.00) |
| less National Housing Fund | (₦7,500.00) |
| **Net pay** | **₦392,150.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦50,000.00 |
| NSITF | ₦5,000.00 |
| ITF | ₦5,000.00 |
| **Total cost to employer** | **₦560,000.00** |

- [ ] **Example B checked.** Correct as shown / needs correction: ______________________

---

## C. Minimum wage earner — NTA 2026

Basic ₦70,000 only (₦840,000 a year, the national minimum wage). Exempt from PAYE; pension and NHF still deducted.

**Period:** September 2026 · **Rules:** `ng-nta-2026` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦840,000.00 |
| less Pension contribution (employee) | (₦67,200.00) |
| less National Housing Fund | (₦21,000.00) |
| **Chargeable income** | **₦751,800.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦800,000.00 | 0% | ₦0.00 |
| **Banded tax** | | **₦0.00** |

- Annual gross ₦840,000.00 is at or below the minimum-wage threshold of ₦840,000.00, so **no PAYE is charged**.
- **Annual tax: ₦0.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦0.00.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦70,000.00 |
| **Gross pay** | **₦70,000.00** |
| less PAYE | (₦0.00) |
| less Pension (employee) | (₦5,600.00) |
| less National Housing Fund | (₦1,750.00) |
| **Net pay** | **₦62,650.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦7,000.00 |
| NSITF | ₦700.00 |
| ITF | ₦700.00 |
| **Total cost to employer** | **₦78,400.00** |

- [ ] **Example C checked.** Correct as shown / needs correction: ______________________

---

## D. High earner reaching the 25% band — NTA 2026

Basic ₦3,000,000, housing ₦2,000,000, transport ₦1,000,000.

**Period:** September 2026 · **Rules:** `ng-nta-2026` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦72,000,000.00 |
| less Pension contribution (employee) | (₦5,760,000.00) |
| less National Housing Fund | (₦900,000.00) |
| **Chargeable income** | **₦65,340,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦800,000.00 | 0% | ₦0.00 |
| ₦800,000.00 – ₦3,000,000.00 | 15% | ₦330,000.00 |
| ₦3,000,000.00 – ₦12,000,000.00 | 18% | ₦1,620,000.00 |
| ₦12,000,000.00 – ₦25,000,000.00 | 21% | ₦2,730,000.00 |
| ₦25,000,000.00 – ₦50,000,000.00 | 23% | ₦5,750,000.00 |
| ₦50,000,000.00 – above | 25% | ₦3,835,000.00 |
| **Banded tax** | | **₦14,265,000.00** |

- **Annual tax: ₦14,265,000.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦1,188,750.00.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦3,000,000.00 |
| Housing allowance | ₦2,000,000.00 |
| Transport allowance | ₦1,000,000.00 |
| **Gross pay** | **₦6,000,000.00** |
| less PAYE | (₦1,188,750.00) |
| less Pension (employee) | (₦480,000.00) |
| less National Housing Fund | (₦75,000.00) |
| **Net pay** | **₦4,256,250.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦600,000.00 |
| NSITF | ₦60,000.00 |
| ITF | ₦60,000.00 |
| **Total cost to employer** | **₦6,720,000.00** |

- [ ] **Example D checked.** Correct as shown / needs correction: ______________________

---

## F. One-off bonus — NTA 2026

As A, plus a taxable, non-pensionable bonus of ₦1,000,000 paid this month. Taxed as the increase in annual tax it causes, all in this month.

**Period:** September 2026 · **Rules:** `ng-nta-2026` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12, plus the one-off) | ₦7,000,000.00 |
| less Pension contribution (employee) | (₦480,000.00) |
| less National Housing Fund | (₦90,000.00) |
| **Chargeable income** | **₦6,430,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦800,000.00 | 0% | ₦0.00 |
| ₦800,000.00 – ₦3,000,000.00 | 15% | ₦330,000.00 |
| ₦3,000,000.00 – ₦12,000,000.00 | 18% | ₦617,400.00 |
| **Banded tax** | | **₦947,400.00** |

- **Annual tax: ₦947,400.00.**
- Of this month's PAYE, ₦63,950.00 is the recurring monthly share and ₦180,000.00 is the extra annual tax caused by the one-off.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦300,000.00 |
| Housing allowance | ₦150,000.00 |
| Transport allowance | ₦50,000.00 |
| Performance bonus | ₦1,000,000.00 |
| **Gross pay** | **₦1,500,000.00** |
| less PAYE | (₦243,950.00) |
| less Pension (employee) | (₦40,000.00) |
| less National Housing Fund | (₦7,500.00) |
| **Net pay** | **₦1,208,550.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦50,000.00 |
| NSITF | ₦15,000.00 |
| ITF | ₦15,000.00 |
| **Total cost to employer** | **₦1,580,000.00** |

- [ ] **Example F checked.** Correct as shown / needs correction: ______________________

---

## G. Joiner mid-month — NTA 2026

As A, joining on 16 September 2026: paid for 15 of 30 calendar days. Annual tax is worked out on the full-month position, then prorated.

**Period:** September 2026 · **Rules:** `ng-nta-2026` · **Days paid:** 15 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦6,000,000.00 |
| less Pension contribution (employee) | (₦480,000.00) |
| less National Housing Fund | (₦90,000.00) |
| **Chargeable income** | **₦5,430,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦800,000.00 | 0% | ₦0.00 |
| ₦800,000.00 – ₦3,000,000.00 | 15% | ₦330,000.00 |
| ₦3,000,000.00 – ₦12,000,000.00 | 18% | ₦437,400.00 |
| **Banded tax** | | **₦767,400.00** |

- **Annual tax: ₦767,400.00.**
- Monthly PAYE = annual tax × 15 ÷ (12 × 30) = ₦31,975.00.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦150,000.00 |
| Housing allowance | ₦75,000.00 |
| Transport allowance | ₦25,000.00 |
| **Gross pay** | **₦250,000.00** |
| less PAYE | (₦31,975.00) |
| less Pension (employee) | (₦20,000.00) |
| less National Housing Fund | (₦3,750.00) |
| **Net pay** | **₦194,275.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦25,000.00 |
| NSITF | ₦2,500.00 |
| ITF | ₦2,500.00 |
| **Total cost to employer** | **₦280,000.00** |

- [ ] **Example G checked.** Correct as shown / needs correction: ______________________

---

## E. Pre-2026 PITA — CRA on gross less exempt items

As A, paid in June 2025 under PITA. Consolidated Relief Allowance computed on gross income after pension and NHF (Pulse's current reading of the Finance Act 2020).

**Period:** June 2025 · **Rules:** `ng-pita-2024` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦6,000,000.00 |
| less Pension contribution (employee) | (₦480,000.00) |
| less National Housing Fund | (₦90,000.00) |
| less Consolidated Relief Allowance | (₦1,286,000.00) |
| **Chargeable income** | **₦4,144,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦300,000.00 | 7% | ₦21,000.00 |
| ₦300,000.00 – ₦600,000.00 | 11% | ₦33,000.00 |
| ₦600,000.00 – ₦1,100,000.00 | 15% | ₦75,000.00 |
| ₦1,100,000.00 – ₦1,600,000.00 | 19% | ₦95,000.00 |
| ₦1,600,000.00 – ₦3,200,000.00 | 21% | ₦336,000.00 |
| ₦3,200,000.00 – above | 24% | ₦226,560.00 |
| **Banded tax** | | **₦786,560.00** |

- Minimum tax (1% of gross) is ₦60,000.00, lower than banded tax, so it does not apply.
- **Annual tax: ₦786,560.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦65,546.67.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦300,000.00 |
| Housing allowance | ₦150,000.00 |
| Transport allowance | ₦50,000.00 |
| **Gross pay** | **₦500,000.00** |
| less PAYE | (₦65,546.67) |
| less Pension (employee) | (₦40,000.00) |
| less National Housing Fund | (₦7,500.00) |
| **Net pay** | **₦386,953.33** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦50,000.00 |
| NSITF | ₦5,000.00 |
| ITF | ₦5,000.00 |
| **Total cost to employer** | **₦560,000.00** |

- [ ] **Example E checked.** Correct as shown / needs correction: ______________________

---

## E2. Pre-2026 PITA — CRA on gross income (alternative reading)

Identical to E, but with CRA computed on gross income before pension and NHF. Shown only so the two readings can be compared.

**Period:** June 2025 · **Rules:** `ng-pita-2024` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦6,000,000.00 |
| less Pension contribution (employee) | (₦480,000.00) |
| less National Housing Fund | (₦90,000.00) |
| less Consolidated Relief Allowance | (₦1,400,000.00) |
| **Chargeable income** | **₦4,030,000.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦300,000.00 | 7% | ₦21,000.00 |
| ₦300,000.00 – ₦600,000.00 | 11% | ₦33,000.00 |
| ₦600,000.00 – ₦1,100,000.00 | 15% | ₦75,000.00 |
| ₦1,100,000.00 – ₦1,600,000.00 | 19% | ₦95,000.00 |
| ₦1,600,000.00 – ₦3,200,000.00 | 21% | ₦336,000.00 |
| ₦3,200,000.00 – above | 24% | ₦199,200.00 |
| **Banded tax** | | **₦759,200.00** |

- Minimum tax (1% of gross) is ₦60,000.00, lower than banded tax, so it does not apply.
- **Annual tax: ₦759,200.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦63,266.67.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦300,000.00 |
| Housing allowance | ₦150,000.00 |
| Transport allowance | ₦50,000.00 |
| **Gross pay** | **₦500,000.00** |
| less PAYE | (₦63,266.67) |
| less Pension (employee) | (₦40,000.00) |
| less National Housing Fund | (₦7,500.00) |
| **Net pay** | **₦389,233.33** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦50,000.00 |
| NSITF | ₦5,000.00 |
| ITF | ₦5,000.00 |
| **Total cost to employer** | **₦560,000.00** |

- [ ] **Example E2 checked.** Correct as shown / needs correction: ______________________

---

## M. Pre-2026 PITA — minimum tax

Basic ₦75,000 only, with ₦500,000 annual life assurance declared. Banded tax falls below 1% of gross income, so minimum tax applies.

**Period:** June 2025 · **Rules:** `ng-pita-2024` · **Days paid:** 30 of 30

### Annual tax working

| Step | Amount |
|---|---|
| Annual gross income (taxable recurring pay × 12) | ₦900,000.00 |
| less Pension contribution (employee) | (₦72,000.00) |
| less National Housing Fund | (₦22,500.00) |
| less Life assurance premium | (₦500,000.00) |
| less Consolidated Relief Allowance | (₦261,100.00) |
| **Chargeable income** | **₦44,400.00** |

| Band | Rate | Tax |
|---|---|---|
| ₦0.00 – ₦300,000.00 | 7% | ₦3,108.00 |
| **Banded tax** | | **₦3,108.00** |

- Minimum tax (1% of gross) is ₦9,000.00 — **higher than banded tax, so it applies**.
- **Annual tax: ₦9,000.00.**
- Monthly PAYE = annual tax ÷ 12 = ₦750.00.

### Payslip

| | Amount |
|---|---|
| Basic salary | ₦75,000.00 |
| **Gross pay** | **₦75,000.00** |
| less PAYE | (₦750.00) |
| less Pension (employee) | (₦6,000.00) |
| less National Housing Fund | (₦1,875.00) |
| **Net pay** | **₦66,375.00** |

| Employer costs | Amount |
|---|---|
| Pension (employer) | ₦7,500.00 |
| NSITF | ₦750.00 |
| ITF | ₦750.00 |
| **Total cost to employer** | **₦84,000.00** |

- [ ] **Example M checked.** Correct as shown / needs correction: ______________________

---

## Sign-off

- [ ] All examples checked, or corrections listed against each.
- [ ] Each question in *What most needs checking* answered.

Checked by: ______________________  Role: ______________________  Date: ____________

Once signed off, the rule sets are changed from `unverified` to `verified` in `src/lib/payrollRules.ts`, and this document regenerated.
