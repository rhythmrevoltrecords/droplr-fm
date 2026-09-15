import { MarketingShell } from "./site-chrome";

export function DocShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <MarketingShell>
      <article className="container max-w-3xl py-14">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-8 space-y-5 leading-relaxed text-zinc-300 [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:bg-card [&_pre]:p-4 [&_pre]:text-sm [&_ul]:list-disc [&_ul]:space-y-2 [&_a]:underline">
          {children}
        </div>
      </article>
    </MarketingShell>
  );
}
