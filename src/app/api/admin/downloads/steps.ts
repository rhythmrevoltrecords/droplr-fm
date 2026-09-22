import { z } from "zod";
import { GATE_PLATFORMS, isGatePlatform, type GatePlatform } from "@/lib/downloads";
import { clientCredentialsToken, getSoundCloudCreds, parseSoundCloudUrl, resolveId } from "@/lib/soundcloud";

export const stepsSchema = z
  .array(
    z.object({
      platform: z.string().max(20),
      action: z.string().max(20),
      target: z.string().max(500).nullable().optional(),
      required: z.boolean().default(true),
    }),
  )
  .max(6)
  .default([]);

export type GateStepInput = z.infer<typeof stepsSchema>[number];

/**
 * Validate a gate's steps and, for SoundCloud, turn the URL into the numeric id the API needs.
 *
 * Resolving at save time rather than at unlock time is deliberate. SoundCloud URLs change when
 * someone renames their account; ids don't. Resolving lazily would mean a gate that worked for
 * months silently stopped one day, at the exact moment the artist was least able to notice.
 *
 * Six steps is the cap. Past that the gate stops being a trade and starts being a chore, and
 * every extra step is somewhere else to lose the person.
 */
export async function resolveGateSteps(
  organizationId: string,
  input: GateStepInput[],
): Promise<{ steps: { position: number; platform: string; action: string; target: string | null; targetId: string | null; required: boolean }[] } | { error: string }> {
  const out: { position: number; platform: string; action: string; target: string | null; targetId: string | null; required: boolean }[] = [];
  const seen = new Set<string>();
  let scToken: string | null | undefined;

  for (const [i, s] of input.entries()) {
    if (!isGatePlatform(s.platform)) return { error: `"${s.platform}" isn't a step droplr can do.` };
    const platform = s.platform as GatePlatform;
    const spec = GATE_PLATFORMS[platform];
    if (!spec.actions.includes(s.action as never)) {
      return { error: `${spec.label} can't do "${s.action}".` };
    }
    // Progress is recorded per platform, so two steps on one platform could never both complete.
    if (seen.has(platform)) return { error: `You've got two ${spec.label} steps. One each.` };
    seen.add(platform);

    const target = s.target?.trim() || null;
    if (spec.needsTarget && !target) return { error: `The ${spec.label} step needs a link.` };
    if (target && !/^https?:\/\//i.test(target)) return { error: `The ${spec.label} link has to start with https://` };

    let targetId: string | null = null;
    if (platform === "soundcloud" && target) {
      const parsed = parseSoundCloudUrl(target);
      if (!parsed) return { error: "That doesn't look like a soundcloud.com link." };
      if (s.action === "follow" && parsed.isTrack) return { error: "For a follow, use your profile link, not a track." };
      if (s.action !== "follow" && !parsed.isTrack) return { error: `For a ${s.action}, link the track, not your profile.` };

      if (scToken === undefined) {
        const creds = await getSoundCloudCreds(organizationId);
        scToken = creds ? await clientCredentialsToken(creds) : null;
      }
      if (!scToken) {
        return { error: "Connect SoundCloud in Settings → Integrations before adding a SoundCloud step." };
      }
      const resolved = await resolveId(scToken, parsed.url);
      if (!resolved) return { error: "SoundCloud didn't recognise that link. Check it opens in a browser." };
      targetId = String(resolved.id);
    }

    out.push({ position: i, platform, action: s.action, target, targetId, required: s.required });
  }
  return { steps: out };
}
