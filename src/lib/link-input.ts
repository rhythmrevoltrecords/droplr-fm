import { z } from "zod";
import { isPlatformKey, mailtoFor } from "./platforms";

/** Shape the shared link editor sends for both release links and bio links. */
export const linkInputSchema = z.object({
  id: z.string().max(40).nullable().optional(),
  platform: z.string().refine(isPlatformKey, "Unknown platform"),
  url: z.string().min(1, "Every button needs a URL"),
  title: z.string().trim().max(60).nullable().optional(),
  buttonText: z.string().trim().max(20).nullable().optional(),
  icon: z.string().trim().max(2).nullable().optional(),
  /** Uploaded square image for a link with no mark of its own. Must be a URL droplr issued. */
  iconUrl: z.string().url().nullable().optional().or(z.literal("")),
  visible: z.boolean(),
});

/**
 * An email button carries a mailto:, everything else carries http(s). Checked here rather than on
 * the url field alone, because which one is allowed depends on the platform beside it — and an
 * http link on an email button, or a mailto on a Spotify one, is a button that lies about itself.
 */
const linkRow = linkInputSchema.superRefine((l, ctx) => {
  if (l.platform === "email") {
    if (!mailtoFor(l.url)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "An email button needs a plain address, like bookings@yourname.com" });
    return;
  }
  if (!/^https?:\/\//i.test(l.url) || !URL.canParse(l.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Every button needs a full URL (https://…)" });
  }
});

export const linksPayloadSchema = z.object({ links: z.array(linkRow).max(40) });
export type LinkInput = z.infer<typeof linkInputSchema>;

export const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
