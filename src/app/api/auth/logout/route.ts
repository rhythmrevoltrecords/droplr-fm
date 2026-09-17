import { clearSession } from "@/lib/auth";
import { redirectTo } from "@/lib/redirect";

export async function POST() {
  await clearSession();
  return redirectTo("/login");
}
