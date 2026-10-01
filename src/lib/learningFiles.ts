/**
 * Material files attached to a learning activity.
 *
 * The bytes live in a private bucket. Nobody — facilitator or trainee — is ever
 * given a bucket path or a lasting address: the server mints a link that works
 * for a few minutes, and only after it has checked who is asking. A trainee's
 * check is their own link; a facilitator's is their Pulse sign-in.
 */

export const LEARNING_BUCKET = "learning";

/** Twenty-five megabytes: enough for a slide deck, small enough to upload on a phone. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** How long a download link lasts. Long enough to open a PDF, short enough not to be worth passing on. */
export const FILE_LINK_SECONDS = 300;

/**
 * What may be uploaded.
 *
 * Deliberately a list rather than a pattern: a training document is a document,
 * and anything executable or scriptable has no business arriving through this
 * route. Browsers render PDFs and images inline; the rest download.
 */
export const ALLOWED_FILE_TYPES: Record<string, { extension: string; label: string; inline: boolean }> = {
  "application/pdf": { extension: "pdf", label: "PDF", inline: true },
  "image/png": { extension: "png", label: "Image", inline: true },
  "image/jpeg": { extension: "jpg", label: "Image", inline: true },
  "image/webp": { extension: "webp", label: "Image", inline: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: "docx", label: "Word document", inline: false },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extension: "pptx", label: "Slides", inline: false },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extension: "xlsx", label: "Spreadsheet", inline: false },
  "text/plain": { extension: "txt", label: "Text", inline: true },
  "text/csv": { extension: "csv", label: "Spreadsheet", inline: false },
};

export type LearningFile = {
  id: string;
  activity_id: string;
  name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
};

export function describeFileType(mime: string) {
  return ALLOWED_FILE_TYPES[mime] ?? { extension: "bin", label: "File", inline: false };
}

export function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Checks an upload before a single byte is stored.
 *
 * The name is the person's own and is shown back to them, so it is cleaned
 * rather than trusted: no directory separators, no leading dots, and a sane
 * length. The stored path never uses it.
 */
export function validateUpload(input: { name: unknown; mime: unknown; size: unknown }):
  | { ok: true; name: string; mime: string; size: number; extension: string }
  | { ok: false; error: string } {
  const mime = typeof input.mime === "string" ? input.mime.split(";")[0].trim().toLowerCase() : "";
  const type = ALLOWED_FILE_TYPES[mime];
  if (!type) {
    return { ok: false, error: "That kind of file cannot be uploaded. Use a PDF, Word, PowerPoint, Excel, CSV, text file or image." };
  }

  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "That file appears to be empty." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `That file is larger than ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB. Link to it instead, or split it up.` };

  const raw = typeof input.name === "string" ? input.name : "";
  const name = raw
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Leading dots after the separators are gone, so "../../x" reads as "x".
    .replace(/^[.\s]+/, "")
    .slice(0, 200);
  if (name.length < 1) return { ok: false, error: "Give the file a name." };

  return { ok: true, name, mime, size, extension: type.extension };
}

/** Where the bytes go. Random, so a path can never be guessed from a name or an id. */
export function filePath(cohortId: string, activityId: string, random: string, extension: string) {
  return `${cohortId}/${activityId}/${random}.${extension}`;
}
