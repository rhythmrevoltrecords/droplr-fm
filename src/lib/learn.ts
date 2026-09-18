/**
 * Knowledge board content. Plain data so guides can be edited without touching pages.
 * Every guide has a public part (broad, indexable) and a members part (the detail), open to every plan
 * including Free. Facts with figures carry `verified` dates: re-check before changing prices or deadlines.
 * Nothing here is legal, tax or financial advice, and pages say so.
 */

export type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string; tone?: "info" | "warn" }
  | { table: { head: string[]; rows: string[][]; caption?: string } }
  | { steps: { title: string; body: string }[] };

export type Guide = {
  slug: string;
  title: string;
  /** One line under the title, and the card blurb. */
  summary: string;
  /** Short label on the card. */
  tag: string;
  minutes: number;
  /** When the facts in the members part were last checked against the official sources. */
  checked: string;
  /** Shown on the public page as "what's inside the full guide". */
  inside: string[];
  public: Block[];
  member: Block[];
  sources: { label: string; url: string }[];
};

export const LEGAL_NOTE =
  "General information for independent artists, not legal, tax or financial advice. Rules, prices and deadlines change: check the official pages linked at the end, and get advice for your own situation.";

export const GUIDES: Guide[] = [
  {
    slug: "getting-paid-australia",
    title: "Getting paid in Australia",
    summary: "Copyright is automatic. Getting paid isn't. The three registrations every self-releasing Australian artist needs.",
    tag: "Royalties",
    minutes: 8,
    checked: "18 September 2026",
    inside: [
      "The order to do it in, before your next release",
      "What to put in a work registration so it actually matches",
      "The 31 August PPCA deadline and why missing it costs you the year",
      "When each royalty actually lands, and the thresholds that hold it back",
      "Gig setlists: the royalty most artists never claim",
    ],
    public: [
      { p: "In Australia copyright is free and automatic: the moment you record or write down an original song, it's yours. There is no register to file with and no fee to pay, unlike the United States. What isn't automatic is the money." },
      { h: "Every record has two copyrights" },
      { p: "This trips up nearly everyone, and it decides who pays you." },
      { ul: [
        "The song (the composition: melody and lyrics). Owned by the songwriters. Licensed in Australia by APRA AMCOS.",
        "The recording (the master: that specific take). Owned by whoever made or paid for the recording — you, if you self-release. Licensed for public play by PPCA.",
      ] },
      { p: "One Spotify stream pays both, through different pipes. If you only ever registered with a distributor, you're collecting one of them." },
      { h: "The three places you register" },
      { steps: [
        { title: "APRA AMCOS, as a writer", body: "Free, for the song. APRA collects when it's performed or streamed; AMCOS collects when it's reproduced. Self-releasing artists join as a writer and add AMCOS, not as a publisher." },
        { title: "PPCA", body: "For the recording, when it's played in public: radio, shops, venues, TV. If you own your masters you register twice, as an artist and as the rights holder." },
        { title: "A distributor", body: "Gets the recording onto Spotify, Apple and the rest, and pays you the streaming money for the master." },
      ] },
      { note: "Registering somewhere doesn't pay you either: a song nobody registered earns nothing no matter how often it's played. The full guide has the order to do it in and what each form actually needs." },
    ],
    member: [
      { h: "Do it in this order" },
      { ol: [
        "Agree the songwriting splits with every co-writer, in writing, before you release. Percentages are painful to fix once money is moving.",
        "Join APRA AMCOS as a writer. It's free, membership is for individuals, and being available to stream counts as eligibility.",
        "Add AMCOS membership in the member Portal if you're unpublished and releasing commercially. Free as well; they take commission from royalties instead of charging a fee.",
        "Register each work in the Writer Portal: title, performer, duration, ISRC, every co-writer and their split.",
        "Register with PPCA twice if you own your masters: as a registered artist (featured performer, Australian), and as a licensor (the rights holder).",
        "Pick a distributor and deliver the release with three to four weeks of lead time.",
        "Put your ABN and bank details in the APRA AMCOS Portal.",
        "After every gig, lodge a performance report with your setlist.",
      ] },
      { note: "Don't join APRA AMCOS as a publisher. Their own guidance says self-releasing artists mostly shouldn't: publisher membership is for administering other writers' work.", tone: "warn" },
      { h: "The PPCA deadline that costs people money" },
      { p: "PPCA distributes to registered artists once a year, and you have to be registered by 31 August to be in that round. They don't hold funds in reserve for artists who register later, so a late registration doesn't mean a delayed payment — it means that year's money is gone." },
      { h: "When the money actually arrives" },
      { table: { head: ["Source", "How often", "Notes"], rows: [
        ["APRA (Australian)", "Quarterly: February, May, August, November", "Roughly six months between the play and the payment"],
        ["AMCOS", "Quarterly, within 60 days of quarter end", "Quarters end March, June, September, December"],
        ["APRA international", "Monthly as overseas societies report", "12 to 24 months is normal"],
        ["PPCA", "Once a year", "Register by 31 August to be in that round"],
        ["Streaming (master)", "From your distributor, usually monthly", "Two to three months behind the streams"],
      ], caption: "Checked against apraamcos.com.au and ppca.com.au on 18 September 2026." } },
      { ul: [
        "APRA AMCOS pays out anything over $10.",
        "Without an ABN on file, withholding tax at the top marginal rate applies above $500 in APRA royalties and $75 in AMCOS royalties. Getting an ABN is free.",
        "There is no published approval time for writer membership. If it drags, contact them rather than assuming something is wrong.",
      ] },
      { h: "Gig money most artists never claim" },
      { p: "When you play live, the songwriter of each song performed is owed a performance royalty, including when the songwriter is you. APRA AMCOS pays these quarterly from the setlists artists lodge as performance reports. If you don't lodge, they can't match the play to your song. Make it part of packing down: set list photographed, reported that week." },
      { h: "Covers, remixes and samples" },
      { ul: [
        "Releasing a cover: you need a mechanical licence for the recording. Most distributors sell one per cover, per release.",
        "A remix you were commissioned to do: agree in writing whether you're paid a fee, a share of the master, or both. Remixers aren't automatically songwriters.",
        "Samples must be cleared before release, for both copyrights: the recording and the song. \"It's only two seconds\" is not a clearance.",
      ] },
      { h: "Where droplr fits" },
      { p: "droplr doesn't collect royalties, and no pre-save tool does. It gets the release in front of fans and captures the ones who'll buy the next one. Registrations are what make sure the plays it drives turn into money." },
    ],
    sources: [
      { label: "APRA AMCOS — join as a writer", url: "https://www.apraamcos.com.au/music-creators/join-as-a-writer" },
      { label: "APRA AMCOS — distributions and thresholds", url: "https://www.apraamcos.com.au/resources/get-paid/distributions" },
      { label: "APRA AMCOS — new member, now what", url: "https://www.apraamcos.com.au/resources/member-tools/new-member-now-what" },
      { label: "PPCA — artist registration", url: "https://www.ppca.com.au/artist-registration-information" },
      { label: "PPCA — register as a licensor", url: "https://www.ppca.com.au/register-as-a-licensor" },
      { label: "business.gov.au — copyright is automatic", url: "https://business.gov.au/planning/protect-your-brand-idea-or-creation/copyright" },
    ],
  },
  {
    slug: "choosing-a-distributor",
    title: "Choosing a distributor",
    summary: "Yearly fee, one-off fee, or free with a cut. The differences that matter, and the add-ons that quietly cost more than the plan.",
    tag: "Distribution",
    minutes: 9,
    checked: "18 September 2026",
    inside: [
      "Current prices and commissions side by side",
      "What happens to your music if you stop paying",
      "The add-ons that cost more than the plan: Content ID, Beatport, social monetisation",
      "Picks for a first single, a regular releaser, and a small label",
      "Beatport and Traxsource access for DJ music",
    ],
    public: [
      { p: "A distributor is the only way onto Spotify, Apple Music and the rest. They also collect the streaming royalties for your recording and pass them on. They do not collect your songwriting royalties: that's APRA AMCOS." },
      { h: "Three pricing shapes" },
      { ul: [
        "Yearly subscription (DistroKid, TuneCore, Amuse, Ditto): unlimited releases while you keep paying, usually 0% commission.",
        "One-off fee per release (CD Baby, G.Y.R.O. Legacy): pay once, the release stays up, they keep a percentage forever.",
        "Free with a cut (RouteNote): nothing up front, they keep a share of revenue.",
      ] },
      { h: "The question that decides it" },
      { p: "What happens if you stop paying? On a subscription, your catalogue comes down, links die and playlist placements go with them. If there's a real chance your next release is 18 months away, a one-off fee is worth the higher price. If you release regularly, a subscription is far cheaper per release." },
      { note: "For UK garage, house and anything DJ-facing, check Beatport and Traxsource access before anything else. It rules several distributors out immediately, and it's the detail people discover after they've paid." },
    ],
    member: [
      { h: "What it costs, as of 18 September 2026" },
      { table: { head: ["Distributor", "Price", "Commission", "Watch for"], rows: [
        ["DistroKid", "US$24.99/yr (1 artist), $44.99 (2), $89.99 (up to 100)", "0% on streaming", "Content ID pack $4.95–$14.95/release/yr plus 20% of that ad revenue. Beatport $9.99/month extra."],
        ["TuneCore", "US$24.99–$54.99/yr, or per release $24.99 single / $44.99 album", "0% streaming, 20% on TikTok, Meta and YouTube monetisation", "Content ID included. Beatport $7.99/month on unlimited plans."],
        ["CD Baby", "One-off US$9.99 single / $14.99 album", "9% streaming and downloads, 15% mechanicals, 30% social video, 40% sync", "Stays up with no renewal. The 9% never stops."],
        ["G.Y.R.O. (ex-GYROstream, Brisbane)", "$29.99 single / $49.99 album one-off, or $9.99 per release per year", "8% (plus GST for Australian customers)", "Australian support and timezone. Acquired by Too Lost in July 2026, so terms may shift. Currency isn't stated on the site: check at signup."],
        ["Ditto Music", "US$19–$109/yr by artist count", "0% streaming, 15% publishing and sync", "Free Beatport label on Pro and Labels: the cheapest route to Beatport."],
        ["Amuse", "US$23.99–$59.99/yr", "15% on the entry tier, 0% above it", "The cheapest tier is not 0%. Free tier is effectively gone."],
        ["RouteNote", "Free, or one-off US$10–$45 per release", "15% on free, 0% on paid", "You can start free and upgrade that release later."],
        ["Symphonic", "US$29.99/yr, or Partner by approval", "Starter 0% streaming; Partner is a negotiated share", "The known name for dance-music store servicing. Get store coverage in writing."],
      ], caption: "Prices read from each company's own pricing page on 18 September 2026, in the currency they show. None of them publish AUD pricing." } },
      { h: "The extras that bite" },
      { ul: [
        "YouTube Content ID is how you get paid when someone else's video uses your track. It's included on some plans and an add-on with a revenue cut on others.",
        "Social monetisation cuts (TikTok, Instagram, YouTube) can be 20–30% even where streaming is 0%.",
        "Beatport is an add-on almost everywhere. Ditto includes a Beatport label on its paid tiers; DistroKid and TuneCore charge monthly for it.",
        "Traxsource isn't confirmed by any of them publicly. If you need it, email and ask before you pay.",
        "Publishing administration add-ons (typically 15–20% of collected royalties) overlap with what APRA AMCOS already does for you in Australia. Don't buy both without understanding which collects what.",
      ] },
      { h: "Picks by situation" },
      { steps: [
        { title: "First single, not sure you'll keep going", body: "A one-off fee: CD Baby at US$9.99 is cheapest, G.Y.R.O. Legacy costs more but gives you Australian support and a lower 8% cut. Avoid a yearly plan that quietly takes the release down when you forget to renew." },
        { title: "Releasing four or more times a year", body: "DistroKid is the cheapest per release. If your music is DJ-facing, Ditto Pro usually wins once you price in Beatport and Content ID. TuneCore suits you if you want Content ID included and don't lean on social monetisation." },
        { title: "A small label with a roster", body: "DistroKid Ultimate covers up to 100 artists on one fee; Ditto Labels adds Beatport labels and publishing admin; Symphonic Partner is the step up when the volume justifies real label services." },
      ] },
      { h: "Before you sign up, check five things" },
      { ol: [
        "Does it service Beatport and Traxsource, and at what extra cost?",
        "What happens to live releases if the subscription lapses?",
        "What's the cut on social and Content ID money, not just streaming?",
        "Can you set splits so collaborators are paid automatically?",
        "Will they request a YouTube Official Artist Channel for you?",
      ] },
      { h: "Timing, so the release isn't wasted" },
      { p: "Deliver to your distributor three to four weeks before release day. That leaves the release visible in Spotify for Artists in time to pitch it, which has to happen at least seven days out. Set the same date in droplr, add your store links as they come through, and the pre-save page and release-day emails line up with the stores." },
    ],
    sources: [
      { label: "DistroKid pricing", url: "https://distrokid.com/pricing/" },
      { label: "TuneCore pricing", url: "https://www.tunecore.com/pricing" },
      { label: "CD Baby pricing", url: "https://cdbaby.com/cd-baby-cost/" },
      { label: "G.Y.R.O. (Australia)", url: "https://www.gyro.music/how-it-works" },
      { label: "Ditto Music pricing", url: "https://dittomusic.com/en/pricing/" },
      { label: "Amuse pricing", url: "https://www.amuse.io/en/pricing/" },
      { label: "RouteNote pricing", url: "https://support.routenote.com/kb-article/how-much-does-routenote-cost/" },
    ],
  },
  {
    slug: "spotify-and-store-tools",
    title: "Spotify, Apple and YouTube tools",
    summary: "What's free, what costs money, and what you need before the paid tools will even take your booking.",
    tag: "Promotion",
    minutes: 7,
    checked: "18 September 2026",
    inside: [
      "The seven-day pitch rule and why Release Radar matters more than the editorial longshot",
      "Showcase, Marquee and Discovery Mode: thresholds, cost and how long each runs",
      "What Discovery Mode really costs you",
      "Apple Music for Artists and Shazam data",
      "Getting a YouTube Official Artist Channel",
    ],
    public: [
      { p: "Every store has a free artist dashboard, and you should claim all of them. They are also where the paid promotion lives, and each tool has a threshold you have to clear before you can use it." },
      { h: "Free, and worth doing on every release" },
      { ul: [
        "Spotify for Artists: pitch your song to editors at least seven days before release. It is free, and it also puts the song in your followers' Release Radar.",
        "Apple Music for Artists: analytics plus Shazam data you can't get anywhere else, promo images, and set lists from your gigs.",
        "YouTube Official Artist Channel: merges your channels into one with a music note and artist analytics. Your distributor requests it for you.",
      ] },
      { h: "Paid, and only once you have an audience" },
      { p: "Spotify's Campaign Kit (Showcase, Marquee and Discovery Mode) is self-serve: you don't need a label. You do need streams. Showcase starts at 1,000 streams in 28 days in that market, Marquee wants 5,000 monthly listeners, and Discovery Mode wants 25,000." },
      { note: "None of these fix a release nobody knows about. Get the pre-save page, the pitch and the fan list right first: they cost nothing and they're what the paid tools amplify." },
    ],
    member: [
      { h: "Pitching to Spotify editors" },
      { ul: [
        "Pitch at least seven days before release day, from Spotify for Artists on the web.",
        "One song at a time. Once it's out you can pitch the next one.",
        "Editorial placement is a longshot. The reliable prize is Release Radar: pitching seven or more days out guarantees the song reaches your followers there.",
        "This means your distributor has to deliver early. Three to four weeks out is the working standard.",
      ] },
      { h: "The paid tools, side by side" },
      { table: { head: ["Tool", "You need", "Costs", "Runs"], rows: [
        ["Showcase", "1,000+ streams in 28 days in that market", "Cost per click, US$100 minimum budget", "About 14 days, any release in your catalogue"],
        ["Marquee", "5,000+ monthly listeners in that market, campaign starting within 21 days of release", "Cost per click, US$100 minimum budget", "About 10 days, new releases only"],
        ["Discovery Mode", "25,000+ monthly listeners, 3+ eligible songs, an approved distributor", "No upfront cost: 30% commission on the recording royalties from those streams", "Ongoing until you switch it off"],
      ], caption: "Spotify for Artists support pages, checked 18 September 2026. Minimums are USD or the local equivalent." } },
      { ul: [
        "Both display campaigns bill per click, and saves count as clicks, so real spend can land under budget.",
        "You need Admin or Editor access on the artist team, and it has to be done on the web, not the phone app.",
        "Remixes, remasters and re-recordings aren't eligible for Marquee.",
        "Discovery Mode only applies to streams in those recommendation contexts, not your whole catalogue. Treat the 30% as paid acquisition: if a stream there doesn't lead to a follow or a save, you've bought a discount on your own music.",
      ] },
      { h: "Apple Music for Artists" },
      { p: "Free, and the Shazam numbers are the reason to look: Apple owns Shazam, so you can see where people are hearing your track in the wild, which is unusually useful for club music. You also get promo images in several languages, embeddable players, set lists, and tour dates on your artist page. There's no paid promotion product and no self-serve editorial pitching: Apple editorial goes through your distributor's Apple contact." },
      { h: "YouTube" },
      { p: "An Official Artist Channel needs at least one official release through a distributor, and the request has to come from your distributor or label rather than from you. Check yours does it before you sign up. Content ID, which pays you when other people's videos use your music, is a separate add-on from your distributor." },
      { h: "What to do with a first $100" },
      { p: "If you're under 1,000 streams a month, none of it goes to Spotify ads. It goes into the things that make the next release land: artwork that reads at thumbnail size, one good video asset, and a pre-save link in every bio you own. Showcase is the first paid tool worth trying, and only when the song is already getting saves." },
    ],
    sources: [
      { label: "Spotify for Artists — Campaign Kit", url: "https://artists.spotify.com/campaign-kit" },
      { label: "Spotify — pitching to playlist editors", url: "https://support.spotify.com/us/artists/article/pitching-music-and-videos-to-playlist-editors/" },
      { label: "Spotify — Marquee and Showcase eligibility", url: "https://support.spotify.com/us/artists/article/creating-a-marquee-showcase-campaign/" },
      { label: "Spotify — Discovery Mode", url: "https://support.spotify.com/us/artists/article/using-discovery-mode-in-spotify-for-artists/" },
      { label: "Apple Music for Artists", url: "https://artists.apple.com/promote/" },
      { label: "YouTube — Official Artist Channel", url: "https://support.google.com/youtube/answer/7336634" },
    ],
  },
  {
    slug: "release-runway",
    title: "The six-week release plan",
    summary: "What to do each week from announce to the week after release, and which parts droplr does for you.",
    tag: "Releases",
    minutes: 6,
    checked: "18 September 2026",
    inside: [
      "A week-by-week plan you can run for every release",
      "The delivery dates that can't slip: distributor, pitch, artwork",
      "What droplr handles automatically, so you stop doing it by hand",
      "Where to put the link so it actually gets clicked",
      "What to do in the week after release, when most people stop",
    ],
    public: [
      { p: "Most independent releases fail on timing, not on the music. The stores need lead time, the pitch has a deadline, and the fans need more than one chance to hear about it." },
      { h: "The short version" },
      { ul: [
        "Six weeks out: master done, artwork done, release date locked.",
        "Four weeks out: delivered to your distributor.",
        "Two weeks out: pre-save link live, announce post, pitch submitted in Spotify for Artists.",
        "Release day: it's out, fans get told, you post what you already made.",
        "The week after: keep going. Most people stop here, which is exactly when the algorithms are still paying attention.",
      ] },
      { note: "Inside droplr this is a dated checklist on every release, with the graphic or link each step needs." },
    ],
    member: [
      { h: "Week by week" },
      { steps: [
        { title: "Six weeks out", body: "Master finalised and checked on phone speakers. Artwork done at full size and legible as a 60px thumbnail. Date locked: a Friday unless you have a reason. Splits agreed in writing with anyone who wrote on it." },
        { title: "Four weeks out", body: "Delivered to the distributor with UPC/ISRC, and the work registered with APRA AMCOS. Create the release in droplr, set the date and your timezone. Pre-save page goes live." },
        { title: "Three weeks out", body: "Teaser clip. Pre-save link into every bio: Instagram, TikTok, SoundCloud, your site, your email signature. Use a variant link per placement so you can see which one worked." },
        { title: "Two weeks out", body: "Pitch in Spotify for Artists (seven days minimum, more is better). Announce post with the countdown graphic. Send the pre-save to your existing fan list. Contact any DJs or radio shows with a private link." },
        { title: "Release week", body: "Second teaser at your busiest hour, which the insights page tells you. Check the store links have filled in. Confirm the release-day email looks right." },
        { title: "Release day", body: "droplr flips the page and emails every pre-saver at 9am in their own timezone, leading with the store they chose. You post the out-now graphic and reply to everyone who comments." },
        { title: "The week after", body: "Thank the people who shared it. Post a different angle: the studio clip, the story, the live version. Send a follow-up to fans who opted in to news. Check which source converted best, and spend more there next time." },
      ] },
      { h: "What droplr does without being asked" },
      { ul: [
        "Flips the pre-save page to the live links when the release unlocks in each country.",
        "Emails every pre-saver at 9am their time, with their chosen store first.",
        "Fills in store links from the UPC or ISRC as they appear, and keeps checking after release.",
        "Makes the countdown, out-now and milestone graphics from your artwork.",
        "Tracks which link variant and which source brought each click and each pre-save.",
      ] },
      { h: "Where the link goes" },
      { p: "One link per placement, not one link everywhere. droplr gives you /ig, /tiktok and QR codes for flyers, each tracked separately. After two releases you'll know whether your Instagram bio or your TikTok comments actually move people, and you can stop guessing." },
      { h: "Honest expectations" },
      { p: "Spotify pre-saves that drop straight into a library are effectively closed to new apps: Spotify allows five allowlisted users per app unless you're a large business. Email pre-save is what works for everyone, which is why droplr is built around it. A fan who gives you their email is worth more than a save anyway: they're reachable for the next release without asking a platform's permission." },
    ],
    sources: [
      { label: "Spotify — pitching to playlist editors", url: "https://support.spotify.com/us/artists/article/pitching-music-and-videos-to-playlist-editors/" },
      { label: "APRA AMCOS — how to be a self-releasing artist", url: "https://www.apraamcos.com.au/about-us/news-and-events/how-to-be-a-self-releasing-artist" },
    ],
  },
  {
    slug: "deals-and-contracts",
    title: "Deals, managers and contracts, in plain words",
    summary: "What the words in a record deal actually mean, what a manager is worth, and how to set yourself up — solo, producer or band — so a fallout doesn't take the name with it.",
    tag: "Business",
    minutes: 10,
    checked: "18 September 2026",
    inside: [
      "The clauses that decide whether a deal is survivable: term, rights, recoupment, reversion",
      "Why an advance is a loan, and what recoupable really costs",
      "360 deals and the questions to ask before signing one",
      "Managers, agents and lawyers: what each does and what they charge",
      "Setting up as a solo artist, producer or band: ABN, splits, names",
      "Where an Australian artist gets a contract checked cheaply",
    ],
    public: [
      { note: "This is general information, not legal advice. Before you sign anything, get it looked at by a lawyer who knows music. The Arts Law Centre of Australia does exactly this for artists, at low cost.", tone: "warn" },
      { h: "The vocabulary, quickly" },
      { ul: [
        "Advance: money paid up front that you pay back out of your own royalties. It's a loan against your future earnings, not a bonus.",
        "Recoupable: costs the label can take back out of your share before you see anything. Recording, videos and marketing are usually recoupable.",
        "Term: how long the deal runs, often expressed in albums or options rather than years.",
        "Rights granted: what they own or control, for how long, and in what countries.",
        "Reversion: when, if ever, the masters come back to you.",
        "360 deal: the label takes a share of income beyond recordings, such as touring, merch or publishing.",
      ] },
      { h: "The one-line test" },
      { p: "A deal is worth reading closely when it takes something that lasts forever, like your masters, in exchange for something that runs out, like a marketing budget. That's not automatically a bad trade, but you should be able to say out loud what you're getting for it." },
    ],
    member: [
      { h: "Reading a recording agreement" },
      { ul: [
        "Term and options: who decides whether it continues, you or them? A deal with three label options is a deal that could run a decade.",
        "Rights and territory: worldwide and in perpetuity means forever, everywhere. Ask what a five or ten year licence with reversion would look like instead.",
        "Royalty rate and base: a percentage of what? Gross receipts, net receipts after distribution fees, or a dealer price? The base matters as much as the number.",
        "Recoupment: which costs come out of your share, and do marketing and video costs count?",
        "Cross-collateralisation: can losses on one release be recovered from the earnings of another? This is how artists end up unrecouped forever.",
        "Accounting and audit: how often are you paid, and can you audit their numbers?",
        "Approvals: who signs off on artwork, singles, sync uses and remixes?",
        "Leaving: what happens to unreleased recordings and the masters if it ends?",
      ] },
      { h: "Advances, honestly" },
      { p: "If you take a $20,000 advance at a 20% royalty, you earn nothing further until the label has recovered that $20,000 out of your 20%, which means the release has to generate around $100,000 first. Advances are useful when they buy something that grows your career. They're expensive when they pay for living costs." },
      { h: "360 deals" },
      { p: "A label taking a share of touring and merch is the norm at some levels. Ask three questions: what are they actually doing to grow that income, is the share capped or does it run for the whole term, and does it apply to income from work they had no hand in? A share of a tour they booked is a partnership. A share of a tour you booked yourself is a tax." },
      { h: "Managers, agents and lawyers" },
      { table: { head: ["Role", "What they do", "Typical cut"], rows: [
        ["Manager", "Overall career: strategy, deals, day-to-day, saying no for you", "Commonly 15–20% of income, sometimes with a lower rate on touring gross"],
        ["Booking agent", "Gets you shows and negotiates fees", "Commonly around 10% of performance fees"],
        ["Music lawyer", "Reviews and negotiates contracts", "Hourly, or a percentage on a deal they negotiate"],
        ["Business manager", "Money: tax, royalties, statements", "Hourly or a fixed fee"],
      ], caption: "Industry ranges, not rules. Everything is negotiable, and nothing here is advice about your specific deal." } },
      { ul: [
        "A manager on 20% of nothing is free; a manager on 20% of everything forever is not. Agree a term, and ask for a sunset clause so commission on old work tapers after they stop.",
        "A manager owes you a duty to act in your interests. If the same person is also your label, your publisher and your promoter, say out loud whose interests win when they conflict.",
        "Get any management agreement checked. It's usually the first contract an artist signs and it binds the most.",
      ] },
      { h: "You, as a business: solo, producer or band" },
      { p: "Most of this applies whether you're a solo singer, a producer taking beats and sessions, a DJ, or five people in a van. The structure follows how many people share the money, not what kind of act you are." },
      { steps: [
        { title: "Solo artist, producer or DJ", body: "You're a sole trader. Get an ABN: free, takes minutes, and without one APRA AMCOS withholds tax at the top rate above small thresholds. Keep a separate bank account for music money, keep receipts for gear, software and travel, and put something aside for tax. Your ABN can sit under your own name while you release under an artist alias: they don't have to match." },
        { title: "Producer working with other artists", body: "Agree three things in writing before you send the file: your songwriting share of the composition, whether you get a share of the master (producer \"points\") or a flat fee, and whether you can put the track in your own portfolio. A beat sold or leased is a licence with its own terms, and \"I produced it\" isn't a credit until it's in the metadata." },
        { title: "Singer or topliner on someone else's track", body: "Writing a topline usually makes you a songwriter on the composition, so register your share with APRA AMCOS. Performing on the recording without writing makes you a featured artist, which is a PPCA question, not a songwriting one. Two different pipes, and they're often confused." },
        { title: "Band or duo", body: "Two or more people sharing profits is effectively a partnership whether or not you write anything down, which also means shared liability for debts. A written agreement covering splits, name ownership, gear and what happens when someone leaves is worth more than any contract you'll sign with a label." },
        { title: "Anyone with real money coming in", body: "A company (with an ACN) makes sense when there's staff, touring debt or serious income. It costs money to run and needs proper accounting: talk to an accountant before incorporating, not after." },
      ] },
      { note: "Keep the songwriting splits separate from every other split. Who wrote it, who performed it, who owns the master and who's in the band are four different questions, and the money follows each one separately." },
      { h: "Splits, in practice" },
      { ul: [
        "Write splits down the day the song is finished, while everyone is happy and can remember who did what.",
        "A splits sheet is simple: song title, every contributor, what they contributed, the percentage, and a signature or an email reply agreeing to it.",
        "Percentages must total 100%. \"We'll sort it later\" is how friends stop being friends.",
        "Register those exact splits with APRA AMCOS. Whatever's registered is what gets paid, no matter what you agreed privately.",
        "Master splits are separate again: if a producer, a mixer or an investor has a share of the recording, record it with your distributor so payouts are automatic rather than you paying people by hand.",
      ] },
      { h: "Your name" },
      { ul: [
        "This matters just as much for a solo alias as for a band name: search IP Australia's trade mark register, plus Spotify, Bandcamp and Instagram, before you commit. Sharing a name with a bigger act is a permanent handicap on every search result.",
        "A business name registration is not a trade mark. Only a registered trade mark stops someone else using the name in your category.",
        "Registering a trade mark in Australia has fees and takes months. It's worth it once the name is earning, and it's cheap insurance for a label name.",
        "If more than one person uses the name, write down who owns it when someone leaves. This is the single most common argument that ends up with lawyers.",
      ] },
      { h: "Where to get it checked" },
      { p: "Arts Law Centre of Australia offers legal advice to artists, with document review services and subscription options that cost far less than a commercial firm. Your state music industry body and the Australian Music Industry Network can also point you to people who do this daily. Paying a few hundred dollars once is cheaper than a decade in a deal you didn't understand." },
    ],
    sources: [
      { label: "Arts Law Centre of Australia", url: "https://www.artslaw.com.au/" },
      { label: "IP Australia — trade marks", url: "https://www.ipaustralia.gov.au/trade-marks" },
      { label: "business.gov.au — business structures", url: "https://business.gov.au/planning/business-structures-and-types/business-structures" },
      { label: "APRA AMCOS — royalties overview", url: "https://www.apraamcos.com.au/music-creators/membership-explained/royalties-overview" },
    ],
  },
  {
    slug: "live-shows-and-fans",
    title: "Live shows and keeping fans",
    summary: "Gigs pay twice if you claim them, and the fans you meet there are the only audience no platform can take away.",
    tag: "Live",
    minutes: 6,
    checked: "18 September 2026",
    inside: [
      "Claiming performance royalties from your own gigs",
      "Getting on a local bill, and what promoters actually want",
      "Turning a room into an email list without being weird about it",
      "What you can and can't email fans in Australia",
      "Free upload routes: triple j Unearthed and community radio",
    ],
    public: [
      { p: "Live is where an independent career is usually built, and it's also a royalty stream most artists never claim. Every time your song is performed, including by you, the songwriter is owed a performance royalty. APRA AMCOS pays those quarterly from the setlists artists lodge." },
      { h: "Three things every gig should do" },
      { ul: [
        "Get paid for the door or the fee, and lodge the setlist so you're paid for the songs as well.",
        "Capture a few fans properly: an email address is worth more than a follow, because nobody can throttle your reach to it.",
        "Come away with content: one clip of the room, one photo you'd actually post.",
      ] },
      { h: "Free routes for Australian artists" },
      { p: "triple j Unearthed takes uploads from Australian artists who aren't signed to a major, with no charge. Approval takes up to ten business days, the licence is non-exclusive so it doesn't clash with your distributor, and community radio programmers look there too." },
    ],
    member: [
      { h: "Getting paid for the gig, twice" },
      { ol: [
        "Be an APRA AMCOS writer member and have the songs registered before the show.",
        "Photograph the setlist on the night, including support-slot songs and covers you played.",
        "Lodge it as a performance report in the member Portal that week, while you still remember the venue and date.",
        "Live performance royalties are paid quarterly. It isn't life-changing money, but it's your money and it takes five minutes.",
      ] },
      { h: "Getting on the bill" },
      { ul: [
        "Promoters book people who bring people. Tell them your realistic draw rather than a guess, and be right: being trusted is worth more than one full room.",
        "Send a short message with one link, a two-line bio and your best track, not an essay with six attachments.",
        "Play the room you can fill, not the room you want. A packed 80-cap show beats a quarter-full 300 every time, and it looks better in photos.",
        "Support your scene: DJs and bands book the people who came to their shows.",
      ] },
      { h: "Turning a room into a list" },
      { ul: [
        "A QR code on the merch table, the flyer and the DJ booth, pointing at your droplr link. droplr can make the QR for you, tracked separately from your socials.",
        "Say it once from the stage, casually, with a reason: the next track goes out in three weeks, and everyone on the list hears it first.",
        "Tick the news option in droplr so fans who want more than release-day mail can opt in. They're the people to tell about a show, a merch drop or a mix.",
      ] },
      { h: "What you can email, legally" },
      { p: "In Australia the Spam Act means you need consent to send marketing email. In droplr that line is drawn for you: a pre-save is consent for that release's email, which droplr sends. Only fans who ticked the news box are yours to email about anything else, and the fan list shows which is which. Keep it that way: the fastest way to lose a list is to burn the consent behind it." },
      { h: "Radio and community" },
      { ul: [
        "triple j Unearthed: free, Australian artists not signed to a major, up to ten business days for approval, non-exclusive licence.",
        "Community radio is genuinely reachable: local specialty shows play local music and their presenters answer email.",
        "Airplay only turns into money if the song is registered with APRA AMCOS, and the recording with PPCA. Registration first, then chase the play.",
      ] },
      { h: "Funding exists, and most artists never apply" },
      { p: "Creative Australia's Music Australia programs fund touring and international development, and APRA AMCOS keeps a running list of grants, prizes and residencies open to members. Rounds close on fixed dates and the money is real. Check the current dates on the official pages rather than trusting any list, including this one." },
    ],
    sources: [
      { label: "triple j Unearthed — artist agreement", url: "https://help.abc.net.au/hc/en-us/articles/13320305958159-triple-j-Unearthed-Artist-Agreement" },
      { label: "APRA AMCOS — new member, now what (performance reports)", url: "https://www.apraamcos.com.au/resources/member-tools/new-member-now-what" },
      { label: "APRA AMCOS — funding and grants list", url: "https://www.apraamcos.com.au/music-creators/member-resources/funding-opportunities-grants" },
      { label: "Creative Australia — Music Australia opportunities", url: "https://creative.gov.au/music-australia/investments-opportunities" },
      { label: "ACMA — spam rules", url: "https://www.acma.gov.au/rules-sending-marketing-emails-sms-and-faxes" },
    ],
  },
];
