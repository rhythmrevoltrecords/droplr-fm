"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "droplr-scroll-to";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  return true;
}

/**
 * Jumps to a section on `page` without putting "#section" in the address bar.
 * From another page it navigates to `page` first, then scrolls once the section exists.
 */
export function SectionLink({ page = "/", section, className, children }: { page?: string; section: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <a
      href={page}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        if (pathname === page && scrollToId(section)) return;
        try { sessionStorage.setItem(KEY, section); } catch {}
        router.push(page);
      }}
    >
      {children}
    </a>
  );
}

/** Put once on a page that has sections: finishes a SectionLink jump that started on another page. */
export function SectionScrollTarget() {
  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch {}
    if (!id) return;
    const target = id;
    let tries = 0;
    const t = setInterval(() => { if (scrollToId(target) || ++tries > 20) clearInterval(t); }, 50);
    return () => clearInterval(t);
  }, []);
  return null;
}
