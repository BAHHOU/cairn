"use client";

import { Check, Monitor, Moon, Paintbrush, RotateCcw, Sun, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import {
  ACCENT_SWATCH,
  ACCENTS,
  type Accent,
  BASE_SWATCH,
  BASES,
  type Base,
  DEFAULT_THEME,
  FONTS,
  type Font,
  RADII,
  type Radius,
  TEMPLATES,
  type Template,
  THEME_COOKIE,
  type ThemePrefs,
  templateOf,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const FONT_FAMILY: Record<Font, string> = {
  schibsted: '"Schibsted Grotesk Variable", sans-serif',
  plex: '"IBM Plex Sans", sans-serif',
  system: "ui-sans-serif, system-ui, -apple-system, sans-serif",
};

const MODES = [
  { id: "light", Icon: Sun },
  { id: "dark", Icon: Moon },
  { id: "system", Icon: Monitor },
] as const;

/** Puts the preferences on the root element and in the cookie the server reads. */
function apply(p: ThemePrefs) {
  const root = document.documentElement;
  root.dataset.accent = p.accent;
  root.dataset.base = p.base;
  root.dataset.font = p.font;
  root.style.setProperty("--radius", `${p.radius}rem`);
  // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, read by the server to render the theme.
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(JSON.stringify(p))}; path=/; max-age=31536000; samesite=lax`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** One choice in a group: a radio, styled as a tile. */
function Choice({
  selected,
  onSelect,
  label,
  className,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a tile that holds a preview; role="radio" carries the semantics.
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        "relative flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
        selected && "border-primary ring-1 ring-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The look of the interface, shadcn-style: a template, or each part on its own. Every choice
 * applies at once, behind the panel, and is kept in this browser.
 */
export function ThemeCustomizer({ initial }: { initial: ThemePrefs }) {
  const t = useTranslations("theme");
  const { theme: mode, setTheme: setMode, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<ThemePrefs>(initial);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const active = templateOf(prefs);

  const set = (next: Partial<ThemePrefs>) => {
    const p = { ...prefs, ...next };
    setPrefs(p);
    apply(p);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label={t("open")}
        title={t("open")}
        className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Paintbrush className="size-4" aria-hidden />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        {/* No dimming: the page behind is the preview. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60]" />
        <DialogPrimitive.Content className="data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed top-0 right-0 z-[60] flex h-dvh w-[min(100vw,24rem)] flex-col border-l bg-background shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
          <header className="flex items-start gap-3 border-b px-5 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <DialogPrimitive.Title className="font-semibold text-base">
                {t("title")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground text-xs">
                {t("description")}
              </DialogPrimitive.Description>
            </div>
            <button
              type="button"
              onClick={() => set(DEFAULT_THEME)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {t("reset")}
            </button>
            <DialogPrimitive.Close
              aria-label={t("close")}
              className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </header>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
            <Section title={t("templates")}>
              <div role="radiogroup" aria-label={t("templates")} className="grid grid-cols-2 gap-2">
                {(Object.keys(TEMPLATES) as Template[]).map((k) => {
                  const p: ThemePrefs = TEMPLATES[k];
                  const [baseLight, baseDark] = BASE_SWATCH[p.base];
                  const [accLight, accDark] = ACCENT_SWATCH[p.accent];
                  return (
                    <Choice
                      key={k}
                      selected={active === k}
                      onSelect={() => set(p)}
                      label={t(`template.${k}.name`)}
                      className="flex-col items-stretch gap-2 p-2"
                    >
                      <span
                        className="flex h-14 items-end gap-1.5 p-2"
                        style={{
                          background: dark ? baseDark : baseLight,
                          borderRadius: `${Math.min(p.radius, 0.75)}rem`,
                        }}
                        aria-hidden
                      >
                        <span
                          className="h-4 w-9"
                          style={{
                            background: dark ? accDark : accLight,
                            borderRadius: `${Math.min(p.radius, 0.5)}rem`,
                          }}
                        />
                        <span
                          className="ml-auto font-semibold text-base leading-none"
                          style={{ fontFamily: FONT_FAMILY[p.font], color: dark ? "#fff" : "#111" }}
                        >
                          Aa
                        </span>
                      </span>
                      <span className="flex flex-col px-0.5">
                        <span className="font-medium text-sm">{t(`template.${k}.name`)}</span>
                        <span className="text-muted-foreground text-xs leading-4">
                          {t(`template.${k}.hint`)}
                        </span>
                      </span>
                    </Choice>
                  );
                })}
              </div>
            </Section>

            <Section title={t("accent")}>
              <div role="radiogroup" aria-label={t("accent")} className="grid grid-cols-3 gap-2">
                {ACCENTS.map((a: Accent) => (
                  <Choice
                    key={a}
                    selected={prefs.accent === a}
                    onSelect={() => set({ accent: a })}
                    label={t(`accentName.${a}`)}
                  >
                    <span
                      className="grid size-5 shrink-0 place-items-center rounded-full"
                      style={{ background: ACCENT_SWATCH[a][dark ? 1 : 0] }}
                      aria-hidden
                    >
                      {prefs.accent === a ? (
                        <Check
                          className={cn(
                            "size-3",
                            dark && a === "graphite" ? "text-black" : "text-white",
                          )}
                        />
                      ) : null}
                    </span>
                    <span className="truncate text-xs">{t(`accentName.${a}`)}</span>
                  </Choice>
                ))}
              </div>
            </Section>

            <Section title={t("base")}>
              <div role="radiogroup" aria-label={t("base")} className="grid grid-cols-3 gap-2">
                {BASES.map((b: Base) => (
                  <Choice
                    key={b}
                    selected={prefs.base === b}
                    onSelect={() => set({ base: b })}
                    label={t(`baseName.${b}`)}
                  >
                    <span
                      className="size-5 shrink-0 rounded-full border"
                      style={{ background: BASE_SWATCH[b][dark ? 1 : 0] }}
                      aria-hidden
                    />
                    <span className="truncate text-xs">{t(`baseName.${b}`)}</span>
                  </Choice>
                ))}
              </div>
            </Section>

            <Section title={t("radius")}>
              <div role="radiogroup" aria-label={t("radius")} className="grid grid-cols-5 gap-2">
                {RADII.map((r: Radius) => (
                  <Choice
                    key={r}
                    selected={prefs.radius === r}
                    onSelect={() => set({ radius: r })}
                    label={`${r} rem`}
                    className="flex-col justify-center gap-1.5 px-1 py-2.5"
                  >
                    <span
                      className="size-5 border-t-2 border-l-2 border-foreground/70"
                      style={{ borderTopLeftRadius: `${r * 1.2}rem` }}
                      aria-hidden
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">{r}</span>
                  </Choice>
                ))}
              </div>
            </Section>

            <Section title={t("font")}>
              <div role="radiogroup" aria-label={t("font")} className="grid grid-cols-3 gap-2">
                {FONTS.map((f: Font) => (
                  <Choice
                    key={f}
                    selected={prefs.font === f}
                    onSelect={() => set({ font: f })}
                    label={t(`fontName.${f}`)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span
                      className="font-semibold text-lg leading-6"
                      style={{ fontFamily: FONT_FAMILY[f] }}
                    >
                      Aa
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {t(`fontName.${f}`)}
                    </span>
                  </Choice>
                ))}
              </div>
            </Section>

            <Section title={t("mode")}>
              <div role="radiogroup" aria-label={t("mode")} className="grid grid-cols-3 gap-2">
                {MODES.map(({ id, Icon }) => (
                  <Choice
                    key={id}
                    selected={mounted && mode === id}
                    onSelect={() => setMode(id)}
                    label={t(`modeName.${id}`)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate text-xs">{t(`modeName.${id}`)}</span>
                  </Choice>
                ))}
              </div>
            </Section>

            <p className="text-muted-foreground text-xs">{t("statusNote")}</p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
