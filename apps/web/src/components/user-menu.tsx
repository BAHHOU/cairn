"use client";

import { LOCALE_LABEL, LOCALES, ROLES, type Role } from "@cairn/shared";
import { FlaskConical, Languages, Monitor, Moon, Sun, SunMoon, UserRoundCog } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { setDemoRole } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale } from "@/i18n/actions";

const THEMES = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
] as const;

/**
 * Everything personal sits behind the avatar, as on GitLab: who you are, the role you view as in
 * the demo, and the preferences (language, theme). The top bar keeps only search and creation.
 */
export function UserMenu({
  name,
  role,
  team,
  demo,
}: {
  name: string;
  role: Role;
  team: string;
  demo: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const [pending, start] = useTransition();
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("shell.userMenu")}
        className="grid size-8 place-items-center rounded-full bg-primary/15 font-semibold text-primary text-xs outline-none ring-offset-background hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary text-sm">
            {initials}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">{name}</span>
            <span className="truncate text-muted-foreground text-xs">
              {t(`domain.role.${role}`)} · {team}
            </span>
          </div>
        </div>

        {demo ? (
          <>
            <div className="mx-1 mb-1 flex items-start gap-2 rounded-md bg-warning/10 px-2 py-1.5 text-xs">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <span>
                <span className="font-medium">{t("shell.demoBadge")}</span>
                <span className="block text-muted-foreground">{t("shell.demoHint")}</span>
              </span>
            </div>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={pending}>
                <UserRoundCog aria-hidden />
                {t("shell.viewAs")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={role}
                  onValueChange={(r) => start(() => setDemoRole(r))}
                >
                  {ROLES.map((r) => (
                    <DropdownMenuRadioItem key={r} value={r}>
                      {t(`domain.role.${r}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={pending}>
              <Languages aria-hidden />
              {t("shell.language")}
              <span className="ml-auto text-muted-foreground text-xs">
                {LOCALE_LABEL[locale as keyof typeof LOCALE_LABEL]}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(l) => start(() => setLocale(l))}
              >
                {LOCALES.map((l) => (
                  <DropdownMenuRadioItem key={l} value={l} lang={l}>
                    {LOCALE_LABEL[l]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunMoon aria-hidden />
              {t("shell.theme")}
              {theme ? (
                <span className="ml-auto text-muted-foreground text-xs">
                  {t(`shell.themeOption.${theme as (typeof THEMES)[number]["id"]}`)}
                </span>
              ) : null}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                {THEMES.map(({ id, icon: Icon }) => (
                  <DropdownMenuRadioItem key={id} value={id}>
                    <Icon aria-hidden />
                    {t(`shell.themeOption.${id}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
