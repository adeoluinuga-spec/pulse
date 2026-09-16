import test from "node:test";
import assert from "node:assert/strict";

import {
  compensationForPeriod,
  toPayrollProfile,
  validateCompensation,
  validateProfile,
  type CompensationRecord,
} from "./payrollInputs.ts";

const N = (naira: number) => Math.round(naira * 100);
const SEPT = { year: 2026, month: 9 };

const record = (effectiveFrom: string, basic: number, housing = 0): CompensationRecord => ({
  effectiveFrom,
  components: [
    { code: "basic", label: "Basic", amountKobo: N(basic), taxable: true, pensionable: true, isBasic: true },
    ...(housing ? [{ code: "housing", label: "Housing", amountKobo: N(housing), taxable: true, pensionable: true, isBasic: false }] : []),
  ],
});

test("one record in force all month passes straight through", () => {
  const result = compensationForPeriod({ records: [record("2025-01-01", 300_000, 150_000)], period: SEPT, joinDate: null, exitDate: null });
  assert.deepEqual(result.components.map((c) => [c.code, c.amountKobo]), [["basic", N(300_000)], ["housing", N(150_000)]]);
  assert.deepEqual(result.notes, []);
});

test("the latest record before the period wins over older ones", () => {
  const result = compensationForPeriod({
    records: [record("2024-01-01", 200_000), record("2026-01-01", 300_000)],
    period: SEPT,
    joinDate: null,
    exitDate: null,
  });
  assert.equal(result.components[0].amountKobo, N(300_000));
});

test("a rise on the 16th of a 30-day month pays half the month at each rate", () => {
  const result = compensationForPeriod({
    records: [record("2025-01-01", 300_000), record("2026-09-16", 400_000)],
    period: SEPT,
    joinDate: null,
    exitDate: null,
  });
  // 15 days at 300,000 and 15 at 400,000, as a full-month equivalent: 350,000.
  assert.equal(result.components[0].amountKobo, N(350_000));
  assert.match(result.notes[0], /Pay changed on 2026-09-16/);
});

test("a joiner whose pay starts the day they join is not prorated twice", () => {
  const result = compensationForPeriod({
    records: [record("2026-09-16", 300_000)],
    period: SEPT,
    joinDate: "2026-09-16",
    exitDate: null,
  });
  // Full-month equivalent stays 300,000; the engine then pays 15/30 of it.
  assert.equal(result.components[0].amountKobo, N(300_000));
  assert.deepEqual(result.notes, []);
});

test("days before any pay record exists are paid nothing, and said so", () => {
  const result = compensationForPeriod({ records: [record("2026-09-16", 300_000)], period: SEPT, joinDate: "2020-01-01", exitDate: null });
  // Employed all 30 days, pay only for the last 15: 150,000 full-month equivalent.
  assert.equal(result.components[0].amountKobo, N(150_000));
  assert.ok(result.notes.some((n) => /No pay was on record for 15 employed days/.test(n)));
});

test("a record that starts after the period contributes nothing", () => {
  const result = compensationForPeriod({ records: [record("2026-10-01", 300_000)], period: SEPT, joinDate: null, exitDate: null });
  assert.deepEqual(result.components, []);
});

test("nobody employed in the period gets no components", () => {
  const result = compensationForPeriod({ records: [record("2025-01-01", 300_000)], period: SEPT, joinDate: "2026-10-01", exitDate: null });
  assert.deepEqual(result.components, []);
});

test("a component added in a later record appears only for the days it existed", () => {
  const result = compensationForPeriod({
    records: [record("2025-01-01", 300_000), record("2026-09-16", 300_000, 60_000)],
    period: SEPT,
    joinDate: null,
    exitDate: null,
  });
  const housing = result.components.find((c) => c.code === "housing");
  assert.equal(housing?.amountKobo, N(30_000), "60,000 for 15 of 30 days");
});

test("valid compensation converts naira to kobo and defaults sensibly", () => {
  const result = validateCompensation({
    effectiveFrom: "2026-10-01",
    components: [
      { code: "basic", label: "Basic salary", amount: 300000.5, isBasic: true, pensionable: true },
      { code: "medical", label: "Medical", amount: 20000 },
    ],
  });
  assert.ok(result.ok);
  assert.equal(result.record.components[0].amountKobo, 30000050);
  assert.equal(result.record.components[1].taxable, true, "taxable unless said otherwise");
  assert.equal(result.record.components[1].pensionable, false, "not pensionable unless said so");
});

test("compensation must name exactly one basic component", () => {
  const none = validateCompensation({ effectiveFrom: "2026-10-01", components: [{ code: "allowance", label: "Allowance", amount: 1 }] });
  assert.ok(!none.ok && none.errors.some((e) => /Mark one component as basic/.test(e)));

  const two = validateCompensation({
    effectiveFrom: "2026-10-01",
    components: [
      { code: "basic", label: "Basic", amount: 1, isBasic: true },
      { code: "basic_two", label: "Other", amount: 1, isBasic: true },
    ],
  });
  assert.ok(!two.ok && two.errors.some((e) => /Only one component/.test(e)));
});

test("duplicate codes, negative amounts and bad dates are all reported together", () => {
  const result = validateCompensation({
    effectiveFrom: "2026-13-40",
    components: [
      { code: "basic", label: "Basic", amount: -5, isBasic: true },
      { code: "basic", label: "Basic again", amount: 10 },
    ],
  });
  assert.equal(result.ok, false);
  const errors = result.ok ? [] : result.errors;
  assert.ok(errors.some((e) => /takes effect/.test(e)));
  assert.ok(errors.some((e) => /used twice/.test(e)));
  assert.ok(errors.some((e) => /zero or more/.test(e)));
});

test("a missing profile is an empty one, falling back to the organisation's tax state", () => {
  const profile = toPayrollProfile(null, "Lagos");
  assert.equal(profile.taxState, "Lagos");
  assert.equal(profile.hasBankDetails, false);
  assert.equal(profile.annualRentKobo, 0);
});

test("a profile's own tax state wins over the organisation default", () => {
  const profile = toPayrollProfile({ tax_state: "Ogun" } as never, "Lagos");
  assert.equal(profile.taxState, "Ogun");
});

test("a profile accepts a real state and a 10-digit account number, in naira", () => {
  const result = validateProfile({ taxState: "Lagos", bankName: "Access", accountNumber: "0123456789", annualRent: 1200000 });
  assert.ok(result.ok);
  assert.equal(result.row.annual_rent_kobo, N(1_200_000));
});

test("a mistyped state or short account number is refused", () => {
  const result = validateProfile({ taxState: "Lagoss", bankName: "Access", accountNumber: "12345" });
  assert.equal(result.ok, false);
  const errors = result.ok ? [] : result.errors;
  assert.ok(errors.some((e) => /36 states or the FCT/.test(e)));
  assert.ok(errors.some((e) => /exactly 10 digits/.test(e)));
});

test("an impossible exit date is refused with a message, not a crash", () => {
  const result = validateProfile({ exitDate: "2026-02-30" });
  assert.equal(result.ok, false);
  assert.ok((result.ok ? [] : result.errors).some((e) => /real date/.test(e)));
});

test("a bank without an account number, or the reverse, is refused", () => {
  assert.equal(validateProfile({ bankName: "Access" }).ok, false);
  assert.equal(validateProfile({ accountNumber: "0123456789" }).ok, false);
});
