# droplr.fm — Security position

Rhythm Revolt Records Pty Ltd · Brisbane, Australia · Last reviewed 23 September 2026

Send this when a label, distributor or artist manager asks "are you secure / are you
SOC 2 / do you handle cards". It is deliberately short and honest. Everything in
Part 1 is a fact about the product today. Part 2 is the plan we follow if something
goes wrong. Part 3 is internal — do not send it.

---

## Part 1 — The sendable page

### Certifications

**droplr.fm is not SOC 2 or ISO 27001 certified.** We are a small Australian company
and those audits attest to a security *program*, not to a secure product. We would
rather show you the controls than a badge we bought. If your procurement process
requires a certified vendor, tell us early — we would rather know than waste your time.

**PCI DSS: we are SAQ A eligible and self-assess annually.** droplr.fm never sees a
card number. Checkout is a full browser redirect to Stripe-hosted Checkout with Stripe
Managed Payments, so there is no payment page and no card field on any droplr.fm
domain. Stripe is the merchant of record for subscriptions: they collect the card,
handle tax, send receipts and own disputes. Because we do not serve a payment page,
PCI DSS 6.4.3 and 11.6.1 (script integrity on payment pages) do not apply to us.

**Consumer Data Right (CDR) does not apply.** The designated sectors are banking,
energy and non-bank lending. Music release data is not in scope.

**Australian privacy law applies.** We operate to the Australian Privacy Principles
and the Notifiable Data Breaches scheme, and to the GDPR for EU and UK fans, whether
or not the small-business exemption technically covers us. Our Privacy Policy, Terms,
and a signable Data Processing Agreement are public at droplr.fm/legal.

### What actually protects your data

| Control | Implementation |
|---|---|
| Tenant isolation | Every database query is scoped by `organizationId`. A request for another label's release returns 404, not 403 — you cannot even confirm a record exists. |
| Proof of isolation | 239 automated tests exist solely to prove one label cannot read, write or enumerate another's data. They run on every single push. |
| Total test suite | 592 automated tests across eight suites, all gated in CI. A red suite blocks the change. |
| Passwords | bcrypt, cost factor 12. Never stored or logged in plain text. |
| Third-party credentials | AES-256-GCM field-level encryption at rest (Spotify, Deezer, SoundCloud secrets and refresh tokens, OAuth state, invite codes). |
| Sessions | Signed JWTs in secure, HTTP-only, same-site cookies. |
| Fan IP addresses | Never stored raw. One-way hash, salted with a secret *and the date*, so the hash changes daily and cannot be correlated across days. |
| Transport | HTTPS everywhere, HSTS, no mixed content. |
| Static analysis | GitHub CodeQL on every push, PR and weekly — injection, XSS, path traversal, SSRF. |
| Dependencies | Dependabot, weekly. Advisories reported in CI. Major framework bumps are held and tested, not auto-merged. |
| Source control | `main` is protected: force pushes blocked, deletions restricted. |
| Data residency | Primary database in Sydney, Australia (Neon). |

### Sub-processors

Netlify (hosting/CDN, US), Neon (database, Sydney), Resend (transactional email, US),
Stripe (billing only — never fan data), and Spotify, Deezer or SoundCloud only when a
fan or artist connects their own account. Each is a named sub-processor in our DPA,
which commits us to 30 days' notice before we add or replace one that touches fan data.

### Breach commitment

If fan data is exposed, we notify the affected label without undue delay and, where
feasible, within 72 hours — with what happened, whose data, and what we are doing.
If serious harm is likely we notify affected individuals and the OAIC under the
Notifiable Data Breaches scheme. We have a written plan for doing this; it is Part 2.

### Questions

security@droplr.fm. We will answer a security questionnaire once a year at no cost,
and sooner if a regulator asks or something has gone wrong.

---

## Part 2 — Incident response plan

This is the part that was missing. The DPA promises notification within 72 hours; this
is how that promise gets kept. One page, on purpose — a plan nobody can follow at 2am
is not a plan.

### What counts as an incident

Any of: a login you didn't make, fan or label data visible to the wrong account, a
leaked key or token, a database or provider compromise, ransomware or destructive
access, or a credible report of any of the above from a researcher or customer.

A Netlify outage is **not** an incident. Availability is a different problem.

### Severity

- **SEV-1** — data of one tenant exposed to another, or to the public. Any confirmed
  unauthorised access to the database. Clock starts.
- **SEV-2** — a leaked credential with no evidence of use. A vulnerability found with
  no evidence of exploitation.
- **SEV-3** — everything else worth writing down.

### The first hour (SEV-1)

1. **Write down the time.** UTC and Brisbane. Every later deadline counts from here.
2. **Start a log.** One file, append-only, timestamped: what you saw, what you did,
   what you concluded. Do not clean it up afterwards. This is the artefact a regulator
   and a customer both want.
3. **Stop the bleeding before you investigate.** Rotate the exposed credential
   (Netlify env → redeploy). Suspend the account. Take the route offline if you must.
   A broken feature is recoverable; continued exposure is not.
4. **Preserve evidence.** Do not delete logs, do not force-push, do not "tidy" the
   database. Export the Netlify function logs and the relevant Neon rows first.
5. **Determine scope.** Which organisations, which fans, which fields, what window.
   If you cannot answer "how many people" in the first hour, say so in the log and
   keep working.

### Who you call

| Need | Who | Where |
|---|---|---|
| Decision maker | Cody Morrison | (you) |
| Hosting / logs / edge | Netlify support | app.netlify.com support |
| Database, PITR restore | Neon support | console.neon.tech |
| Billing, card data, fraud | Stripe support | dashboard.stripe.com |
| Email delivery / spoofing | Resend support | resend.com |
| Domain / DNS hijack | Registrar support | (registrar account) |
| Australian privacy law | Privacy lawyer — **engage one before you need one** | TBD |
| Regulator | OAIC, Notifiable Data Breaches form | oaic.gov.au |
| Cybercrime report | ReportCyber | cyber.gov.au |

**Gap to close: the lawyer line says TBD.** Find one and put a name there. Doing it
cold, mid-incident, is how the 72 hours gets burned.

### The 72-hour clock

- **Hour 0–24** — contain, scope, log. Notify affected labels as soon as you can
  describe the incident, even if the investigation is still open. An early partial
  notice beats a late complete one.
- **Hour 24–72** — written notice to every affected label: what happened, when, what
  data, how many people, what you have done, what they should do. Assess serious harm.
- **Within 30 days** — if serious harm is likely, a statement to the OAIC and to
  affected individuals. This is the statutory Notifiable Data Breaches deadline; do
  not use all of it.

### What the notice says

Plain English, no hedging. What happened. When it started and when it stopped. Exactly
which fields. How many people. What you have already done. What they need to do (reset
a password, warn their fans). One contact address. No "may have potentially been".

### After

Within a week: a written post-mortem — timeline, root cause, what made it possible,
what stops it recurring. **If it was an isolation bug, the fix ships with a new test in
the 239-test suite.** A fix without a test is not a fix; the bug comes back.

### Drill it

Twice a year, spend twenty minutes on a tabletop: "a label reports seeing another
label's fan list." Walk the steps. Check the credentials rotate, the logs exist, and
the contacts still work. Write the date in this document.

Last drill: **never.** Do one before launch.

---

## Part 3 — Internal. Do not send.

### Gaps I would find first if I were auditing you

1. **MFA is not on everywhere.** GitHub, Stripe, Netlify, Neon, the domain registrar,
   and the Google account behind them. This is the single highest-value hour of
   security work available to you and it costs nothing. An attacker does not need a
   bug in droplr if they can log into Netlify.
2. **No named lawyer.** See the table above.
3. **No drill has ever been run.**
4. **Secret scanning with push protection is still off** (GitHub → Settings → Advanced
   Security). The repo is public. This is what stops a key being committed rather than
   reporting it after the fact.
5. **PCI SAQ A has not been filed.** Stripe Dashboard → Settings → Compliance →
   Documents. Free, ~20 minutes, annual. Do it so the claim in Part 1 is backed by a
   document you can attach.
6. **Sub-processor list is now stale in one place** — SoundCloud joined with the
   download gates. The DPA text has it; check the Privacy Policy share section names
   it too.
7. **Provider certifications are asserted, not verified.** Before you send Part 1 to a
   procurement team, pull the current reports from each provider's trust page and say
   which you have actually seen. Do not claim a vendor's SOC 2 on memory.

### The open legal question

Whether the Privacy Act's A$3 million small business exemption still exists is
genuinely unresolved — the sources contradict each other and all of them are marketing
for compliance software. It does not change what you should do (you are already
operating as if the APPs apply, which is the right posture and what customers expect),
but it does change whether non-compliance is a legal risk or only a commercial one.
That is a question for an Australian privacy lawyer, not for me and not for a blog.

### What to say if someone demands SOC 2

"We're not certified, and I'd rather tell you that than pay for an audit of a program
we're still building. Here's what we do instead, and here's our incident response plan.
If certification is a hard requirement for you, say so now and I'll tell you honestly
whether we can get there in your timeframe."

That answer wins more procurement conversations than a badge does at this stage. It
stops winning them the moment you are selling to a major.
