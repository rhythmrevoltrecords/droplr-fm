"use client";
import { Compass, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Shows the first-login walkthrough again from the start. */
export function RestartTourButton({ home }: { home: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ done: false }) }).catch(() => {});
        router.push(home);
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Compass />} Show me around again
    </Button>
  );
}
