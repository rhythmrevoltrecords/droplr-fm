"use client";
import { useEffect } from "react";

/** Adds .mk-in to every .mk-reveal as it scrolls into view. Mounted once per page. */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mk-reveal"));
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("mk-js");
    // Anything already on screen shows straight away.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("mk-in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => { io.disconnect(); root.classList.remove("mk-js"); };
  }, []);
  return null;
}
