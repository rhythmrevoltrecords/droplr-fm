"use client";
import { QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";

export function QrDownload({ value, filename, label = "QR" }: { value: string; filename: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  return (
    <>
      <div ref={ref} className="hidden" aria-hidden>
        <QRCodeCanvas id={id} value={value} size={1024} marginSize={4} level="M" />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          const canvas = ref.current?.querySelector("canvas");
          if (!canvas) return;
          const a = document.createElement("a");
          a.href = canvas.toDataURL("image/png");
          a.download = `${filename}.png`;
          a.click();
        }}
      >
        <QrCode /> {label}
      </Button>
    </>
  );
}
