# Thrive Quick Fit

**Where can you serve?** A four-minute, phone-first serving assessment for LOFT City Church that ends in a real next step: a role to try once and a team leader who follows up within 48 hours.

Built to `docs/spec.pdf` (September 2026). Scoring model v2 (energy plus readiness). No framework, no build step. Content lives in JSON files anyone can edit.

## Current state (October 7, 2026)

Live at **https://thrive.loftcity.church** (HTTPS, Let's Encrypt). `serve-loft.netlify.app` redirects there.

- Code: GitHub `samchacko03/thrive`, branch `main`. Netlify site `serve-loft` auto-deploys every push.
- DNS (GoDaddy, loftcity.church): CNAME `thrive` to Netlify; Resend records for the `mail` subdomain (DKIM TXT, two CNAMEs, MX, owner-verification TXT).
- Email: Resend domain `mail.loftcity.church` is Verified. Sends from `info@mail.loftcity.church`, replies go to `info@loftcity.church`. API key "Thrive (Netlify)" lives only in Netlify env vars.
- Tested end to end on the live site: emailReport, try, intro, coffee, remind, keep all returned ok and all emails show Delivered in Resend. The emailed report link opens the stored two-page report.
- Not yet done: `ZAPIER_HOOK_URL` is unset, so leader tasks are a no-op until the Zap below is built. Role time costs in `roles.json` still need Anil and Morgan.

## How it works

1. Name, email, consent.
2. 41 statements rated "I'd struggle here" to "I'd thrive here" (39 energy items across 13 archetypes, 2 consistency checks).
3. Readiness check on the top five areas: have you done this before?
4. Who are you drawn to serve? (up to three)
5. Availability this season (six options, including rest and healing).
6. About you (all optional): skills or languages, who they'd serve with, what would make serving hard, rhythm, where they are with Jesus.
7. **The report.** A two-page, Letter-size, LOFT-branded report (design in `docs/design/Thrive_Report.pdf`; rules in `docs/design/report-instructions.md`). Shown on screen scaled to the phone, printable from the page (Print or Save as PDF), and emailed with a private link that reopens it. Reports are stored in Netlify Blobs under an unguessable id (`report.html?id=...`); a self-contained `?d=` link is the fallback.
8. **The four doors.** Nothing is assumed. The person chooses:
   - **Try a role once.** Role cards with time costs. Tap one; the leader gets a task and texts within 48 hours. One Sunday, no commitment.
   - **Talk with someone first.** Pick a team to learn more about: an intro email goes to the person and that team's leader together, Sam BCC'd. Or "I'm not sure yet," which offers coffee with Pastor Sam to discern serving vs. rest; the person gets the Calendly link, Sam gets a heads-up.
   - **Not now, remind me later.** 1, 3, 6, 12 months or any date. One email on that day with the report and the same doors. Nothing before. (Rest-and-healing people see this door first, 6 months suggested.)
   - **Just keep my results.** Saved with the team; nobody reaches out unless they ask.
9. A confirmation that reflects exactly what they chose.

## Repo layout

```
index.html                   app shell
assets/css/thrive.css        June 2026 brand system
assets/js/app.js             screen flow, rendering, submit
assets/js/scoring.js         scoring model v2 (pure functions)
assets/js/match.js           role matching
assets/logo.png              orange wordmark, transparent
content/en/*.json            everything a human might edit (see below)
content/es/                  Spanish scaffold (copy en, translate values)
report.html                  standalone report page (opens from the emailed link; printable)
assets/js/report.js          report data model + two-page renderer (matches docs/design)
assets/css/report.css        the report's own stylesheet
netlify/functions/report.js  GET /api/report?id= (stored reports)
netlify/functions/submit.js  backend: emails, intros, reminders, leader routing (Zapier or Planning Center)
netlify/functions/send-reminders.js  scheduled daily; sends reminders due today
netlify/functions/lib/email.js       Resend email + LOFT email layout
netlify.toml                 /api/submit redirect, functions folder
tests/scoring.test.js        16 tests for scoring and matching
docs/spec.pdf, spec.json     the build spec
```

## Editing content (no code)

Open a file in `content/en/`, change the text, commit. Netlify redeploys in about a minute.

| Want to change | Edit |
|---|---|
| A question's wording | `items.json` (keep `a` and `n` the same) |
| Team names, who leads each team, their email | `teams.json` |
| Roles, what they involve, time cost, which archetypes fit | `roles.json` |
| Any on-screen text, button labels, the confirmation copy | `ui.json` |
| Archetype names or one-liners | `archetypes.json` |
| Availability or audience options | `availability.json`, `audiences.json` |
| About-you options (serve with, barriers, rhythm, faith stage) | `about.json` |

Each role also carries three matching fields: `rhythm` (weekly, events, or oncall), `familyOk` (true if someone can serve alongside a spouse or kids), and `maturity` (true if it needs an established believer; people still exploring or new to faith are never offered it). The `idea` role ("Something not on this list") routes to Sam so a Pioneer with a real idea has somewhere to go.

**The single most important content:** the `time`, `minCommit`, and `training` fields in `roles.json`. Until a leader fills them in, the app shows "Ask [leader] about the time commitment." Honest time costs are what make a yes easy.

When the pilot ends, set `"pilot": false` on every team in `teams.json`.

## Running locally

```
npm run dev        # serves on http://localhost:3000
npm test           # runs the 16 scoring and matching tests
```

The submit button will show the error state locally because there's no function endpoint. To test the backend locally, use the Netlify CLI: `npx netlify dev`.

## Deploying

1. Push this folder to GitHub (`loftcitychurch/thrive` or your own account).
2. In Netlify: Add new site > Import from Git > pick the repo. Build command: none. Publish directory: `.`. Netlify detects `netlify.toml`.
3. Add environment variables (Site configuration > Environment variables). See the backend section below.
4. Domain: add `thrive.loftcity.church` in Netlify > Domain management, then in GoDaddy DNS add a CNAME record, name `thrive`, pointing to your Netlify site address. HTTPS is automatic.

Every push to `main` redeploys.

## Email and reminders (Resend + Netlify Blobs)

Emails to the person (report, confirmations, intros, coffee, reminders) go through Resend. Reminders are stored in Netlify Blobs (built in, no setup) and sent by a scheduled function every morning at 8:00 AM Central.

Setup, one time:
1. Create a free account at resend.com. Add the domain `mail.loftcity.church` (a subdomain, because the root domain was already claimed by another Resend team) and add the DNS records it shows in GoDaddy. Wait for "Verified."
2. Create an API key. In Netlify > Site configuration > Environment variables, add:
   - `RESEND_API_KEY` = the key
   - `MAIL_FROM` = `LOFT City Church <info@mail.loftcity.church>` (the verified sending subdomain)
   - `MAIL_REPLY_TO` = `info@loftcity.church` (where replies go)
   - `SITE_URL` = `https://thrive.loftcity.church`
   - `PASTOR_EMAIL` = `sam@loftcity.church` (BCC on intros, coffee heads-ups)
   - `PASTOR_CALENDLY` = `https://calendly.com/samchacko`
3. Nothing else. Netlify Blobs and the schedule work automatically once deployed. The email carries a private link to the report; the person prints or saves a PDF from the page. (A serverless Chromium PDF attachment was tried and does not run on Netlify's function image, so it was removed.)

Resend's free tier is 3,000 emails a month, far more than needed. Every email is sent from the church, not from a personal account.

## Backend: where leader tasks go

One environment variable decides: `THRIVE_DESTINATION` = `zapier` (default) or `planningcenter`.

### Option A: Zapier (recommended to start)

Reuses the Serve at LOFT routing already built in Zapier. The function sends a `route_to` field (worship, audio, video, fm, hosp, prayer, missions, groups, general, pastor) and an `action` field (try, intro, coffee, remind, keep).

1. In Zapier, create a Zap: **Trigger: Webhooks by Zapier, Catch Hook.** Copy the hook URL.
2. In Netlify, set `ZAPIER_HOOK_URL` to that URL.
3. Add steps in the Zap, mirroring the Serve at LOFT Zap:
   - **Paths** on `route_to`: worship/audio/video to Anil, fm to Morgan, hosp to Lexie, prayer to Christine, missions to Jasper, groups to Kaley, pastor to Sam, general to Nincy.
   - **Asana: Create Task** in SLT Weekly Meeting Action Items, section "Serve at LOFT Submissions", assigned to the leader, due in 2 days, name `Thrive: {first_name} {last_name} wants to try {role_name}`, notes = `summary`.
   - Task name by `action`: try = "Thrive: {first_name} wants to try {role_name}"; intro = "Thrive: {first_name} asked about {role_team_name}" (the intro email already went out; the task is a nudge to reply); coffee = "Thrive: coffee with {first_name}"; remind = "Thrive: {first_name} asked for a check-in on {remind_at}" (no due date; the reminder email is automatic); keep = "Thrive: {first_name} saved results" (no due date, do not contact).
   - No email steps are needed in the Zap. The function already emails the person.
4. Fields available from the hook: `first_name, last_name, email, action, route_to, remind_at, report_url, fruitful, faithful, wearying, availability, availability_key, drawn_to, role_name, role_team, role_team_name, role_leader, role_leader_email, role_when, role_time, suggested_roles, skills_languages, serve_with, barriers, rhythm, faith_stage, flags, seconds_to_complete, summary, all_scores`.

### Option B: Planning Center direct

Writes custom fields and creates a workflow card assigned to the leader. Needs setup in Planning Center first.

1. People > Custom fields: create a tab **Thrive** with text fields: Thrive Date, Fruitful, Faithful, Wearying, Top Archetype 1, Top Archetype 2, Availability, Drawn To, Role Chosen, Flags, Skills, Serve With, Barriers, Rhythm, Faith Stage. Note each field's ID (visible in the URL when you edit it, or via api.planningcenteronline.com > API Explorer > people/v2/field_definitions).
2. People > Workflows: create **Thrive: Worship**, **Thrive: Family Ministries**, **Thrive: General**, each with steps: Contact within 48 hours, First Serve scheduled, First Serve completed, 30-day check-in. Assign step 1 to the leader. Note each workflow's ID (in the URL).
3. Create a Personal Access Token at api.planningcenteronline.com (Sam already has one).
4. Netlify environment variables:
   - `THRIVE_DESTINATION` = `planningcenter`
   - `PCO_CLIENT_ID`, `PCO_SECRET` (never commit these; never paste them in chat)
   - `PCO_FIELDS_JSON` = `{"thriveDate":ID,"fruitful":ID,"faithful":ID,"wearying":ID,"top1":ID,"top2":ID,"availability":ID,"drawnTo":ID,"roleChosen":ID,"flags":ID,"skills":ID,"serveWith":ID,"barriers":ID,"rhythm":ID,"faith":ID}` (omit any you don't create)
   - `PCO_WORKFLOWS_JSON` = `{"worship":ID,"audio":ID,"video":ID,"fm":ID,"general":ID}` (teams not listed fall back to general)

Email confirmation to the person is not sent in this mode; Planning Center workflow notifications go to the leader. Add a Zap or Planning Center automation for the person's email if wanted.

## Changing the report

The report's layout is fixed by design. To change copy (taglines, the three questions, the scripture, links), edit `content/en/ui.json` under `report`. To change the look, edit `assets/css/report.css` and re-check against `docs/design/Thrive_Report.pdf`. Render the Priya sample and confirm both pages still fit one Letter sheet.

## Measuring

The only number that matters: **percent of takers who complete a First Serve within 60 days.** In Asana, that's tasks marked complete with a "served" tag; in Planning Center, cards reaching step 3. Count at 30 and 60 days after each welcome lunch.

## Privacy

Planning Center or Asana is the system of record. The function logs only a timestamp, destination, and ok/fail. No names or emails are logged. Rest-and-healing responses are deliberately routed to a gentle 90-day check-in with no leader assignment.

## Spanish

Copy `content/en/*.json` to `content/es/`, translate only the text values, keep every key. Then serve an `es.html` copy of `index.html` with `lang="es"`, or add a language toggle. The app loads `content/{lang}/`.

## Questions

Brand questions: Nincy Hernandez, nincy@loftcity.church. Everything else: Sam Chacko, sam@loftcity.church.
