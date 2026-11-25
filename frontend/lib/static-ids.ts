import fs from "fs";
import path from "path";

/**
 * IDs to pre-render for dynamic routes in the static preview build. The backend exporter writes
 * public/data/_index.json; in the regular server build no pages are pre-rendered.
 */
export function staticIds(kind: "games" | "players" | "teams"): string[] {
  if (process.env.STATIC_EXPORT !== "1") return [];
  const file = path.join(process.cwd(), "public", "data", "_index.json");
  if (!fs.existsSync(file)) throw new Error("public/data/_index.json missing: run `python -m app.cli export-static` first");
  const index = JSON.parse(fs.readFileSync(file, "utf8"));
  return (index[kind] ?? []).map((id: number) => String(id));
}
