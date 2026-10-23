import { validIndexNowKey } from "@/lib/indexnow";

/**
 * The IndexNow key file. Served on every host this app answers on — droplr.fm and each label's
 * custom domain — because a search engine only accepts URLs for a host whose own copy of the key
 * it can read. Middleware never sees .txt requests, so the tenant rewrite doesn't intercept it.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = validIndexNowKey(process.env.INDEXNOW_KEY);
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
