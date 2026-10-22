"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component every few seconds while an import is running. */
export function AutoRefresh({ active, everyMs = 1500 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}
