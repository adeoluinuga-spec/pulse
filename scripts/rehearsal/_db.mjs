import pg from "pg";
export function connect() {
  const url = process.env.PULSE_DB_URL;
  if (!url) throw new Error("PULSE_DB_URL is not set");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  return client;
}
