import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { AggregatePdfReport, IndividualPdfReport } from "./assessmentPdfReport.ts";
import { groupScoreLabel, raterGroupLabels, scoreLabel } from "./assessmentPdfReport.ts";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#151719",
    lineHeight: 1.45,
  },
  cover: {
    backgroundColor: "#f5f7fb",
  },
  brand: {
    color: "#3154d4",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 76,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.1,
  },
  subtitle: {
    marginTop: 10,
    color: "#616b7c",
    fontSize: 13,
  },
  confidentiality: {
    marginTop: 44,
    padding: 16,
    borderWidth: 1,
    borderColor: "#cfd6e6",
    backgroundColor: "#ffffff",
  },
  section: {
    marginBottom: 18,
  },
  heading: {
    marginBottom: 8,
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
  },
  subheading: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: 700,
  },
  muted: {
    color: "#6b7280",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 6,
    gap: 8,
  },
  cellWide: {
    flex: 2,
  },
  cell: {
    flex: 1,
  },
  pill: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: "#eef2ff",
    color: "#3154d4",
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  suppressed: {
    color: "#a16207",
    fontWeight: 700,
  },
  listItem: {
    marginBottom: 5,
  },
  idpBox: {
    height: 58,
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginBottom: 10,
    padding: 8,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#8b95a7",
    fontSize: 8,
  },
});

function Footer({ report }: { report: IndividualPdfReport | AggregatePdfReport }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{report.brandName} 360 Assessment</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function ScoreRow({ label, value, muted }: { label: string; value: string; muted?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.cellWide}>{label}</Text>
      <Text style={value.includes("Suppressed") ? [styles.cell, styles.suppressed] : styles.cell}>{value}</Text>
      <Text style={[styles.cell, styles.muted]}>{muted ?? ""}</Text>
    </View>
  );
}

function deltaLabel(value: number | null): string {
  if (value === null) return "No comparable delta";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function IndividualAssessmentReportDocument({ report }: { report: IndividualPdfReport }) {
  const blindSpots = report.scores.gaps.filter((gap) => gap.blindSpot);
  const hiddenStrengths = report.scores.gaps.filter((gap) => gap.hiddenStrength);

  return (
    <Document title={`${report.subject.name} 360 Assessment Report`} author="Pulse Work OS">
      <Page size="A4" style={[styles.page, styles.cover]}>
        <Text style={styles.brand}>{report.brandName}</Text>
        <Text style={styles.title}>Individual 360 Assessment Report</Text>
        <Text style={styles.subtitle}>{report.subject.name}</Text>
        <Text style={styles.subtitle}>{report.subject.role ?? report.subject.level ?? "Participant"}</Text>
        <Text style={styles.subtitle}>{report.cycle.name}</Text>
        <Text style={styles.subtitle}>Framework version {report.cycle.frameworkVersion ?? "not recorded"}</Text>
        <Text style={styles.subtitle}>Generated {new Date(report.generatedAt).toLocaleDateString("en-GB")}</Text>
        <View style={styles.confidentiality}>
          <Text style={styles.subheading}>Confidentiality statement</Text>
          <Text>
            This report is for leadership development. Rater categories with fewer than three distinct scored raters are suppressed and must not be inferred from blanks, zeros, or missing charts.
          </Text>
        </View>
        <Footer report={report} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Section title="How to read this report">
          <Text>
            Scores use a 1 to 5 scale. Unable to Observe responses are excluded from numerator and denominator. Where a category shows n&lt;3, there were fewer than three scored raters in that category, so the result is deliberately suppressed for confidentiality.
          </Text>
        </Section>

        <Section title="Overall competency scores">
          <ScoreRow label="Overall score" value={scoreLabel(report.scores.overall)} muted={report.scores.insufficientData ? "Insufficient release data" : "Release-ready"} />
          {report.competencies.map((competency) => (
            <ScoreRow key={competency.competencyId} label={competency.name} value={scoreLabel(competency.mean)} muted={`${competency.raterCount} raters`} />
          ))}
        </Section>

        <Section title="Scores by rater category">
          {report.competencies.map((competency) => (
            <View key={competency.competencyId} wrap={false}>
              <Text style={styles.subheading}>{competency.name}</Text>
              {competency.byGroup.map((cell) => (
                <ScoreRow
                  key={`${competency.competencyId}-${cell.raterGroup}`}
                  label={raterGroupLabels[cell.raterGroup]}
                  value={groupScoreLabel(cell)}
                  muted={`${cell.raterCount} raters, ${cell.notObservedCount} unable to observe`}
                />
              ))}
            </View>
          ))}
        </Section>
        <Footer report={report} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Section title="Self-versus-others comparison">
          {report.competencies.map((competency) => (
            <ScoreRow
              key={competency.competencyId}
              label={competency.name}
              value={`Self ${scoreLabel(competency.selfMean)} | Others ${scoreLabel(competency.othersMean)}`}
              muted=""
            />
          ))}
        </Section>

        {report.movement ? (
          <Section title="Movement against baseline">
            <Text style={report.movement.comparability.comparable ? styles.muted : styles.suppressed}>
              {report.movement.comparability.message}
            </Text>
            {report.movement.competencies.map((item) => (
              <ScoreRow
                key={item.competencyId}
                label={item.label}
                value={item.suppressed ? "Suppressed (n<3)" : deltaLabel(item.delta)}
                muted={`Prior ${scoreLabel(item.priorScore)} | Current ${scoreLabel(item.currentScore)}`}
              />
            ))}
          </Section>
        ) : null}

        <Section title="Blind spots and hidden strengths">
          <Text style={styles.subheading}>Blind spots</Text>
          {blindSpots.length ? blindSpots.map((gap) => (
            <Text key={gap.competencyId} style={styles.listItem}>{gap.competencyId}: self is {gap.gap} points above others.</Text>
          )) : <Text style={styles.muted}>No material blind spots met the threshold.</Text>}
          <Text style={styles.subheading}>Hidden strengths</Text>
          {hiddenStrengths.length ? hiddenStrengths.map((gap) => (
            <Text key={gap.competencyId} style={styles.listItem}>{gap.competencyId}: others are {Math.abs(gap.gap ?? 0)} points above self.</Text>
          )) : <Text style={styles.muted}>No material hidden strengths met the threshold.</Text>}
        </Section>

        <Section title="Item-level detail">
          {report.competencies.map((competency) => (
            <View key={competency.competencyId} wrap={false}>
              <Text style={styles.subheading}>{competency.name}</Text>
              {competency.items.map((item) => (
                <ScoreRow
                  key={item.itemId}
                  label={item.text}
                  value={item.suppressed || item.mean === null ? "Suppressed (n<3)" : scoreLabel(item.mean)}
                  muted={`Self ${scoreLabel(item.selfRating)}; ${item.notObservedCount} unable to observe`}
                />
              ))}
            </View>
          ))}
        </Section>
        <Footer report={report} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Section title="Themed narrative feedback">
          {report.narrativeThemes.length ? report.narrativeThemes.map((theme) => (
            <View key={theme.theme} wrap={false}>
              <Text style={styles.subheading}>{theme.theme}</Text>
              {theme.comments.map((comment, index) => (
                <Text key={`${theme.theme}-${index}`} style={styles.listItem}>- {comment}</Text>
              ))}
            </View>
          )) : <Text style={styles.muted}>No narrative comments were submitted.</Text>}
        </Section>

        <Section title="Development priorities">
          {report.developmentPriorities.map((priority, index) => (
            <Text key={priority} style={styles.listItem}>{index + 1}. {priority}</Text>
          ))}
        </Section>

        <Section title="Individual Development Plan">
          <Text style={styles.subheading}>Priority 1</Text>
          <View style={styles.idpBox}><Text>Action, support needed, success measure, date</Text></View>
          <Text style={styles.subheading}>Priority 2</Text>
          <View style={styles.idpBox}><Text>Action, support needed, success measure, date</Text></View>
          <Text style={styles.subheading}>Priority 3</Text>
          <View style={styles.idpBox}><Text>Action, support needed, success measure, date</Text></View>
        </Section>
        <Footer report={report} />
      </Page>
    </Document>
  );
}

export function AggregateAssessmentReportDocument({ report }: { report: AggregatePdfReport }) {
  return (
    <Document title={`${report.cycle.name} Aggregate 360 Report`} author="Pulse Work OS">
      <Page size="A4" style={[styles.page, styles.cover]}>
        <Text style={styles.brand}>{report.brandName}</Text>
        <Text style={styles.title}>Aggregate 360 Assessment Report</Text>
        <Text style={styles.subtitle}>{report.cycle.name}</Text>
        <Text style={styles.subtitle}>{report.cohortSize} participants</Text>
        <Text style={styles.subtitle}>Framework version {report.cycle.frameworkVersion ?? "not recorded"}</Text>
        <Text style={styles.subtitle}>Generated {new Date(report.generatedAt).toLocaleDateString("en-GB")}</Text>
        <View style={styles.confidentiality}>
          <Text style={styles.subheading}>Confidential aggregate design</Text>
          <Text>
            This aggregate report contains no named individuals and no participant ranking table. Segments below the minimum cohort size are visibly suppressed.
          </Text>
        </View>
        <Footer report={report} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Section title="Cohort scores">
          <ScoreRow label="Cohort mean" value={scoreLabel(report.cohortMean)} muted={`${report.cohortSize} participants`} />
        </Section>

        {report.movement ? (
          <Section title="Movement against baseline">
            <Text style={report.movement.comparability.comparable ? styles.muted : styles.suppressed}>
              {report.movementNarrative ?? report.movement.headline}
            </Text>
            <ScoreRow
              label="Overall movement"
              value={report.movement.overall.suppressed ? "Suppressed (n<3)" : deltaLabel(report.movement.overall.delta)}
              muted={`Prior ${scoreLabel(report.movement.overall.priorScore)} | Current ${scoreLabel(report.movement.overall.currentScore)}`}
            />
          </Section>
        ) : null}

        <Section title="Competency heat map">
          {report.competencyHeatMap.map((item) => (
            <ScoreRow
              key={item.competencyId}
              label={item.name}
              value={item.suppressed || item.mean === null ? "Suppressed (n<3)" : scoreLabel(item.mean)}
              muted={item.suppressed ? "Segment too thin" : "Cohort mean"}
            />
          ))}
        </Section>

        <Section title="Segmentation by level, function and region">
          {report.segments
            .filter((segment) => segment.dimension !== "portfolio")
            .map((segment) => (
              <ScoreRow
                key={`${segment.dimension}-${segment.value}`}
                label={`${segment.dimension}: ${segment.value}`}
                value={segment.suppressed || segment.mean === null ? "Suppressed (n<3)" : scoreLabel(segment.mean)}
                muted={`${segment.subjectCount} participants`}
              />
            ))}
        </Section>
        <Footer report={report} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Section title="Capability gaps">
          {report.capabilityGaps.map((gap) => <Text key={gap} style={styles.listItem}>- {gap}</Text>)}
        </Section>

        <Section title="Recommended interventions">
          {report.recommendedInterventions.map((intervention) => (
            <Text key={intervention} style={styles.listItem}>- {intervention}</Text>
          ))}
        </Section>

        <Text style={styles.pill}>No participant ranking included</Text>
        <Footer report={report} />
      </Page>
    </Document>
  );
}
