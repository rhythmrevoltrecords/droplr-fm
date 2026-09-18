import { SOCIAL_LABELS, type SocialLinks } from "@/lib/artist-fields";

export type PressKitData = {
  name: string;
  genre?: string | null;
  location?: string | null;
  bio?: string | null;
  website?: string | null;
  photoUrl?: string | null;
  pressPhotoUrls?: string[];
  socials: SocialLinks;
  monthlyListeners?: number | null;
  followers?: number | null;
  /** Booking / press contact shown on the sheet. */
  contactEmail?: string | null;
  contactLabel?: string;
  labelName?: string;
  linkUrl?: string | null;
  releases: { title: string; date: string; url?: string | null }[];
};

const num = (n: number) => n.toLocaleString("en-AU");

/** One-page press kit built from the profile. Black on white so it prints and attaches cleanly. */
export function PressKit({ data }: { data: PressKitData }) {
  const socials = Object.entries(data.socials) as [keyof typeof SOCIAL_LABELS, string][];
  return (
    <div className="print-sheet mx-auto w-full max-w-[820px] bg-white px-8 py-10 text-[13px] leading-relaxed text-black shadow-2xl sm:px-12">
      <header className="flex items-start gap-5 border-b border-black/20 pb-5">
        {data.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.photoUrl} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-lg border border-black/20 text-[10px] text-black/40">Photo</div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{data.name}</h1>
          <p className="mt-1 text-black/70">{[data.genre, data.location].filter(Boolean).join(" · ") || "Add a genre and location to your profile"}</p>
          {(data.monthlyListeners || data.followers) && (
            <p className="mt-2 text-[12px] text-black/60">
              {data.monthlyListeners ? `${num(data.monthlyListeners)} monthly listeners` : ""}
              {data.monthlyListeners && data.followers ? " · " : ""}
              {data.followers ? `${num(data.followers)} followers` : ""}
            </p>
          )}
        </div>
        <p className="shrink-0 text-right text-[10px] text-black/45">Press kit<br />Made with droplr.fm</p>
      </header>

      <section className="mt-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">About</h2>
        <p className="mt-2 whitespace-pre-line">{data.bio?.trim() || "Add a bio to your droplr profile and it appears here."}</p>
      </section>

      {data.releases.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">Releases</h2>
          <ul className="mt-2 space-y-1">
            {data.releases.map((r) => (
              <li key={`${r.title}-${r.date}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.title}</span>
                <span className="text-black/55">{r.date}</span>
                {r.url && <span className="text-black/45">{r.url}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">Listen and follow</h2>
          <ul className="mt-2 space-y-1">
            {data.linkUrl && <li><span className="font-medium">Links:</span> {data.linkUrl}</li>}
            {data.website && <li><span className="font-medium">Website:</span> {data.website}</li>}
            {socials.map(([k, v]) => <li key={k}><span className="font-medium">{SOCIAL_LABELS[k]}:</span> {v}</li>)}
            {!socials.length && !data.website && <li className="text-black/45">Add your socials to your profile.</li>}
          </ul>
        </section>
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">Contact</h2>
          <ul className="mt-2 space-y-1">
            {data.contactEmail ? <li><span className="font-medium">{data.contactLabel ?? "Bookings and press"}:</span> {data.contactEmail}</li> : <li className="text-black/45">Add a contact email.</li>}
            {data.labelName && <li><span className="font-medium">Label:</span> {data.labelName}</li>}
          </ul>
          {(data.pressPhotoUrls?.length ?? 0) > 0 && (
            <>
              <h2 className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-black/70">Press photos</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.pressPhotoUrls!.slice(0, 4).map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="h-16 w-16 rounded object-cover" />
                ))}
              </div>
              <p className="mt-1 text-[10px] text-black/45">Full-size press photos on request.</p>
            </>
          )}
        </section>
      </div>
      <p className="mt-6 border-t border-black/15 pt-3 text-[10px] text-black/45">{data.name} · press kit generated {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })} with droplr.fm</p>
    </div>
  );
}

/** What's still empty, so the page can nudge before someone sends a half-finished kit. */
export function pressKitGaps(d: PressKitData) {
  const gaps: string[] = [];
  if (!d.photoUrl) gaps.push("a profile photo");
  if (!d.bio?.trim()) gaps.push("a bio");
  if (!d.genre) gaps.push("a genre");
  if (!d.location) gaps.push("where you're based");
  if (!Object.keys(d.socials).length) gaps.push("at least one social link");
  if (!d.contactEmail) gaps.push("a contact email");
  return gaps;
}
