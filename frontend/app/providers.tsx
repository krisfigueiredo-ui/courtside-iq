"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { resolvedTheme, usePrefs } from "@/lib/store";

function ThemeSync() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute("data-theme", resolvedTheme(theme));
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={100}>
        <ThemeSync />
        {children}
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
