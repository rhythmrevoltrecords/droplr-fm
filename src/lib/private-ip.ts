import { isIP } from "node:net";

/**
 * Shared by every check that must not reach an internal address: lib/color (publicHttpsUrl),
 * lib/untrusted-get (the connect-time guard) and lib/contest-server. Its own file so untrusted-get
 * can use it without importing color.ts, which imports untrusted-get.
 */

/** Private, loopback, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24 IETF protocol, 192.0.2/24 docs
      (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
      (a === 198 && b === 51 && c === 100) || // docs
      (a === 203 && b === 0 && c === 113) || // docs
      a >= 224 // multicast + reserved
    );
  }
  if (v === 6) {
    const bytes = ipv6Bytes(ip);
    if (!bytes) return true; // can't parse it: don't try to be clever
    const embedded = (o: number) => isPrivateIp(`${bytes[o]}.${bytes[o + 1]}.${bytes[o + 2]}.${bytes[o + 3]}`);
    const zero = (from: number, to: number) => bytes.slice(from, to).every((x) => x === 0);
    // ::ffff:a.b.c.d (IPv4-mapped): judge the IPv4 address.
    if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return embedded(12);
    // ::ffff:0:a.b.c.d (IPv4-translated, ::ffff:0:0/96): judge the IPv4 address.
    if (zero(0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && bytes[10] === 0 && bytes[11] === 0) return embedded(12);
    // ::/96 — unspecified, loopback and the deprecated IPv4-compatible form (::7f00:1 is 127.0.0.1).
    if (zero(0, 12)) return true;
    const w0 = (bytes[0] << 8) | bytes[1];
    const w1 = (bytes[2] << 8) | bytes[3];
    if (w0 === 0x0064 && w1 === 0xff9b) return zero(4, 12) ? embedded(12) : true; // NAT64 64:ff9b::/96 (and 64:ff9b:1::/48 local-use)
    if (w0 === 0x2002) return embedded(2); // 6to4 2002:a.b.c.d::/48
    if (w0 === 0x2001 && w1 === 0x0000) return true; // Teredo: the IPv4 inside is obfuscated
    if (w0 === 0x2001 && w1 === 0x0db8) return true; // documentation
    if (w0 === 0x0100 && zero(2, 8)) return true; // 100::/64 discard
    return (
      (w0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (w0 & 0xffc0) === 0xfe80 || // fe80::/10 link local
      (w0 & 0xffc0) === 0xfec0 || // fec0::/10 site local (deprecated, still routed by some stacks)
      (w0 & 0xff00) === 0xff00 // ff00::/8 multicast
    );
  }
  return true;
}

/** 16 bytes of an IPv6 address (handles "::" and a dotted IPv4 tail), or null if it doesn't parse. */
function ipv6Bytes(ip: string): number[] | null {
  let h = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const tail = h.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [p, q, r, t] = tail.slice(1).map(Number);
    h = h.slice(0, -tail[0].length) + `${((p << 8) | q).toString(16)}:${((r << 8) | t).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
  const words = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest].map((w) => parseInt(w, 16));
  if (words.length !== 8 || words.some((w) => Number.isNaN(w) || w < 0 || w > 0xffff)) return null;
  return words.flatMap((w) => [w >> 8, w & 0xff]);
}
