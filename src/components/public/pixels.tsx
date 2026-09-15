"use client";
import Script from "next/script";
import { useEffect } from "react";

type W = Window & { fbq?: (...a: unknown[]) => void; ttq?: { track: (e: string, p?: object) => void }; gtag?: (...a: unknown[]) => void };

/** Label-level pixels: set once per org, fire on every release page. */
export function Pixels({ meta, tiktok, ga4, contentName }: { meta?: string | null; tiktok?: string | null; ga4?: string | null; contentName: string }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-track]");
      if (!el) return;
      const platform = el.dataset.track;
      const w = window as W;
      const kind = el.dataset.kind === "presave" ? "Lead" : "ViewContent";
      w.fbq?.("track", kind, { content_name: contentName, content_category: platform });
      w.ttq?.track(kind === "Lead" ? "SubmitForm" : "ClickButton", { content_name: contentName, description: platform });
      w.gtag?.("event", kind === "Lead" ? "generate_lead" : "select_content", { content_type: platform, item_id: contentName });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [contentName]);

  const safe = (v?: string | null) => (v && /^[A-Za-z0-9_-]+$/.test(v) ? v : null);
  const m = safe(meta), t = safe(tiktok), g = safe(ga4);
  return (
    <>
      {m && (
        <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${m}');fbq('track','PageView');`}</Script>
      )}
      {t && (
        <Script id="tiktok-pixel" strategy="afterInteractive">{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${t}');ttq.page();}(window,document,'ttq');`}</Script>
      )}
      {g && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${g}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${g}');`}</Script>
        </>
      )}
    </>
  );
}
