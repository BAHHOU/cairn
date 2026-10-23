"use client";

import { ROLES, type Role } from "@cairn/shared";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setDemoRole } from "@/app/actions";

export function RoleSwitcher({ current }: { current: Role }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {t("shell.viewAs")}
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setDemoRole(e.target.value))}
        className="h-8 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`domain.role.${r}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
