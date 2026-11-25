"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
/** Static preview build: data comes from pre-generated JSON files instead of the API. */
export const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/krisfigueiredo-ui/courtside-iq";
export const STATIC_MESSAGE = "Not available in the static preview. Run the full application to use this feature.";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * File name of a pre-generated API response. Must match backend/app/static_export.py:static_key.
 * Query parameters are sorted; simulation sizes are ignored (one file per game).
 */
export function staticKey(path: string): string {
  const [p, q = ""] = path.replace(/^\/api\//, "").split("?");
  const params = new URLSearchParams(q);
  if (/^games\/\d+$/.test(p)) params.delete("n_sims");
  if (/^simulate\/\d+$/.test(p)) params.delete("n");
  const qs = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${p}${qs ? `?${qs}` : ""}`.replace(/[^A-Za-z0-9._-]/g, "_") + ".json";
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  if (STATIC) {
    if (init?.method && init.method !== "GET") throw new ApiError(405, STATIC_MESSAGE);
    const res = await fetch(`${BASE_PATH}/data/${staticKey(path)}`);
    if (!res.ok) throw new ApiError(res.status, "This view is not included in the static preview.");
    return res.json() as Promise<T>;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export function useApi<T = any>(path: string | null, opts?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path as string),
    enabled: !!path,
    ...(opts as any),
    ...(STATIC ? { refetchInterval: false } : {}),
  });
}

export const exportUrl = (dataset: string, format: "csv" | "xlsx" | "json", league?: string) =>
  STATIC ? `${REPO_URL}/tree/main/backend/data/demo_snapshot` : `${API_BASE}/api/data/export/${dataset}?format=${format}${league ? `&league=${league}` : ""}`;
