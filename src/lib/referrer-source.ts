/**
 * Which site sent a visitor, from the host in the Referer header. No imports, so the edge middleware
 * and the server routes share one list.
 *
 * Matches whole host labels from the right: "reddit.com" and "old.reddit.com" are Reddit, but
 * "bitcoinbox.com" isn't X and "instagram.com.evil.example" isn't Instagram. The old substring
 * test (/t\.co/) read every Reddit visit as X.
 *
 * A host that isn't listed is returned as it is, so a new site still shows up by name: the list only
 * groups the big ones and never has to be kept complete.
 */
const KNOWN: [suffixes: string[], label: string][] = [
  [["instagram.com"], "instagram"],
  [["tiktok.com"], "tiktok"],
  [["facebook.com", "fb.com", "fb.me", "messenger.com"], "facebook"],
  [["t.co", "twitter.com", "x.com"], "x"],
  [["youtube.com", "youtu.be"], "youtube"],
  [["reddit.com", "redd.it"], "reddit"],
  [["soundcloud.com"], "soundcloud"],
  [["linkedin.com", "lnkd.in"], "linkedin"],
  [["bing.com"], "bing"],
  [["duckduckgo.com"], "duckduckgo"],
  [["news.ycombinator.com"], "hacker news"],
  [["chatgpt.com", "chat.openai.com"], "chatgpt"],
  [["perplexity.ai"], "perplexity"],
  [["discord.com", "discord.gg", "discordapp.com"], "discord"],
];

const endsWithHost = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`);

/** "https://www.reddit.com/r/x" → "reddit.com". Lower case, no port, no leading www. Null for anything unreadable. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return /^[a-z0-9.-]{1,253}$/.test(h) && h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

/** A host to the name it's reported under: "old.reddit.com" → "reddit", "google.com.au" → "google", "blog.example" → itself. */
export function sourceFromHost(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  // Google search runs a domain per country (google.com.au, google.co.uk). Only the bare domain is
  // search: docs.google.com or sites.google.com is someone's page, so it keeps its own name.
  if (/^google\.(com|[a-z]{2})(\.[a-z]{2})?$/.test(h)) return "google";
  for (const [suffixes, label] of KNOWN) if (suffixes.some((s) => endsWithHost(h, s))) return label;
  return h;
}

/**
 * Android apps send "android-app://<package>/" instead of a web address. The big ones are named like
 * their sites (the old substring test already read these as instagram, facebook, google); any other
 * app keeps its package name.
 */
const APPS: Record<string, string> = {
  "com.instagram.android": "instagram",
  "com.facebook.katana": "facebook",
  "com.facebook.orca": "facebook",
  "com.zhiliaoapp.musically": "tiktok",
  "com.ss.android.ugc.trill": "tiktok",
  "com.twitter.android": "x",
  "com.google.android.youtube": "youtube",
  "com.reddit.frontpage": "reddit",
  "com.discord": "discord",
  "com.soundcloud.android": "soundcloud",
  "com.google.android.gm": "google",
  "com.google.android.googlequicksearchbox": "google",
};

/** "android-app://com.instagram.android/" → "instagram"; null if the referrer isn't an Android app. */
export function sourceFromAndroidApp(ref: string | null | undefined): string | null {
  const m = ref?.match(/^android-app:\/\/([A-Za-z0-9._]{1,120})/);
  if (!m) return null;
  const pkg = m[1].toLowerCase();
  return APPS[pkg] ?? pkg;
}
