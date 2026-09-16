import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Source files are black artwork on a transparent background.
// .logo-adaptive (globals.css) renders the black artwork white, and leaves it black inside a light theme scope.
const INVERT = "logo-adaptive";

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
