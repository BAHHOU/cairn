import { Check, Compass } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeatureKey } from "@/lib/nav";

/** Planned features with a description in `planned.feature`. */
export type PlannedKey = Exclude<
  FeatureKey,
  | "home"
  | "projects"
  | "import"
  | "issues"
  | "overview"
  | "architecture"
  | "codeMap"
  | "docs"
  | "onboarding"
  | "delivery"
>;

/**
 * A feature whose place in Cairn is decided but whose data is not wired yet. It says what the page
 * will show and nothing more: no sample numbers, so nobody mistakes the roadmap for a measurement.
 */
export async function PlannedFeature({ feature, back }: { feature: PlannedKey; back: string }) {
  const t = await getTranslations("planned");
  const tn = await getTranslations("nav.item");
  const points = (["p1", "p2", "p3"] as const).map((p) => t(`feature.${feature}.${p}`));

  return (
    <>
      <PageHeader
        title={tn(feature)}
        description={t(`feature.${feature}.summary`)}
        actions={<Badge variant="info">{t("common.badge")}</Badge>}
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="size-4 text-muted-foreground" aria-hidden />
            {t("common.whatYouGet")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2 text-sm">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("common.roadmap")}</p>
          <Link
            href={back}
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
          >
            {t("common.back")}
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
