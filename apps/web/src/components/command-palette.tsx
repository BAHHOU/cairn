"use client";

import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface PaletteEntry {
  group: string;
  label: string;
  href: string;
}

export function CommandPalette({ entries }: { entries: PaletteEntry[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const groups = [...new Set(entries.map((e) => e.group))];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Rechercher un projet, une page…</span>
        <kbd className="rounded border bg-muted px-1.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Palette de commandes"
        overlayClassName="fixed inset-0 z-50 bg-black/50"
        contentClassName="fixed left-1/2 top-[18%] z-50 w-[92vw] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
      >
        <Command.Input
          placeholder="Tapez pour rechercher…"
          className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            Aucun résultat.
          </Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {entries
                .filter((e) => e.group === group)
                .map((e) => (
                  <Command.Item
                    key={e.href}
                    value={`${e.group} ${e.label}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(e.href);
                    }}
                    className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    {e.label}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
