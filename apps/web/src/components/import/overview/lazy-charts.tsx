"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Component, type ReactNode } from "react";

/**
 * Charts load in the browser only (Recharts measures the DOM). While they load, a skeleton holds
 * their place; if one throws, only that chart is replaced by a message, never the page.
 */

function ChartSkeleton({ height = 176 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse rounded-md bg-muted/60" style={{ height }} aria-hidden />
  );
}

function ChartError() {
  const t = useTranslations("overview.charts");
  return (
    <p role="alert" className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
      {t("error")}
    </p>
  );
}

export class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <ChartError /> : this.props.children;
  }
}

export const UsefulNoiseDonut = dynamic(() => import("./charts").then((m) => m.UsefulNoiseDonut), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export const KindStackedBar = dynamic(() => import("./charts").then((m) => m.KindStackedBar), {
  ssr: false,
  loading: () => <ChartSkeleton height={96} />,
});

export const TopBars = dynamic(() => import("./charts").then((m) => m.TopBars), {
  ssr: false,
  loading: () => <ChartSkeleton height={240} />,
});
