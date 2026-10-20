"use client";

import { ROLES, type Role } from "@cairn/shared";
import { useTransition } from "react";
import { setDemoRole } from "@/app/actions";

export function RoleSwitcher({ current, labels }: { current: Role; labels: Record<Role, string> }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      Voir en tant que
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setDemoRole(e.target.value))}
        className="h-8 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {labels[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
