/**
 * What's live, what's next and what's later. Shown on /roadmap (it used to fill a third of the
 * homepage; the homepage now links to it).
 *
 * Kept honest against droplr/platform-vision-roadmap.md. "Next" means the next thing being built,
 * not the next thing worth wanting -- a demo inbox sat there for weeks while the plan had it at
 * phase 4, which is a promise to everyone who signs up.
 */
export type RoadmapStatus = "Live now" | "Next" | "Later";
export const ROADMAP: { status: RoadmapStatus; items: { title: string; body: string }[]; note?: string }[] = [
  // Kept honest against droplr/platform-vision-roadmap.md. "Next" means the next thing being
  // built, not the next thing worth wanting — a demo inbox sat here for weeks while the plan had
  // it at phase 4, which is a promise to everyone who signs up.
  { status: "Live now", items: [
    { title: "Release planning for teams", body: "Give any step of a release's promo plan to the label or the artist, or add your own tasks, like masters to the distributor or artwork sign-off. Each one is dated from release day, so it moves when the release does, and the person it's given to gets an email on the day. Artists tick theirs off from their own dashboard. The calendar shows every release on the roster and flags two out on the same day, or the same artist twice inside a fortnight. Tasks are on Pro and Label; the calendar and its warnings are on every plan." },
    { title: "Exclusivity warnings", body: "Tell droplr a release is exclusive to Beatport and it warns you when a link you're about to publish breaks the window — because it's the only thing that knows both. Beatport, LabelWorx and Symphonic publish different rules about what counts; droplr answers under your distributor's and says which." },
    { title: "Remix contests", body: "Your stems go out through a gate; remixes come back as links on the same release, with a deadline, a prize and everyone's contact in one list instead of thirty DMs. When entries close the tracks go public with a play button and a vote. Free to enter, always." },
    { title: "Release clips", body: "Pick 30 seconds and droplr renders the video for Reels, your link on it: a waveform on the kick, your artwork moving in, your artwork on a spinning record or CD, your own lyrics line by line (timed once, by tapping along), or (on paid plans) your words cut on the beat, or your lyrics changing as they're sung. It happens in your browser, so your master never leaves your computer." },
    { title: "Artist accounts", body: "Artists run their own releases, fan list and promo plans, on Free, Artist or Artist Pro." },
    { title: "Artists linked to your roster", body: "An artist with their own droplr account sees the releases you put out under their name — their numbers, their links, their clips. They stay yours to edit." },
    { title: "Metadata check", body: "Your barcode, your ISRC and your titles, checked against what stores actually reject for — including whether you've already used that ISRC on another release, which only droplr can see." },
    { title: "Download gates", body: "Put an edit pack, stems or an unreleased track behind a follow or an email. The page says which steps are actually checked and which aren't, and the stats show which step people drop at." },
    { title: "Fan updates", body: "Email the fans who opted in to news, from your name, straight out of droplr." },
    { title: "Bio link page", body: "One link for everything you do. Your latest release sits at the top and updates itself — the page reads the release record, so you never edit it. You see who opened it: where they came from, what country they are in, and which button they tapped. Videos play on the page without slowing it down, and merch sits there as pictures that link to your shop. Switch on the email box and fans can ask to hear about your next one, so it reaches them whatever an algorithm decides. On every plan, including Free." },
    { title: "Phone app and notifications", body: "Add your dashboard to your Home Screen and get a ping for pre-save milestones and release day." },
    { title: "Free release plan", body: "The promo plan every droplr release gets, on a page anyone can use without an account. Pick your release day, get every step dated, add it to your calendar." },
    { title: "Refer a friend", body: "A free month for each artist or label you bring who stays paid for 30 days, up to 3 a year." },
  ] },
  // Deliberately empty. Everything that could honestly be built without users is built; the next
  // thing comes from the first artists and labels using it. An invented item here would be the same
  // mistake as the demo inbox that sat in this column for weeks.
  { status: "Next", items: [], note: "Nothing's queued here on purpose. Everything that could be built without knowing real artists' problems is built. What comes next is decided by the people using droplr now — not by a list written before anyone turned up." },
  { status: "Later", items: [
    { title: "Pitch to labels", body: "Artists send a track to a label's private demo inbox; labels listen, rate and reply. Waits until there are enough labels for it not to be an empty room." },
    { title: "Unsigned pool", body: "Artists opt in unreleased tracks; labels discover them by genre, BPM and traction." },
    // Built and being tested on a few accounts (lib/beta). Not "Live now" until anyone can switch them on.
    { title: "Royalties and splits", body: "Confirmed split sheets, then distributor statements imported and turned into a clear statement per collaborator. Tracked, never held." },
    { title: "Contracts", body: "Agreements kept next to the roster and the releases they cover." },
  ] },
];

