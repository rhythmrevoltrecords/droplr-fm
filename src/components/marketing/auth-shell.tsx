import { Logo } from "./logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(139,92,246,.25),transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo priority className="[&_img]:h-11" /></div>
        <div className="rounded-2xl border bg-card/80 p-6 backdrop-blur">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
