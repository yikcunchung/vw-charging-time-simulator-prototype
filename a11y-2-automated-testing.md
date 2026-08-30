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
| **axe DevTools 4.131.2** | ◐ **Equivalent, not identical** | This audit ran **axe-core 4.13.0**, the library the extension embeds, over CDP with no `runOnly` filter. The extension's build number is not the engine version. One run through the 4.131.2 UI is still worth doing to satisfy the protocol literally; expect agreement |
| **WAVE Evaluation Tool 3.3.1.0** | ✅ **Done** | Real engine via `wave.webaim.org/report#/<url>` against the public URL |
| **Zoom 400% and 320 × 256 px** | ✅ **Done** | `320×256 @ deviceScaleFactor 4`. **dsf 1 is a small screen, not a zoomed one** |
| **Operated via the keyboard** | ✅ **Done** | Driven with real `Input.dispatchKeyEvent` |
| **NVDA 2026.1.1.55980** | ❌ **Not done** | The one real gap — §5 |
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

**Real screen-reader output has never been tested.** The accessibility tree confirms what is
*exposed*; NVDA, JAWS and VoiceOver differ in what they *announce*. No headless pass closes this.

**A name can be present, unique, and wrong.** Every automated check here passes on a control
labelled "button". Names must be read against what they describe.

**SC 2.5.3 Label in Name has no axe rule.** It was checked by hand — see `a11y-1-criteria.md`.

---

# 6. Re-running the suite

```
# 1. serve the build, then drive a real browser over CDP
python3 -m http.server 7810 --bind 127.0.0.1
chrome --headless=new --remote-debugging-port=9345 --disable-gpu
#    pick the debug target by matching type == "page" AND the expected URL.
#    NEVER take the first target from /json — it is often an extension page.

# 2. Network.enable BEFORE Network.setCacheDisabled, or add ?cb=<nonce>
# 3. axe.run(document, {rules:{'target-size':{enabled:true}, ...}})
#    read violations AND incomplete; assert target-size lands in passes
# 4. AX tree: Accessibility.getFullAXTree
#      -> assert 0 role=image nodes that are unnamed and not ignored
#      -> review every duplicate role+name pair
# 5. Real keys: Input.dispatchKeyEvent, assert document.activeElement after each
# 6. Reflow: Emulation.setDeviceMetricsOverride 320x256 @ dsf 4   (= 400% zoom)
# 7. Text spacing: inject the four overrides, diff the clipped-element set,
#    and prove a canary fires before believing the result
# 8. WAVE: wave.webaim.org/report#/<public-url>, poll until counts are STABLE
# 9. Diff local against live first — audit what is actually deployed
```

**Automate the structural half in CI, but do not mistake it for the whole.** A structural-only suite
is exactly what scores clean on a build with a Level A naming failure.
