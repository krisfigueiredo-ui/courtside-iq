"use client";

import { Suspense } from "react";

import { Skeleton, TabBar } from "@/components/ui/primitives";
import { CompareView } from "@/components/views/CompareView";
import { DataView } from "@/components/views/DataView";
import { DirectoryView } from "@/components/views/DirectoryView";
import { TrendsView } from "@/components/views/TrendsView";
import { useTab } from "@/lib/useTab";

const TABS = ["trends", "teams", "players", "compare", "data"] as const;

function Research() {
  const [tab, setTab] = useTab<(typeof TABS)[number]>("trends", TABS);
  return (
    <>
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "trends", label: "Trends" },
          { value: "teams", label: "Teams" },
          { value: "players", label: "Players" },
          { value: "compare", label: "Compare" },
          { value: "data", label: "Data & imports" },
        ]}
      />
      {tab === "trends" && <TrendsView />}
      {tab === "teams" && <DirectoryView kind="teams" />}
      {tab === "players" && <DirectoryView kind="players" />}
      {tab === "compare" && <CompareView />}
      {tab === "data" && <DataView />}
    </>
  );
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh]" />}>
      <Research />
    </Suspense>
  );
}
