"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A modal: what a click opens in place, so that nobody has to scroll to the bottom of the page to
 * read the answer. Radix handles the focus trap, Escape, and the scroll lock (it keeps the width of
 * the scrollbar, so the page does not jump when the modal opens).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[60] bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-[60] flex max-h-[min(88vh,52rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-card shadow-2xl outline-none",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=open]:animate-in",
            wide ? "w-[min(94vw,64rem)]" : "w-[min(94vw,42rem)]",
          )}
        >
          <header className="flex items-start gap-3 border-b p-4 pr-3">
            {icon}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <DialogPrimitive.Title className="break-words font-semibold text-base leading-snug">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-muted-foreground text-xs">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Fermer"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
