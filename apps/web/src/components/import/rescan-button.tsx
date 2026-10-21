"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rescanRepositoryAction } from "@/app/(app)/projects/import/actions";
import { Button } from "@/components/ui/button";

/** Starts a new scan of an imported repository. Unchanged files are reused, not read again. */
export function RescanButton({
  repositoryId,
  disabled,
}: {
  repositoryId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const outcome = await rescanRepositoryAction(repositoryId);
            if (!outcome.ok) setError(outcome.message);
            router.refresh();
          })
        }
      >
        <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} /> Re-scanner
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}
