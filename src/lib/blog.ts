import type { Block } from "@/lib/learn";

/**
 * The blog: the news explainers, written out.
 *
 * Each post is the video's script as an article, because the embed alone earns nothing in search —
 * Google indexes the words on the page, and the video already ranks on YouTube. The article is the
 * page; the video is on it.
 *
 * `publishAt` gates the post exactly the way `lib/guides.ts` gates a guide card: before that instant
 * a scheduled YouTube video renders "Video unavailable", so a post published ahead of its video is
 * worse than no post. Every surface goes through `livePosts()`.
 *
 * **If a video's YouTube schedule moves, change `publishAt` here and nothing else.**
 *
 * Brisbane is UTC+10 with no daylight saving, so the offsets below are right year-round.
 */
export type Post = {
  slug: string;
  /** Matches the video's YouTube title, so the two read as one thing. */
  title: string;
  /** One line under the title, and the card blurb. Also the meta description. */
  summary: string;
  /**
   * What the post is. `/blog` is one feed with two halves: a news explainer reports something that
   * happened and has to be checkable, so it carries `sources`; a guide teaches how to do something
   * and has nothing external to cite, so its `sources` is `[]`. Nothing on the site may call a
   * guide news.
   */
  kind: "news" | "guide";
  /** Short label on the card. */
  tag: string;
  /** Reading time for the article, not the video runtime. */
  minutes: number;
  /** "4:36" — the video's runtime, shown on the player. */
  runtime: string;
  /** The 11-character YouTube ID. */
  youTubeId: string;
  /** ISO 8601 with offset. The post stays hidden until this instant. Also the published date. */
  publishAt: string;
  body: Block[];
  /**
   * Where the facts came from. The article names each outlet inline; these are the links, and they
   * are the whole argument: a post that says "go and check" has to be checkable.
   */
  sources: { label: string; url: string }[];
};

export const POSTS: Post[] = [
  {
    slug: "fake-streams-and-what-they-take-from-you",
    title: "A Man Got 18 Months for Fake Streams. Here's What It Took From You.",
    summary:
      "The first criminal streaming-fraud sentence in the US, and the reason it comes out of the same pot that pays you.",
    kind: "news",
    tag: "News",
    minutes: 4,
    runtime: "4:36",
    youTubeId: "iJsZ2ddOAU8",
    publishAt: "2026-10-08T09:00:00+10:00",
    body: [
      { p: "On the 6th of October, in a Manhattan courtroom, a man called Michael Smith was sentenced to 18 months in federal prison. His crime was streaming. Not piracy. Streaming." },
      { p: "He made hundreds of thousands of songs with AI, built thousands of fake accounts, and pointed bots at them until Spotify, Apple Music, Amazon Music and YouTube Music had paid him more than $8 million. It's the first criminal case of its kind in the United States." },
      { p: "And here's the part that matters to you. Some of that money came out of the same pot that pays you." },
      { h: "The record" },
      { p: "Smith ran the scheme from 2017 to 2024. In March he pleaded guilty to one count of conspiracy to commit wire fraud. The maximum was five years. Prosecutors asked for at least 46 months. His lawyers asked for probation, no prison at all. The judge landed on 18 months, two years of supervised release, and he forfeits just over $8 million." },
      { note: "The US Attorney's office summed it up like this: the songs were fake, the listeners were fake, the money was real.", tone: "info" },
      { h: "Why it's your problem" },
      { p: "To see why, you need to know how streaming actually pays. It isn't a fixed price per play. Each month a service takes the money it owes rights holders and puts it in one pot. Then it splits that pot by share of streams." },
      { p: "So picture a tiny version. The pot is $100. There are 100 streams, and ten of them are yours. You get $10. Now a bot farm adds 25 fake streams. The pot doesn't grow. It's still $100, but now it's split across 125 streams. Your ten streams are worth $8." },
      { p: "You did nothing different. You just got paid less." },
      { note: "Those numbers are made up to keep the maths simple. The mechanism isn't.", tone: "warn" },
      { h: "Spread thin on purpose" },
      { p: "The clever part, and it was clever, was spreading it thin. Music Business Worldwide went through his own planning numbers. Early on he was running around 660,000 bot streams a day, spread across hundreds of thousands of tracks. That's about two plays per song per day. Nothing goes viral. Nothing trips an alarm." },
      { p: "In his own words, he needed a ton of content with small amounts of streams. One fake hit gets noticed. Hundreds of thousands of songs nobody listens to don't." },
      { p: "The services did respond. Since April 2024, Spotify only pays recording royalties on a track once it's had at least 1,000 streams in the previous 12 months. Spread two plays a day thin enough, and plenty of those tracks fall under that line. But a bigger bot fleet clears it, and Music Business Worldwide points out the threshold doesn't cover publishing royalties yet. So the door is narrower. It isn't shut." },
      { h: "The honest bit" },
      { p: "$8 million, spread across every rights holder on four services over seven years, is a rounding error on any one artist's statement. I'm not going to tell you this guy cost you your rent. He didn't." },
      { p: "What he shows is the shape of the problem. Every fake stream, from every farm still running, comes out of the same pot. And 18 months is well under half of what prosecutors asked for, so the deterrent is smaller than the headline." },
      { h: "So what do you actually do with this?" },
      { ol: [
        "Never buy streams, and be careful with anyone selling guaranteed playlist placement. Distributors take releases down when they spot artificial streaming, and it's your name on the release, not theirs.",
        "Stop treating streams as the thing you own. You don't own a stream. You can't message a stream when your next single drops. What you can own is the list of people who chose to hear from you.",
      ] },
      { p: "That's why I built droplr. It's pre-saves, smart links and download gates for independent artists and labels, and the point of all three is the same. When someone shows up, you get a real fan you can reach again, not just a number on a dashboard. It's one person running it, which is a downside, and I'd rather say that than have you find out." },
      { p: "Fake streams shrink the pot. Real fans are the only growth nobody can take off you." },
    ],
    sources: [
      { label: "US Department of Justice \u2014 the guilty plea (March 2026)", url: "https://www.justice.gov/usao-sdny/pr/north-carolina-man-pleads-guilty-music-streaming-fraud-aided-artificial-intelligence-0" },
      { label: "Rolling Stone \u2014 the 18-month sentence", url: "https://www.rollingstone.com/music/music-news/mike-smith-sentence-18-months-music-streaming-fraud-1235636944/" },
      { label: "Music Business Worldwide \u2014 the pro-rata maths and the rule change", url: "https://www.musicbusinessworldwide.com/an-8m-streaming-fraud-two-plays-a-day-heres-the-pro-rata-math-behind-the-bot-scheme-and-the-rule-change-that-would-have-killed-it/" },
      { label: "Complete Music Update \u2014 the sentencing letters", url: "https://completemusicupdate.com/streaming-fraud-is-fuelled-by-perceived-lack-of-a-legal-risk-industry-stakeholders-tell-judge-in-michael-smith-sentencing/" },
    ],
  },
  {
    slug: "suno-terms-of-service-investigation",
    title: "Italy Is Investigating Suno's Terms. Here's What You Agreed To.",
    summary:
      "Not copyright, not training data — the contract you clicked through. Six things the regulator is looking at, and five questions worth asking of anything you make music with.",
    kind: "news",
    tag: "News",
    minutes: 4,
    runtime: "4:17",
    youTubeId: "pL5bJIbmdH0",
    publishAt: "2026-10-14T09:00:00+10:00",
    body: [
      { p: "On the 6th of October, Italy's competition authority opened an investigation into Suno, the AI music generator. Not over copyright. Not over training data. Over the terms of service, the wall of text everyone clicks through to start making songs." },
      { p: "The regulator thinks parts of it are unfair to the people using it. If you've ever generated a track, a hook or a stem in Suno, this one is about a contract you've already agreed to." },
      { h: "What the regulator is looking at" },
      { p: "From its own announcement:" },
      { ol: [
        "Suno can change the service, the features and the subscription price without a justified reason.",
        "It can suspend or delete your account and your content at any time, for any reason, without notice.",
        "The terms point to extra conditions you couldn't know about when you signed up.",
        "Very broad limits on Suno's liability, including for personal injury.",
        "The licence you give Suno over what you create, which the regulator calls too broad and too vaguely defined, plus a requirement to waive moral rights that Italian law protects.",
        "Disputes go to individual arbitration in the US, under Massachusetts courts, with no class actions.",
      ] },
      { h: "What this isn't" },
      { p: "It's the opening of an investigation, not a ruling. Suno hasn't been found to have done anything wrong, and it may well change its terms before this ends. It's Italian consumer law, so it protects consumers in Italy first. And none of this is legal advice — I'm a producer who runs a small music business, not a lawyer." },
      { p: "But regulators don't usually open a case over terms they think are fine, and the questions they're asking are the right ones for any tool you make music with." },
      { h: "A quick one on moral rights" },
      { p: "Most people outside Europe have never heard of them. Copyright is about who can copy and sell a work. Moral rights are about being credited as the author, and objecting when your work is distorted. In Italy you can't simply sign those away, which is exactly why a clause asking you to waive them caught the regulator's eye." },
      { p: "If you're in Australia, the UK or the US, the rules are different. The question is the same. What are you giving up when you click accept?" },
      { h: "The context" },
      { p: "Suno has been in court with the major labels. Music Week reports that Warner settled last year and signed a licensing deal, while Universal and Sony are still suing. So the label side is getting negotiated. This case is about the other side of the table — you, the person typing the prompts and downloading the stems. That side has had a lot less attention." },
      { h: "The test, for any music tool" },
      { p: "Suno or anyone else:" },
      { ol: [
        "Can they change the price or the rules without telling you?",
        "Can they delete your account and your work without a reason?",
        "What licence do you give them over what you make, how wide is it, and does it end when you leave?",
        "If it goes wrong, where do you have to argue about it?",
        "If you walk away tomorrow, what do you get to take with you?",
      ] },
      { note: "Screenshot this.", tone: "info" },
      { h: "That test applies to me as well" },
      { p: "I'm not anti AI. AI tools are part of how a lot of music gets made now, and that's fine. I'm anti skipping the small print." },
      { p: "droplr has terms. Read them. If anything in there fails one of those five questions, tell me. It's one person running it, which is a downside, but it also means the person you'd be complaining to is the person who can fix it." },
      { p: "Question five is the whole reason droplr exists. Pre-saves, smart links and download gates that turn listeners into fans you can actually reach, by email, whatever tools you used to make the track." },
      { p: "Make it with whatever you like. Just read what you agreed to, and own the relationship with the people who listen." },
    ],
    sources: [
      { label: "AGCM \u2014 the press release opening the case (Italian)", url: "https://www.agcm.it/media/comunicati-stampa/2026/10/CV278" },
      { label: "Music Week \u2014 Italian watchdog investigates Suno over user terms", url: "https://musicweek.com/digital/read/italian-watchdog-investigates-suno-over-user-terms/095166" },
    ],
  },
  // Appended in date order, which is not the order they appear anywhere: every surface goes
  // through livePosts(), which sorts newest first. Add to the bottom.
  {
    slug: "launch-a-release-like-a-label",
    title: "How to Launch a Release Like a Label (Full droplr Walkthrough)",
    summary:
      "The whole thing, start to finish: a pre-save that becomes a smart link on release day, download gates, the promo plan, and a fan list you keep.",
    kind: "guide",
    tag: "Guide",
    minutes: 5,
    runtime: "3:59",
    youTubeId: "pgSIW6lZ0Lo",
    publishAt: "2026-10-06T09:00:00+10:00",
    body: [
      { p: "Every day, tens of thousands of new tracks hit streaming. If you're an independent artist, or you run a small label, you're up against all of it — usually with a link in your bio and a hope." },
      { p: "This is how you launch a release the way a label would: pre-saves, smart links, download gates, a promo plan, and a fan list you actually keep. The video is the whole walkthrough in about four minutes. This is the same thing in writing." },
      { h: "Start with a pre-save" },
      { p: "In the dashboard, hit new pre-save link and paste your Spotify link or URI. You'll find it in Spotify for Artists, under upcoming. If Spotify hasn't got the details yet, which is normal for unreleased music, fill them in: title, artist. Then drop in your artwork and crop it. droplr picks an accent colour out of the artwork so the page matches the release. Hit create, and the page is live." },
      { h: "What your fans see" },
      { p: "A countdown to release day, your artwork, and one simple ask — their email. They pick where they listen: Spotify, Apple Music, Bandcamp, Beatport, wherever. Tick the box, tap pre-save, and they're on the list." },
      { note: "No Spotify login needed. It works for every fan, on every platform — which is the whole reason the email is the ask and the store is a checkbox.", tone: "info" },
      { h: "Release day happens without you" },
      { p: "At midnight in each fan's own timezone, the same link turns into a smart link with every store on it. At 9am their time, every pre-saver gets an email with the store they picked right at the top." },
      { p: "So the link in your bio never changes. Before release it's a pre-save. After, it's a smart link. The one on the flyer, the one in a story from three months ago — same link, still right." },
      { h: "Smart links: every store the same size" },
      { p: "Not every fan streams on Spotify, so your smart link shouldn't pretend they do. Every store gets the same size button, and you can drag them into any order. For Bandcamp Friday, drag Bandcamp to the top and rename the button. Then add the stores your fans actually use — Beatport, Traxsource, Juno — plus buttons for merch, vinyl or tickets. Hit save, and every link you've already shared updates." },
      { h: "Download gates" },
      { p: "Giving something away? An edit pack, a remix, stems, a demo. Put it behind a download gate. Name it, add artwork, paste the link to where your files live — they stay in your own Drive or Dropbox. Then pick what fans do first. An email is the one that matters, because you keep it. Fans complete the steps, the download unlocks, and your list grows." },
      { h: "The promo plan, dated back from release day" },
      { p: "Announce it. Pitch to Spotify's editors. Post a teaser. Countdown at seven days. Out now. Then a recap. Move the release date and the whole plan moves with it." },
      { p: "And you don't need a designer for it. The share tab makes countdown, out now and milestone graphics straight from your artwork, in story and post sizes, with your link on them." },
      { h: "Which post actually brought the pre-saves" },
      { p: "Give every placement its own link — Instagram, TikTok, your bio. droplr tracks the views and pre-saves from each one side by side, along with countries, devices, and when your fans are most active." },
      { h: "One fan list" },
      { p: "Every pre-saver lands in one list: where they are, where they listen, and who wants to hear about your next release. You can filter it, and bring your old list in too." },
      { p: "That's it. One link, before and after release day, and a fan list that's yours. Free to start — three releases in any rolling twelve months, and no card." },
    ],
    sources: [],
  },
  {
    slug: "release-day-checklist",
    title: "The Release Day Checklist: 13 Steps From 4 Weeks Out to 1 Week After",
    summary:
      "Most releases don't fall flat on release day. They fall flat four weeks before it. Every step, and exactly when to do it.",
    kind: "guide",
    tag: "Guide",
    minutes: 5,
    runtime: "2:45",
    youTubeId: "IQ1gVKJeS8M",
    publishAt: "2026-10-13T09:00:00+10:00",
    body: [
      { p: "Most releases don't fall flat on release day. They fall flat four weeks before it, when nobody's been told yet." },
      { p: "So here's the checklist. Every step, and exactly when to do it, from four weeks out to a week after release. Screenshot it, or let droplr build it for you, dated back from your release date." },
      { h: "Four weeks out" },
      { steps: [
        { title: "Announce it", body: "Your music should already be with your distributor, and your pre-save page should be live. Post the cover with \"pre-save now\", and put the link in your bio." },
        { title: "A separate link for every place you'll post", body: "Instagram, TikTok, your bio. Do it the next day, not later. That's how you'll know which post actually worked." },
      ] },
      { h: "Three weeks out" },
      { steps: [
        { title: "Pitch it to Spotify's editors", body: "In Spotify for Artists. Spotify needs it at least seven days before release, but earlier gives them more time to listen." },
        { title: "Post a teaser", body: "Fifteen seconds of the hook or the drop, vertical, with a link sticker. Post it just before your fans' busiest hour." },
      ] },
      { h: "Two weeks out" },
      { steps: [
        { title: "Send it to DJs, blogs and playlist curators", body: "A short personal message, the pre-save link, and a private stream. Ten personal emails beat a hundred copy-pastes." },
      ] },
      { h: "The last ten days" },
      { steps: [
        { title: "Ten days out — tell the fans who said yes to news", body: "Only them. They're the ones who asked to hear from you." },
        { title: "Seven days out — post your countdown", body: "And reply to every comment." },
        { title: "Three days out — give people a reason to share it", body: "A studio clip, or the story behind the track." },
        { title: "The day before — check every store link", body: "Beatport, Bandcamp, SoundCloud, wherever your fans actually listen." },
      ] },
      { h: "Release day and after" },
      { steps: [
        { title: "Release day — post your out now graphic", body: "At your fans' busiest hour. With droplr, every pre-saver already got an email at 9am in their own timezone, with their store right at the top." },
        { title: "The day after — thank your fans", body: "And repost anyone who shared it." },
        { title: "Three days after — add any store links that went live late", body: "They often do." },
        { title: "A week after — look at what worked", body: "Which post brought the pre-saves, which country, which hour. That's your plan for next time." },
      ] },
      { note: "Thirteen steps, over five weeks. You can run it from a spreadsheet, or droplr builds the whole plan for you, dated back from your release day, with the graphic or link each step needs. Move the release date and every step moves with it.", tone: "info" },
    ],
    sources: [],
  },
  {
    slug: "who-owns-your-link-in-bio",
    title: "Who Actually Owns Your Link in Bio?",
    summary:
      "Three smart link services disappeared and the links survived while the data didn't. Now the link is being bundled into distribution software. Five things to check — including on mine.",
    kind: "news",
    tag: "Analysis",
    minutes: 7,
    runtime: "5:47",
    youTubeId: "fG5Z9N3hktY",
    publishAt: "2026-10-15T09:00:00+10:00",
    body: [
      { p: "On the 31st of July this year, Songlink — the service a lot of smart links were built on — switched off its API. About six weeks' notice. Before that, Songwhip shut down, and the links people had put in their bios stopped resolving. Before that, smartURL was acquired, and when it migrated the analytics were closed permanently. The redirects survived. The history didn't." },
      { p: "Three different services. Same shape every time. The link survives, and the data doesn't." },
      { h: "What a smart link actually is" },
      { p: "A page that works out where someone is and sends them to the right store. That's it. It's genuinely useful, and it is also, technically, close to trivial. A redirect and a store lookup." },
      { p: "Which is why there are about forty of them. Why most are free, or near enough. And why they keep getting bought, bundled and switched off. Nobody's business is the link. The link is the thing they hand you, so they can be the one holding something else — usually your fans' email addresses, or your attention, or your subscription." },
      { p: "That's not a conspiracy. It's the economics. But it means the link is the part most likely to change hands, and your fan list is the part you should actually care about." },
      { h: "What's happening right now" },
      { p: "In June, Feature.fm — one of the bigger smart link and pre-save companies — announced a partnership with SonoSuite. SonoSuite isn't a name most artists know, and that's the point: it's the white label software a lot of independent distributors run on. If you're with a small distributor, there's a reasonable chance their dashboard is SonoSuite underneath." },
      { p: "So now pre-saves, smart links and fan capture sit inside that distribution software. And a distributor can switch it on for everybody they serve. If yours runs on it, you might get smart links included, for free. Which sounds like good news, and in the short term it genuinely is." },
      { p: "But notice what moved. The link layer went from being a product you chose to infrastructure you're handed. And infrastructure you're handed is infrastructure you don't control." },
      { h: "The question worth asking first" },
      { p: "Before you pick anything — including mine. If this disappeared tomorrow, what would I still have?" },
      { p: "And I don't mean do my links still work. Links are cheap; you can rebuild links in an afternoon. I mean: do I still have the email addresses? Can I see all of them, right now, on the plan I'm actually on? Can I take them with me?" },
      { p: "And here's the new one, the one that didn't exist a year ago. If my distributor is the one giving me the marketing tool, what happens to my fan list the day I change distributor? Because when the marketing lives inside the distribution, leaving one and leaving the other become the same decision. Nobody's being sneaky. That's just what bundling does." },
      { h: "Five checks. They take about ten minutes." },
      { ol: [
        "Can you see every email address today, on the plan you're on? Not a count. Not the first two hundred. The actual addresses. Some tools collect them and only show you a number.",
        "Can you get them out — and what does that cost? Some charge for export. That's a fair business decision. But find out before you've got two thousand of them in there, not after.",
        "Who's responsible for that data — you, or the tool? It should say, in plain words, in their terms. If you can't find it in five minutes, that's your answer.",
        "If you leave, what happens to links you've already put out? The one on a flyer. The one in your bio. The one in a DM from eight months ago.",
        "Can it tell you which post actually brought the fan? Because if it can't, you're guessing at the only question that matters for your next release.",
      ] },
      { h: "The case for taking the free one" },
      { p: "It's free. It's already there. It's one less login and one less thing to think about. And for a lot of artists, one less thing to think about is worth more than control they're never going to use. That's a real argument. If you put out two tracks a year and you're not building a list, take the free one. I mean that." },
      { p: "It stops being the right call the moment the list starts being worth something. Because that's exactly when you'd find out you can't take it with you." },
      { h: "What I do, and what it doesn't" },
      { p: "I built droplr because I run a small label and I wanted the answer to those five to be yes. Every email address is visible on the free plan — not a count, the addresses." },
      { p: "And I'll answer check two honestly, because it's mine: the CSV export is on the paid plans. Free shows you everyone and lets you work with them. Downloading the file is paid. You can decide whether that's fair. I'd rather tell you than let you find out." },
      { p: "Because the release, the links and the fans all sit on one record, it can tell you which placement brought which pre-save, and warn you when a link you're about to publish breaks a store exclusive — which is honestly the thing I built it for." },
      { p: "It's one person. That's a downside. It's also why a named human answers you." },
      { p: "And if your answer is the free one inside your distributor — fine. Just make sure you know which question you answered." },
    ],
    sources: [
      { label: "Feature.fm — the SonoSuite partnership announcement", url: "https://blog.feature.fm/feature-fm-and-sonosuite-partner-to-bring-marketing-automation-directly-into-white-label-music-distribution-infrastructure/" },
    ],
  },
  {
    slug: "youtube-is-labelling-music-as-ai",
    title: "YouTube Is Now Labelling Music As AI — And You Don't Set The Flag",
    summary:
      "The label comes from a metadata field on the delivery, not from your account. Send nothing and YouTube reads it as unknown, then decides from its own signals.",
    kind: "news",
    tag: "News",
    minutes: 5,
    runtime: "4:55",
    youTubeId: "GY0BqYGfS0E",
    publishAt: "2026-10-19T09:00:00+10:00",
    body: [
      { p: "On Wednesday the 14th of October, YouTube Music began labelling songs made primarily with generative AI." },
      { p: "The part worth understanding: the label is driven by a metadata field on the delivery, not by anything in your account. You almost certainly don't set it. Your distributor does — or nobody does." },
      { h: "Three values, three ways in" },
      { p: "The disclosure has three possible values: Fully Gen AI, Partly Gen AI, or No Gen AI. There are three ways it can reach YouTube:" },
      { ol: [
        "A DDEX ERN 4.3.2 or later delivery, which is how most distributors send music.",
        "A contains_ai column in a CSV, in Content Manager.",
        "By hand, in Studio.",
      ] },
      { note: "If a partner sends no value at all, YouTube reads it as \"unknown\" — and may designate the track fully or partly Gen AI from its own detection signals instead.", tone: "warn" },
      { h: "Where the line falls" },
      { p: "YouTube's own examples put pitch correction and automated AI mastering in No Gen AI. But an AI-generated instrumental layer under live vocals goes in Partly Gen AI." },
      { p: "Read that second one again if you make electronic music. A generated bassline, pad or texture under your own performance is Partly Gen AI by that example. That line runs straight through normal practice." },
      { p: "And YouTube says, in its own words, that it is up to partners to interpret the Gen AI definitions provided by DDEX. So the interpretation that lands on your release is your distributor's, not yours." },
      { h: "What isn't stated" },
      { p: "No penalty. No appeals process. Nothing about the effect on recommendations or payouts for music." },
      { p: "Worth being precise here, because it gets misquoted: YouTube did say back in May that labelling doesn't change recommendations or monetisation — but that statement was about video. Not this." },
      { h: "What to do this week" },
      { ol: [
        "Find out what your distributor sends. Ask them directly whether they populate the Gen AI field, what they default to, and whether you can set it per release.",
        "Check your own releases in Studio, if you have Content Manager access. A value you didn't set is still a value on your record.",
        "Decide your own answer before someone else does. For each release: nothing generated, something generated, or mostly generated. Write it down next to the release.",
      ] },
      { p: "That last one is the only part fully in your hands. If you keep one record per release with what's in it and who cleared what, you can answer the question the day it's asked instead of reconstructing it." },
      { p: "I'm not against AI tools, and this isn't legal advice — I'm a producer who runs a small label. But a flag on your music that you didn't set and can't see is worth ten minutes." },
    ],
    sources: [
      { label: "YouTube Help — Disclose Gen AI usage for music content", url: "https://support.google.com/youtube/answer/17124251" },
      { label: "YouTube Blog — 14 October 2026", url: "https://blog.youtube/news-and-events/youtube-music-ai-labels/" },
      { label: "Music Business Worldwide — 14 October 2026", url: "https://www.musicbusinessworldwide.com/youtube-music-starts-labeling-ai-generated-songs-using-partner-disclosures-and-its-own-detection-tools/" },
    ],
  },
  {
    slug: "casual-listeners-into-superfans",
    title: "How Independent Artists Turn Casual Listeners Into Superfans",
    summary:
      "A stream is a listener you'll probably never meet. Three things turn one into someone who shows up for every release.",
    kind: "guide",
    tag: "Guide",
    minutes: 4,
    runtime: "2:31",
    youTubeId: "NVu8gt_8TDk",
    publishAt: "2026-10-20T09:00:00+10:00",
    body: [
      { p: "A stream is a listener you'll probably never meet. So how do you turn a casual listener into someone who shows up for every release?" },
      { p: "Three things. Own a way to reach them. Give them a reason to stay. And show up when it counts." },
      { h: "Own the contact" },
      { p: "Followers belong to the platform. If the algorithm decides not to show your post, that's it. An email is different: it's yours, and it goes straight to them." },
      { p: "The easiest moment to ask for one is when someone already wants something from you. A pre-save. A free download. That's the trade — they get the music, you get a way to reach them." },
      { h: "Give them a reason" },
      { p: "Free downloads are perfect for this. An edit pack, a remix, stems, an early demo. Put it behind a download gate and ask for the email first." },
      { p: "Keep it to one or two steps. Every extra step loses people. And be honest about what you'll send: only email people about news if they've said yes to news." },
      { h: "Know who they are" },
      { p: "Where are they? Where do they listen? Who wants to hear from you again?" },
      { p: "If most of your fans buy on Bandcamp, lead with Bandcamp. If most of them are in the UK, post when it's evening in London. Small changes, but they show fans you're paying attention." },
      { h: "Show up when it counts" },
      { p: "Superfans aren't made by posting more. They're made in moments. Release day, at a sensible hour in their timezone. Thanking them when you hit a milestone. Reposting the fans who shared it." },
      { p: "And between releases, don't go quiet. One honest update a month is enough — a studio clip, a gig, a sneak peek. Send it to the fans who said yes to news, at a sensible hour in their own timezone." },
      { h: "One thing people get wrong about consent" },
      { p: "\"They gave me their email for a download\" and \"they want my newsletter\" are two different permissions, and treating them as one is the fastest way to get marked as spam by the people who liked you most." },
      { p: "So keep them apart. A download gate gets you an address for that download. News is a separate yes, asked separately. The list of people who said yes to news will be smaller than your total list, and it will open at three or four times the rate. That trade is worth it every time." },
      { p: "It also means you should know, at any moment, which of your fans said which. If the tool you use can't tell you that, you don't have a fan list — you have a pile of addresses." },
      { note: "Own the contact. Give them a reason. Show up when it counts.", tone: "info" },
      { p: "droplr handles the boring parts: the pre-saves, the download gates, the fan list, and the release-day email at 9am in each fan's timezone. On paid plans you can email your news fans straight from droplr too." },
      { p: "On the free plan you can see every address on the list, and who said yes to news. Downloading the list as a file is on the paid plans, and whatever plan you're on, the whole list comes with you if you close your account." },
    ],
    sources: [],
  },
  {
    slug: "distributor-can-pull-your-music-on-a-claim",
    title: "Your Distributor Can Pull Your Music On A Claim. Not A Ruling.",
    summary:
      "DistroKid artists found songs gone from Spotify and Apple Music. The clause that allowed it is in most distribution agreements, and you agreed to it.",
    kind: "news",
    tag: "News",
    minutes: 6,
    runtime: "5:15",
    youTubeId: "oOYPO8yz3Qg",
    publishAt: "2026-10-21T09:00:00+10:00",
    body: [
      { p: "On Saturday the 10th of October, independent artists started noticing their songs had gone from Spotify and Apple Music. No email. No warning. In several cases, no reason given. They were DistroKid artists, and the takedown notices named Universal." },
      { h: "What's confirmed" },
      { p: "On 15 September, Universal Music Group sued DistroKid in federal court in Delaware. UMG says DistroKid is flooding streaming services with AI-generated “slop” — their word — and distributing recordings it has acknowledged it doesn't hold the rights to. The complaint asks the court to order infringing tracks removed and repeat infringers' accounts terminated." },
      { p: "On 12 October, DistroKid confirmed the removals. Amanda Ferri, their VP of Artist Services, told The Verge: “A very small number of recordings distributed through DistroKid have been removed in response to claims made by UMG.” And: “We strongly dispute the allegations underlying UMG's lawsuit, and regret the disruption to affected artists.”" },
      { p: "Then on Friday 16 October, Universal and Sony filed again, demanding DistroKid hand over its internal data on how many AI-generated tracks it uploads, and the details of its AI detection tools. The filing calls DistroKid a “primary conduit” for Suno-generated music." },
      { h: "The mechanism is a clause, not a scandal" },
      { p: "DistroKid's distribution agreement reserves the right to remove a recording from streaming services — quote — “if we receive any legal claims regarding the particular Recording”." },
      { note: "Any legal claims. Received. Not proven. Not ruled on. A claim arrives, and the clause is live.", tone: "warn" },
      { p: "That is not unusual, and I'm not telling you DistroKid is unusual for having it. Most distribution agreements have something that shape. The point is that you agreed to it, and you probably haven't read it." },
      { h: "Where it lands on you" },
      { p: "The musician McGwire says six of his songs came down, that DistroKid didn't contact him before or after, and that when he chased it he first got a bot. One removal cited an uncleared sample — and Hypebot reports the song he supposedly sampled came out two years after his track did. The rapper Insane Ian says an original song was removed with no warning and no reason given. Those are their accounts, not findings." },
      { p: "The documented route back is a DMCA counter-notice. DistroKid's own guidance says that after a valid one, it has to wait ten business days before reinstating. And the streaming services may choose not to reinstate at all, under their own policies." },
      { p: "Ten business days is two weeks. If that lands on your release week, your release week is gone." },
      { h: "What this does not mean" },
      { ul: [
        "It does not mean DistroKid did anything wrong. They dispute UMG's allegations, they called it a very small number, and no court has decided anything yet.",
        "It does not mean the removed tracks were AI. Some of those artists say theirs weren't. Music Business Worldwide was careful to say it had not verified the rights status of those recordings, or whether they were even tied to UMG's claims. I can't verify it either.",
        "It does not mean switching distributor fixes this. That clause is common. Moving to a distributor whose agreement you also haven't read is not a plan.",
      ] },
      { p: "What nobody outside DistroKid and Universal can tell you is how many tracks came down, or how many were correctly identified. That is part of why the filing on the 16th exists." },
      { h: "Three things. The first takes ten minutes." },
      { steps: [
        { title: "Open your distribution agreement and search it for the word “remove”", body: "Find the clause that says when they can take your music down, and whether they have to tell you first. Read that one paragraph. Whatever it says, you'll know — which is more than most people reading this." },
        { title: "Build the evidence file before you need it, not after", body: "For every release: the sample clearances, the beat licence and who else it was sold to, the cover licence, the split sheet, and the date you published. If you ever file a counter-notice you'll be assembling all of that under time pressure, with a ten-business-day clock on top." },
        { title: "Stop letting one dashboard be the only place your catalogue exists", body: "If your distributor's account is the only record of what you released and when, then when something goes wrong you find out in their order, at their speed." },
      ] },
      { p: "That third one is what droplr is. One record per release — the links, the splits, the rights — somewhere that isn't your distributor's dashboard." },
      { p: "It will not stop a takedown. Nothing I build can. What it does is mean that when one happens, you already know what you published, where it went, and when. I build it on my own, one person in Brisbane." },
    ],
    sources: [
      { label: "Music Business Worldwide — DistroKid confirms removals in response to UMG claims", url: "https://www.musicbusinessworldwide.com/distrokid-confirms-it-has-removed-tracks-in-response-to-umg-claims/" },
      { label: "Hypebot — DistroKid takedown wave hits indie artists after UMG lawsuit", url: "https://www.hypebot.com/distrokid-takedown-wave-hits-indie-artists-after-umg-lawsuit/" },
      { label: "Digital Music News — Sony and UMG demand DistroKid's AI disclosure data", url: "https://www.digitalmusicnews.com/2026/10/16/sony-music-umg-lawsuit-vs-distrokid-ai-disclosure/" },
      { label: "Rolling Stone — DistroKid removed music in response to UMG lawsuit", url: "https://www.rollingstone.com/music/music-news/distrokid-removed-music-response-umg-lawsuit-1235641464/" },
    ],
  },
  {
    slug: "spotify-1000-stream-rule-is-now-an-ai-defence",
    title: "Spotify's 1,000-Stream Rule Is Now An AI Defence. You're In Range.",
    summary:
      "Spotify now calls its 1,000-stream royalty threshold a first line of defence against AI slop. It catches small human catalogues the same way — and the streams before a track qualifies are never paid.",
    kind: "news",
    tag: "News",
    minutes: 5,
    runtime: "5:25",
    youTubeId: "dizgTJMPkws",
    publishAt: "2026-10-26T09:00:00+10:00",
    body: [
      { p: "On Tuesday the 20th of October, Spotify published a post about defending human artistry. 75 million tracks removed. 50 million more pulled out of recommendations. And one sentence, in the middle of it, about your money." },
      { p: "Spotify said that tracks likely to be AI-generated are ten times more likely to fall below the 1,000-stream royalty threshold. And it called that threshold a first line of defence. The rule that pays you nothing is now a feature." },
      { h: "What's actually on the record" },
      { p: "The post is on Spotify's own newsroom, dated the 20th of October. It is called “One Year In: Putting Human Artistry First on Spotify”, and it is a one-year update on measures the company announced in September 2025." },
      { p: "Two numbers in it. Over 75 million spammy tracks removed from the platform outright, for what Spotify calls “serious or repeated violations of our rules”. And over 50 million slop and spam tracks taken out of recommendations this year alone — not removed, just never surfaced." },
      { p: "Then, further down the same post, the line that matters: tracks with a high probability of being AI-generated are ten times more likely to fall below the 1,000-stream royalty threshold. Spotify did not put that under a heading about payouts. It put it under defences." },
      { h: "What the threshold actually does" },
      { p: "This is on Spotify's own help page, “Track monetization eligibility”. Anyone can read it. Since April 2024, a recording earns nothing from Spotify until it has had at least 1,000 streams in the previous 12 months, counted worldwide." },
      { p: "Per recording. Not per artist, not per release. Every ISRC clears that line on its own. There is a second condition as well — a minimum number of unique listeners — and in Spotify's own words: “We don't share this number publicly.”" },
      { h: "The part people get wrong: it is not backdated" },
      { p: "Spotify's own example, on that page. A track gets 750 streams in its first month, and 500 in its second. It earns royalties on the 500. The 750 are never paid. Not later. Not ever." },
      { p: "And that money does not stay with Spotify. Their wording is that it “is reallocated by streamshare to increase the payments going to eligible tracks”. So your first 750 streams pay somebody bigger than you." },
      { note: "Below the line a recording earns nothing, and the streams it collected on the way to the line are not paid retrospectively when it crosses.", tone: "warn" },
      { h: "Why that works as a defence — and who else it catches" },
      { p: "A slop farm does not make one track with a million streams. It makes a million tracks with forty streams each. Every one of them falls under the line and earns nothing. It is an effective filter, and I'm not going to pretend it isn't." },
      { p: "But a threshold cannot tell the difference between a generated track with forty streams and a first single from a producer in Brisbane with seven hundred. Both get nothing. And both lots of streams go into the pool that pays everyone above the line." },
      { p: "Spotify also says how it decides what to filter out of recommendations:" },
      { ul: [
        "Listener engagement and feedback — skips, ignores, and “didn't want to hear” reports.",
        "Upload patterns.",
        "Metadata.",
        "Multiple third-party AI detection tools.",
      ] },
      { p: "Their words again: “No single signal catches slop or spam on its own, so we combine many.” And they say the detection has limitations." },
      { h: "What this does not mean" },
      { ul: [
        "The threshold is not new. It started in April 2024. What changed on Tuesday is that Spotify named it as a defence against AI, in its own announcement.",
        "The ten-times figure is Spotify's own, and there is no published method behind it. Take it as the company's measurement, because that is what it is.",
        "It does not touch your publishing. If you're an APRA AMCOS member here, your songwriting side is a separate system, and this rule does not reach it.",
      ] },
      { p: "And I cannot tell you whether one of your tracks has been quietly dropped out of recommendations. The post describes no appeal and no way to check, and the help page doesn't either. Nobody can tell you that from outside your account." },
      { h: "Three things" },
      { steps: [
        { title: "Open Spotify for Artists and count", body: "How many of your recordings have had under 1,000 streams in the last twelve months? That number is the part of your catalogue earning nothing. Not a small amount — nothing. It is a ten-minute job and most artists have never done it." },
        { title: "Stop splitting one song across versions it doesn't need", body: "Each recording clears the line on its own. Four versions at 400 streams each is 1,600 streams and no payment; one version at 1,600 gets paid. That is an argument for releasing a remix because it does a job, not to fill a schedule — it is not an argument against remixes." },
        { title: "Fill in your own AI Credits, and turn on Artist Profile Protection", body: "AI Credits let you disclose which roles or instruments were made with AI, rather than leaving a detector to decide. Artist Profile Protection lets you review releases that credit you before they appear on your profile; Spotify says every artist gets it by the end of the year." },
      ] },
      { h: "Where droplr comes in" },
      { p: "A threshold is a rule about a pool you do not control. A download pays on the first one. So does a direct sale. There is no line to clear, because there is no pool." },
      { p: "droplr does three things: pre-save pages, smart links and download gates. Each one asks for an email, with consent. The page address is droplr's — the list is yours. You can see every address on the free plan, the export file is from A$12, and the whole list downloads on any plan when you close your account." },
      { p: "I built it on my own. One person, in Brisbane. Start free at droplr.fm — three releases in any rolling twelve months, and no card." },
    ],
    sources: [
      { label: "Spotify Newsroom — One Year In: Putting Human Artistry First on Spotify", url: "https://newsroom.spotify.com/2026-10-20/prioritizing-human-artistry/" },
      { label: "Spotify for Artists — Track monetization eligibility", url: "https://support.spotify.com/us/artists/article/track-monetization-eligibility/" },
    ],
  },
  {
    slug: "who-signed-spotifys-ai-remix-deal",
    title: "Spotify AI Remix Tool: Four Deals Signed, None Of Them By You",
    summary:
      "Four companies have now licensed catalogue to Spotify's fan-remix tool — Universal, Kobalt, Merlin and, as of 20 October, Believe and TuneCore. Every one says artists get a choice. None of them was signed by an artist.",
    kind: "news",
    tag: "Analysis",
    minutes: 5,
    runtime: "5:21",
    youTubeId: "PASTEIDHERE",
    publishAt: "2026-10-28T09:00:00+10:00",
    body: [
      { p: "On Tuesday the 20th of October, Believe and TuneCore signed a licensing agreement with Spotify. It covers a tool that lets fans make AI remixes and covers of their artists' songs." },
      { p: "That is the fourth of these this year. Universal. Kobalt. Merlin, back in August, for its member labels. And now Believe and TuneCore. Every one of them says artists choose whether to take part. And not one of them was signed by an artist. Your consent just moved one level above you." },
      { h: "What is actually on the record" },
      { p: "The announcement is on Spotify's own newsroom, dated the 20th of October: “Believe and Spotify Partner to Unlock New Opportunities for Artists Through Licensed Fan Remixes and Covers.” Not reporting about it — Spotify's own words." },
      { ul: [
        "It covers artists and labels on Believe and on TuneCore.",
        "The tool makes remixes and covers of songs that already exist, rather than entirely new works.",
        "Streams of those remixes pay royalties to the original artist and the rights holders behind the track.",
        "Spotify plans to sell it as a paid add-on for Premium subscribers.",
      ] },
      { p: "Participation is voluntary, and it is voluntary twice. Believe and TuneCore first ask whether you want to be considered for AI programs at all. Only artists who say yes are then shown the Spotify partnership, and they decide again. Music Week and Hypebot both reported it the same way: agreeing to hear about AI opportunities does not enrol you in anything." },
      { h: "The mechanism is the story" },
      { p: "Spotify is not asking you. Spotify is licensing from whoever holds the agreement above you." },
      { p: "On the 4th of August, Spotify announced the same kind of deal with Merlin — the licensing body that represents independent labels, and which says it covers about 15% of the global recorded music market. Merlin's own announcement says the agreement “enables artists on labels under Merlin's Spotify agreement the option to participate”." },
      { note: "Artists on labels. The option runs through the label.", tone: "info" },
      { p: "Merlin's chief executive described it as giving “our members' artists the choice”. How a member label passes that choice down to one of its artists is not written anywhere public that I could find." },
      { p: "So there is a chain:" },
      { ol: [
        "Spotify.",
        "The body or the distributor that licensed to Spotify.",
        "Your label, if you have one.",
        "You.",
      ] },
      { p: "Believe and TuneCore have published a switch at the artist end. Merlin has published that a choice exists somewhere. Those are not the same thing." },
      { h: "What this does not mean" },
      { p: "This is not a scandal and I am not going to dress it up as one. These are opt-in deals. Nobody's catalogue is being fed into a remix tool on a default setting. If you never click anything, nothing happens to your songs." },
      { p: "Credit where it is due, too: a two-step opt-in is more than most of this industry offers, and Spotify's announcement says every remix links back to the original track and artist." },
      { p: "What is not published is the rest of it — a launch date, the price of the add-on, the royalty rate, or how the money splits between the person who made the remix, you, and the rights holder. And I cannot tell you what your own distributor has signed. I am one person in Brisbane reading press releases, the same as you can. The only way to know is to ask them." },
      { h: "Three things to do this week" },
      { steps: [
        { title: "Trace who licenses your recordings to Spotify", body: "If you go direct, it is your distributor. If you are on a label, it is the label, and possibly a body like Merlin above that. Write the chain down. It takes ten minutes and most artists have never actually done it." },
        { title: "Ask them two questions, in writing", body: "Have you signed Spotify's fan-remix licence? And what is my setting right now? An email with a date on it is worth more than a memory of a dashboard." },
        { title: "If you are on Believe or TuneCore, screenshot your AI settings today", body: "Not because anyone is going to change them behind your back. Because in twelve months you will want to know what you agreed to, and when." },
      ] },
      { p: "And one wider thing. Search your distribution agreement for the words licence, sublicense and derivative. The clause that made this possible was already in there before any of these deals were announced." },
      { h: "Where droplr comes in" },
      { p: "Every one of these agreements is about your recordings, and your recordings sit inside somebody else's licensing chain. That is simply true, and nothing I build changes it." },
      { p: "What does not sit in that chain is the direct line to the people who listen to you. An email address is not something a third party can license. Nobody signs a deal in August that covers your mailing list." },
      { p: "That is most of the reason I built droplr. It does three things: a pre-save link that turns into a smart link on release day, a download gate, and the fan list that comes out of both. Every address is visible on the free plan, exporting it to a file is from A$12, and the whole list downloads on any plan if you close your account." },
      { p: "I built it on my own. One person in Brisbane. Start free at droplr.fm — three releases in any rolling twelve months, and no card." },
    ],
    sources: [
      { label: "Spotify Newsroom — Believe and Spotify Partner to Unlock New Opportunities for Artists Through Licensed Fan Remixes and Covers", url: "https://newsroom.spotify.com/2026-10-20/believe-spotify-licensing-agreement-fan-made-covers-remixes/" },
      { label: "Spotify Newsroom — Spotify and Merlin Announce Licensing Agreement for Fan-Made Covers and Remixes", url: "https://newsroom.spotify.com/2026-08-04/merlin-spotify-licensing-agreements-fan-made-covers-remixes/" },
      { label: "Music Week — Spotify's AI-powered remixes tool is now open to Believe and TuneCore artists and labels", url: "https://www.musicweek.com/digital/read/spotify-s-ai-powered-remixes-tool-is-now-open-to-believe-and-tunecore-artists-and-labels/095290" },
      { label: "Hypebot — Believe, TuneCore Artists Can Opt Into Spotify's AI Remix Tool", url: "https://www.hypebot.com/believe-tunecore-artists-can-opt-into-spotifys-ai-remix-tool/" },
    ],
  },
];

/** Posts whose video is public. Every surface goes through this: never map POSTS directly. */
export function livePosts(now: Date): Post[] {
  return POSTS.filter((p) => Date.parse(p.publishAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt));
}

/**
 * The news half only. The home page promises "news", so it shows news: a guide reaching that
 * section would make the heading above it untrue. `/blog` carries both and uses `livePosts`.
 */
export function liveNews(now: Date): Post[] {
  return livePosts(now).filter((p) => p.kind === "news");
}

export function findPost(slug: string, now: Date): Post | null {
  return livePosts(now).find((p) => p.slug === slug) ?? null;
}

/** The still, from YouTube's image CDN. A JPEG request, not the player. */
export function postThumb(p: Post): string {
  return `https://i.ytimg.com/vi/${p.youTubeId}/maxresdefault.jpg`;
}

export function postEmbed(p: Post): string {
  return `https://www.youtube-nocookie.com/embed/${p.youTubeId}?autoplay=1&rel=0&modestbranding=1&cc_load_policy=1`;
}

export function postWatchUrl(p: Post): string {
  return `https://youtu.be/${p.youTubeId}`;
}

/** "8 October 2026" in Brisbane, so the printed date matches the schedule above. */
export function postDate(p: Post): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane",
  }).format(new Date(p.publishAt));
}
