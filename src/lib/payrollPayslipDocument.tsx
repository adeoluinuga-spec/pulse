import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * A payslip as a PDF.
 *
 * Amounts are written "NGN 388,550.00" rather than with the naira sign. The PDF
 * uses the built-in Helvetica, whose character set has no ₦, so the symbol
 * would print as an empty box on every payslip — and a payslip with a missing
 * currency mark looks forged.
 */

export type PayslipData = {
  organisationName: string;
  employeeName: string;
  employeeEmail: string | null;
  department: string | null;
  periodLabel: string;
  approvedAt: string | null;
  daysPaid: number;
  daysInPeriod: number;
  taxState: string | null;
  ruleSetId: string | null;
  earnings: Array<{ label: string; amountKobo: number }>;
  deductions: Array<{ label: string; amountKobo: number }>;
  employer: Array<{ label: string; amountKobo: number }>;
  grossKobo: number;
  totalDeductionsKobo: number;
  netKobo: number;
};

export function pdfMoney(kobo: number): string {
  const sign = kobo < 0 ? "-" : "";
  const absolute = Math.abs(kobo);
  const naira = Math.floor(absolute / 100).toLocaleString("en-NG");
  return `${sign}NGN ${naira}.${String(absolute % 100).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 10, color: "#182438" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  org: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#66758a", fontSize: 9 },
  title: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
  details: { flexDirection: "row", borderTop: "1pt solid #dfe6ef", borderBottom: "1pt solid #dfe6ef", paddingVertical: 10, marginBottom: 16 },
  detail: { flex: 1 },
  label: { fontSize: 8, color: "#66758a", textTransform: "uppercase", marginBottom: 3 },
  columns: { flexDirection: "row", gap: 18 },
  column: { flex: 1 },
  section: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#4c5d75", textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: "0.5pt solid #edf1f6" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  net: { marginTop: 18, padding: 14, backgroundColor: "#142641", color: "#ffffff", flexDirection: "row", justifyContent: "space-between", borderRadius: 4 },
  netAmount: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  employer: { marginTop: 20 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, fontSize: 8, color: "#8190a3", borderTop: "0.5pt solid #dfe6ef", paddingTop: 8 },
});

function Lines({ rows }: { rows: Array<{ label: string; amountKobo: number }> }) {
  return (
    <>
      {rows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={styles.row}>
          <Text>{row.label}</Text>
          <Text>{pdfMoney(row.amountKobo)}</Text>
        </View>
      ))}
    </>
  );
}

export function PayslipDocument({ payslip }: { payslip: PayslipData }) {
  const employerTotal = payslip.employer.reduce((sum, row) => sum + row.amountKobo, 0);

  return (
    <Document title={`Payslip ${payslip.periodLabel} — ${payslip.employeeName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.org}>{payslip.organisationName}</Text>
            <Text style={styles.muted}>Payslip</Text>
          </View>
          <View>
            <Text style={styles.title}>{payslip.periodLabel}</Text>
            <Text style={styles.muted}>
              {payslip.approvedAt ? `Approved ${new Date(payslip.approvedAt).toLocaleDateString("en-GB")}` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.details}>
          <View style={styles.detail}>
            <Text style={styles.label}>Employee</Text>
            <Text>{payslip.employeeName}</Text>
            {payslip.employeeEmail ? <Text style={styles.muted}>{payslip.employeeEmail}</Text> : null}
          </View>
          <View style={styles.detail}>
            <Text style={styles.label}>Department</Text>
            <Text>{payslip.department ?? "—"}</Text>
          </View>
          <View style={styles.detail}>
            <Text style={styles.label}>Days paid</Text>
            <Text>
              {payslip.daysPaid} of {payslip.daysInPeriod}
            </Text>
          </View>
          <View style={styles.detail}>
            <Text style={styles.label}>Tax state</Text>
            <Text>{payslip.taxState ?? "—"}</Text>
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.section}>Earnings</Text>
            <Lines rows={payslip.earnings} />
            <View style={styles.total}>
              <Text>Gross pay</Text>
              <Text>{pdfMoney(payslip.grossKobo)}</Text>
            </View>
          </View>
          <View style={styles.column}>
            <Text style={styles.section}>Deductions</Text>
            <Lines rows={payslip.deductions} />
            <View style={styles.total}>
              <Text>Total deductions</Text>
              <Text>{pdfMoney(payslip.totalDeductionsKobo)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.net}>
          <Text>Net pay</Text>
          <Text style={styles.netAmount}>{pdfMoney(payslip.netKobo)}</Text>
        </View>

        {payslip.employer.length ? (
          <View style={styles.employer}>
            <Text style={styles.section}>Paid by your employer on top of your salary</Text>
            <Lines rows={payslip.employer} />
            <View style={styles.total}>
              <Text>Employer contributions</Text>
              <Text>{pdfMoney(employerTotal)}</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Generated by Pulse from an approved payroll run. Tax rules: {payslip.ruleSetId ?? "not recorded"}. Keep this payslip
          for your records. Questions about your pay should go to your HR team.
        </Text>
      </Page>
    </Document>
  );
}
