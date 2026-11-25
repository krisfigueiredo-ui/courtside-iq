"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Workspace tab kept in the URL (?tab=), so tabs are linkable and survive reloads. */
export function useTab<T extends string>(fallback: T, allowed: readonly T[]): [T, (t: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const raw = params.get("tab") as T | null;
  const tab = raw && allowed.includes(raw) ? raw : fallback;
  const set = useCallback(
    (t: T) => {
      const next = new URLSearchParams(params.toString());
      if (t === fallback) next.delete("tab");
      else next.set("tab", t);
      const qs = next.toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [params, router, path, fallback],
  );
  return [tab, set];
}
