import { z } from "zod";
import { isPlatformKey } from "./platforms";

/** Shape the shared link editor sends for both release links and bio links. */
export const linkInputSchema = z.object({
  id: z.string().max(40).nullable().optional(),
  platform: z.string().refine(isPlatformKey, "Unknown platform"),
  url: z.string().url("Every button needs a full URL (https://…)").refine((u) => /^https?:\/\//i.test(u), "http(s) only"),
  title: z.string().trim().max(60).nullable().optional(),
  buttonText: z.string().trim().max(20).nullable().optional(),
  icon: z.string().trim().max(2).nullable().optional(),
  visible: z.boolean(),
});

export const linksPayloadSchema = z.object({ links: z.array(linkInputSchema).max(40) });
export type LinkInput = z.infer<typeof linkInputSchema>;

export const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
