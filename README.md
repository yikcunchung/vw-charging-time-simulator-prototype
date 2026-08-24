# VW Charging Time Simulator — accessibility reference build

A working, WCAG 2.2 AA reference build. **It is a behavioural specification, not source to copy.** The defects that shipped here were invisible to every automated tool — they were found only by reading the accessibility tree.

**Live:** https://yikcunchung.github.io/vw-charging-time-simulator-prototype/

---

## If you are the developer porting this — read this section only

You need **six things**. Everything else in this repo is evidence for auditors.

### 1. 7 inline SVGs must be aria-hidden or named

```
<!-- decorative -->
<svg aria-hidden="true" focusable="false">…</svg>
```

**Why:** The 7 decorative SVGs shipped unnamed. Chrome maps a bare <svg> to role=image with an empty name.

> axe returns inapplicable for an <svg> without a role. The AX-tree assertion in the Definition of Done is what proves it.

### 2. The dual SOC slider must be keyboard operable

```
thumb.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") { e.preventDefault(); moveThumb(thumb, +step); }
  if (e.key === "ArrowLeft")  { e.preventDefault(); moveThumb(thumb, -step); }
  // Home, End, PageUp, PageDown
});
```

**Why:** The primary control had zero keydown handlers. A keyboard user could not change the charge range at all.

> Each thumb needs its own handler. The range is the primary control; getting this wrong fails SC 2.1.1 on the most important element on the page.

### 3. Each slider thumb exposes role="slider" and keeps its ARIA values in sync

```
thumb.setAttribute("role", "slider");
thumb.setAttribute("aria-valuemin", min);
thumb.setAttribute("aria-valuemax", max);
thumb.setAttribute("aria-valuenow", current);
thumb.setAttribute("aria-valuetext", current + "%");
```

**Why:** The thumbs exposed no role and no value. A screen reader had no way to know the current position.

> aria-valuenow alone is not enough — aria-valuetext is what a screen reader actually reads.

### 4. The slider track is clickable as the alternative to dragging

```
track.addEventListener("click", e => {
  const pct = (e.clientX - trackRect.left) / trackRect.width;
  setValue(pct);
});
```

**Why:** The slider was drag-only. SC 2.5.7 requires a single-pointer non-drag alternative.

> The click handler is the alternative. No drag-cancel logic is needed for a click.

### 5. Animated digit reels must be aria-hidden; publish the real value as text

```
<div class="slot-reel" aria-hidden="true">…</div>
<p class="sr-only" aria-live="polite" aria-atomic="true"></p>
```

**Why:** The result was exposed as "0123456789:01234567890123456789 h" instead of "2:50 h".

> The live region carries the answer. Clear it after ~3s; never populate at load.

### 6. Every focusable control has a visible focus ring

```
.fl-select select:focus-visible { outline: 2px solid #C86C03; }
```

**Why:** 3 of 22 focus stops painted no indicator pixels. .fl-select select set outline:none with no replacement.

> Never remove outline without a named replacement.

---

## How you know you are done

```bash
npm install
npm test
```

**197 tests over 4 viewports.** They encode all six rules above plus the scanner checks. Green means you have it.

> **These six exist because every one of them was invisible to axe, WAVE and Nu.**

---

## Everything else in this repo

You do not need these to build.

| File | Who it is for |
|---|---|
| [`a11y-3-implementation.md`](a11y-3-implementation.md) | The full version of the six rules, plus 17 more standard for any VW app. |
| [`a11y-2-automated-testing.md`](a11y-2-automated-testing.md) | What the tools prove, the test procedure, and the recorded results. |
| [`a11y-1-criteria.md`](a11y-1-criteria.md) | All 56 WCAG A/AA criteria, one row each. For the auditor — look up, don't read through. |

## One known failure, not yours to fix

The `<select>` border is `rgb(161,164,172)` — **2.29:1** against the page where WCAG needs 3:1. Core component value — raise it upstream, never darken locally. (`#8b8e96` passes at 3.01:1.)
