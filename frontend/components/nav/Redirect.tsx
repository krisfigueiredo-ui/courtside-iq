"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Client-side redirect for routes that moved into a workspace (works in the static build). */
export function Redirect({ to, label }: { to: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <p className="py-10 text-center text-sm text-muted">
      Moved to{" "}
      <Link href={to} className="text-fg underline">
        {label}
      </Link>
      .
    </p>
  );
}
