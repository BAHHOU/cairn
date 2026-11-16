"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { rescanRepositoryAction } from "@/app/(app)/projects/import/actions";
import { Button } from "@/components/ui/button";
import { type ImportErrorCode, importErrorCode } from "@/lib/import/messages";
import { cn } from "@/lib/utils";

/** Starts a new scan of an imported repository. Unchanged files are reused, not read again. */
export function RescanButton({
  repositoryId,
  disabled,
  className,
  wrapperClassName,
}: {
  repositoryId: string;
  disabled?: boolean;
  /** Extra classes for the button, e.g. the dark primary style of an action column. */
  className?: string;
  wrapperClassName?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<ImportErrorCode | null>(null);

  return (
    <span className={cn("flex flex-col items-end gap-1", wrapperClassName)}>
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const outcome = await rescanRepositoryAction(repositoryId);
            if (!outcome.ok) setError(outcome.code);
            router.refresh();
          })
        }
      >
        <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} />{" "}
        {t("import.rescan")}
      </Button>
      {error ? (
        <span className="text-destructive text-xs">
          {t(`importErrors.${importErrorCode(error)}`)}
        </span>
      ) : null}
    </span>
  );
}
