"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies the already-caveated summary block, so the numbers travel with their footnote. */
export function CopySummary({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // Clipboard refused (insecure origin, or permission). The block above is selectable,
          // so saying nothing and letting them select it is better than an error they can't act on.
        }
      }}
    >
      {done ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</>}
    </Button>
  );
}
