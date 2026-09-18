"use client";
import { Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Print (Save as PDF in the print dialog) and copy-the-text, for pasting into Docs or Word. */
export function TemplateActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button onClick={() => window.print()}><Printer /> Print or save as PDF</Button>
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            window.prompt("Copy this template", text);
          }
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy as text"}
      </Button>
    </div>
  );
}
