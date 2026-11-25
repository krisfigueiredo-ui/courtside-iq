"use client";

import { Suspense } from "react";

import { LeagueCenter } from "@/components/game/LeagueCenter";
import { LiveTerminal } from "@/components/live/LiveTerminal";
import { Skeleton, TabBar } from "@/components/ui/primitives";
import { useTab } from "@/lib/useTab";

const TABS = ["live", "nba", "cbb"] as const;

function LiveWorkspace() {
  const [tab, setTab] = useTab<(typeof TABS)[number]>("live", TABS);
  return (
    <>
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "live", label: "Live & today" },
          { value: "nba", label: "NBA" },
          { value: "cbb", label: "NCAA" },
        ]}
      />
      {tab === "live" ? <LiveTerminal /> : <LeagueCenter league={tab === "nba" ? "NBA" : "CBB"} />}
    </>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh]" />}>
      <LiveWorkspace />
    </Suspense>
  );
}
