"use client";
import { BellOff, BellRing, Loader2, Share, Smartphone, SquarePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type PushDevice = { id: string; label: string; added: string; lastSent: string | null; endpoint: string };
type Kind = { key: string; label: string; hint: string };
type Mode = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as { error?: string; sent?: number };
  return res.ok ? { ok: true as const, ...j } : { ok: false as const, error: j.error ?? "Something went wrong" };
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function PushSettings({ vapidKey, devices, kinds, prefs }: { vapidKey: string | null; devices: PushDevice[]; kinds: Kind[]; prefs: Record<string, boolean> }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [p, setP] = useState(prefs);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const sa = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setStandalone(sa);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (ios && !sa) return setMode("ios-install"); // iPhone/iPad: web push only works from the Home Screen app
      if (!supported) return setMode("unsupported");
      if (Notification.permission === "denied") return setMode("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setMode(sub ? "on" : "off");
    })().catch(() => setMode("unsupported"));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function turnOn() {
    if (!vapidKey) return;
    setBusy("on"); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMode(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) }));
      const r = await call("/api/push/subscribe", "POST", { subscription: sub.toJSON() });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setEndpoint(sub.endpoint); setMode("on");
      setMsg({ ok: true, text: "Notifications are on for this device." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't turn on notifications" });
    } finally { setBusy(null); }
  }

  async function turnOff() {
    setBusy("off"); setMsg(null);
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await call("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}); }
    setEndpoint(null); setMode("off"); setBusy(null); router.refresh();
  }

  async function test() {
    setBusy("test"); setMsg(null);
    const r = await call("/api/push/test", "POST");
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: r.sent ? "Sent. It should pop up in a few seconds." : "Sent, but no device accepted it. Try turning notifications off and on again." } : { ok: false, text: r.error });
  }

  async function togglePref(key: string, value: boolean) {
    setP((x) => ({ ...x, [key]: value }));
    const r = await call("/api/push/prefs", "PATCH", { [key]: value });
    if (!r.ok) { setP((x) => ({ ...x, [key]: !value })); setMsg({ ok: false, text: r.error }); }
  }

  async function removeDevice(id: string, ep: string) {
    setBusy(`rm-${id}`);
    await call("/api/push/devices", "DELETE", { id });
    if (ep === endpoint) { const reg = await navigator.serviceWorker.getRegistration("/"); await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => {}); setEndpoint(null); setMode("off"); }
    setBusy(null); router.refresh();
  }

  return (
    <div className="space-y-5">
      {!vapidKey && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Push isn&apos;t switched on for this deployment yet (VAPID keys not set).</p>}

      {/* This device */}
      <div className="rounded-xl border p-4">
        {mode === "loading" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking this device…</p>}
        {mode === "ios-install" && (
          <div className="space-y-3 text-sm">
            <p className="font-medium">On iPhone, add droplr to your Home Screen first</p>
            <p className="text-muted-foreground">Apple only allows website notifications from apps on the Home Screen (iOS 16.4 or newer).</p>
            <ol className="space-y-2">
              {[
                <>Open this page in <strong>Safari</strong> and tap <Share className="inline h-4 w-4 align-[-2px]" aria-label="Share" /> <strong>Share</strong>.</>,
                <>Tap <SquarePlus className="inline h-4 w-4 align-[-2px]" aria-hidden /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</>,
                <>Open <strong>droplr</strong> from your Home Screen, log in, and come back to Account to turn notifications on.</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs">{i + 1}</span>
                  <span className="min-w-0 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {mode === "unsupported" && <p className="text-sm text-muted-foreground">This browser can&apos;t receive push notifications. Try Chrome, Edge or Firefox, or Safari on a Mac (macOS 13+).</p>}
        {mode === "denied" && <p className="text-sm text-muted-foreground"><BellOff className="mr-1 inline h-4 w-4" /> Notifications are blocked for droplr.fm in this browser. Allow them in the browser&apos;s site settings{standalone ? " (on iPhone: Settings → Notifications → droplr)" : ""}, then reload this page.</p>}
        {(mode === "off" || mode === "on") && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">{mode === "on" ? <><BellRing className="mr-1 inline h-4 w-4 text-emerald-400" /> On for this device</> : "Off for this device"}</p>
              <p className="text-muted-foreground">{mode === "on" ? "You'll get the notifications ticked below." : "Get a notification on this phone or computer when something happens."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {mode === "off" ? (
                <Button onClick={turnOn} disabled={!vapidKey || !!busy}>{busy === "on" ? <Loader2 className="animate-spin" /> : <BellRing />} Turn on notifications</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={test} disabled={!!busy}>{busy === "test" && <Loader2 className="animate-spin" />} Send a test</Button>
                  <Button variant="ghost" onClick={turnOff} disabled={!!busy}>{busy === "off" && <Loader2 className="animate-spin" />} Turn off</Button>
                </>
              )}
            </div>
          </div>
        )}
        {install && !standalone && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
            <span className="text-muted-foreground"><Smartphone className="mr-1 inline h-4 w-4" /> Install droplr as an app for one-tap access.</span>
            <Button size="sm" variant="outline" onClick={async () => { await install.prompt(); setInstall(null); }}>Install app</Button>
          </div>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      </div>

      {/* What to notify */}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Notify me about</legend>
        {kinds.map((k) => (
          <label key={k.key} className="flex min-h-[44px] items-start gap-3 rounded-lg border p-3 text-sm">
            <input type="checkbox" checked={p[k.key] !== false} onChange={(e) => togglePref(k.key, e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span><span className="font-medium">{k.label}</span><span className="block text-muted-foreground">{k.hint}</span></span>
          </label>
        ))}
      </fieldset>

      {/* Devices */}
      {devices.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Devices</p>
          <ul className="divide-y rounded-lg border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.label}{d.endpoint === endpoint ? " · this device" : ""}</span>
                  <span className="block text-xs text-muted-foreground">Added {d.added}{d.lastSent ? ` · last notified ${d.lastSent}` : ""}</span>
                </span>
                <Button size="icon" variant="ghost" aria-label={`Remove ${d.label}`} disabled={!!busy} onClick={() => removeDevice(d.id, d.endpoint)}>{busy === `rm-${d.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
