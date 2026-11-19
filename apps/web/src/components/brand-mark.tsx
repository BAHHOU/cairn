import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The MergeOK logo, from assets/full-logo.png with its background keyed out (public/brand, 619×96).
 * Dark mode: the logo as drawn. Light mode: the same lockup with the mark from assets/logo-icon.png
 * and the letters in Mineral, "OK" in deep olive, since white and Citron cannot be read on Ivory.
 */
export function BrandLogo({ alt, className }: { alt: string; className?: string }) {
  const size = "h-[22px] w-auto shrink-0";
  return (
    <span className={cn("inline-flex", className)}>
      <Image
        src="/brand/logo-light.png"
        alt={alt}
        width={619}
        height={96}
        priority
        className={cn(size, "dark:hidden")}
      />
      <Image
        src="/brand/logo-dark.png"
        alt={alt}
        width={619}
        height={96}
        priority
        className={cn(size, "hidden dark:block")}
      />
    </span>
  );
}

/** The mark alone (public/brand/mark.png, 211×128), for narrow spaces. Same colours in every theme. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mark.png"
      alt=""
      width={211}
      height={128}
      priority
      className={cn("h-6 w-auto shrink-0", className)}
    />
  );
}
