export type ParticipantCsvRow = {
  name: string;
  email: string;
  level?: string;
  functionName?: string;
  region?: string;
  portfolio?: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  result.push(current.trim());
  return result;
}

export function parseAssessmentParticipantCsv(csvText: string): ParticipantCsvRow[] {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((line) => parseCsvLine(line));

  const parsedRows: ParticipantCsvRow[] = [];

  for (const row of rows) {
    if (!row.some((value) => value.trim().length > 0)) continue;

    const valueMap: Record<string, string> = {};
    headers.forEach((header, index) => {
      valueMap[header] = row[index] ?? "";
    });

    const name = valueMap.name ?? valueMap.full_name ?? "";
    const email = valueMap.email ?? "";
    if (!name.trim() || !email.trim()) continue;

    parsedRows.push({
      name: name.trim(),
      email: email.trim(),
      level: valueMap.level ?? "assistant_director",
      functionName: valueMap.function_name ?? valueMap.function ?? "",
      region: valueMap.region ?? "",
      portfolio: valueMap.portfolio ?? "",
    });
  }

  return parsedRows;
}
