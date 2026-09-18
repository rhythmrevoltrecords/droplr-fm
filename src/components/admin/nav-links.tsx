"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; /** data-tour hook for the first-login walkthrough. */ tour?: string; /** Also reachable from Settings: hidden on narrower desktops so the bar never wraps. */ wide?: boolean };

/** The nav item for this page: the longest href the path starts with (so /admin/settings/billing is Billing, not Settings). */
function activeHref(nav: Item[], path: string) {
  return nav.filter((n) => path === n.href || path.startsWith(`${n.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Scrolls the active item of a sideways scroller into view (mobile nav, release tabs). */
export function ScrollActiveIntoView({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-active='true']");
    const box = ref.current?.firstElementChild as HTMLElement | null;
    if (el && box && box.scrollWidth > box.clientWidth) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  });
  return <div ref={ref} className={className}>{children}</div>;
}

export function DesktopNav({ nav }: { nav: Item[] }) {
  const active = activeHref(nav, usePathname());
  return (
    <nav className="hidden items-center gap-0.5 text-[13px] lg:text-sm md:flex">
      {nav.map((n) => (
        <Link key={n.href} href={n.href} data-tour={n.tour} aria-current={active === n.href ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 hover:bg-secondary hover:text-foreground", n.wide && "hidden 2xl:inline-flex", active === n.href ? "bg-secondary text-foreground" : "text-muted-foreground")}>{n.label}</Link>
      ))}
    </nav>
  );
}

export function MobileNav({ nav }: { nav: Item[] }) {
  const active = activeHref(nav, usePathname());
  return (
    <ScrollActiveIntoView className="md:hidden">
      <nav className="no-scrollbar container flex gap-1.5 overflow-x-auto pb-2 text-sm [mask-image:linear-gradient(to_right,black_85%,transparent)]">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} data-tour={n.tour ? `${n.tour}-m` : undefined} data-active={active === n.href} aria-current={active === n.href ? "page" : undefined} className={cn("shrink-0 rounded-full px-3.5 py-1.5", active === n.href ? "bg-foreground font-medium text-background" : "bg-secondary/60 text-muted-foreground")}>{n.label}</Link>
        ))}
        <span aria-hidden className="w-6 shrink-0" />
      </nav>
    </ScrollActiveIntoView>
  );
}
