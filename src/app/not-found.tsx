import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-[.2em] text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-bold">Nobody&apos;s in this room</h1>
        <p className="mt-2 text-muted-foreground">The artist isn&apos;t in the studio right now. This link either changed or was never made public &mdash; wrong door, maybe.</p>
        <Link href="/" className="mt-6 inline-block text-sm underline">droplr.fm</Link>
      </div>
    </main>
  );
}
