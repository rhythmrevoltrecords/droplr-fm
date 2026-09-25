/** First-login walkthrough steps. Server-safe data, rendered by the client ProductTour. */
export type TourStep = {
  /** data-tour value of the element to ring. A missing element just centres the card. */
  target?: string;
  /** Page this step lives on. The tour navigates there first, so the ring lands on something real. */
  href?: string;
  title: string;
  body: string;
  /** Last step only: finish and go somewhere useful. */
  cta?: { label: string; href: string };
};

/**
 * A path to a first release, not a tour of the menu.
 *
 * Order matters: profile first (the press kit is generated from it), then the release itself, and
 * only then the things they'll want once a release exists. Each step names the page it lives on so
 * the walkthrough moves them there and rings the actual control rather than floating over a page
 * that doesn't contain it.
 *
 * It deliberately stops at the "Create link" button instead of driving the form. Walking someone
 * through a half-filled form and then navigating them off it loses their work.
 */
export function tourSteps(kind: "artist" | "label" | "artistLogin"): TourStep[] {
  const base = kind === "artistLogin" ? "/dashboard" : "/admin";
  const profileHref = kind === "artistLogin" ? "/dashboard/profile" : "/admin/artists";
  const artistLogin = kind === "artistLogin";

  // An artist login can't create releases — its walkthrough is about its own profile and stats.
  if (artistLogin) {
    return [
      {
        href: "/dashboard/profile",
        target: "nav-profile",
        title: "Start with your profile",
        body: "Photo, bio, genre, socials, contact. droplr turns it into a press kit PDF you can send to promoters, radio and labels, so this is the one thing worth doing properly.",
      },
      {
        href: "/dashboard",
        target: "nav-releases",
        title: "Your releases",
        body: "Every release you're on, with its links, QR codes and stats. Copy a link straight from here.",
      },
      {
        href: "/dashboard/learn",
        target: "nav-knowledge",
        title: "Read this before your next release",
        body: "Start with Getting paid in Australia. Copyright is automatic, the money isn't, and most artists are missing at least one registration.",
      },
      {
        href: "/dashboard",
        target: "feedback",
        title: "Talk to us here",
        body: "This goes to a person, not a ticket queue. Broken, confusing or missing: say so and you'll get a reply.",
        cta: { label: "Set up my profile", href: profileHref },
      },
    ];
  }

  return [
    {
      href: "/admin/artists",
      target: "profile-add",
      title: "Start here: the profile",
      body:
        kind === "label"
          ? "Add each artist once — photo, bio, genre, socials, contacts. Everything else is built from this, including a press kit you can send to promoters and radio instead of rewriting a bio."
          : "Photo, bio, genre, socials, contact. Your press kit is generated from this, so it's the one thing worth doing properly before anything else.",
    },
    {
      href: "/admin",
      target: "create-link",
      title: "Then make your first release",
      body: "Paste a Spotify link and droplr builds the pre-save page, pulls the artwork and its colour, and fills in the other stores as they appear. Set the date and it handles release day for you.",
    },
    {
      href: "/admin",
      target: "nav-releases",
      title: "Release day runs itself",
      body: "Everyone who pre-saved gets an email at 9am in their own timezone, on the store they picked. You don't have to be awake for it.",
    },
    {
      href: "/admin",
      target: "nav-releases",
      title: "And you get the reel from the same page",
      body:
        "Open a release, go to Clip, pick the best 30 seconds. droplr builds the video — artwork moving on the kick, your link on it — right here in your browser. Your master never leaves your computer, and there's no limit on how many you make.",
    },
    {
      href: "/admin/learn",
      target: "nav-knowledge",
      title: "Read this before you release",
      body: "Eleven guides on putting out your own music. Start with Getting paid in Australia: copyright is automatic, the money isn't, and most artists miss at least one registration.",
    },
    {
      href: "/admin/templates",
      target: "nav-templates",
      title: "Templates you can print",
      body: "Splits sheet, release metadata, a six-week checklist and a press one-pager. Print them, or copy the text into Docs.",
    },
    {
      href: "/admin",
      target: "feedback",
      title: "Tell me when it breaks",
      body: "This goes to a person, not a ticket queue. Broken, confusing or missing — say so and you'll get a reply.",
      cta: { label: "Make my first release", href: "/admin" },
    },
  ].map((s) => ({ ...s, body: s.body.replace("{base}", base) }));
}
