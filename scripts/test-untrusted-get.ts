/**
 * The safe GET for addresses users type in (lib/untrusted-get). Run: npm run test:untrusted
 *
 * Starts a local https server with a throwaway self-signed certificate and checks that a compressed
 * response is refused unread, that nothing follows a redirect, and that the size cap holds. Source
 * checks make sure the three user-URL paths stay on it rather than fetch().
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fails.push(name); console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

async function main() {
  const { untrustedGet, isCompressed } = await import("../src/lib/untrusted-get");

  check("identity is not compressed", !isCompressed("identity") && !isCompressed(undefined) && !isCompressed(""));
  check("br, gzip and deflate are compressed", isCompressed("br") && isCompressed("gzip") && isCompressed(" GZIP ") && isCompressed("deflate"));

  const dir = mkdtempSync(join(tmpdir(), "ug-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const seen: string[] = [];
  const server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    seen.push(String(req.headers["accept-encoding"]));
    if (req.url === "/br") { res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" }); return res.end(brotliCompressSync(Buffer.from("<a href=x>hi</a>"))); }
    if (req.url === "/gzip-claim") { res.writeHead(200, { "content-type": "image/png", "content-encoding": "gzip" }); return res.end("x"); }
    if (req.url === "/redirect") { res.writeHead(302, { location: "https://127.0.0.1:1/" }); return res.end(); }
    if (req.url === "/big") { res.writeHead(200, { "content-type": "image/png" }); return res.end(Buffer.alloc(5000)); }
    res.writeHead(200, { "content-type": "text/html" }); res.end("<p>plain</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const u = (p: string) => new URL(`https://127.0.0.1:${port}${p}`);

  const plain = await untrustedGet(u("/"), { maxBytes: 1000, timeoutMs: 3000 });
  check("a plain response comes back whole", plain?.status === 200 && plain.body.toString() === "<p>plain</p>" && plain.contentType === "text/html");
  check("it asks for no compression", seen[0] === "identity", seen[0]);
  check("a Brotli response is refused unread", (await untrustedGet(u("/br"), { maxBytes: 1000, timeoutMs: 3000 })) === null);
  check("any other compression is refused too", (await untrustedGet(u("/gzip-claim"), { maxBytes: 1000, timeoutMs: 3000 })) === null);
  const redir = await untrustedGet(u("/redirect"), { maxBytes: 1000, timeoutMs: 3000 });
  check("a redirect is reported, not followed", redir?.status === 302);
  check("over the cap without truncate is refused", (await untrustedGet(u("/big"), { maxBytes: 1000, timeoutMs: 3000 })) === null);
  const cut = await untrustedGet(u("/big"), { maxBytes: 1000, timeoutMs: 3000, truncate: true });
  check("with truncate it stops at the cap", cut?.body.length === 1000, String(cut?.body.length));
  check("an unreachable host is null, not a throw", (await untrustedGet(new URL("https://127.0.0.1:1/"), { maxBytes: 10, timeoutMs: 2000 })) === null);
  server.close();

  // The user-URL paths must stay on it. fetch() decompresses whatever comes back.
  const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const color = code("src/lib/color.ts");
  const fpi = color.slice(color.indexOf("export async function fetchPublicImage"), color.indexOf("export async function extractAccentColor"));
  check("artwork downloads use untrustedGet, not fetch", fpi.includes("untrustedGet(") && !/\bfetch\(/.test(fpi));
  const imp = code("src/lib/link-import-server.ts");
  check("link import uses untrustedGet, not fetch", imp.includes("untrustedGet(") && !/\bfetch\(/.test(imp));

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
