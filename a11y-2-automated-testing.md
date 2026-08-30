# A11y 2 of 3 — What the automated tests cover, and what they cannot

**App:** VW Charging Time Simulator (`charging-time-simulator`).
**Audited:** 2026-08-22 against the live deployment, headless Chrome 151.0.7922.174, axe-core 4.13.0
(`axe.version` read from the engine, not the bundle filename).
**Deployed at:** https://yikcunchung.github.io/vw-charging-time-simulator-prototype/
**Companions:** `a11y-1-criteria.md` (every criterion) · `a11y-3-implementation.md` (what to build).

The single most important sentence in this pack:

> **A clean automated run is necessary and nowhere near sufficient.** This app scores 0 axe
> violations, 0 WAVE errors and 0 HTML validity errors — and that result could not see the
> unnamed-graphic defect that the accessibility tree found, cannot test SC 2.5.3, cannot judge
> whether a name is *correct* rather than merely present, and cannot tell you what a screen reader
> actually says.

---

# 0. Scope of this evidence — read before quoting a number

This app is a **standalone page**, so `axe.run(document)` covers the whole conformance surface.
There is no component-versus-page split.

The local `index.html` and the deployed build are **byte-identical**.

---

# 1. Tool coverage at a glance

| Tool | Good for | Blind spots that matter here |
|---|---|---|
| **axe-core 4.13.0** | Structural ARIA, names, roles, contrast on solid backgrounds | **No `label-in-name` rule at all** (SC 2.5.3). **Cannot see an unnamed inline `<svg>` that has no `role`** — trap 10. Cannot see behaviour. Punts on contrast over gradients. **Nine rules are off by default, including `target-size`** — trap 1 |
| **WAVE 3.3.1.0** | A genuinely different engine; catches empty labels and sr-only contrast axe passes | Needs a public URL. Reports `.sr-only` contrast as an error even when clipped to 1×1 |
| **Nu HTML validator** | SC 4.1.1 Parsing, still normative under EN 301 549 | Says nothing about semantics or naming |
| **Accessibility tree (CDP)** | Ground truth for name / role / value | Exposure is not announcement — §5 |
| **Real key and pointer events** | The only way to test behaviour | Slow; assert state after every event |

## Required toolchain — coverage against it

| Required | Status | Note |
|---|---|---|
| **axe DevTools 4.12.1** | ✅ **Done — UI at WCAG 2.2 AA** | Automated scan (default + info-modal-open states), Interactive Elements, and Forms guided tests all run — every AI-flagged item was a false positive (two heading-markup suggestions on plain question labels, a disabled `battery-select` flagged as a keyboard-access failure when disabled-on-purpose is the whole point, and an already-correct `aria-checked="true"` misread as "not-checked") — §9.3. This audit's CDP run used **axe-core 4.13.0**, the library version embedded then; the two agree on substance |
| **WAVE Evaluation Tool 3.3.1.0** | ✅ **Done — hosted and extension, both states** | Hosted engine via `wave.webaim.org/report#/<url>`; extension pass confirmed **0 errors, 0 contrast errors** in both the default state and the info-modal-open state — §9.2 |
| **Zoom 400% and 320 × 256 px** | ✅ **Done** | `320×256 @ deviceScaleFactor 4`. **dsf 1 is a small screen, not a zoomed one** |
| **Operated via the keyboard** | ✅ **Done** | Driven with real `Input.dispatchKeyEvent` |
| **NVDA 2026.1.1.55980** | ❌ **Not done** | The one real screen-reader gap. **VoiceOver has been run — §9.1** — a deviation, not a substitute |
| **PAC 26.1.0.0** | ⚪ **Not applicable** | PAC checks PDF/UA-1 (ISO 14289-1). This app ships no PDFs (`*.pdf` count: 0). If brochures or price lists are added they are a separate surface under EN 301 549 clause 10 |

### NVDA vs VoiceOver — a deviation to record

VoiceOver is planned instead of NVDA. Record that as a **deviation**, not a substitution. The two
disagree exactly where this app is interesting: a `<select>` named via `aria-labelledby`, live-region
politeness, and controls built from a visually hidden `<input>` behind a styled `<label>`. NVDA is
normally tested with Firefox or Chrome, VoiceOver with Safari, so the browser differs too. Budget an
NVDA pass before formal sign-off.

---

# 2. Results

## axe-core — 0 violations

Bare `axe.run(document)` plus the default-disabled rules force-enabled (98 rules).
Viewports: 1440×900, 768×1024, 390×844, 320×640, and 320×256 @ dsf 4 (literal 400% zoom).

| Measure | Value |
|---|---|
| Rules executed | 98 |
| Violations | **0** at every viewport |
| `target-size` | **passes 15 nodes**, 0 violations, 0 incomplete |
| JS exceptions | **0** |
| Horizontal scroll | none, at any viewport |

## Accessibility tree

| Measure | Value |
|---|---|
| Nodes (1440×900) | 236 |
| Named interactive / graphic nodes | 35 |
| **Unnamed** | **0** |
| Focusable controls | 21 |

> **This is where the one real defect was found.** Before the fix, **7 `role=image` nodes were exposed unnamed** — invisible to axe, WAVE and Nu alike. See trap 10.

## WAVE 3.3.1.0 — real engine, public URL

| Errors | Contrast errors | Alerts | Features | Structure | ARIA |
|---|---|---|---|---|---|
| **0** | **0** | 0 | 12 | 3 | 44 |

The run was confirmed to have analysed the real page — control count and document title were read
back out of WAVE's iframe, not assumed.

## Nu HTML validator — 0 errors

SC 4.1.1 Parsing. Obsolete in WCAG 2.2 but normative under EN 301 549 (clause 9.4.1.1), so it is
checked and kept.

## Contrast — the `incomplete` bucket resolved by hand

axe punts whenever the background is a gradient, an image, or overlapped. Those are **not passes** —
a BITV tester must resolve every one. At 1440×900 there were **18**.

16 of the 18 are "background could not be determined due to a background gradient"; the other 2 are overlap. axe declined to compute a ratio in every case.

**Every one resolves to a pass.** Measured on composited pixels: viewport screenshot, cropped in PIL
with viewport-relative coordinates, foreground taken from the glyph band and background from the
dominant colour of a second capture with the text forced transparent. **Worst ratio anywhere:
14.50:1**, against a 4.5:1 requirement (every element is 16px or smaller, so the 3:1
large-text threshold never applies).

## Orientation and text spacing

**SC 1.3.4 Orientation — pass.** No `@media (orientation:)` rule exists anywhere in the app.

**SC 1.4.12 Text Spacing — pass.** With all four overrides applied (`line-height:1.5`,
`letter-spacing:0.12em`, `word-spacing:0.16em`, `p margin-bottom:2em`) at 1440 / 390 / 320:
**no newly clipped element, no control lost, no horizontal scroll.**

> **One nuance the detector accounts for.** The trim-select and battery-select floating labels
> ("Model: The new ID.3 Neo" / "Motor / Battery Capacity") do still visually truncate at some
> widths under these overrides. That is not counted as loss: each select's `<option>`s are wrapped
> in an `<optgroup>` whose `label` matches the truncated string exactly, so opening the select —
> its own normal operation — reveals the same text in full. A label whose content has no such
> match inside its own control (there is none here) would still fail this check.

> **Detector validated.** A canary that fits at the default line-height and overflows only at 1.5
> was injected and *was* detected. A first canary was already clipped before the override and
> therefore proved nothing — "no new clipping" is worthless unless you have watched the detector fire.

---

# 3. Validate the harness before trusting a zero

Every axe detector was re-run against the page with that defect injected:

| Injected defect | Rule | Fired |
|---|---|---|
| `<button>` with no accessible name | `button-name` | ✅ |
| `<img>` with no `alt` | `image-alt` | ✅ |
| Text at ~1.2:1 | `color-contrast` | ✅ |
| Two elements sharing an `id` | `duplicate-id` | ✅ |
| `<input>` with no label | `label` | ✅ |
| `<a href>` with no text | `link-name` | ✅ |
| Two adjacent 12×12 buttons | `target-size` | ✅ |

**`target-size` first appeared to miss, and that was the harness's fault.** The canaries had been
injected at `position:fixed; top:0; left:0` — underneath the sticky topbar, so axe treated them as
obscured — and only `violations` was read. In normal flow the rule fires on both nodes. Traps 1 and 2.

---

# 4. Ten traps that produce a confident false pass

**1 · Bare `axe.run()` is not every rule.** Nine rules are `enabled:false` by default in axe-core
4.13.0: **`target-size`** (SC 2.5.8), `aria-roledescription`, `color-contrast-enhanced`,
`duplicate-id`, `duplicate-id-active`, `identical-links-same-purpose`,
`landmark-complementary-is-top-level`, `meta-refresh-no-exceptions`, `audio-caption`. A stock run
reports "0 violations" **without ever having tested target size**. Pass
`{rules:{'target-size':{enabled:true}, …}}` and confirm the rule appears in `passes`. Check
`axe._audit.rules.filter(r => !r.enabled)` before believing a rule ran.

**2 · `violations` is not the whole result.** `incomplete` is the "needs review" bucket a BITV or
EN 301 549 tester must resolve by hand. It is also where an *obscured* element lands — so a
genuinely undersized target can be missing from `violations` because axe could not decide, not
because it passed.

**3 · `runOnly: {type:'tag'}` is not "all rules".** A tag filter silently skips every rule without
one of those tags.

**4 · 400% zoom is `deviceScaleFactor: 4`.** `320×256 @ dsf 1` is a small screen — a different test,
and not the one 1.4.4 asks for.

**5 · WAVE reads stale counts.** Poll until the icon counts go **stable**, not until
`wave.report.iconlist` merely exists. Reading early returns the *previous* page's numbers. Also
`iconlist.error` is `{description, count, items}`, not a map — summing it as a map yields a false
all-zero clean pass.

**6 · `Page.captureScreenshot` clip is document-absolute.** `getBoundingClientRect()` is
viewport-relative. Mixing them photographs a blank region: the element scores exactly `1.00:1` with
one unique colour. **A ratio of exactly 1.00 means the clip missed, not that contrast failed.**

**7 · Anti-aliasing is not the background, and neither is a border.** Taking the *worst* minority
colour in a text crop reports white-on-dark text as a failure — it has found the element's own
border. Crop to the **glyph band** (union of `Range.getClientRects()`), or the padding box for a
`<select>`, and use the **dominant** background.

**8 · A `<select>`'s options are not its label.** Comparing concatenated `<option>` text against the
accessible name manufactures SC 2.5.3 failures that do not exist. Compare the associated `<label>`.

**9 · `Network.setCacheDisabled` is a no-op unless `Network.enable` was called first.** Re-auditing
after an edit then silently re-measures the *old* page and reports the defect as unfixed. Enable the
domain, or append a cache-busting query string.

**10 · axe is blind to unnamed inline SVGs.** `svg-img-alt` and `role-img-alt` return
**`inapplicable`** for an `<svg>` with no `role`, and `image-alt` only inspects `<img>`. A page can
expose any number of unnamed graphics and still score 0 violations. **Read `role=image` nodes off
the AX tree and assert 0 unnamed** — that is how every unnamed-graphic failure in this suite was
found, and neither axe nor WAVE nor Nu saw any of them.

---

# 5. What automation will never close

**Real screen-reader/AI-guided output requires a human pass.** The accessibility tree confirms what
is *exposed*; NVDA, JAWS and VoiceOver differ in what they *announce*. VoiceOver, WAVE, and axe
DevTools have now all been run manually — §9. **NVDA remains the one outstanding instrument.**

**A name can be present, unique, and wrong.** Every automated check here passes on a control
labelled "button". Names must be read against what they describe.

**SC 2.5.3 Label in Name has no axe rule.** It was checked by hand — see `a11y-1-criteria.md`.

---

# 6. Manual testing — what to do

**All three manual runs (VoiceOver, WAVE, axe DevTools) have now been run — results in §9. NVDA
remains outstanding** — §1.

**The reusable procedure (Step 0, VoiceOver/WAVE/axe DevTools runs, sign-off checklist) lives
centrally** in `../audit-evidence/manual-testing-guide.md` — it's identical across all five sibling
apps, so it's maintained once there instead of copied per app. What follows here is only what's
specific to charging-time-simulator.

## App-specific Step 0

- **Live** — `https://yikcunchung.github.io/vw-charging-time-simulator-prototype/`.
- **Confirm on screen:** 6 info-modal triggers (`info-btn-location`, `info-btn-charger`,
  `info-btn-power`, `info-btn-soc`, `info-btn-temp`, `info-btn-time`), three button-radiogroup
  carousels (`location-group`, `charger-group`, `power-group`), a dual SOC slider, a temperature
  slider, and the trim/battery selects.
- **Audited Tab-stop count is 21**, but that assumes `battery-select` is enabled — with the default
  trim (Trend) now correctly disabling it, a fresh page load has **20** real Tab stops.

## App-specific notes for the central procedure's Run 2 (WAVE)

- Confirmed **0 errors, 0 contrast errors** in both the default state and the info-modal-open state
  — §9.2.

---

# 7. Verification checklist

Tick only what you actually observed against the central sign-off checklist in
`../audit-evidence/manual-testing-guide.md`. **An untested box is not a pass.**

---

# 8. Re-running the automated suite

Identical across all five sibling apps — see `../audit-evidence/manual-testing-guide.md` for the
CDP re-run script (serve locally, drive headless Chrome over the CDP protocol, run axe/AX-tree/
reflow/text-spacing/WAVE checks, diff local against live). Substitute this app's own port (`7810`)
and live URL where the script needs them.

**Automate the structural half in CI, but do not mistake it for the whole.** A structural-only suite
is exactly what scores clean on a build with a Level A naming failure.

---

# 9. Manual run results

## 9.1 Screen reader — VoiceOver / Safari, complete

VoiceOver Run 1 completed against the live build: full Tab-order walk (20 real stops, skip link
through the CTA button), all three carousel radiogroups (location/charger/power — correct
`role="radio"`/`aria-checked`, native "N of M" position info, silent on unchecked, consistent across
all three), the SOC dual slider (two distinct correctly-named thumbs), the temperature slider,
trim-select (a phrasing difference between Safari and Chrome for the native select was checked
against real production and confirmed to be normal cross-browser AT behavior, not a defect), the
final CTA button, and all 6 info-modals (open/read/close via all three methods, focus returns to the
trigger correctly, multi-paragraph bodies read via the same already-verified `renderBody()` pattern
as range-simulator). Rotor sweep: Form Controls and Landmarks (banner + main) both correct; Headings
shows only 1 (`<h1>`) — correct, since the on-page "questions" are styled `<span>`s, not real heading
elements, so no gap there either.

## 9.2 WAVE 3.3.1.0 — extension, complete

Extension pass against the live build reported **0 errors, 0 contrast errors** in both the default
state and the info-modal-open state.

## 9.3 axe DevTools 4.12.1 — automated scan + Interactive Elements + Forms, complete

All run against the live build. Findings, all false positives:
- **Automated scan (default state):** 2× "Headings must use heading markup" on `#q-power`/`#q-charger`
  — an AI (non-deterministic, 73-82% confidence) suggestion to turn plain question-label `<span>`s
  into headings. Inconsistent with itself (only 2 of 6 identical labels flagged) and contradicts the
  VoiceOver rotor sweep (§9.1), which confirmed a single-heading structure is correct for this
  single-continuous-form page.
- **Automated scan (info-modal-open state):** 1× "Function cannot be performed by keyboard alone" on
  `<select id="battery-select" disabled>`. Disabled-on-purpose (single-option trim) — a disabled
  control being unreachable by keyboard is the intended behavior, not a violation.
- **Interactive Elements guided test:** flagged `#location-group`'s "At home" button as
  states/properties "not-checked" with AI suggestion "checked" — verified directly against the live
  DOM: `role="radio" aria-checked="true"` is already exactly correct. The tool's own state read was
  simply wrong, not a real defect.
- **Forms guided test:** same false-positive family already established for range-simulator (see that
  app's §9.3).

## 9.4 Outstanding

**NVDA 2026.1.1.55980** — not yet run; see the deviation note in §1. Required before formal
BITV/EN 301 549 sign-off.
