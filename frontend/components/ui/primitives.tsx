"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle } from "lucide-react";
import * as React from "react";

import { ago, cn } from "@/lib/format";

/* COURTSIDE IQ primitives (shadcn-style: Radix behaviour, cva variants, our own styling).
   Surfaces are flat; hierarchy comes from type weight, spacing and hairlines. */

/* ---------------- Surfaces ---------------- */
export function Panel({ className, children, flush, ...p }: React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <section className={cn(flush ? "bg-surface" : "panel", "min-w-0", className)} {...p}>
      {children}
    </section>
  );
}

/** Compact section header: title, optional context and right-aligned controls. No icons, no eyebrows above the title. */
export function PanelHeader({
  title,
  eyebrow,
  right,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header className={cn("flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-hair px-3 py-2", className)}>
      <h3 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-fg">
        <span className="truncate">{title}</span>
        {eyebrow && <span className="truncate text-xs font-normal text-subtle">{eyebrow}</span>}
      </h3>
      {right && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/** Workspace header: one line, small. Explanations belong in tooltips or docs, not under every title. */
export function PageHeader({ title, right, subtitle }: { index?: string; title: string; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-fg" title={typeof subtitle === "string" ? subtitle : undefined}>
        {title}
      </h1>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Controls row for a view inside a workspace tab (the tab already names the view). */
export function ViewBar({ right, left }: { title?: string; index?: string; subtitle?: React.ReactNode; right?: React.ReactNode; left?: React.ReactNode }) {
  if (!right && !left) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}

/* ---------------- Tags ---------------- */
const badgeVariants = cva("inline-flex shrink-0 items-center gap-1 rounded-sm px-1 py-px text-2xs font-medium leading-4", {
  variants: {
    tone: {
      neutral: "bg-raised text-muted ring-1 ring-inset ring-hair",
      volt: "bg-accent/12 text-accent",
      cyan: "bg-info/12 text-info",
      gain: "bg-pos/12 text-pos",
      loss: "bg-neg/12 text-neg",
      flare: "bg-warn/14 text-warn",
      gold: "bg-warn/14 text-warn",
      live: "bg-live/12 text-live",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}

export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block h-1.5 w-1.5 shrink-0 animate-pulseDot rounded-full bg-live", className)} />;
}

export function DemoBadge({ show = true, className }: { show?: boolean; className?: string }) {
  if (!show) return null;
  return (
    <Tip content="Synthetic demo data from the COURTSIDE simulator. Not real games, statistics or sportsbook prices.">
      <Badge tone="flare" className={cn("uppercase tracking-wide", className)}>
        Demo
      </Badge>
    </Tip>
  );
}

export function ResultBadge({ result }: { result: string }) {
  const tone = result === "win" ? "gain" : result === "loss" ? "loss" : result === "push" ? "gold" : result === "void" ? "neutral" : "volt";
  return (
    <Badge tone={tone as any} className="uppercase tracking-wide">
      {result === "pending" ? "open" : result}
    </Badge>
  );
}

/** Data provenance marker: live, historical, demo, stale or unavailable. */
export type DataKind = "live" | "final" | "historical" | "scheduled" | "demo" | "stale" | "unavailable" | "model";
const KIND: Record<DataKind, { tone: VariantProps<typeof badgeVariants>["tone"]; label: string }> = {
  live: { tone: "live", label: "Live" },
  final: { tone: "neutral", label: "Final" },
  historical: { tone: "neutral", label: "Historical" },
  scheduled: { tone: "neutral", label: "Scheduled" },
  demo: { tone: "flare", label: "Demo" },
  stale: { tone: "flare", label: "Stale" },
  unavailable: { tone: "neutral", label: "Unavailable" },
  model: { tone: "volt", label: "Model" },
};
export function DataTag({ kind, label, title }: { kind: DataKind; label?: string; title?: string }) {
  const k = KIND[kind];
  return (
    <Badge tone={k.tone} title={title} className="uppercase tracking-wide">
      {kind === "live" && <LiveDot />}
      {label ?? k.label}
    </Badge>
  );
}

/* ---------------- Buttons ---------------- */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent/90",
        ghost: "text-muted hover:bg-raised hover:text-fg",
        outline: "border border-hair bg-surface text-fg-2 hover:border-edge hover:text-fg",
        danger: "border border-neg/40 text-neg hover:bg-neg/10",
      },
      size: { sm: "h-7 px-2.5 text-xs", md: "h-8 px-3 text-sm", icon: "h-7 w-7" },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(({ className, variant, size, asChild, ...p }, ref) => {
  const C: any = asChild ? Slot : "button";
  return <C ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...p} />;
});
Button.displayName = "Button";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("rounded-sm border border-hair bg-raised px-1 font-mono text-2xs text-subtle", className)}>{children}</kbd>;
}

/* ---------------- Segmented control (Radix ToggleGroup) ---------------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("inline-flex max-w-full flex-wrap items-stretch rounded border border-hair bg-surface", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "border-l border-hair font-medium text-muted transition-colors first:border-l-0 hover:text-fg data-[state=on]:bg-raised data-[state=on]:text-fg",
            "data-[state=on]:shadow-[inset_0_-1.5px_0_rgb(var(--c-accent))]",
            size === "sm" ? "h-6 px-2 text-2xs" : "h-7 px-2.5 text-xs",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* ---------------- Tabs (underline) ---------------- */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("no-scrollbar flex gap-4 overflow-x-auto border-b border-hair", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px whitespace-nowrap border-b-[1.5px] border-transparent pb-2 pt-1 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg",
        className,
      )}
      {...p}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/** Link-driven tab bar for workspaces (keeps the URL as the source of truth). */
export function TabBar<T extends string>({ value, onChange, tabs, className, right }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number }[]; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3 border-b border-hair", className)}>
      <div role="tablist" className="no-scrollbar -mb-px flex gap-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-[1.5px] pb-2 pt-1 text-sm font-medium transition-colors",
              value === t.value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count != null && <span className="num text-2xs text-subtle">{t.count}</span>}
          </button>
        ))}
      </div>
      {right && <div className="mb-1.5 flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------------- Tooltip ---------------- */
export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={5}
          className="z-[90] max-w-xs rounded border border-edge bg-overlay px-2.5 py-1.5 text-xs leading-relaxed text-fg-2 shadow-pop"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ---------------- Figures ---------------- */
const TONE = { gain: "text-pos", loss: "text-neg", volt: "text-accent", flare: "text-warn", cyan: "text-info" } as const;

/** A single figure. Borderless: groups of figures sit in a StatStrip, not a grid of cards. */
export function Stat({
  label,
  value,
  sub,
  tone,
  className,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
  hint?: React.ReactNode;
}) {
  const body = (
    <div className={cn("min-w-0 px-3 py-2", className)}>
      <div className={cn("truncate text-2xs font-medium uppercase tracking-[0.06em] text-subtle", hint && "underline decoration-dotted decoration-subtle/60 underline-offset-2")}>{label}</div>
      <div className={cn("num mt-0.5 truncate text-[19px] font-medium leading-6 tracking-[-0.01em]", tone ? TONE[tone] : "text-fg")}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
  return hint ? <Tip content={hint}>{body}</Tip> : body;
}

/** Horizontal band of figures separated by hairlines; wraps on narrow screens. */
export function StatStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 divide-hair border-y border-hair sm:flex sm:divide-x [&>*]:min-w-0 sm:[&>*]:flex-1", className)}>{children}</div>;
}

export function ProbBar({
  left,
  right,
  leftLabel,
  rightLabel,
  leftColor = "rgb(var(--c-info))",
  rightColor = "rgb(var(--c-accent))",
  push = 0,
  className,
}: {
  left: number;
  right: number;
  leftLabel?: React.ReactNode;
  rightLabel?: React.ReactNode;
  leftColor?: string;
  rightColor?: string;
  push?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {(leftLabel || rightLabel) && (
        <div className="num mb-1 flex justify-between text-2xs text-fg-2">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
      <div className="flex h-1 w-full gap-px overflow-hidden bg-hair">
        <div style={{ width: `${left * 100}%`, background: leftColor }} />
        {push > 0 && <div style={{ width: `${push * 100}%` }} className="bg-warn/70" />}
        <div style={{ width: `${right * 100}%`, background: rightColor }} />
      </div>
    </div>
  );
}

export function Meter({ value, max = 1, color = "rgb(var(--c-accent))", className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1 w-full overflow-hidden bg-hair", className)}>
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }} />
    </div>
  );
}

/* ---------------- States ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-sm font-medium text-fg-2">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-xs text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="flex items-center gap-2 border-l-2 border-neg bg-neg/5 px-3 py-2 text-xs text-neg">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {error instanceof Error ? error.message : "Something went wrong"}
    </div>
  );
}

/** Where a figure comes from and how fresh it is. */
export function SourceStamp({ source, at, demo, className }: { source?: string; at?: string | null; demo?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs text-subtle", className)}>
      {source && <span>{source}</span>}
      {source && at !== undefined && <span aria-hidden>·</span>}
      {at !== undefined && <span title={at ?? ""}>{at ? ago(at) : "no data"}</span>}
      {demo && <DemoBadge />}
    </div>
  );
}

export function KV({ k, v, className }: { k: React.ReactNode; v: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1 text-sm", className)}>
      <span className="text-muted">{k}</span>
      <span className="num text-fg">{v}</span>
    </div>
  );
}
