# A11y 3 of 3 — What to build

**App:** VW Charging Time Simulator (`charging-time-simulator`). **Target:** production vw.com — AEM + React SPA Editor +
styled-components.
**Companions:** `a11y-1-criteria.md` (every criterion, pass/fail) ·
`a11y-2-automated-testing.md` (what the tools can and cannot prove).

**Scope:** the whole page. This app is standalone — there is no component-versus-page split.

> **Do not copy the reference build.** It is vanilla HTML/JS and it is a *behavioural
> specification*, not source to port. A meaningful share of the required behaviour lives in
> JavaScript — a port that copies the DOM and rewrites the logic will silently drop it.

---

## Start here — the defect that shipped, and that no tool caught

**7 decorative inline `<svg>`s were exposed to assistive technology as unnamed graphics**, and
**not one tool in the required toolchain saw them.** axe reported 0 violations at 98 rules. WAVE
reported 0 errors. Nu reported 0 errors. The accessibility tree was the only thing that caught it.

Chrome maps a bare `<svg>` to `role=image`, `name=""`, `ignored=false` — it is **not** decorative by
default. `svg-img-alt` and `role-img-alt` are both **inapplicable** to an `<svg>` with no `role`
attribute, and `image-alt` only inspects `<img>`, so the whole class is invisible to scanners.

Fixed with `aria-hidden="true"`. **SC 1.1.1 is the rule; the accessibility-tree assertion in the
Definition of Done is the check that keeps it fixed.** The pattern was already understood in this
codebase — every `.q-icon` SVG carried `aria-hidden="true"` already. These 7 were simply missed.

---
# 1. Semantics and naming

### SC 1.1.1 — Every inline `<svg>` is either named or hidden

**Level A**

Chrome maps a bare `<svg>` to `role=image`, `name=""`, `ignored=false`. It is therefore **exposed to
assistive technology as an unnamed graphic** — it is not "decorative by default".

```jsx
// ✗ exposed, unnamed — this is the defect that shipped
<svg width="24" height="24" viewBox="0 0 24 24"><path d="…"/></svg>

// ✓ decorative: remove it from the tree
<svg aria-hidden="true" focusable="false" width="24" height="24">…</svg>

// ✓ meaningful: give it a role AND a name
<svg role="img" aria-label="Volkswagen" width="32" height="32">…</svg>
```

> **No scanner catches this.** `svg-img-alt` and `role-img-alt` are **inapplicable** to an `<svg>`
> with no `role`; `image-alt` only inspects `<img>`. axe, WAVE and Nu all returned clean on pages
> carrying up to 16 of these. **The accessibility tree is the only check that works** — assert
> `0` nodes with `role=image` that are unnamed and not `ignored`.

**In React:** put it in the icon component itself, so it cannot be forgotten per call site.

```jsx
export const Icon = ({ label, ...p }) =>
  label ? <svg role="img" aria-label={label} {...p}/> 
        : <svg aria-hidden="true" focusable="false" {...p}/>;
```

---

### SC 4.1.2, 2.4.4 — An icon-only control needs a real name, not a hidden one

**Level A**

If a control's only content is an icon, the control carries `aria-label`; the icon inside it is
`aria-hidden`. Never name the icon and leave the button unnamed — the name must sit on the thing
that is focusable.

---

### SC 1.3.1, 4.1.2 — A `<select>` is named by its visible label

**Level A**

Use `aria-labelledby` pointing at the visible label element. Do not retype the label into an
`aria-label` — that is how the visible text and the name drift apart (see SC 2.5.3 above).

**Trap:** a `<select>`'s `<option>` text is **not** its label. An audit that compares concatenated
option text against the accessible name will manufacture failures that do not exist.

---

### SC 2.5.3 — The visible label sits inside the accessible name

**Level A**

If a control has a visible text label, the accessible name must **contain that text, contiguously**
— otherwise a speech-input user cannot activate it by saying what they see.

```jsx
// ✗ visible "Motor / Battery Capacity", name "Motor and battery capacity"
//   one character — "/" written as the word "and" — is a Level A failure
// ✗ visible "in … weather", name "in which weather"  (a word spliced between)
// ✓ append, never splice:  visible "of my ID.7", name "of my ID.7 variant"
```

**axe has no rule for this at all.** It must be checked by hand, against the accessibility tree.

---

### SC 1.3.1, 2.4.1, 2.4.6 — One `h1`, no skipped levels, real landmarks

**Level A / AA**

One `h1`; heading levels descend without gaps; `role="banner"` on the topbar and a `<main>`; and a
skip link as the **first** tab stop, pointing at an id that exists.

---

### SC 4.1.3 — A visually hidden polite live region, updated on every path

**Level AA**

```html
<p id="time-live" class="sr-only" aria-live="polite"></p>
```

The region must already be in the DOM at load — injecting it and writing to it in the same tick is
not announced. Write to it from **every** path that changes the result, not just the common one.

> **Keep the `.sr-only` clip.** `position:absolute; width:1px; height:1px; clip:rect(0,0,0,0);
> clip-path:inset(50%); white-space:nowrap`. Set an explicit `color` on it — a clipped region that
> inherits a matching colour reads as a 1:1 contrast error to WAVE even though nothing renders.

---

### SC 3.1.1, 3.1.2 — `lang` on the document, and on any passage that differs

**Level A / AA**

`<html lang="en">`. If a CMS field can hold a string in another language, the component rendering it
must be able to emit `lang` alongside it.

---
# 2. Keyboard and focus

### SC 2.1.1 — Everything the mouse can do, the keyboard can do

**Level A**

Every custom control — anything that is not a native `<button>`, `<a>`, `<select>` or `<input>` —
needs an explicit key handler. Assert the **state change**, not just that the handler fired.

---

### SC 4.1.2 — A custom widget exposes role, name **and** value, on every path

**Level A**

A slider built from a `<div>` needs the full contract, and the value must be written from every
path that can change it — keyboard, drag, and click-on-track:

```html
<div role="slider" tabindex="0"
     aria-label="Current charge level"
     aria-valuemin="0" aria-valuemax="100"
     aria-valuenow="20" aria-valuetext="20 percent">
```

**Derive the ARIA from state, never set it imperatively in one branch only.** In React:
`aria-valuenow={value}`, so desync is impossible.

> **A CDP caveat, not a defect:** `Accessibility.getPartialAXTree` reports `valuetext: ""` for
> *every* ARIA widget, even when `aria-valuetext` is set. Whether it reaches the platform API is not
> measurable over CDP — it needs a real screen reader. Do not read that empty string as a failure.

---

### SC 2.4.3 — Focus order matches visual order

**Level A**

Drive real `Tab` and assert `document.activeElement` at each stop. Responsive layouts are where this
breaks: a control that moves visually at a breakpoint must move in the DOM too, not be repositioned
with CSS `order`.

---

### SC 2.4.7 — A visible focus indicator on every control, styled consistently

**Level AA**

`outline: 2px solid var(--navy-dark); outline-offset: 3px`. Apply it to **every** focusable thing
including skip links and inline links — a control that falls back to the browser's default ring
still passes, but it is a visible inconsistency and the first thing an auditor notices.

**Never remove an outline without replacing it.** If the real control is a visually hidden
`<input>` behind a styled surrogate, style the ring on the surrogate:

```css
.vw-switch input:focus-visible ~ .vw-switch-track { outline: 2px solid #293043; outline-offset: 3px; }
```

---

### SC 2.4.11 — A focused control is never left under sticky chrome

**Level AA**

Use `scroll-padding-top` / `scroll-padding-bottom` on the scroll container equal to the height of
the fixed bars, or a `focusin` handler that scrolls the control clear. Verify by measuring the
focused control's rect against the viewport **after the scroll settles** — a synchronous read right
after `.focus()` catches a smooth scroll mid-flight and reports a false failure.

---

### SC 2.1.2 — No keyboard trap

**Level A**

Tab must cycle through every stop and out the other side. Any disclosure or panel must be escapable.

---

### SC 2.1.1 — A scrollable region is keyboard reachable

**Level A** (ACT rule `0ssw9k`)

A region that scrolls must be focusable so a keyboard user can scroll it: `tabindex="0"` plus
`role="group"` and an accessible name.

> **Two rules disagree here, by construction.** axe's experimental `focus-order-semantics` flags
> `tabindex="0"` on a `role="group"` as a defect. It is tagged `best-practice` + `experimental`,
> carries **no `wcag2*` tag**, and maps to no WCAG criterion. **Keep the `tabindex`** — 2.1.1 wins.

---
# 3. Pointer and targets

### SC 2.5.8 — Every target is at least 24×24 CSS px

**Level AA**

> **axe will not catch this for you.** `target-size` is `enabled: false` by default in axe-core
> 4.13.0, so a stock run reports "0 violations" without testing target size at all. Turn it on:
> `axe.run(el, { rules: { 'target-size': { enabled: true } } })`.

A visually small control can still be a compliant target if a transparent `::before` enlarges the
**hit area** — and that is a legitimate technique, not a loophole. WCAG defines a target as "the
region of the display that will accept a pointer action":

```css
.thumb { width: 18px; height: 18px; }
.thumb::before {                    /* the real 24x24 target */
  content: ""; position: absolute; inset: 50% auto auto 50%;
  width: 24px; height: 24px; transform: translate(-50%, -50%);
  pointer-events: auto;             /* and the parent must not clip it */
}
```

**Prove it, do not assume it.** Ray-cast `document.elementFromPoint` outward from the centre in
0.5px steps and confirm the hit region really is ≥24×24 — and that a real drag *starts* from the
enlarged area, not just a hit-test.

**If a target genuinely is undersized**, the spacing exception is the fallback, and the test depends
on the neighbour:

- against a **full-size** neighbour: a 24px-diameter circle centred on the undersized target must
  not intersect the neighbour's **box** — i.e. **≥12px from centre to box edge**
- against **another undersized** target: **≥24px centre-to-centre**

Using centre-to-centre against a full-size neighbour is the wrong test and gives a falsely
comfortable number.

---

### SC 2.5.2 — Activation happens on the up-event

**Level A**

Native `<button>` gets this free. A custom control must fire on `pointerup`/`click`, never
`pointerdown`, so a user can drag off to abort.

---

### SC 2.5.7 — Dragging always has a non-drag alternative

**Level AA**

A slider thumb that can be dragged must also respond to arrow keys, and ideally to a click on the
track. Arrow keys alone satisfy the criterion.

---
# 4. Visual

### SC 1.4.3 — Text contrast ≥4.5:1, measured on composited pixels

**Level AA**

Over a gradient, an image, or an overlapping element, axe returns **`incomplete`**, not a pass.
Those must be resolved by hand, on real pixels.

**How to measure without producing a false result:**

- `Page.captureScreenshot` `clip` is **document-absolute**; `getBoundingClientRect()` is
  **viewport-relative**. Screenshot the viewport and crop in PIL with viewport-relative coordinates.
  A ratio of exactly `1.00:1` with one unique colour means your crop missed.
- Crop to the **glyph band** — the union of `Range.getClientRects()` over the text nodes — so the
  element's own border is excluded. A 1px border can occupy enough of a padding-box crop to be
  picked as "the background" and produce a false failure.
- Take the **dominant** background, not the worst minority colour. At 12px the glyph core is under
  1% of the crop, so the most *frequent* off-background pixel is an anti-aliasing mid-tone.

---

### SC 1.4.11 — Non-text contrast ≥3:1

**Level AA**

Control boundaries, focus rings and selected-state indicators.

---

### SC 1.4.10, 1.4.4 — No content loss at 320×256 CSS px

**Level AA**

**400% zoom is `setDeviceMetricsOverride{ width:320, height:256, deviceScaleFactor:4 }`.**
`dsf 1` is a small screen — a different test.

Content may scroll in **one** direction only. A horizontal carousel is **not** an instance of the
SC's normative exception — that exception is narrower and covers only content which *requires*
two-dimensional layout for its usage or meaning (the SC's own examples: maps, diagrams, data
tables, code indentation). A card selector has no such requirement, so citing "the exception" for
it is the wrong clause. The real route to compliance is **G225** (sufficient technique): keep each
carousel card under 320 CSS px wide, so reading any single card never itself needs horizontal
scroll — the carousel's own scroll is only used to move between cards. Page-level horizontal
scroll is not permitted under either route.

Sufficient techniques: **G225** (bounded ≤320px carousel panels), **C31** (flexbox), **C32** (media
queries + grid), **C34** (un-fix sticky).

> **A bounded carousel (`overflow-x:auto`) clips its own children's outward-drawn focus rings at
> its edge, unless you give it room.** Any content painted outside an element's box — an
> `outline` at the default `outline-offset:0`, same as a `box-shadow` — gets clipped by an
> ancestor's `overflow` the same way `overflow:hidden` would clip it, including the container's
> own scroll edge. Give the carousel `padding` equal to the ring width, and match it with
> `scroll-padding-inline` so `scrollIntoView()` respects the same margin — otherwise a card
> scrolled flush to the edge still has its ring clipped even though the card itself is fully
> visible. Also add a `focusin` handler that calls `scrollIntoView({block:'nearest',
> inline:'nearest'})` on the focused child — native browsers do not reliably auto-scroll a
> focused element inside a nested `overflow-x:auto` container on `Tab` alone.

---

### SC 1.4.12 — The text-spacing overrides must not clip anything

**Level AA**

```css
* { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important; }
p { margin-bottom:2em !important; }
```

Nothing may newly clip, no control may be lost, no horizontal scroll may appear.

> **Build target sizes out of `padding`, not `line-height`.** This criterion invites the user to
> override `line-height`, so a 24px target built on line-height collapses under the very override
> you are being tested against. Padding is unaffected.

> **Fix the width first, not just the recovery path.** A `<select>`'s floating label (e.g. "Motor /
> Battery Capacity", or a value like "The new ID.3 Neo") can run out of room under these overrides
> if two selects are forced to share a row. `.select-group` stacks them vertically, unconditionally
> (no breakpoint gating — this page's own grid makes available width non-monotonic across
> viewports, so no single breakpoint threshold holds), which gives each label the full row width
> everywhere and eliminates the truncation outright — verified zero clipping at every tested width.
>
> As a secondary, belt-and-suspenders safeguard (for if content ever grows past the stacked width),
> wrap that select's `<option>`s in an `<optgroup label="…">` carrying the identical text, so opening
> the select (its own normal operation) reveals it in full:
> ```html
> <select aria-labelledby="battery-fl-label">
>   <optgroup label="Motor / Battery Capacity">
>     <option value="50">125 kW (170 PS) · 50 kWh</option>
>   </optgroup>
> </select>
> ```
> Do this in **every** place that rebuilds the select's `innerHTML` (a trim-change handler, etc.) —
> a static markup fix alone will be silently undone the moment the options are rebuilt in JS. Treat
> the optgroup as a safety net, not the primary fix: a label with no matching optgroup, and no
> layout fix either, has no escape — it must actually fit, or the criterion is a real failure.

---

### SC 1.3.4 — Never lock orientation

**Level AA**

No `@media (orientation:)` rule that hides or restricts content.

---
# 5. React, styled-components and AEM — the ones that bite

1. **`styled-components` drops unknown props.** `aria-*` and `role` pass through on DOM elements but
   **not** through a custom component unless you forward them. Spread `{...rest}` onto the DOM node.
2. **AEM `EditableComponent` injects a wrapper `<div>`.** Anything relying on a parent-child ARIA
   relationship (a `radiogroup` owning its radios, `aria-labelledby` across a boundary) breaks when
   each child becomes separately authorable. Keep such a group as **one** component, or wire
   `aria-owns` explicitly.
3. **Conditional rendering destroys focus.** Unmounting a panel while focus is inside drops focus to
   `<body>`. Return focus to the opener explicitly.
4. **`useId()` for every label association** — hand-written ids collide once a component is placed
   twice on a page, and `duplicate-id-aria` is a real failure.
5. **A CSS-in-JS `:focus-visible` must survive minification.** Verify the ring in the built bundle,
   not just in dev.
6. **Icons: name or hide at the component boundary** (SC 1.1.1). A per-call-site decision will be missed.
7. **Live regions must mount before they are written to.** Render the region unconditionally; write
   into it on update.

---

# 6. Definition of Done

- [ ] **axe with `target-size` explicitly enabled** — it is off by default, so without that line CI
      passes SC 2.5.8 without ever testing it
- [ ] **Accessibility tree asserted** — `0` unnamed `role=image` nodes, `0` unnamed interactive
      nodes, every duplicate role+name pair reviewed
- [ ] **Real keyboard run** — Tab / Shift+Tab / Enter / Space / Arrows / Escape, asserting
      `document.activeElement` and the resulting state at each step
- [ ] **All states, not just the default** — expand every disclosure, open every panel, select every
      option, and re-run the checks after each
- [ ] **Reflow at 320×256 @ dsf 4** — nothing lost, no page-level horizontal scroll
- [ ] **Contrast on composited pixels** wherever text sits over a gradient or imagery
- [ ] **SC 2.5.3 by hand** — visible label contained in the accessible name. No tool does this
- [ ] **Names are correct**, not merely present and unique — read each against what it describes
- [ ] **Screen reader** — one pass with NVDA or VoiceOver. Not optional
- [ ] **The suite fails when it should** — inject the defect and confirm the detector fires

---

# 7. App-specific notes

**The two-thumb SOC slider is the most interesting control in the suite, and it is built
correctly.** No native `<input type=range>` underneath — the ARIA contract *is* the control:

```html
<div class="soc-thumb" id="soc-thumb-from" role="slider" tabindex="0"
     aria-label="Current charge level"
     aria-valuemin="0" aria-valuemax="100"
     aria-valuenow="20" aria-valuetext="20 percent"></div>
```

**What makes it work, and what to preserve in the port:**

1. **`aria-valuenow` is written from all three update paths** — the keydown handler, the drag
   `mousemove`/`touchmove`, and the click-on-track. A single `setPositions()` owns it. In React,
   derive it: `aria-valuenow={value}`, so a path cannot forget.
2. **Keyboard is complete**: Arrow ±1, PageUp/PageDown ±10, Home and End — each correctly clamped
   against the enforced 24-point minimum gap between the thumbs. Both thumbs are separate Tab stops.
3. **SC 2.5.8 via `::before`**, exactly as in cost-simulator: the visual circle is 18×18, the real
   hit area is **24.0 × 24.0**. Verified twice — by ray-casting, and by *real drags* started at
   centre ±11px, which moved the value. A hit-test alone would not have proved the drag works.
4. **Worst-case separation is 55.38px centre-to-centre** at the narrowest viewport, because
   `MIN_SOC_GAP = 24` percentage points is enforced on all three paths. The thumbs cannot be driven
   close enough to fail the spacing test.

> **A CDP artifact, not a defect.** `Accessibility.getPartialAXTree` reports `valuetext: ""` for
> these thumbs even though `aria-valuetext="20 percent"` is set — but it does so for **every** ARIA
> widget, confirmed against a control page. Whether `aria-valuetext` reaches the platform API needs
> a real screen reader. Do not read that empty string as a failure, and do not "fix" it.

**One clamping behaviour that looks like a bug and is not.** Driving `#soc-thumb-to` with ArrowLeft
can leave it unchanged — because the *other* thumb has already been pushed up to the minimum gap, so
80 is the clamped floor. Re-test from a clean load before reporting it.
