"use client";
import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * The homepage's motion, and only that: the markup is all server-rendered and complete without it.
 *
 *  - Always: scales the composition to the width it has (the stacked layout).
 *  - Motion welcome: calm reveals on the later sections.
 *  - Motion welcome AND at least 1000x680: one pinned, scrubbed stage where the composition
 *    separates into three chapters (pre-save, smart link, 9am email), plus a little pointer tilt on
 *    the front phone where there is a real pointer.
 *
 * Everything is created inside gsap.matchMedia, so leaving a query (resize, or turning on reduced
 * motion) reverts it to the stacked layout, and unmounting reverts the lot.
 */
export function ShowcaseMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-sc-root]");
    const wrap = root?.querySelector<HTMLElement>("[data-sc-compwrap]");
    const comp = root?.querySelector<HTMLElement>("[data-sc-comp]");
    if (!root || !wrap || !comp) return;
    gsap.registerPlugin(ScrollTrigger);

    const fit = () => {
      if (root.classList.contains("sc-tour-on")) return;
      const w = wrap.clientWidth;
      const compact = w < 760;
      comp.style.setProperty("--cw", compact ? "640px" : "1080px");
      comp.style.setProperty("--slx", compact ? "-190px" : "-330px");
      comp.style.setProperty("--emx", compact ? "200px" : "350px");
      wrap.style.setProperty("--s", Math.min(1, w / (compact ? 620 : 1080)).toFixed(4));
    };
    window.addEventListener("resize", fit);
    fit();

    const mm = gsap.matchMedia(root);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      root.classList.add("sc-rv-ready");
      ScrollTrigger.batch(root.querySelectorAll(".sc-rv"), {
        start: "top 88%",
        once: true,
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, overwrite: true }),
      });
      return () => {
        root.classList.remove("sc-rv-ready");
        gsap.set(root.querySelectorAll(".sc-rv"), { clearProps: "all" });
      };
    });

    mm.add("(min-width: 1000px) and (min-height: 680px) and (prefers-reduced-motion: no-preference)", () => {
      root.classList.add("sc-tour-on");
      comp.style.setProperty("--cw", "1080px");
      const q = <T extends Element = HTMLElement>(s: string, r: ParentNode = root) => r.querySelector(s) as T;
      const ps = q(".sc-p-ps", comp), sl = q(".sc-p-sl", comp), em = q(".sc-p-em", comp);
      const warn = q("[data-sc-warn]", sl);
      const caps = comp.querySelectorAll(".sc-cap");
      const ch = Array.from(root.querySelectorAll<HTMLElement>(".sc-chapter"));
      const stage = q("[data-sc-stage]"), hero = q("[data-sc-hero]"), note = q("[data-sc-note]"), light = q(".sc-light");

      const vh = () => window.innerHeight;
      // In the hero state the composition sits low, peeking under the headline.
      const heroY = () => Math.max(0, hero.offsetTop + hero.offsetHeight + 56 - (vh() / 2 - 320));
      const spot = () => Math.min(window.innerWidth * 0.22, 310);

      gsap.set([ps, sl, em], { xPercent: -50, transformPerspective: 0 });
      gsap.set(ps, { x: 0, z: 0, rotationY: 0 });
      gsap.set(sl, { x: -330, z: -180, rotationY: 20 });
      gsap.set(em, { x: 350, z: -180, rotationY: -20 });
      gsap.set(comp, { y: heroY });
      // The chapters are centred with translateY(-50%); hand that to GSAP so its y tweens add to it.
      gsap.set(ch, { yPercent: -50, y: 0 });

      const live = [0.28, 0.56, 0.82], dead = [0.5, 0.78, 1.01];
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut", duration: 1 },
        scrollTrigger: {
          trigger: stage, start: "top top", end: "+=300%", pin: true, scrub: 1, invalidateOnRefresh: true,
          onUpdate(self) {
            const p = self.progress;
            ch.forEach((c, i) => c.classList.toggle("sc-live", p > live[i] && p < dead[i]));
          },
        },
      });

      // 1. the composition rises and separates
      tl.to(hero, { y: -90, autoAlpha: 0, duration: 0.8, ease: "power2.in" }, 0)
        .to(note, { autoAlpha: 0, duration: 0.4 }, 0)
        .fromTo(comp, { y: heroY }, { y: 0, duration: 1.4 }, 0)
        .to(sl, { x: -440, rotationY: 12, z: -120, duration: 1.4 }, 0)
        .to(em, { x: 460, rotationY: -12, z: -120, duration: 1.4 }, 0)
        .to(light, { scale: 1.15, duration: 1.4 }, 0)
        .to(caps, { autoAlpha: 0, duration: 0.5 }, 1.1)
      // 2. pre-save becomes the subject
        .to(ps, { x: spot, z: 0, duration: 1.2 }, 1.6)
        .to(sl, { x: -720, z: -420, autoAlpha: 0, duration: 1.1 }, 1.6)
        .to(em, { x: () => spot() + 520, z: -420, autoAlpha: 0, duration: 1.1 }, 1.6)
        .fromTo(ch[0], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "expo.out" }, 2.1)
        .to({}, { duration: 1 }, 2.9)
      // 3. the smart link takes its place, with the exclusive warning beside it
        .to(ch[0], { autoAlpha: 0, y: -20, duration: 0.6, ease: "power2.in" }, 3.9)
        .to(ps, { x: () => spot() - 140, z: -360, autoAlpha: 0, duration: 1 }, 3.9)
        .fromTo(sl, { x: () => spot() + 240, z: -460, rotationY: -8, autoAlpha: 0 }, { x: spot, z: 0, rotationY: 0, autoAlpha: 1, duration: 1.2, immediateRender: false }, 4.3)
        .fromTo(warn, { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.7, ease: "expo.out" }, 5.1)
        .fromTo(ch[1], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "expo.out" }, 4.7)
        .to({}, { duration: 1 }, 5.6)
      // 4. the 9am email
        .to([ch[1], warn], { autoAlpha: 0, y: -20, duration: 0.6, ease: "power2.in" }, 6.6)
        .to(sl, { x: () => spot() - 140, z: -360, autoAlpha: 0, duration: 1 }, 6.6)
        .fromTo(em, { x: () => spot() + 240, z: -460, rotationY: -8, autoAlpha: 0 }, { x: spot, z: 0, rotationY: 0, autoAlpha: 1, duration: 1.2, immediateRender: false }, 7.0)
        .fromTo(ch[2], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: "expo.out" }, 7.4)
        .to({}, { duration: 1.2 }, 8.2);

      // A little depth from the pointer on the front phone, hero state only, real pointers only.
      let move: ((e: PointerEvent) => void) | null = null;
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        const tilt = q(".sc-tilt", ps);
        const rx = gsap.quickTo(tilt, "rotationX", { duration: 0.9, ease: "power3" });
        const ry = gsap.quickTo(tilt, "rotationY", { duration: 0.9, ease: "power3" });
        move = (e) => {
          const k = (tl.scrollTrigger?.progress ?? 1) < 0.05 ? 1 : 0;
          ry(((e.clientX / window.innerWidth) - 0.5) * k * 6);
          rx(-((e.clientY / window.innerHeight) - 0.5) * k * 4);
        };
        window.addEventListener("pointermove", move, { passive: true });
      }

      document.fonts?.ready.then(() => ScrollTrigger.refresh());
      return () => {
        if (move) window.removeEventListener("pointermove", move);
        root.classList.remove("sc-tour-on");
        ch.forEach((c) => c.classList.remove("sc-live"));
        fit();
      };
    });

    return () => {
      window.removeEventListener("resize", fit);
      mm.revert();
    };
  }, []);
  return null;
}
