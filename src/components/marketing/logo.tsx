import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Source files are black artwork on a transparent background.
// The app runs in dark mode (<html class="dark">), so `dark:brightness-0 dark:invert`
// renders them pure white. Drop the `dark` class and they show in their original black.
const INVERT = "invert-0 dark:brightness-0 dark:invert";

export function Logo({ href = "/", variant = "wordmark", className, priority = false }: { href?: string; variant?: "wordmark" | "icon"; className?: string; priority?: boolean }) {
  return (
    <Link href={href} aria-label="droplr.fm home" className={cn("inline-flex shrink-0 items-center", className)}>
      {variant === "icon" ? (
        <Image src="/logo/icon.png" alt="droplr.fm" width={32} height={32} priority={priority} className={cn("h-8 w-8", INVERT)} />
      ) : (
        <Image src="/logo/wordmark.png" alt="droplr.fm" width={108} height={36} priority={priority} className={cn("h-9 w-auto", INVERT)} />
      )}
    </Link>
  );
}
