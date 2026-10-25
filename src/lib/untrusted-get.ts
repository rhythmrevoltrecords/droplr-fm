import { request } from "node:https";

/**
 * A GET to a server someone else chose (a pasted artwork URL, a link-in-bio page to import).
 *
 * Deliberately not fetch(). fetch() decompresses whatever Content-Encoding the server sends back,
 * and in October 2026 Node's Brotli decoder had a remote-code-execution bug (CVE-2026-111497,
 * "Node2Shell"): a hostile server answering one of these requests could run code inside droplr's
 * functions, where every secret lives. droplr does not control which Node patch release the
 * hosting runtime is on, so the defence has to be here: ask for no compression, and refuse any
 * response that is compressed anyway, without ever handing its bytes to a decoder.
 *
 * node:https never decompresses on its own and never follows redirects, which is what the callers
 * already required (a public host must not be able to bounce the request to an internal address).
 * The caller is still responsible for the address check (publicHttpsUrl in lib/color.ts).
 */
export type UntrustedResult = { status: number; contentType: string; body: Buffer };

export function untrustedGet(
  url: URL,
  o: { maxBytes: number; timeoutMs: number; accept?: string; userAgent?: string; truncate?: boolean; onError?: (code: string) => void },
): Promise<UntrustedResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: UntrustedResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "accept-encoding": "identity",
          ...(o.accept ? { accept: o.accept } : {}),
          "user-agent": o.userAgent ?? "droplr.fm (+https://droplr.fm)",
        },
      },
      (res) => {
        if (isCompressed(res.headers["content-encoding"] as string | undefined)) {
          // Compressed despite being asked not to: drop it unread.
          res.destroy();
          req.destroy();
          return done(null);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > o.maxBytes) {
            if (o.truncate) {
              const keep = chunk.subarray(0, Math.max(0, o.maxBytes - (size - chunk.length)));
              if (keep.length) chunks.push(keep);
              res.destroy();
              req.destroy();
              return done({ status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) });
            }
            res.destroy();
            req.destroy();
            return done(null);
          }
          chunks.push(chunk);
        });
        res.on("end", () => done({ status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }));
        res.on("error", () => done(null));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(null);
    }, o.timeoutMs);
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (!settled) o.onError?.(e.code ?? "");
      done(null);
    });
    req.end();
  });
}

/** True when a response would have been decompressed by fetch(). Exported for the test. */
export const isCompressed = (contentEncoding: string | null | undefined) => {
  const e = (contentEncoding ?? "identity").trim().toLowerCase();
  return e !== "identity" && e !== "";
};
