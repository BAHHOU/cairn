"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const DropdownMenu = Primitive.Root;
const DropdownMenuTrigger = Primitive.Trigger;
const DropdownMenuGroup = Primitive.Group;
const DropdownMenuSub = Primitive.Sub;
const DropdownMenuRadioGroup = Primitive.RadioGroup;

const PANEL =
  "z-[70] min-w-48 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

const ITEM =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

const DropdownMenuSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) => (
  <Primitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
);

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(PANEL, "min-w-56", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(ITEM, className)} {...props} />;
}

/** Opens a second panel to the side, like GitLab's "Preferences" entries in the user menu. */
function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.SubTrigger>) {
  return (
    <Primitive.SubTrigger className={cn(ITEM, "data-[state=open]:bg-accent", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" aria-hidden />
    </Primitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent sideOffset={4} className={cn(PANEL, className)} {...props} />
    </Primitive.Portal>
  );
}

/** One choice among several; the chosen one carries a check mark. */
function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(ITEM, "pr-8", className)} {...props}>
      {children}
      <Primitive.ItemIndicator className="absolute right-2 flex items-center">
        <Check className="text-foreground!" aria-hidden />
      </Primitive.ItemIndicator>
    </Primitive.RadioItem>
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
