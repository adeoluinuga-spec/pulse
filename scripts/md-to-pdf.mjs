/**
 * Markdown -> print-ready PDF, via headless Chrome/Edge.
 *
 *   node scripts/md-to-pdf.mjs out.pdf "Title" doc1.md [doc2.md ...]
 *
 * Multiple documents are concatenated with a page break between them and a
 * contents page at the front. Styled for reading on paper or a tablet: A4,
 * generous leading, tables that do not split across pages.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";

const [outPdf, packTitle, ...sources] = process.argv.slice(2);
if (!outPdf || !sources.length) {
  console.error("usage: node scripts/md-to-pdf.mjs <out.pdf> <title> <in1.md> [in2.md ...]");
  process.exit(1);
}

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) {
  console.error("No Chrome or Edge found for PDF printing.");
  process.exit(1);
}

marked.setOptions({ gfm: true, breaks: false });

const escape = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const docs = sources.map((file, i) => {
  const raw = readFileSync(file, "utf8");
  // First H1 becomes the document title; the rest is the body.
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  return {
    id: `doc-${i + 1}`,
    file,
    title: titleMatch ? titleMatch[1].trim() : file,
    html: marked.parse(raw),
  };
});

const css = `
  @page { size: A4; margin: 16mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font: 10.5pt/1.55 "Segoe UI", -apple-system, system-ui, sans-serif;
    color: #14181f; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3, h4 { line-height: 1.25; page-break-after: avoid; color: #0b1220; }
  h1 { font-size: 21pt; margin: 0 0 6pt; letter-spacing: -0.3pt; }
  h2 { font-size: 14.5pt; margin: 20pt 0 7pt; padding-bottom: 4pt; border-bottom: 1.5px solid #e3e7ee; }
  h3 { font-size: 11.8pt; margin: 15pt 0 5pt; }
  h4 { font-size: 10.6pt; margin: 12pt 0 4pt; color: #35404f; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 17pt; }
  li { margin: 2.5pt 0; }
  code {
    font: 9pt/1.4 "Cascadia Mono", Consolas, monospace;
    background: #f2f4f8; padding: 1px 4px; border-radius: 3px; color: #b3005e;
    word-break: break-word;
  }
  pre {
    background: #f7f9fc; border: 1px solid #e3e7ee; border-left: 3px solid #6b7c93;
    padding: 8pt 10pt; border-radius: 4px; overflow: visible; white-space: pre-wrap;
    word-break: break-word; page-break-inside: avoid; font-size: 8.6pt;
  }
  pre code { background: none; padding: 0; color: #223; }
  table {
    border-collapse: collapse; width: 100%; margin: 9pt 0; font-size: 9pt;
    page-break-inside: avoid;
  }
  th, td { border: 1px solid #dde2ea; padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: #eef1f6; font-weight: 650; }
  tr:nth-child(even) td { background: #fafbfd; }
  blockquote {
    margin: 10pt 0; padding: 8pt 12pt; background: #fff8e6;
    border-left: 3px solid #e0a800; border-radius: 0 4px 4px 0; page-break-inside: avoid;
  }
  blockquote h3 { margin-top: 0; }
  hr { border: 0; border-top: 1px solid #e3e7ee; margin: 16pt 0; }
  a { color: #14181f; text-decoration: none; }
  strong { font-weight: 650; }

  .cover { page-break-after: always; padding-top: 55mm; }
  .cover h1 { font-size: 30pt; border: 0; }
  .cover .sub { color: #5b6676; font-size: 12pt; margin-top: 6pt; }
  .cover .meta { margin-top: 26pt; font-size: 9.5pt; color: #5b6676; }
  .toc { margin-top: 20pt; }
  .toc li { margin: 5pt 0; font-size: 11pt; }
  .doc { page-break-before: always; }
  .doc:first-of-type { page-break-before: avoid; }
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(packTitle ?? "Pulse")}</title>
<style>${css}</style></head><body>
<div class="cover">
  <h1>${escape(packTitle ?? "Pulse")}</h1>
  <div class="sub">Pulse 360 — study pack</div>
  <div class="meta">Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
  <div class="toc"><h3>Contents</h3><ol>
    ${docs.map((d) => `<li>${escape(d.title)}</li>`).join("\n    ")}
  </ol></div>
</div>
${docs.map((d) => `<section class="doc">${d.html}</section>`).join("\n")}
</body></html>`;

const tmpHtml = resolve(`${outPdf}.tmp.html`);
writeFileSync(tmpHtml, html, "utf8");

try {
  execFileSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${resolve(outPdf)}`,
      `file:///${tmpHtml.replace(/\\/g, "/")}`,
    ],
    { stdio: "pipe", timeout: 120000 },
  );
  console.log(`wrote ${outPdf} from ${docs.length} document(s)`);
} finally {
  if (existsSync(tmpHtml)) unlinkSync(tmpHtml);
}
