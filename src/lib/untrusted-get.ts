import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { isPrivateIp } from "./private-ip";

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
 * The caller still runs publicHttpsUrl (lib/color.ts) first, for a clean "not a public address"
 * answer. But that check resolves the name once and the connection resolves it again, so a hostile
 * DNS server with a zero TTL could answer public to the first and 169.254.x / 10.x to the second.
 * publicOnlyLookup closes that: it is the resolver this request connects through, so the address
 * judged is the address dialled. An IP-literal URL never reaches a resolver; publicHttpsUrl already
 * refused the private ones, and a literal can't change between check and use.
 */
/** The error code a refused private address surfaces as, through onError. */
export const PRIVATE_ADDRESS = "EPRIVATEADDRESS";

/**
 * A dns.lookup for the socket that refuses to connect anywhere non-public. Any private answer fails
 * the whole lookup, not just that address: a name that resolves to both kinds is not a public host.
 * `resolve` is swappable for the test; production uses dns.lookup.
 */
export function publicOnlyLookup(resolve: typeof dnsLookup = dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as unknown as LookupAddress[];
      if (!list.length || list.some((a) => isPrivateIp(a.address))) {
        const e: NodeJS.ErrnoException = new Error(`${hostname} resolves to a non-public address`);
        e.code = PRIVATE_ADDRESS;
        return callback(e, "", 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

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
        lookup: publicOnlyLookup(),
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
