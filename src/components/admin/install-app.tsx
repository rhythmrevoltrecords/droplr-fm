"use client";
import { Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const DISMISSED = "dfm_install_dismissed";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Nudge to put droplr on the Home Screen.
 *
 * Android and desktop Chrome fire beforeinstallprompt, so there's a real one-tap install button.
 * **iOS never prompts at all** — Safari requires Share → Add to Home Screen and tells nobody, so
 * the artists most likely to want this are the ones least likely to find it. That asymmetry is
 * the whole reason this component exists; the Android half is a freebie on top.
 *
 * Renders nothing once installed, so it can't nag someone who already did it.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already installed? Nothing to ask for. iOS reports it on navigator, everyone else via
    // display-mode, and both are checked because neither alone covers both platforms.
    const installed =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) return;

    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED) === "1"; } catch { dismissed = false; }
    if (dismissed) return;

    // iPadOS 13+ reports itself as a Mac, so a touch-capable "Mac" is really an iPad.
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIos) {
      setIos(true);
      setShow(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it, so the button below can fire it when they're ready
      setPrompt(e as Prompt);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setShow(false));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* private mode: it'll ask again, which is fine */ }
    setShow(false);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setShow(false);
  }

  return (
    <Card className="border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Put droplr on your Home Screen</p>
          {ios ? (
            <p className="text-sm text-muted-foreground">
              Tap <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" /> in Safari&apos;s toolbar, then{" "}
              <span className="whitespace-nowrap">
                <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> Add to Home Screen
              </span>
              . You&apos;ll get an icon, full screen, and a ping on release day.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Opens full screen with its own icon, and can notify you on release day.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!ios && <Button size="sm" onClick={() => void install()}>Install</Button>}
          <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
