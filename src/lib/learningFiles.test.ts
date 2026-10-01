import test from "node:test";
import assert from "node:assert/strict";

import { describeFileType, fileSizeLabel, filePath, MAX_FILE_BYTES, validateUpload } from "./learningFiles.ts";

const upload = (over: Record<string, unknown> = {}) => validateUpload({ name: "Session deck.pdf", mime: "application/pdf", size: 1024, ...over });

test("a training document is accepted and its name tidied, never trusted as a path", () => {
  const result = upload({ name: "  ../../etc/passwd  " });
  assert.ok(result.ok);
  assert.equal(result.name, "etc passwd", "separators and leading dots are stripped");
  assert.equal(result.extension, "pdf", "the extension comes from the type, not the name");
});

test("anything executable or unknown is refused", () => {
  for (const mime of ["application/x-msdownload", "text/html", "image/svg+xml", "application/zip", ""]) {
    const result = validateUpload({ name: "thing", mime, size: 10 });
    assert.equal(result.ok, false, `${mime || "(none)"} must be refused`);
  }
  assert.ok(upload({ mime: "application/pdf; charset=binary" }).ok, "a charset on the type is fine");
});

test("empty and oversized files are refused with something a person can act on", () => {
  assert.equal(upload({ size: 0 }).ok, false);
  const big = upload({ size: MAX_FILE_BYTES + 1 });
  assert.equal(big.ok, false);
  assert.match(big.ok ? "" : big.error, /25 MB|link to it/i);
  assert.ok(upload({ size: MAX_FILE_BYTES }).ok, "exactly at the limit is allowed");
});

test("a stored path is random and carries nothing from the file's name", () => {
  const path = filePath("cohort-1", "activity-1", "9f8c7b", "pdf");
  assert.equal(path, "cohort-1/activity-1/9f8c7b.pdf");
  assert.equal(path.includes("Session"), false);
});

test("people are told what a file is and how big, in words", () => {
  assert.equal(describeFileType("application/pdf").label, "PDF");
  assert.equal(describeFileType("application/pdf").inline, true, "a PDF opens in the browser");
  assert.equal(describeFileType("application/vnd.openxmlformats-officedocument.presentationml.presentation").inline, false, "slides download");
  assert.equal(describeFileType("application/unknown").label, "File");
  assert.equal(fileSizeLabel(900), "900 B");
  assert.equal(fileSizeLabel(2048), "2 KB");
  assert.equal(fileSizeLabel(3 * 1024 * 1024), "3.0 MB");
});
