"use client";

import { Check } from "lucide-react";
import { Checkbox as Primitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** shadcn/ui Checkbox: drawn by the design system, identical in every browser and theme. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "peer grid size-4 shrink-0 place-items-center rounded-[4px] border border-input bg-background shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <Primitive.Indicator>
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </Primitive.Indicator>
    </Primitive.Root>
  );
}

export { Checkbox };
