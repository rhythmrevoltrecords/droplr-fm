/** First-login walkthrough steps. Server-safe data, rendered by the client ProductTour. */
export type TourStep = {
  /** data-tour value of the element to ring. A missing element just centres the card. */
  target?: string;
  title: string;
  body: string;
  /** Last step only: finish and go somewhere useful. */
  cta?: { label: string; href: string };
};

export function tourSteps(kind: "artist" | "label" | "artistLogin"): TourStep[] {
  const base = kind === "artistLogin" ? "/dashboard" : "/admin";
  const profileHref = kind === "artistLogin" ? "/dashboard/profile" : "/admin/artists";
  return [
    {
      target: "nav-profile",
      title: "Start with your profile",
      body:
        kind === "label"
          ? "Add each artist: photo, bio, genre, socials and contacts. droplr turns it into a press kit you can send to promoters and radio, so fill it in once and stop rewriting bios."
          : "Photo, bio, genre, socials, contact. droplr turns it into a press kit PDF you can send to promoters, radio and labels, so this is the one thing worth doing properly.",
    },
    {
      target: "nav-releases",
      title: kind === "artistLogin" ? "Your releases" : "Then make a release",
      body:
        kind === "artistLogin"
          ? "Every release you're on, with its links, QR codes and stats. Copy a link straight from here."
          : "Paste a Spotify link and droplr builds the pre-save page, pulls the artwork and colour, and fills in store links as they appear.",
    },
    {
      target: "nav-knowledge",
      title: "Knowledge: read this first",
      body: "Guides for releasing your own music. Start with Getting paid in Australia: copyright is automatic, the money isn't, and most artists miss at least one registration.",
    },
    {
      target: "nav-templates",
      title: "Templates you can print",
      body: "Splits sheet, release metadata, a six-week checklist and a press one-pager. Print them, or copy the text into Docs.",
    },
    {
      target: "feedback",
      title: "Talk to us here",
      body: "This goes to a person, not a ticket queue. Broken, confusing or missing: say so and you'll get a reply.",
      cta: { label: "Set up my profile", href: profileHref },
    },
  ].map((s) => ({ ...s, body: s.body.replace("{base}", base) }));
}
