"use client";
import Link from "next/link";

// Admin-scoped error boundary: shows a usable page (with the digest for Netlify function logs)
// instead of Next's bare "Application error" screen.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">The dashboard couldn&apos;t load</h1>
        <p className="text-sm text-muted-foreground">Something went wrong on the server. Try again, or sign in again if it keeps happening.</p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Digest: {error.digest}</p>}
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
          <Link href="/login" className="rounded-lg border px-4 py-2 text-sm">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
