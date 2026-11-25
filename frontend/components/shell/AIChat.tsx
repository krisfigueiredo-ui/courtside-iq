"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { STATIC, api, useApi } from "@/lib/api";
import { cn } from "@/lib/format";

interface Msg {
  role: "user" | "assistant";
  content: string;
  citations?: any[];
  tool_calls?: any[];
  error?: string;
  model?: string;
}

const SUGGESTIONS = [
  "Where does the model disagree most with the closing line today?",
  "Summarize this game: form, injuries, and how the market has moved.",
  "Which teams has the model been most and least accurate on this season?",
  "Which college conferences produce the largest total errors?",
];

/** Answer sections the assistant is instructed to use; each gets its own marker. */
const SECTION: Record<string, { cls: string; label: string }> = {
  "verified data": { cls: "border-pos", label: "Verified data" },
  "model estimates": { cls: "border-accent", label: "Model estimates" },
  interpretation: { cls: "border-info", label: "Interpretation" },
};

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g).map((p, i) => {
    if (p.startsWith("**")) return <strong key={i} className="font-semibold text-fg">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`")) return <code key={i} className="num rounded-sm bg-raised px-1 text-xs">{p.slice(1, -1)}</code>;
    if (/^\[\d+\]$/.test(p)) return <sup key={i} className="num ml-0.5 text-2xs text-accent">{p.slice(1, -1)}</sup>;
    return <span key={i}>{p}</span>;
  });
}

function Blocks({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((b, i) => {
          const lines = b.split("\n");
          if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l)))
            return (
              <ul key={i} className="ml-4 list-disc space-y-0.5 marker:text-subtle">
                {lines.map((l, j) => (
                  <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""))}</li>
                ))}
              </ul>
            );
          if (lines[0].startsWith("|"))
            return (
              <pre key={i} className="num overflow-x-auto border border-hair bg-canvas p-2 text-2xs text-fg-2">
                {b}
              </pre>
            );
          return <p key={i}>{inline(b)}</p>;
        })}
    </>
  );
}

/** Markdown subset with the three answer sections rendered as marked blocks. */
function Answer({ text }: { text: string }) {
  const parts = text.split(/^#{2,4}\s+(.+)$/m);
  const out: React.ReactNode[] = [];
  if (parts[0].trim()) out.push(<Blocks key="lead" text={parts[0]} />);
  for (let i = 1; i < parts.length; i += 2) {
    const head = parts[i].trim();
    const sec = SECTION[head.toLowerCase()];
    out.push(
      <section key={i} className={cn("border-l-2 pl-2.5", sec?.cls ?? "border-hair")}>
        <div className="label mb-1">{sec?.label ?? head}</div>
        <div className="space-y-2">
          <Blocks text={parts[i + 1] ?? ""} />
        </div>
      </section>,
    );
  }
  return <div className="space-y-3 text-sm leading-relaxed text-fg-2">{out}</div>;
}

export function AIChat({ compact, context }: { compact?: boolean; context?: Record<string, any> }) {
  const status = useApi<any>("/api/ai/status");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const ask = useMutation({
    mutationFn: (question: string) =>
      api<any>("/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({ question, history: msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), context }),
      }),
    onSuccess: (r) =>
      setMsgs((m) => [...m, { role: "assistant", content: r.answer ?? "", citations: r.citations, tool_calls: r.tool_calls, error: r.error, model: r.model }]),
    onError: (e: any) => setMsgs((m) => [...m, { role: "assistant", content: "", error: e.message }]),
  });
  useEffect(() => {
    if (msgs.length || ask.isPending) bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, ask.isPending]);
  const send = (text: string) => {
    if (!text.trim() || ask.isPending) return;
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setQ("");
    ask.mutate(text);
  };
  const disabled = STATIC || (status.data && !status.data.enabled);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex-1 space-y-4 overflow-y-auto px-3 py-3", !compact && "min-h-[420px]")}>
        {disabled && (
          <div className="border-l-2 border-warn bg-warn/5 px-2.5 py-2 text-xs text-fg-2">
            <div className="font-medium text-fg">{STATIC ? "The assistant needs the full application" : "Claude API key not configured"}</div>
            <p className="mt-0.5 text-muted">
              {STATIC ? "This site is a static build. Run the API (see the README) and set " : "Set "}
              <code className="num">ANTHROPIC_API_KEY</code> on the backend to enable COURTSIDE AI. Everything else works without it.{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>
            </p>
          </div>
        )}
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Ask about games, players, markets or the model. Answers cite the records they use and separate verified data, model estimates and interpretation.</p>
            <div className="divide-y divide-hair border-y border-hair">
              {SUGGESTIONS.map((s) => (
                <button key={s} disabled={!!disabled} onClick={() => send(s)} className="block w-full px-1 py-1.5 text-left text-sm text-fg-2 hover:text-fg disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "user" ? (
              <div className="max-w-[88%] rounded bg-raised px-2.5 py-1.5 text-sm text-fg">{m.content}</div>
            ) : (
              <div className="w-full space-y-2">
                {m.error ? <div className="border-l-2 border-neg px-2.5 py-1 text-xs text-neg">{m.error}</div> : <Answer text={m.content} />}
                {!!m.tool_calls?.length && <div className="num text-2xs text-subtle">tools: {m.tool_calls.map((t) => t.tool).join(", ")}</div>}
                {!!m.citations?.length && (
                  <details className="text-2xs text-muted">
                    <summary className="cursor-pointer select-none text-subtle hover:text-fg">{m.citations.length} sources</summary>
                    <ol className="mt-1 space-y-0.5">
                      {m.citations.slice(0, 15).map((c) => (
                        <li key={c.n} className="num flex gap-1.5">
                          <span className="text-accent">[{c.n}]</span>
                          <span className="truncate">
                            {c.table}#{String(c.id)} {c.label ? `· ${c.label}` : ""} {c.timestamp ? `· ${new Date(c.timestamp).toLocaleString()}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Retrieving records…
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
        className="border-t border-hair p-2"
      >
        <div className="flex items-end gap-2 rounded border border-hair bg-canvas p-1.5 focus-within:border-edge">
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(q);
              }
            }}
            rows={compact ? 2 : 3}
            disabled={!!disabled}
            placeholder={disabled ? "Assistant unavailable" : "Ask a question…"}
            aria-label="Question for COURTSIDE AI"
            className="flex-1 resize-none bg-transparent px-1 text-sm text-fg placeholder:text-subtle focus:outline-none"
          />
          <button type="submit" disabled={!q.trim() || ask.isPending || !!disabled} className="rounded bg-accent p-1.5 text-accent-fg disabled:opacity-40" aria-label="Send">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
