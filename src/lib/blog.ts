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
];

/** Posts whose video is public. Every surface goes through this: never map POSTS directly. */
export function livePosts(now: Date): Post[] {
  return POSTS.filter((p) => Date.parse(p.publishAt) <= now.getTime())
    .sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt));
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
