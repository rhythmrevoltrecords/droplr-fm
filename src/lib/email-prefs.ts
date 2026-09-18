import { NextResponse } from "next/server";

/** The little standalone page fans land on from an email link (unsubscribe, re-subscribe). */
export function prefsPage(html: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body style="background:#09090b;color:#fafafa;font:16px system-ui;display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center;padding:24px"><main style="max-width:32rem">${html}</main></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status },
  );
}
