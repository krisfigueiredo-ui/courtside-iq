"use client";

import { Suspense } from "react";

import { Skeleton, TabBar } from "@/components/ui/primitives";
import { PropsView } from "@/components/views/PropsView";
import { SpreadsView } from "@/components/views/SpreadsView";
import { TotalsView } from "@/components/views/TotalsView";
import { useTab } from "@/lib/useTab";

const TABS = ["lines", "totals", "props"] as const;

function Markets() {
  const [tab, setTab] = useTab<(typeof TABS)[number]>("lines", TABS);
  return (
    <>
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "lines", label: "Lines & movement" },
          { value: "totals", label: "Totals" },
          { value: "props", label: "Player props" },
        ]}
      />
      {tab === "lines" ? <SpreadsView /> : tab === "totals" ? <TotalsView /> : <PropsView />}
    </>
  );
}

export default function MarketsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh]" />}>
      <Markets />
    </Suspense>
  );
}
