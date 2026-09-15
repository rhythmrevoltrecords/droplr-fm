import { NextResponse, type NextRequest } from "next/server";

/** Generated placeholder artwork for demo/seed releases. */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const hex = (v: string | null, d: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const a = hex(sp.get("a"), "#7C3AED");
  const b = hex(sp.get("b"), "#EC4899");
  const title = (sp.get("title") ?? "droplr.fm").slice(0, 40).replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="r" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
<rect width="640" height="640" fill="url(#g)"/><rect width="640" height="640" fill="url(#r)"/>
<circle cx="470" cy="190" r="120" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
<circle cx="470" cy="190" r="70" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>
<text x="48" y="560" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${title}</text>
</svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
