"use client";

import { LOCALE_LABEL, LOCALES } from "@cairn/shared";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";

export function LocaleSwitcher() {
  const t = useTranslations("shell");
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <label className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent">
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => start(() => setLocale(e.target.value))}
        className="bg-transparent text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
