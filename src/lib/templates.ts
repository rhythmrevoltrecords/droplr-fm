/**
 * Printable templates for artists. Pure data: a page renders them for screen and for print (Save as PDF),
 * with a filled sample behind a watermark. Text versions are for pasting into Docs or Word.
 * Not legal advice, and the pages say so.
 */

export type Row = { label: string; hint?: string; sample?: string };
export type Section =
  | { h: string; note?: string }
  | { fields: Row[] }
  | { grid: { head: string[]; rows: number; sampleRows?: string[][]; note?: string } }
  | { checks: { group: string; items: { task: string; when: string }[] }[] }
  | { lines: { label: string; count: number; sample?: string } }
  | { sign: { role: string }[] }
  | { small: string };

export type Template = {
  slug: string;
  title: string;
  tag: string;
  summary: string;
  /** Shown above the preview, not printed. */
  why: string[];
  /** The printed document. */
  doc: Section[];
  /** Plain text for pasting into Google Docs or Word. */
  text: string;
};

export const TEMPLATE_NOTE =
  "A starting point, not legal advice. For anything with money or ownership attached, have it checked — the Arts Law Centre of Australia reviews documents for artists at low cost.";

export const TEMPLATES: Template[] = [
  {
    slug: "song-splits-sheet",
    title: "Song splits sheet",
    tag: "Ownership",
    summary: "Who wrote what, who owns the recording, signed by everyone in the room. The document that prevents the worst arguments.",
    why: [
      "Fill it in the day the song is finished, while everyone remembers who did what.",
      "Songwriting shares and master shares are two different things. Both are on this sheet.",
      "Register the songwriting shares with APRA AMCOS exactly as signed here: whatever is registered is what gets paid.",
      "Keep the signed copy. An email reply saying \"agreed\" from each person works too.",
      "Labels: collect this from the artist before you deliver the release, not after the first royalty run.",
    ],
    doc: [
      { h: "Song" },
      { fields: [
        { label: "Song title", sample: "Two Step Theory" },
        { label: "Version (original, radio edit, remix)", sample: "Original mix" },
        { label: "Artist name as released", sample: "Ototo" },
        { label: "Date written / finished", sample: "14 August 2026" },
        { label: "Duration", sample: "4:12" },
        { label: "ISRC (if known)", sample: "AUXXX2600123" },
      ] },
      { h: "Songwriting shares (the composition)", note: "Everyone who wrote lyrics, melody, topline or musical parts. Shares must total 100%." },
      { grid: { head: ["Full legal name", "Known as", "Society + member no.", "Contribution", "Share %"], rows: 5, sampleRows: [
        ["Cody Morrison", "Ototo", "APRA AMCOS 12345678", "Music, production", "50%"],
        ["Alex Rivera", "Riv", "APRA AMCOS 87654321", "Topline, lyrics", "50%"],
      ], note: "Total must equal 100%." } },
      { lines: { label: "Total", count: 1, sample: "100%" } },
      { h: "Publisher (leave blank if unpublished)" },
      { fields: [{ label: "Writer", hint: "Publisher name and share" }] },
      { h: "Recording shares (the master)", note: "Who owns the recording itself. Often the artist who paid for it. Producer points go here, not in the songwriting table." },
      { grid: { head: ["Name", "Role", "Flat fee paid", "Master share %"], rows: 4, sampleRows: [
        ["Rhythm Revolt Records", "Label / paid for the session", "—", "80%"],
        ["Alex Rivera", "Producer", "A$400", "20% (producer points)"],
      ] } },
      { h: "Agreed" },
      { small: "By signing, each person agrees these shares are correct and may be registered with APRA AMCOS, PPCA and the distributor." },
      { sign: [{ role: "Name, signature, date" }, { role: "Name, signature, date" }, { role: "Name, signature, date" }] },
      { small: TEMPLATE_NOTE },
    ],
    text: `SONG SPLITS SHEET

Song title:
Version:
Artist name as released:
Date written / finished:
Duration:
ISRC (if known):

SONGWRITING SHARES (the composition) — must total 100%
Full legal name | Known as | Society + member no. | Contribution | Share %
1.
2.
3.
4.
TOTAL: 100%

PUBLISHER (leave blank if unpublished):

RECORDING SHARES (the master) — producer points go here
Name | Role | Flat fee paid | Master share %
1.
2.
3.

AGREED
By signing, each person agrees these shares are correct and may be registered with
APRA AMCOS, PPCA and the distributor.

Name: ______________________  Signature: ______________________  Date: __________
Name: ______________________  Signature: ______________________  Date: __________
Name: ______________________  Signature: ______________________  Date: __________

A starting point, not legal advice. Made with droplr.fm`,
  },
  {
    slug: "release-metadata-sheet",
    title: "Release metadata sheet",
    tag: "Releases",
    summary: "Everything a distributor, a store and APRA AMCOS need for one release, on one page. Fill it once and stop re-typing it.",
    why: [
      "Metadata mistakes are the most common reason a release goes out wrong, and they are painful to fix after the fact.",
      "Write the artist name exactly as it should appear everywhere: stores match on the string, not on what you meant.",
      "Have this filled in before you start the distributor upload, and the upload takes ten minutes.",
      "Keep it after release: you'll need the ISRC and UPC again for sync, radio and PPCA.",
      "Labels: one sheet per release, filled in by the artist, is the fastest way to stop metadata coming back wrong.",
    ],
    doc: [
      { h: "Release" },
      { fields: [
        { label: "Release title", sample: "Two Step Theory" },
        { label: "Main artist, exactly as it should appear", sample: "Ototo" },
        { label: "Featured artists", sample: "—" },
        { label: "Release type (single / EP / album)", sample: "Single" },
        { label: "Label", sample: "Rhythm Revolt Records" },
        { label: "Catalogue number", sample: "RRR010" },
        { label: "Genre / sub-genre", sample: "Electronic / UK garage" },
        { label: "Release date + time + timezone", sample: "Fri 25 Sept 2026, 00:00 Brisbane" },
        { label: "Rollout (each country's midnight, or one moment worldwide)", sample: "Each country's midnight" },
        { label: "UPC / EAN", sample: "Assigned by distributor" },
        { label: "Territories (worldwide, or list)", sample: "Worldwide" },
        { label: "Explicit?", sample: "No" },
        { label: "Language of lyrics", sample: "English" },
        { label: "Previously released?", sample: "No" },
      ] },
      { h: "Tracks" },
      { grid: { head: ["#", "Track title", "Version", "ISRC", "Length", "Explicit"], rows: 5, sampleRows: [
        ["1", "Two Step Theory", "Original mix", "AUXXX2600123", "4:12", "No"],
      ] } },
      { h: "Credits, per track", note: "Names as they should be credited. Writers must match your APRA AMCOS registration." },
      { grid: { head: ["Track", "Writers (and splits)", "Producers", "Mixed by", "Mastered by"], rows: 4, sampleRows: [
        ["1", "C. Morrison 50%, A. Rivera 50%", "Ototo", "Ototo", "Studio Name"],
      ] } },
      { h: "Artwork and assets" },
      { fields: [
        { label: "Artwork file (3000x3000 JPG/PNG, no logos or URLs)", sample: "two-step-theory-3000.jpg" },
        { label: "Artwork credit", sample: "Design: A. Designer" },
        { label: "Press photo + credit", sample: "photo-2026.jpg — Photo: P. Shooter" },
        { label: "Audio master file (WAV 24-bit)", sample: "two-step-theory-master.wav" },
      ] },
      { h: "Links and admin" },
      { fields: [
        { label: "droplr.fm pre-save link", sample: "droplr.fm/rhythm-revolt/two-step-theory" },
        { label: "Distributor + delivery date", sample: "Delivered 28 Aug 2026" },
        { label: "APRA AMCOS work registered?", sample: "Yes, 15 Aug 2026" },
        { label: "PPCA registered (master)?", sample: "Yes" },
        { label: "Spotify pitch submitted (7+ days before)?", sample: "Yes, 11 Sept 2026" },
        { label: "Samples cleared?", sample: "No samples" },
      ] },
      { small: TEMPLATE_NOTE },
    ],
    text: `RELEASE METADATA SHEET

RELEASE
Release title:
Main artist (exactly as it should appear):
Featured artists:
Release type (single / EP / album):
Label:
Catalogue number:
Genre / sub-genre:
Release date + time + timezone:
Rollout (each country's midnight / one moment worldwide):
UPC / EAN:
Territories:
Explicit:
Language of lyrics:
Previously released:

TRACKS
# | Track title | Version | ISRC | Length | Explicit
1.
2.
3.

CREDITS PER TRACK
Track | Writers (and splits) | Producers | Mixed by | Mastered by
1.
2.

ARTWORK AND ASSETS
Artwork file (3000x3000, no logos or URLs):
Artwork credit:
Press photo + credit:
Audio master file (WAV 24-bit):

LINKS AND ADMIN
droplr.fm pre-save link:
Distributor + delivery date:
APRA AMCOS work registered:
PPCA registered (master):
Spotify pitch submitted (7+ days before):
Samples cleared:

Made with droplr.fm`,
  },
  {
    slug: "release-checklist",
    title: "Six-week release checklist",
    tag: "Releases",
    summary: "The release plan on one printable page, with a date column you fill in and boxes you tick. For the studio wall.",
    why: [
      "Work backwards from release day: write the date next to each line before you start.",
      "The two dates that can't slip are delivery to your distributor (three to four weeks out) and the Spotify pitch (at least seven days out).",
      "Labels: print one per release and hand it to the artist so you both know who does what.",
      "droplr runs the release-day parts for you; the rest is the human work.",
    ],
    doc: [
      { h: "Release" },
      { fields: [
        { label: "Artist and title", sample: "Ototo — Two Step Theory" },
        { label: "Release date", sample: "Friday 25 September 2026" },
        { label: "Who's running it", sample: "Cody" },
      ] },
      { h: "Countdown" },
      { checks: [
        { group: "Six weeks out", items: [
          { task: "Master finished and checked on phone speakers", when: "" },
          { task: "Artwork done, readable at thumbnail size", when: "" },
          { task: "Release date locked", when: "" },
          { task: "Splits agreed and signed with every writer", when: "" },
        ] },
        { group: "Four weeks out", items: [
          { task: "Delivered to distributor with credits and ISRC", when: "" },
          { task: "Work registered with APRA AMCOS", when: "" },
          { task: "Master registered with PPCA", when: "" },
          { task: "Release created in droplr, date and timezone set", when: "" },
          { task: "Pre-save page live and tested on a phone", when: "" },
        ] },
        { group: "Three weeks out", items: [
          { task: "Teaser clip posted", when: "" },
          { task: "Pre-save link in every bio (with a variant link per placement)", when: "" },
          { task: "Private link sent to DJs, radio and press", when: "" },
        ] },
        { group: "Two weeks out", items: [
          { task: "Pitched in Spotify for Artists (7+ days before release)", when: "" },
          { task: "Announce post with countdown graphic", when: "" },
          { task: "Pre-save sent to the existing fan list", when: "" },
        ] },
        { group: "Release week", items: [
          { task: "Second teaser at your busiest hour", when: "" },
          { task: "Store links checked on the pre-save page", when: "" },
          { task: "Release-day email previewed", when: "" },
        ] },
        { group: "Release day", items: [
          { task: "droplr flips the page and emails pre-savers at 9am their time", when: "" },
          { task: "Out-now post and story", when: "" },
          { task: "Reply to everyone who comments or shares", when: "" },
        ] },
        { group: "The week after", items: [
          { task: "Thank the people who shared it", when: "" },
          { task: "Post a different angle: studio clip, story, live version", when: "" },
          { task: "Email fans who opted in to news", when: "" },
          { task: "Check which source converted best, note it for next time", when: "" },
        ] },
      ] },
      { small: TEMPLATE_NOTE },
    ],
    text: `SIX-WEEK RELEASE CHECKLIST

Artist and title:
Release date:
Who's running it:

SIX WEEKS OUT                                    Date      Done
[ ] Master finished, checked on phone speakers   ______    ___
[ ] Artwork done, readable as a thumbnail        ______    ___
[ ] Release date locked                          ______    ___
[ ] Splits agreed and signed                     ______    ___

FOUR WEEKS OUT
[ ] Delivered to distributor with credits + ISRC ______    ___
[ ] Work registered with APRA AMCOS              ______    ___
[ ] Master registered with PPCA                  ______    ___
[ ] Release created in droplr, date + timezone   ______    ___
[ ] Pre-save page live, tested on a phone        ______    ___

THREE WEEKS OUT
[ ] Teaser clip posted                           ______    ___
[ ] Pre-save link in every bio (variant links)   ______    ___
[ ] Private link to DJs, radio, press            ______    ___

TWO WEEKS OUT
[ ] Pitched in Spotify for Artists (7+ days out) ______    ___
[ ] Announce post with countdown graphic         ______    ___
[ ] Pre-save sent to the fan list                ______    ___

RELEASE WEEK
[ ] Second teaser at your busiest hour           ______    ___
[ ] Store links checked on the pre-save page     ______    ___
[ ] Release-day email previewed                  ______    ___

RELEASE DAY
[ ] droplr emails pre-savers at 9am their time   ______    ___
[ ] Out-now post and story                       ______    ___
[ ] Reply to comments and shares                 ______    ___

THE WEEK AFTER
[ ] Thank the sharers                            ______    ___
[ ] Post a different angle                       ______    ___
[ ] Email fans who opted in to news              ______    ___
[ ] Note which source converted best             ______    ___

Made with droplr.fm`,
  },
  {
    slug: "press-one-pager",
    title: "Press one-pager (EPK)",
    tag: "Promotion",
    summary: "One page a promoter, radio producer or label can read in thirty seconds: who you are, what you sound like, and how to book you.",
    why: [
      "Nobody reads a six-paragraph bio. Give them a 50-word version they can paste straight into a listing.",
      "Lead with what's verifiable: plays, supports, festivals, numbers. Adjectives don't book shows.",
      "Labels: keep one per artist on the roster and you can answer a press request the same day.",
      "Keep it current. A one-pager with last year's numbers reads worse than none at all.",
    ],
    doc: [
      { h: "Artist" },
      { fields: [
        { label: "Artist name", sample: "Ototo" },
        { label: "Based in", sample: "Brisbane, Australia" },
        { label: "Genre, in three words", sample: "UK garage, speed garage" },
        { label: "One-line pitch", sample: "Brisbane garage producer making club tracks that still work on a car stereo." },
        { label: "For fans of", sample: "Sammy Virji, Interplanetary Criminal, Conducta" },
      ] },
      { h: "Short bio (50 words, for listings)" },
      { lines: { label: "", count: 4, sample: "Ototo is a Brisbane producer and DJ working in UK garage and speed garage. Since 2024 he has released through Rhythm Revolt Records, held a residency at Spice Nightlife, and built a following on the back of shuffling drums and sub-heavy basslines." } },
      { h: "Long bio (150 words, for features)" },
      { lines: { label: "", count: 8 } },
      { h: "Proof" },
      { grid: { head: ["Type", "Detail", "When"], rows: 5, sampleRows: [
        ["Release", "Two Step Theory (Rhythm Revolt Records)", "Sept 2026"],
        ["Support", "Opened for [artist] at [venue]", "July 2026"],
        ["Airplay", "triple j Unearthed, community radio", "2026"],
      ], note: "Releases, supports, festivals, airplay, playlist adds, notable numbers." } },
      { h: "Key tracks" },
      { grid: { head: ["Track", "Link", "Why this one"], rows: 3 } },
      { h: "Numbers (only if they help)" },
      { fields: [
        { label: "Monthly listeners", sample: "12,800" },
        { label: "Email fan list", sample: "1,240" },
        { label: "Biggest platform + following", sample: "Instagram 6.4k" },
      ] },
      { h: "Links and contact" },
      { fields: [
        { label: "Smart link / pre-save (droplr.fm)", sample: "droplr.fm/ototo" },
        { label: "Spotify / Apple / SoundCloud", sample: "" },
        { label: "Instagram / TikTok", sample: "" },
        { label: "Press photos (link, with photographer credit)", sample: "" },
        { label: "Bookings", sample: "bookings@example.com" },
        { label: "Management / label contact", sample: "hello@rhythmrevoltrecords.com" },
      ] },
      { small: TEMPLATE_NOTE },
    ],
    text: `PRESS ONE-PAGER (EPK)

Artist name:
Based in:
Genre, in three words:
One-line pitch:
For fans of:

SHORT BIO (50 words, for listings)


LONG BIO (150 words, for features)


PROOF (releases, supports, festivals, airplay, playlist adds)
Type | Detail | When
1.
2.
3.

KEY TRACKS
Track | Link | Why this one
1.
2.
3.

NUMBERS (only if they help)
Monthly listeners:
Email fan list:
Biggest platform + following:

LINKS AND CONTACT
Smart link / pre-save:
Spotify / Apple / SoundCloud:
Instagram / TikTok:
Press photos (with photographer credit):
Bookings:
Management / label contact:

Made with droplr.fm`,
  },
  {
    slug: "artist-onboarding-sheet",
    title: "Artist onboarding sheet",
    tag: "Label",
    summary: "What a label needs from an artist before the first release: contacts, society numbers, approvals and where the money goes.",
    why: [
      "Collect this once when you sign someone, and you stop chasing details the week of a release.",
      "Society and tax details are what make royalty payments possible: chasing them after a payment run is the slow way.",
      "Write down who approves artwork and single choices before there's a disagreement about it.",
      "Artists: filling this in for your own records is just as useful, and it's most of what a distributor asks for.",
    ],
    doc: [
      { h: "Artist" },
      { fields: [
        { label: "Artist / project name", sample: "Ototo" },
        { label: "Members or contributors (legal names)", sample: "Cody Morrison" },
        { label: "Based in", sample: "Brisbane, QLD" },
        { label: "Primary contact + phone", sample: "cody@example.com · 04xx xxx xxx" },
        { label: "Manager / agent (if any)", sample: "—" },
      ] },
      { h: "Societies and tax" },
      { fields: [
        { label: "APRA AMCOS writer member number", sample: "12345678" },
        { label: "AMCOS membership added?", sample: "Yes" },
        { label: "PPCA registered (artist and/or licensor)", sample: "Artist: yes · Licensor: label" },
        { label: "ABN", sample: "" },
        { label: "GST registered?", sample: "No" },
        { label: "Payment details on file (bank, PayID)", sample: "Held securely, not on this sheet" },
      ] },
      { h: "Rights and approvals" },
      { fields: [
        { label: "Who owns the masters for releases under this agreement", sample: "Label, 5-year licence then reverts" },
        { label: "Who approves artwork", sample: "Artist + label, both" },
        { label: "Who approves single choices and release dates", sample: "Label, in consultation" },
        { label: "Who approves remixes and sync uses", sample: "Both" },
        { label: "Existing commitments (other labels, publishers, exclusivity)", sample: "None" },
      ] },
      { h: "Assets on file" },
      { grid: { head: ["Asset", "Where it lives", "Updated"], rows: 5, sampleRows: [
        ["Press photos + credit", "Shared drive / artist folder", "Aug 2026"],
        ["Logo and artwork files", "Shared drive", "Aug 2026"],
        ["Bio (50 and 150 words)", "Press one-pager", "Aug 2026"],
      ] } },
      { h: "Accounts and access" },
      { fields: [
        { label: "Spotify for Artists access granted to", sample: "Artist + label" },
        { label: "Apple Music for Artists access", sample: "Artist" },
        { label: "droplr.fm login (artist dashboard)", sample: "Invited 12 Aug 2026" },
        { label: "Distributor account releases go through", sample: "Label account" },
      ] },
      { h: "Agreed" },
      { small: "This sheet records working details. It is not the agreement between the artist and the label: that should be a separate written contract." },
      { sign: [{ role: "Artist: name, signature, date" }, { role: "Label: name, signature, date" }] },
      { small: TEMPLATE_NOTE },
    ],
    text: `ARTIST ONBOARDING SHEET

ARTIST
Artist / project name:
Members or contributors (legal names):
Based in:
Primary contact + phone:
Manager / agent:

SOCIETIES AND TAX
APRA AMCOS writer member number:
AMCOS membership added:
PPCA registered (artist / licensor):
ABN:
GST registered:
Payment details on file (store securely, not on this sheet):

RIGHTS AND APPROVALS
Who owns the masters:
Who approves artwork:
Who approves single choices and release dates:
Who approves remixes and sync:
Existing commitments (labels, publishers, exclusivity):

ASSETS ON FILE
Asset | Where it lives | Updated
1.
2.
3.

ACCOUNTS AND ACCESS
Spotify for Artists access:
Apple Music for Artists access:
droplr.fm artist login:
Distributor account:

AGREED
This sheet records working details. It is not the agreement between artist and label:
that should be a separate written contract.

Artist: ______________________  Signature: __________________  Date: __________
Label:  ______________________  Signature: __________________  Date: __________

Made with droplr.fm`,
  },
];
