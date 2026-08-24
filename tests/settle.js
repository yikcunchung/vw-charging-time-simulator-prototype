// Shared setup. Every helper here polls for a condition. There is not one fixed
// sleep in this file on purpose: two honest runs of a fixed sleep will disagree.
//
// ─── THE INIT GATE ───────────────────────────────────────────────────────────
// This app does NOT defer itself behind an IntersectionObserver the way the
// sibling Visualizer does — grep confirms there is no IntersectionObserver, no
// requestIdleCallback and no lazy init anywhere in index.html. So there is
// nothing to *trigger*.
//
// There is a great deal to *wait for*, which is the same trap wearing different
// clothes. `window.addEventListener('DOMContentLoaded', …)` is what builds the
// accessible version of this page, and none of what it writes is in the served
// markup:
//
//   1. updateTime() → syncGroupA11y() stamps role="radio", aria-checked and the
//      REAL `disabled` attribute onto all 13 group buttons. In the raw HTML they
//      are 13 plain <button>s carrying nothing but CSS classes — no roles, no
//      checked state, and the five "disabled" ones are fully focusable. Audit
//      before this and you measure a page whose entire selection model is
//      invisible to assistive technology, and score it clean, because axe has no
//      rule that says "these buttons ought to have been radios".
//   2. updateBatteryOptions() replaces #battery-select's innerHTML. The markup
//      ships 3 options; the default trim (Trend) has exactly 1.
//   3. updateTime() → buildTimeSlots() replaces #time-display with the slot
//      reels, and writes the first announcement into #time-live.
//   4. initSocSlider() attaches the keydown / drag / track-click handlers and
//      calls setPositions(), which is what puts aria-valuenow on the thumbs.
//
// So: poll for a real built-state condition and then ASSERT it, so the suite
// fails loudly rather than silently measuring the shell.

const { expect } = require('@playwright/test');

// Measured, not assumed: 4 location + 3 charger + 6 power = 13.
const RADIO_TOTAL = 13;
// One checked radio per group, three groups.
const CHECKED_TOTAL = 3;
// Tab stops in the default state, identical at 1440x900, 768x1024, 390x844 and
// 320x256@dsf4: skip link, 5 info buttons, 4 location, 2 enabled chargers,
// 2 enabled powers, 2 SOC thumbs, temp slider, 2 selects, CTA.
const TAB_STOPS = 20;
// From index.html. Enforced identically on the keyboard, drag and track-click paths.
const MIN_SOC_GAP = 24;
// The nine rules axe-core ships with `enabled: false`. target-size is SC 2.5.8:
// a stock run reports "0 violations" having never tested target size at all.
const DISABLED_BY_DEFAULT = [
  'target-size', 'aria-roledescription', 'color-contrast-enhanced',
  'duplicate-id', 'duplicate-id-active', 'identical-links-same-purpose',
  'landmark-complementary-is-top-level', 'meta-refresh-no-exceptions', 'audio-caption',
];

async function settle(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  // Guard against auditing the wrong document entirely.
  await expect(page.locator('#content')).toHaveCount(1);

  // Built, not merely present. All four conditions, polled together.
  await page.waitForFunction(
    (n) => document.querySelectorAll('#content [role="radio"]').length === n
        && document.querySelectorAll('#content [role="radio"][aria-checked]').length === n
        && document.querySelectorAll('#time-display .slot-digit').length > 0
        && document.querySelectorAll('#battery-select option').length > 0
        && document.getElementById('soc-thumb-from').hasAttribute('aria-valuenow'),
    RADIO_TOTAL,
    { timeout: 15_000 },
  );

  // …and assert it, so a broken gate is a red suite and not a quiet zero.
  const built = await page.evaluate(() => ({
    radios: document.querySelectorAll('#content [role="radio"]').length,
    checked: document.querySelectorAll('#content [role="radio"][aria-checked="true"]').length,
    reallyDisabled: document.querySelectorAll('#content [role="radio"][disabled]').length,
    slots: document.querySelectorAll('#time-display .slot-digit').length,
  }));
  expect(built.radios, 'syncGroupA11y() has not run: the group buttons are not radios')
    .toBe(RADIO_TOTAL);
  expect(built.checked, 'exactly one checked radio per group').toBe(CHECKED_TOTAL);
  // 5 in the default state (home/wallbox/11kW): DC, 2.3, 7.2, 50, 150 kW. The
  // count is state-dependent, so assert only that the real attribute is in use —
  // a class-only "disabled" leaves them focusable and announced as enabled.
  expect(built.reallyDisabled, 'the unavailable options carry a real disabled attribute')
    .toBeGreaterThan(0);
  expect(built.slots, 'buildTimeSlots() has not run').toBeGreaterThan(0);

  // Fonts and images must be resolved before any contrast assertion. Half-painted
  // text lets axe compute a background it otherwise could not determine, which
  // flips colour-contrast findings from `incomplete` (needs review — the honest
  // answer over a gradient) into hard `violations`. Conditions, not sleeps.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('#content img')];
    return imgs.length > 0 && imgs.every((i) => i.complete);
  }, null, { timeout: 15_000 });

  await installNameOf(page);
  return page.locator('#content');
}

/**
 * Ray-cast the real pointer target outward from an element's centre.
 *
 * SC 2.5.8 for the SOC thumbs is satisfied by a transparent 24x24 ::before, so
 * getBoundingClientRect() reports 18x18 and is the wrong measurement. This casts
 * elementFromPoint in 0.5px steps and returns the width and height of the region
 * that actually accepts the pointer.
 *
 * It scrolls the element into view FIRST, and that is not cosmetic:
 * elementFromPoint takes viewport coordinates and returns null outside the
 * viewport. At 320x256 the thumb sits at y≈897 on load, so an unscrolled
 * ray-cast returns 0x0 — a hard failure of a control that is perfectly fine.
 * At 390x844 an unscrolled cast returns 24.0 x 15.0 (down-ray 2.5px instead of
 * 11.5px) because the thumb sits near the bottom edge. Both are measurement
 * artifacts, and both look exactly like an SC 2.5.8 failure.
 */
async function hitArea(page, id) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await waitForStableBox(page, `#${id}`);
  return page.evaluate((tid) => {
    const t = document.getElementById(tid);
    const b = t.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const reach = (dx, dy) => {
      let d = 0;
      for (let k = 0.5; k <= 40; k += 0.5) {
        const el = document.elementFromPoint(cx + dx * k, cy + dy * k);
        if (!el || !(el === t || t.contains(el))) break;
        d = k;
      }
      return d;
    };
    const l = reach(-1, 0), r = reach(1, 0), u = reach(0, -1), dn = reach(0, 1);
    return { w: +(l + r).toFixed(2), h: +(u + dn).toFixed(2), l, r, u, dn };
  }, id);
}

/**
 * Wait until an element's box stops changing.
 *
 * Cards and pills have a CSS transition, and a control measured mid-transition
 * reports a smaller box than it ever renders at. Polls for two identical
 * consecutive samples rather than asserting a size, so it cannot mask a real
 * failure — a permanently undersized control samples stably at its bad size.
 */
async function waitForStableBox(page, selector, tries = 25) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const box = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    }, selector);
    if (box !== null && box === last) return box;
    last = box;
    await page.waitForTimeout(60);
  }
  return last;
}

/**
 * Bring the sticky result bar into its shown state, or report that this viewport
 * does not have one.
 *
 * It only exists below 960px, and checkVisibility() runs on scroll — so the
 * default-state audit never sees it. "All states, not just the default" is a
 * line in the Definition of Done, and this is the state it is talking about.
 */
async function showStickyBar(page) {
  if (await page.evaluate(() => window.innerWidth >= 960)) return false;
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForFunction(() =>
    document.getElementById('sticky-result').classList.contains('visible'), null,
  { timeout: 5_000 });
  return true;
}

/**
 * Walk real Tab presses and describe each stop. Never element.focus() — a
 * programmatic focus does not match :focus-visible, so a .focus() walk measures
 * nothing at all where focus indicators are concerned.
 *
 * Coordinates are DOCUMENT-absolute (rect + scroll offset), not viewport-relative.
 * Tabbing scrolls the page, so a viewport-relative `top` decreases as the walk
 * progresses and every geometric comparison across stops becomes nonsense — it
 * reported "jumps upwards" between two controls that are 44px apart down the page.
 *
 * `domIndex` is the element's position in document order, so focus order can be
 * compared against DOM order directly rather than inferred from geometry.
 */
async function tabWalk(page, max = 30) {
  await page.evaluate(() => {
    window.__domOrder = [...document.querySelectorAll('*')];
  });
  const stops = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const cs = getComputedStyle(a);
      const r = a.getBoundingClientRect();
      const sib = a.nextElementSibling ? getComputedStyle(a.nextElementSibling) : null;
      return {
        key: a.id || `${a.tagName}.${String(a.className).split(' ')[0]}`,
        name: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim(),
        domIndex: window.__domOrder.indexOf(a),
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
        left: r.left + window.scrollX,
        w: r.width, h: r.height,
        tabIndexAttr: a.getAttribute('tabindex'),
        outline: `${cs.outlineWidth}/${cs.outlineStyle}/${cs.outlineColor}`,
        sibOutline: sib ? `${sib.outlineWidth}/${sib.outlineStyle}/${sib.outlineColor}` : null,
        opacity: cs.opacity,
      };
    });
    if (s === null) break;      // focus left the document — the honest end of the cycle
    stops.push(s);
  }
  return stops;
}

/**
 * Install window.__nameOf in the page: the accessible name, computed in
 * precedence order (aria-label, aria-labelledby, an img with a non-empty alt,
 * then text content).
 *
 * Note what it deliberately does NOT do: it never reads <option> text. A
 * <select>'s options are not its label, and comparing concatenated option text
 * against the accessible name manufactures SC 2.5.3 failures that do not exist
 * — #trim-select would "fail" on the string "Trend Life Style Trend Life…".
 */
async function installNameOf(page) {
  await page.evaluate(() => {
    window.__nameOf = (el) => {
      const al = el.getAttribute('aria-label');
      if (al && al.trim()) return al.trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        return lb.split(/\s+/)
          .map((id) => (document.getElementById(id) || {}).textContent || '')
          .join(' ').replace(/\s+/g, ' ').trim();
      }
      if (el.tagName === 'SELECT') return '';   // never fall through to option text
      const img = el.querySelector && el.querySelector('img[alt]:not([alt=""])');
      if (img) return img.alt.trim();
      return (el.textContent || '').replace(/\s+/g, ' ').trim();
    };
  });
}

module.exports = {
  settle, hitArea, waitForStableBox, showStickyBar, tabWalk, installNameOf,
  RADIO_TOTAL, CHECKED_TOTAL, TAB_STOPS, MIN_SOC_GAP, DISABLED_BY_DEFAULT,
};
