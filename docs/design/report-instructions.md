# Thrive report — instructions for Claude (Netlify build)

## Goal
When someone completes the Thrive survey on the website, generate a two-page, letter-size, LOFT-branded report that matches `Thrive Report.dc.html` in this project exactly (layout, type, colors, spacing). Deliver it as an HTML page at a private URL and as a PDF attached to the confirmation email.

## Where it runs
- Netlify Function (`netlify/functions/thrive-report.ts`), triggered by the form submission (`submission-created` event or a direct POST from the survey).
- Input: the respondent's answers plus computed scores for the 13 areas (0–5, one decimal).
- Output: `report.html` (self-contained, fonts linked from Google Fonts) stored in Netlify Blobs keyed by a random id, and a PDF rendered from it (Playwright/Chromium, Letter, no margins, `printBackground: true`).
- Email the respondent the report link and PDF; the link reopens the same HTML.

## Data model
```
name, fullName, date            // "Priya", "Priya Varghese", "October 6, 2026"
areas: [{ name, score, description, readyNow }]   // all 13, report order:
  Shepherd, Teacher, Disciple-Maker, Host, Artist, Producer, Evangelist,
  Mercy-Bearer, Intercessor, Administrator, Strategist, Mobilizer, Pioneer
roles: [{ ministry, role, schedule }]             // exactly 3
told: { season, drawnTo, rhythm, serveWith, faith, skills }
questions: [string, string, string]
links: { serve, coffee, retake }
```
Tiers: Fruitful = score ≥ 4.5 · Faithful = 2.5–4.4 · Wearying = < 2.5. Only areas that appear in Fruitful/Wearying (and the top Faithful) get cards; all 13 appear in the right-hand list.

## Template (reproduce exactly)
Use the HTML in `Thrive Report.dc.html` as the template. Replace only the data; do not restyle.

**Page 1**
- Navy `#1A2E52` header band, padding 40/56px: white wordmark (52px) top-left; "Prepared for {fullName} on {date}" top-right in `#B9C3D6` 12px; orange dot + amber `#FAA83D` uppercase eyebrow "Your Thrive report"; headline "{name}, here's what we learned." Barlow Condensed 800, 58px, line-height 0.98, white; subline "Take it, print it, pray over it. Nothing here commits you to anything." 16px `#D6E0F0`.
- Body grid: left column (fluid) + right column 250px, gap 40px, padding 36/56px.
- Left: three tiers, each with a dot + Barlow Condensed 28px heading and 13px gray tagline:
  - Fruitful (orange `#E15628`, filled dot), tagline "Where you come alive. Lean in here." Cards `#FDF1EB`, radius 14px, two per row. Card: name (Barlow Condensed 700 21px navy), score right-aligned in orange, optional "Ready now" tag (11px uppercase `#C8481D`), description 13.5px.
  - Faithful (navy, filled dot), tagline "Capable, not energized. Good for a season when there's a need." Cards `#EDF2FA`, score in navy.
  - Wearying (`#5F656E`, outlined dot), tagline "Tends to drain you over time. Serve here sparingly." Cards white with 1px `#E4E3DE` border, score `#8A8F96`.
- Right: "All thirteen areas" — 13 rows with hairline dividers, name 13px, five 9px dots (filled up to the score, colored by tier), score in Barlow Condensed 15px. Legend below: Fruitful / Faithful / Wearying dots.
- Footer: "LOFT City Church · Thrive" left, "1 of 2" right, 11px `#8A8F96`.

**Page 2**
- "Roles at LOFT that fit you" (Barlow Condensed 800 36px) + subline "Based on your wiring, who you're drawn to, and your season. Just information for now." Three Sand `#F4EFE7` cards: ministry eyebrow (10.5px uppercase orange), role (Barlow Condensed 21px navy), schedule line (12.5px gray).
- Two columns, gap 40px: "What you told us" as a two-column definition list (labels 12px `#8A8F96`, values 13px, hairline rows); "Three questions to sit with" with big orange numerals (Barlow Condensed 800 30px) and 13.5px text.
- Navy card, radius 18px: "Whenever you're ready" (Barlow Condensed 800 30px white), two dot-bulleted links in amber ("Sign up to serve: …", "Coffee with Pastor Sam: …"), note "Reopen this report any time from the link in your email, or retake it at thrive.loftcity.church" in `#B9C3D6`; white wordmark 84px on the right.
- Ephesians 2:10 quote with 3px orange left rule, Barlow Condensed 600 22px navy, cite in orange uppercase 12px.
- Footer "2 of 2".

## Style rules (non-negotiable)
- Fonts: Barlow Condensed (headings, 600–800) and DM Sans (body, 13–16px, line-height 1.4–1.5). Fallbacks Oswald / Arial.
- Colors only from the LOFT palette: Orange `#E15628`, Amber `#FAA83D`, Navy `#1A2E52`, Sand `#F4EFE7`, Mist `#EDF2FA`, orange-50 `#FDF1EB`, neutrals `#E4E3DE #8A8F96 #5F656E #3C4250 #2B3142`. Never maroon.
- Sentence case for every heading. LOFT always all-caps. Oxford commas.
- Dots are the only decorative motif. Card radii 14–18px, hairline dividers, no shadows, no gradients, no emoji, no icons.
- Keep all survey copy verbatim; never paraphrase a respondent's answer or an area description.
- Each page must fit one Letter sheet with no clipping; test with the longest plausible names and descriptions.

## Acceptance check
Render the sample data (Priya Varghese) and diff against `Thrive Report.dc.html` — they should be visually identical. Confirm the PDF is two pages, Letter, backgrounds printed, fonts embedded.
