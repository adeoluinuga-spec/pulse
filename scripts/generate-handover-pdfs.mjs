import { readFile, writeFile } from "node:fs/promises";
import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const root = new URL("../", import.meta.url);

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingRight: 42, paddingBottom: 48, paddingLeft: 42, fontSize: 9, fontFamily: "Helvetica", color: "#172033" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 14 },
  heading: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  subheading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 5 },
  body: { lineHeight: 1.45, marginBottom: 5 },
  bullet: { lineHeight: 1.4, marginLeft: 10, marginBottom: 3 },
  code: { fontFamily: "Courier", fontSize: 7.5, lineHeight: 1.3, marginBottom: 3 },
  footer: { position: "absolute", bottom: 20, left: 42, right: 42, fontSize: 7, color: "#667085", textAlign: "center" },
});

function elementForLine(line, index) {
  if (!line.trim()) return null;
  if (line.startsWith("# ")) return React.createElement(Text, { key: index, style: styles.title }, line.slice(2));
  if (line.startsWith("## ")) return React.createElement(Text, { key: index, style: styles.heading }, line.slice(3));
  if (line.startsWith("### ")) return React.createElement(Text, { key: index, style: styles.subheading }, line.slice(4));
  if (line.startsWith("|")) return React.createElement(Text, { key: index, style: styles.code }, line.replaceAll("|", "  "));
  if (line.startsWith("- ")) return React.createElement(Text, { key: index, style: styles.bullet }, `- ${line.slice(2)}`);
  if (/^\d+\. /.test(line)) return React.createElement(Text, { key: index, style: styles.bullet }, line);
  return React.createElement(Text, { key: index, style: styles.body }, line.replaceAll("`", ""));
}

async function generate(inputName, outputName) {
  const markdown = await readFile(new URL(inputName, root), "utf8");
  const children = markdown.split(/\r?\n/).map(elementForLine).filter(Boolean);
  const document = React.createElement(
    Document,
    { title: markdown.split(/\r?\n/)[0].replace(/^# /, "") },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(View, null, children),
      React.createElement(Text, { fixed: true, style: styles.footer }, "Pulse handover documentation - generated from the repository source"),
    ),
  );
  await writeFile(new URL(outputName, root), await renderToBuffer(document));
}

await generate("PULSE_360_GAP_REPORT.md", "Pulse-360-Study-Pack.pdf");
await generate("PULSE_TODO.md", "Pulse-Status-And-Todo.pdf");
