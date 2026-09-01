# UI-SPEC — DVE Strategy landing, taste rebuild (2026-09-01)

Supersedes the warm-noir/gold v1 (rejected 2026-09-01 as "claude generic": dark +
single gold accent + Spectral serif + mono-uppercase eyebrows + filled SaaS buttons
+ custom cursor). Track: **committed editorial** (not pure restraint — a trading page
needs mono numerics), light ground. Structure stays a faithful Tradestone port.

## Gate 0 — Brief
- ONE feeling: the calm precision of a professional trading desk — a research note you
  trust, not a hype funnel.
- Design read: a trading-mentorship landing for retail traders, in a private-desk
  editorial-fintech language, leaning light and typographic.
- Physical scene (justifies LIGHT, not reflex dark): a portfolio manager reading a
  printed morning research note on a bright desk at 8am, one dark terminal glowing
  beside it. The page is the note; the live chart is the terminal.
- Single conversion action: Signup (one evergreen button). Hard bans: no gold accent,
  no dark permanent ground, no Spectral/Inter/Poppins/Space Grotesk/Geist/Fraunces/
  Instrument, no 12px uppercase mono eyebrow, no filled secondary buttons, no custom
  cursor, no grain, no per-element scroll-reveal spam, no em-dashes, no
  self-declared "premium/world-class", no gradient text, no emoji icons.

## Gate 2 — Token contract (60/30/10)
Color (paper 60 / ink+structure 30 / evergreen 10; claret = semantic only):
- `--paper` #ECEBE4 (oat-grey ground; deliberately cooler than the #F4F1EA cream cluster)
- `--paper-2` #F6F5F0 (raised surface, lighter than ground)
- `--ink` #17190F (near-black, faint warm-cool cast; never #000)
- `--muted` #63665B  · `--faint` #8C8E83 (captions only)
- `--line` #D6D5CB  · `--line-2` #E5E4DB (hairlines)
- `--evergreen` #1E5B3B (brand + "up" data + primary CTA) · `--evergreen-2` #16472D
- `--claret` #9E3527 ("down" data only)
- Dark terminal inset (chart): `--term` #111410, ink #E7E9E0, up #2FA96B, down #D0503E,
  tag #2FA96B, grid rgba(231,233,224,.10)

Accent reserved for (<=4): (1) primary CTA fill, (2) live "up"/positive figures,
(3) active-nav + signature session/tape marks, (4) chart price tag. Claret = "down" only.

Type (3 families, fixed roles):
- Display/headlines/eyebrows: **Bodoni Moda** 500 (+ italic for eyebrows). 30-54px only.
- Body/UI/nav/buttons: **Hanken Grotesk** 400/500.
- Numerics/prices/tape/labels/chart: **IBM Plex Mono** 400/500 (the trading vernacular;
  NEVER as an uppercase micro-label).
- Scale ~1.25: 15 / 17(body) / 21 / 27 / 34 / 44 / clamp hero to ~54 max. Body 17px,
  line-height 1.6, measure <=68ch. `tabular-nums` on every figure. `text-wrap:balance` h1-h3.
- Eyebrows: Bodoni italic, sentence case, rationed to <= ceil(sections/3).

Layout: asymmetric splits only (7/5, 8/4), never 50/50. Radius budget = 2 values
(`--r-sm` 3px controls, `--r` 10px insets). Nav one line, brand left + few links,
retreat to corners. Hairline dividers over heavy cards. Generous negative space.
CTA: ONE evergreen primary (the conversion); everything else hairline/ghost.

Motion: one orchestrated hero entrance (stagger fade-up, ease-out, <=600ms,
transform/opacity only). Ambient = the live tape + live chart, not scattered reveals.
Reduced-motion respected. No bounce/elastic, no `transition:all`.

## Signature element (subject's own materials, not decoration)
Three **session clocks** (Tokyo / London / New York, live open/closed state) + a **live
price tape** + the **dark live candlestick terminal**. Why: a trader's day is structured
by sessions and read off the tape and the ladder. These carry true, live information.

## Re-derive test
A template would ship: dark hero, gradient, 3 rounded cards, mono-uppercase eyebrow,
gold accent, filled buttons, reveal-on-everything = exactly the rejected v1. This plan
inverts all of it: light editorial paper, Bodoni display, serif-italic eyebrows,
evergreen/claret data-only color, session-clock + tape signature, dark chart inset,
hairline CTAs, one orchestrated entrance. Nothing survives unchanged.
