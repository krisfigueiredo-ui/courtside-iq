import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Badge, Button, DataTag, Kbd, Panel, PanelHeader, ProbBar, Segmented, Stat, StatStrip, TabBar } from "@/components/ui/primitives";

const meta: Meta = { title: "Foundations/Primitives" };
export default meta;

export const Figures: StoryObj = {
  render: () => (
    <Panel>
      <StatStrip className="border-0">
        <Stat label="Graded" value="3,997" sub="2,393–1,604" />
        <Stat label="Win %" value="59.9%" sub="95% CI 58–61%" tone="volt" />
        <Stat label="Spread" value="50.1%" sub="vs close" hint="52.4% breaks even at −110" />
        <Stat label="ROI" value="−1.9%" tone="loss" sub="flat 1 unit" />
      </StatStrip>
    </Panel>
  ),
};

export const Tags: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <DataTag kind="live" label="Q3 4:12" />
      <DataTag kind="final" />
      <DataTag kind="scheduled" label="7:30 PM" />
      <DataTag kind="stale" />
      <DataTag kind="demo" />
      <DataTag kind="model" />
      <Badge tone="gain">Win</Badge>
      <Badge tone="loss">Loss</Badge>
      <Kbd>⌘K</Kbd>
    </div>
  ),
};

export const Controls: StoryObj = {
  render: function Render() {
    const [v, setV] = useState<"all" | "ml" | "ats">("all");
    const [t, setT] = useState<"a" | "b" | "c">("a");
    return (
      <div className="space-y-4">
        <TabBar value={t} onChange={setT} tabs={[{ value: "a", label: "Performance" }, { value: "b", label: "Streaks & splits", count: 395 }, { value: "c", label: "Archive" }]} />
        <Segmented value={v} onChange={setV} options={[{ value: "all", label: "All" }, { value: "ml", label: "ML" }, { value: "ats", label: "Spread" }]} />
        <div className="flex gap-2">
          <Button variant="primary">Retrain</Button>
          <Button>Export</Button>
          <Button variant="ghost">Cancel</Button>
        </div>
      </div>
    );
  },
};

export const PanelWithHeader: StoryObj = {
  render: () => (
    <Panel className="max-w-xl">
      <PanelHeader title="Win probability" eyebrow="ESPN, per play" right={<Badge>10k sims</Badge>} />
      <div className="p-3">
        <ProbBar left={0.46} right={0.54} leftLabel="DEN 46%" rightLabel="54% OKC" leftColor="#FEC524" rightColor="#007AC1" />
      </div>
    </Panel>
  ),
};
