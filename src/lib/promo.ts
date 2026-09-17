import { zonedDay, zonedLocalToDate } from "./time";

/**
 * A release promo plan: dated steps counted back from release day, each pointing at the droplr tool that does it.
 * Generated from the release date, so moving the date moves the plan. Ticks live in PromoTaskDone.
 */
export type PromoStep = {
  key: string;
  day: number; // relative to release day (0 = release day)
  title: string;
  body: string;
  tab?: "links" | "variants" | "analytics" | "presaves" | "share" | "settings";
  href?: string;
};

export function promoSteps(kind: "artist" | "label"): PromoStep[] {
  const you = kind === "artist" ? "you" : "the artist";
  const your = kind === "artist" ? "your" : "the artist's";
  return [
    { key: "announce", day: -28, title: "Announce it", body: `Post the cover with "pre-save now". Use the countdown graphic from the Share tab and put the link in ${your} bio.`, tab: "share" },
    { key: "placements", day: -27, title: "Make a link for each placement", body: "Create /ig, /tiktok and /bio variants so you can see which post actually brings pre-saves.", tab: "variants" },
    { key: "spotify-pitch", day: -21, title: "Pitch to Spotify's editors", body: `In Spotify for Artists, pitch the release for editorial playlists. Spotify needs it at least 7 days before release; earlier gives the editors more time.`, href: "https://artists.spotify.com" },
    { key: "teaser", day: -21, title: "Post a teaser clip", body: `15 seconds of the hook or drop, vertical, with a link sticker. Post it just before ${your} fans' busiest hour.` },
    { key: "djs-blogs", day: -14, title: "Send it to DJs, blogs and playlist curators", body: "A short personal message plus the pre-save link and a private stream. Ten personal emails beat a hundred copy-pastes." },
    { key: "news-fans", day: -10, title: "Tell fans who opted in to news", body: "Filter the Fans page to news opt-ins and export them for your newsletter tool. Only those fans agreed to hear about new releases.", href: "/admin/fans?news=1" },
    { key: "countdown-7", day: -7, title: "Countdown: 7 days", body: "Post the countdown story graphic. Reply to every comment and share fan reposts.", tab: "share" },
    { key: "behind", day: -3, title: "Behind the scenes", body: `A studio clip, the story behind the track or a DJ set moment. Gives fans a reason to share it before it's out.` },
    { key: "store-check", day: -1, title: "Check every store link", body: "Add Beatport, Bandcamp, SoundCloud or YouTube Music if you have them. The Links tab shows which stores fans picked that still have no link.", tab: "links" },
    { key: "out-now", day: 0, title: "Release day: out now", body: `Post the Out now graphic at ${your} fans' busiest hour. droplr emails every pre-saver at 9am in their own timezone, so ${you} don't have to.`, tab: "share" },
    { key: "thank", day: 1, title: "Thank the fans", body: "Share a pre-save milestone graphic and repost fans who shared it.", tab: "share" },
    { key: "stores-late", day: 3, title: "Fill in late store links", body: "Some stores go live a day or two later. Add anything still missing so the smart link covers everyone.", tab: "links" },
    { key: "recap", day: 7, title: "Learn from it", body: "Open Analytics: which source converted best, which country and which hour. Plan the next release around it.", tab: "analytics" },
  ];
}

/** What droplr does on its own, shown so nobody spends time on it. */
export const AUTOMATIC = [
  "Finds Apple Music, Deezer, Spotify and TIDAL links from the UPC/ISRC, daily before release and hourly after",
  "Switches the page from pre-save to smart link at midnight in each fan's timezone",
  "Emails every pre-saver at 9am their time on release day, leading with the store they picked",
  "Saves to Spotify libraries for your allowlisted VIPs when it unlocks for them",
  "Counts views, clicks and pre-saves by source, country, device and hour",
];

export function stepDate(releaseDate: Date, tz: string, day: number) {
  const releaseDay = zonedDay(releaseDate, tz);
  const noon = zonedLocalToDate(`${releaseDay}T12:00`, tz);
  return new Date(noon.getTime() + day * 86_400_000);
}
