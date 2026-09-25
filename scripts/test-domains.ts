/**
 * Custom domains: naming advice, and what happens to the old domain when a label moves to a new one.
 *   npx tsx scripts/test-domains.ts
 *
 * What this defends:
 *  - a domain change used to be a one-way door. Every link already printed on a card, pinned in a bio or
 *    sitting in someone's saved messages died the moment the alias was detached. The old domain now keeps
 *    redirecting to the current one for a year;
 *  - the redirect is permanent ONLY when there is another live domain to point at. A 308 to droplr.fm gets
 *    cached by the browser forever, so the label's new domain would never take over for that visitor;
 *  - whoever currently holds a domain beats whoever used to hold it. An old entry can't shadow a live tenant;
 *  - an alias scheduled for release next year isn't released today.
 *
 * Local database only. Never point it at Neon.
 */
import { prisma } from "../src/lib/db";
import { DOMAIN_REDIRECT_DAYS, domainAdvice, forgetPreviousDomain, MAX_PREVIOUS_DOMAINS, nextPreviousDomains, processDetaches, queueDetach } from "../src/lib/domains";
import { SITE_URL } from "../src/lib/env";
import { resolveTenantPath } from "../src/lib/releases";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if ((process.env[name] ?? "").includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run against production (${name}).`);
    process.exit(1);
  }
}

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};

const tag = Date.now().toString(36);
const OLD = `presave-${tag}.example.com`;
const NEW = `listen-${tag}.example.com`;
const PENDING = `soon-${tag}.example.com`;

async function main() {
  console.log("1. Naming advice");
  const advice = domainAdvice("presave.rhythmrevoltrecords.com");
  check("presave.* gets advice", !!advice);
  check("it suggests listen. on the same root", !!advice?.includes("listen.rhythmrevoltrecords.com"), advice ?? "");
  check("it suggests music. too", !!advice?.includes("music.rhythmrevoltrecords.com"));
  check("it says old links keep working", !!advice?.includes("keep redirecting"));
  check("two-part suffix keeps the whole root", !!domainAdvice("presave.label.com.au")?.includes("listen.label.com.au"));
  check("pre-save with a hyphen counts", !!domainAdvice("pre-save.label.com"));
  check("preorder counts", !!domainAdvice("preorder.label.com"));
  check("outnow counts", !!domainAdvice("outnow.label.com"));
  check("uppercase still counts", !!domainAdvice("PreSave.Label.com"));
  check("listen. is fine", domainAdvice("listen.label.com") === null);
  check("music. is fine", domainAdvice("music.label.com") === null);
  check("an apex domain is fine", domainAdvice("label.com") === null);
  check("only the host part is read, not the root", domainAdvice("go.presaverecords.com") === null && domainAdvice("hello.outnowmusic.com") === null);

  console.log("\n2. Bookkeeping when the domain changes");
  const np = (cur: string[], leaving: string | null, arriving: string | null, keeps: boolean) => nextPreviousDomains(cur, leaving, arriving, keeps).join(",");
  check("an attached domain is kept", np([], "a.com", "b.com", true) === "a.com");
  check("one that never attached is dropped", np([], "a.com", "b.com", false) === "");
  check("moving back clears the old entry", np(["a.com"], "b.com", "a.com", true) === "b.com");
  check("no duplicates", np(["a.com"], "a.com", "b.com", true) === "a.com");
  check("the cap holds, oldest first out", np(["a.com", "b.com", "c.com"], "d.com", "e.com", true) === "b.com,c.com,d.com", String(MAX_PREVIOUS_DOMAINS));
  check("clearing the domain still keeps the old one redirecting", np([], "a.com", null, true) === "a.com");

  console.log("\n3. A label moves to a new domain");
  const org = await prisma.organization.create({
    data: {
      name: `Domains ${tag}`, slug: `domains-${tag}`, plan: "label", planUpdatedAt: new Date(),
      customDomain: NEW, customDomainVerifiedAt: new Date(), customDomainAttachedAt: new Date(), customDomainLiveAt: new Date(),
      previousDomains: [OLD],
    },
  });
  const cleanup: string[] = [org.id];
  try {
    const release = await prisma.release.create({
      data: {
        organizationId: org.id, slug: `moved-${tag}`, title: "Moved", artistName: "Tester",
        coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86_400_000), autoReResolve: false,
      },
    });

    const onNew = await resolveTenantPath(NEW, [release.slug]);
    check("the current domain still serves the release", onNew?.kind === "release", onNew?.kind ?? "null");

    const moved = await resolveTenantPath(OLD, [release.slug]);
    check("the old domain redirects", moved?.kind === "redirect", moved?.kind ?? "null");
    check("…to the same release on the new domain", moved?.kind === "redirect" && moved.to === `https://${NEW}/${release.slug}`, moved?.kind === "redirect" ? moved.to : "");
    check("…permanently, because there is a live domain to point at", moved?.kind === "redirect" && !moved.temporary);

    const rootMoved = await resolveTenantPath(OLD, []);
    check("the old domain's root redirects to the new root", rootMoved?.kind === "redirect" && rootMoved.to === `https://${NEW}`, rootMoved?.kind === "redirect" ? rootMoved.to : "");

    const variantMoved = await resolveTenantPath(OLD, [release.slug, "ig"]);
    check("a variant path is carried across", variantMoved?.kind === "redirect" && variantMoved.to === `https://${NEW}/${release.slug}/ig`);

    check("an unrelated host is still a 404", (await resolveTenantPath(`nobody-${tag}.example.com`, [release.slug])) === null);

    console.log("\n4. The new domain isn't live yet");
    // Mid-move: DNS not switched over. Sending visitors to droplr.fm has to be temporary, or the browser caches
    // the 308 and the label's new domain never takes over for that person once it connects.
    await prisma.organization.update({ where: { id: org.id }, data: { customDomain: PENDING, customDomainLiveAt: null, previousDomains: [OLD] } });
    const midMove = await resolveTenantPath(OLD, [`${release.slug}-b`]);
    check("old domain falls back to droplr.fm", midMove?.kind === "redirect" && midMove.to === `${SITE_URL}/${org.slug}/${release.slug}-b`, midMove?.kind === "redirect" ? midMove.to : "");
    check("…temporarily, so the new domain can still take over", midMove?.kind === "redirect" && midMove.temporary === true);

    console.log("\n5. Whoever holds the domain now wins");
    const claimant = await prisma.organization.create({
      data: {
        name: `Claimant ${tag}`, slug: `claimant-${tag}`, plan: "label", planUpdatedAt: new Date(),
        customDomain: OLD, customDomainVerifiedAt: new Date(), customDomainAttachedAt: new Date(), customDomainLiveAt: new Date(),
      },
    });
    cleanup.push(claimant.id);
    const theirs = await prisma.release.create({
      data: {
        organizationId: claimant.id, slug: `claimed-${tag}`, title: "Claimed", artistName: "Tester",
        coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86_400_000), autoReResolve: false,
      },
    });
    const served = await resolveTenantPath(OLD, [theirs.slug]);
    check("the live tenant is served, not the old holder's redirect", served?.kind === "release" && served.release.organizationId === claimant.id, served?.kind ?? "null");

    check("forgetPreviousDomain drops the stale claim", await (async () => {
      await forgetPreviousDomain(OLD);
      const after = await prisma.organization.findUnique({ where: { id: org.id }, select: { previousDomains: true } });
      return !after?.previousDomains.includes(OLD);
    })());

    console.log("\n6. The alias isn't released today");
    const due = new Date(Date.now() + DOMAIN_REDIRECT_DAYS * 86_400_000);
    check("a year is a long enough grace", DOMAIN_REDIRECT_DAYS >= 365);
    await queueDetach(OLD, due);
    const queued = await prisma.domainDetach.findUnique({ where: { domain: OLD } });
    check("the detach is scheduled, not immediate", !!queued?.after && queued.after.getTime() > Date.now() + 300 * 86_400_000, String(queued?.after));
    check("processDetaches skips a row that isn't due", (await processDetaches(10, OLD)) === 0 && !!(await prisma.domainDetach.findUnique({ where: { domain: OLD } })));
    check("…and doesn't burn a retry on it", (await prisma.domainDetach.findUnique({ where: { domain: OLD } }))?.attempts === 0);

    // Re-queueing without a date clears the hold: that's a domain cleared outright, which goes now.
    // Netlify is switched off for this one call so the row survives to be inspected instead of being actioned.
    const token = process.env.NETLIFY_API_TOKEN;
    delete process.env.NETLIFY_API_TOKEN;
    try { await queueDetach(OLD); } finally { if (token !== undefined) process.env.NETLIFY_API_TOKEN = token; }
    check("clearing a domain queues it straight away", (await prisma.domainDetach.findUnique({ where: { domain: OLD } }))?.after === null);
    // Still claimed by the live tenant above, so processDetaches keeps the alias and drops the row.
    check("a domain someone else now uses is never detached", (await processDetaches(10, OLD)) === 0 && (await prisma.domainDetach.findUnique({ where: { domain: OLD } })) === null);
  } finally {
    await prisma.domainDetach.deleteMany({ where: { domain: { in: [OLD, NEW, PENDING] } } });
    await prisma.release.deleteMany({ where: { organizationId: { in: cleanup } } });
    await prisma.organization.deleteMany({ where: { id: { in: cleanup } } });
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch(async (e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
