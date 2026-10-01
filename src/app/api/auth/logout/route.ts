import { endSession } from "@/lib/auth";
import { redirectTo } from "@/lib/redirect";

export async function POST() {
  await endSession();
  return redirectTo("/login");
}
