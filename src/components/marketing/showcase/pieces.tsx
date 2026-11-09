import { PLATFORM_LOGOS } from "@/lib/platform-logos";
import { platformMeta, type PlatformKey } from "@/lib/platforms";

/**
 * The three pieces of the homepage composition: the pre-save page, the smart link and the 9am
 * email, drawn after the real fan page (components/public/release-view) and the real release-day
 * email (lib/email). All example data: Night Shift and "Lowlight" are made up, and the page says so.
 * Server components; ShowcaseMotion moves them, nothing here runs in the browser.
 */

const SPRITE_PLATFORMS: PlatformKey[] = ["spotify", "appleMusic", "beatport", "traxsource", "bandcamp", "soundcloud", "instagram"];

/** One inline sprite for the page: the example cover art, the store marks and a few UI icons. */
export function ShowcaseSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="sc-g-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#140a26" /><stop offset=".55" stopColor="#3a1242" /><stop offset="1" stopColor="#14091e" /></linearGradient>
        <radialGradient id="sc-g-orb" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffd2a8" /><stop offset=".35" stopColor="#ff7d8f" /><stop offset=".7" stopColor="#c2387a" stopOpacity=".55" /><stop offset="1" stopColor="#c2387a" stopOpacity="0" /></radialGradient>
        <linearGradient id="sc-g-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a0b22" stopOpacity=".2" /><stop offset="1" stopColor="#0b0612" stopOpacity=".95" /></linearGradient>
      </defs>
      <symbol id="sc-cover" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="url(#sc-g-bg)" />
        <circle cx="104" cy="120" r="78" fill="url(#sc-g-orb)" />
        <rect y="124" width="200" height="76" fill="url(#sc-g-sea)" />
        <g fill="#ff9aa6" opacity=".55">
          <rect x="66" y="132" width="76" height="2.2" rx="1.1" /><rect x="76" y="140" width="56" height="1.8" rx=".9" /><rect x="84" y="148" width="40" height="1.5" rx=".75" /><rect x="92" y="156" width="24" height="1.2" rx=".6" /><rect x="97" y="163" width="14" height="1" rx=".5" />
        </g>
        <rect x="0" y="123" width="200" height=".8" fill="#ffc7b0" opacity=".5" />
        <text x="16" y="26" fill="#fff" fillOpacity=".86" fontFamily="Inter,sans-serif" fontSize="8.5" fontWeight="600" letterSpacing="2.6">NIGHT SHIFT</text>
        <text x="16" y="184" fill="#fff" fontFamily="Inter,sans-serif" fontSize="17" fontWeight="900" letterSpacing="-.4">LOWLIGHT</text>
      </symbol>
      {SPRITE_PLATFORMS.map((p) => {
        const logo = PLATFORM_LOGOS[p];
        return logo ? <symbol key={p} id={`sc-i-${p}`} viewBox="0 0 24 24"><path fill="currentColor" d={logo.path} /></symbol> : null;
      })}
      <symbol id="sc-i-check" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="sc-i-arrow" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="sc-i-plus" viewBox="0 0 18 18"><path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></symbol>
      <symbol id="sc-i-warn" viewBox="0 0 16 16"><path d="M8 1.8l6.6 11.6H1.4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6.2v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="11.4" r=".9" fill="currentColor" /></symbol>
      <symbol id="sc-i-down" viewBox="0 0 16 16"><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="sc-i-signal" viewBox="0 0 15 10"><rect x="0" y="6" width="2.6" height="4" rx=".6" fill="currentColor" /><rect x="4" y="4" width="2.6" height="6" rx=".6" fill="currentColor" /><rect x="8" y="2" width="2.6" height="8" rx=".6" fill="currentColor" /><rect x="12" y="0" width="2.6" height="10" rx=".6" fill="currentColor" /></symbol>
      <symbol id="sc-i-batt" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="3" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor" /><rect x="21.6" y="3.6" width="1.6" height="3.8" rx=".8" fill="currentColor" opacity=".5" /></symbol>
    </svg>
  );
}

/** A sprite icon. Decorative everywhere it is used. */
export function Use({ id, style }: { id: string; style?: React.CSSProperties }) {
  return <svg aria-hidden focusable="false" style={style}><use href={`#sc-i-${id}`} /></svg>;
}

function Cover({ viewBox = "0 0 200 200" }: { viewBox?: string }) {
  return <svg viewBox={viewBox} aria-hidden focusable="false"><use href="#sc-cover" /></svg>;
}

function Status() {
  return (
    <div className="sc-status">
      <span>9:41</span><i />
      <span className="sc-bars"><Use id="signal" style={{ width: 15, height: 10 }} /><Use id="batt" style={{ width: 22, height: 10 }} /></span>
    </div>
  );
}

function StoreRow({ p, lead }: { p: PlatformKey; lead?: boolean }) {
  const m = platformMeta(p);
  return (
    <div className={lead ? "sc-row sc-lead" : "sc-row"}>
      <span className="sc-ico" style={{ ["--c" as string]: m.color }}><Use id={p} /></span>
      <span className="sc-nm">{m.name}</span>
      {lead && <span className="sc-pick">Your pick</span>}
      <span className="sc-ac">{m.action}</span>
    </div>
  );
}

export function PreSavePhone() {
  return (
    <div className="sc-phone"><div className="sc-screen"><div className="sc-scr">
      <Status />
      <div className="sc-cover"><Cover /></div>
      <div className="sc-rel"><small>Out 21 Nov 2026</small><strong>Lowlight</strong><span>Night Shift</span></div>
      <div className="sc-count"><div><b>11</b><span>days</span></div><div><b>04</b><span>hrs</span></div><div><b>31</b><span>min</span></div><div><b>08</b><span>sec</span></div></div>
      <div className="sc-form">
        <div className="sc-lb">Get it on release day</div>
        <div className="sc-in">you@email.com</div>
        <div className="sc-q">Where do you listen? (optional)</div>
        <div className="sc-chips"><span>Spotify</span><span>Apple Music</span><span className="sc-on">Beatport</span><span>Bandcamp</span></div>
        <div className="sc-go">Pre-save with email</div>
      </div>
      <div className="sc-follow"><Use id="spotify" /><b>Follow Night Shift on Spotify</b><em>Follow ↗</em></div>
    </div></div></div>
  );
}

export function SmartLinkPhone() {
  return (
    <div className="sc-phone"><div className="sc-screen"><div className="sc-scr">
      <Status />
      <div className="sc-cover"><Cover /></div>
      <div className="sc-rel"><small>Out now</small><strong>Lowlight</strong><span>Night Shift</span></div>
      <div className="sc-socials"><Use id="instagram" /><Use id="soundcloud" /><Use id="spotify" /></div>
      <div className="sc-rows">
        {(["spotify", "beatport", "traxsource", "bandcamp", "appleMusic"] as PlatformKey[]).map((p) => <StoreRow key={p} p={p} />)}
      </div>
    </div></div></div>
  );
}

export function EmailCard() {
  return (
    <div className="sc-mail">
      <div className="sc-mail-h">
        <span className="sc-av"><Cover viewBox="40 40 120 120" /></span>
        <b>Night Shift</b><time>9:00 am</time>
        <span className="sc-to">to you, in your timezone</span>
      </div>
      <div className="sc-mail-s">Lowlight by Night Shift is out now</div>
      <div className="sc-mail-b">
        <div className="sc-cover"><Cover /></div>
        <small>Out now</small><strong>Lowlight</strong><span className="sc-ar">Night Shift</span>
        <p>You pre-saved this one. It just dropped: listen or save it now.</p>
        <div className="sc-rows">
          <StoreRow p="beatport" lead />
          <StoreRow p="spotify" />
          <StoreRow p="appleMusic" />
        </div>
      </div>
    </div>
  );
}

/**
 * The warning droplr shows on the release's Settings tab, in its own words (lib/exclusivity).
 * No buttons on purpose: droplr warns, the artist switches the link off on the Links tab.
 */
export function ExclusiveWarning({ motion = false }: { motion?: boolean }) {
  return (
    <div className="sc-warn" data-sc-warn={motion ? "" : undefined}>
      <div className="sc-wt"><Use id="warn" />Beatport exclusive</div>
      Bandcamp breaks your Beatport exclusive, which runs until 12 Dec. Hide this link until the window closes, or drop the exclusive.
      <span className="sc-wh">On the release&apos;s Settings tab</span>
    </div>
  );
}
