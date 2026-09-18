"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * A "we're thinking about building this — want in?" switch.
 *
 * It is deliberately honest: ticking it shares nothing with anyone, and the copy says so.
 * The point is that when the unreleased pool and bookable profiles do exist, they launch
 * already populated instead of as an empty room.
 */
export function InterestToggle({
  endpoint,
  field,
  initial,
  title,
  description,
}: {
  endpoint: string;
  field: string;
  initial: boolean;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    const previous = on;
    setOn(next);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setOn(previous);
        setError(j.error ?? "Couldn't save that.");
        return;
      }
      router.refresh();
    } catch {
      setOn(previous);
      setError("Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={on}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{title}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Not built yet. Ticking this shares nothing with anyone — it tells us you want it, and you&apos;ll be first in when it&apos;s ready.
            </span>
          </span>
        </label>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
