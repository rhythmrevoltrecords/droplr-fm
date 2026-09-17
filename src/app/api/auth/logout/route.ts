import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await clearSession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
