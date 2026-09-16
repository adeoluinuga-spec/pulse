import test from "node:test";
import assert from "node:assert/strict";

import {
  bankSchedule,
  csvCell,
  nhfSchedule,
  payeSchedule,
  pensionSchedule,
  type ExportLine,
  type ExportProfile,
} from "./payrollExports.ts";

const N = (naira: number) => Math.round(naira * 100);

const line = (overrides: Partial<ExportLine> = {}): ExportLine => ({
  employeeId: "e1",
  name: "Ada Obi",
  included: true,
  grossKobo: N(500_000),
  payeKobo: N(63_950),
  pensionEmployeeKobo: N(40_000),
  pensionEmployerKobo: N(50_000),
  nhfKobo: N(7_500),
  netKobo: N(388_550),
  basicKobo: N(300_000),
  taxState: "Lagos",
  ...overrides,
});

const profile = (overrides: Partial<ExportProfile> = {}): ExportProfile => ({
  tin: "1234567890",
  bankName: "Access Bank",
  bankCode: "044",
  accountNumber: "0123456789",
  accountName: "ADA OBI",
  pfaName: "Stanbic IBTC Pensions",
  rsaPin: "PEN100000000001",
  nhfNumber: "NHF-001",
  ...overrides,
});

const period = { year: 2026, month: 9 };

test("a cell that would run as a spreadsheet formula is neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://evil\",\"x\")"), "\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
  assert.equal(csvCell("+234 800"), "'+234 800");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-cmd"), "'-cmd");
});

test("real numbers, including negative ones, are left untouched for the bank to parse", () => {
  assert.equal(csvCell("388550.00"), "388550.00");
  assert.equal(csvCell("-500.00"), "-500.00");
  assert.equal(csvCell(42), "42");
});

test("commas, quotes and line breaks are quoted correctly", () => {
  assert.equal(csvCell("Obi, Ada"), "\"Obi, Ada\"");
  assert.equal(csvCell("say \"hi\""), "\"say \"\"hi\"\"\"");
});

test("the bank schedule pays net, in naira with two decimals, with a narration", () => {
  const result = bankSchedule({ lines: [line()], profiles: new Map([["e1", profile()]]), ...period });
  const [, row] = result.csv.trim().split("\r\n");
  assert.equal(row, "ADA OBI,0123456789,Access Bank,044,388550.00,Salary September 2026");
  assert.equal(result.totalKobo, N(388_550));
  assert.equal(result.count, 1);
});

test("an account number with a leading zero keeps it", () => {
  const result = bankSchedule({ lines: [line()], profiles: new Map([["e1", profile({ accountNumber: "0012345678" })]]), ...period });
  assert.match(result.csv, /,0012345678,/);
});

test("somebody with no bank account is omitted and named, not silently dropped", () => {
  const result = bankSchedule({
    lines: [line(), line({ employeeId: "e2", name: "Tunde Cole" })],
    profiles: new Map([["e1", profile()]]),
    ...period,
  });
  assert.equal(result.count, 1);
  assert.deepEqual(result.omitted, [{ name: "Tunde Cole", reason: "No bank account on record." }]);
});

test("excluded lines never reach the bank file", () => {
  const result = bankSchedule({ lines: [line({ included: false })], profiles: new Map([["e1", profile()]]), ...period });
  assert.equal(result.count, 0);
});

test("PAYE is grouped by the state each employee lives in", () => {
  const result = payeSchedule({
    lines: [
      line({ employeeId: "a", name: "A", taxState: "Ogun", payeKobo: N(10_000) }),
      line({ employeeId: "b", name: "B", taxState: "Lagos", payeKobo: N(20_000) }),
      line({ employeeId: "c", name: "C", taxState: "Lagos", payeKobo: N(30_000) }),
      line({ employeeId: "d", name: "D", taxState: null, payeKobo: N(5_000) }),
    ],
    profiles: new Map(),
    ...period,
  });
  assert.deepEqual(result.byState, [
    { state: "Lagos", payeKobo: N(50_000), headcount: 2 },
    { state: "Ogun", payeKobo: N(10_000), headcount: 1 },
  ]);
  assert.deepEqual(result.omitted, [{ name: "D", reason: "No tax state recorded." }]);
  const states = result.csv.trim().split("\r\n").slice(1).map((row) => row.split(",")[0]);
  assert.deepEqual(states, ["Lagos", "Lagos", "Ogun"], "rows for one state office sit together");
});

test("the pension schedule adds employee and employer contributions", () => {
  const result = pensionSchedule({ lines: [line()], profiles: new Map([["e1", profile()]]), ...period });
  assert.match(result.csv, /Stanbic IBTC Pensions,PEN100000000001,Ada Obi,September 2026,40000.00,50000.00,90000.00/);
  assert.equal(result.totalKobo, N(90_000));
});

test("pension without an RSA PIN is held back and named", () => {
  const result = pensionSchedule({ lines: [line()], profiles: new Map([["e1", profile({ rsaPin: null })]]), ...period });
  assert.equal(result.totalKobo, 0);
  assert.equal(result.omitted[0].reason, "No PFA or RSA PIN recorded.");
});

test("the NHF schedule shows basic and contribution", () => {
  const result = nhfSchedule({ lines: [line()], profiles: new Map([["e1", profile()]]), ...period });
  assert.match(result.csv, /NHF-001,Ada Obi,September 2026,300000.00,7500.00/);
  assert.equal(result.totalKobo, N(7_500));
});
