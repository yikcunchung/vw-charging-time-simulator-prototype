// Behavioural half. Roughly half this app's accessibility lives in JavaScript that
// no scanner executes: syncGroupA11y() writes the entire selection model, and
// setPositions() writes the entire slider value contract. axe scores a clean 0 on
// a build where both have been deleted.
//
// Every key here goes through page.keyboard and every pointer action through
// page.mouse. element.click() would bypass the exact code paths that break —
// notably the keydown handler on the SOC thumbs, which did not exist at all until
// SC 2.1.1 was raised against it.
//
// Invariant ids (A1, B2, …) refer to a11y-3-implementation.md.

const { test, expect } = require('@playwright/test');
const {
  settle, showStickyBar, tabWalk, hitArea,
  RADIO_TOTAL, CHECKED_TOTAL, TAB_STOPS, MIN_SOC_GAP,
} = require('./settle');

const AUDITED_RING = '2px/solid/rgb(41, 48, 67)';

/** aria-valuenow / aria-valuetext / activeElement, read together. */
const socState = (page) => page.evaluate(() => ({
  from: +document.getElementById('soc-thumb-from').getAttribute('aria-valuenow'),
  to: +document.getElementById('soc-thumb-to').getAttribute('aria-valuenow'),
  fromText: document.getElementById('soc-thumb-from').getAttribute('aria-valuetext'),
  toText: document.getElementById('soc-thumb-to').getAttribute('aria-valuetext'),
  fromTip: document.getElementById('soc-tip-from').textContent,
  toTip: document.getElementById('soc-tip-to').textContent,
  active: document.activeElement.id || document.activeElement.tagName,
}));

/** The whole ARIA state of the three groups, plus what CSS thinks. */
const groupState = (page) => page.evaluate(() =>
  ['location-group', 'charger-group', 'power-group'].map((gid) => ({
    gid,
    rows: [...document.querySelectorAll(`#${gid} button`)].map((b) => ({
      name: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      role: b.getAttribute('role'),
      ariaChecked: b.getAttribute('aria-checked'),
      cssActive: b.classList.contains('active'),
      ariaDisabled: b.disabled,
      cssDisabled: b.classList.contains('disabled'),
      tabbable: !b.disabled,
    })),
  })));

/* ─── B2 / SC 4.1.2 · the ARIA state IS the state ─────────────────────────────
   Selection and availability lived only in CSS classes, so AT heard 13 identical
   enabled buttons. syncGroupA11y() derives role, aria-checked and the real
   disabled attribute from those classes on every recomputation. Nothing in axe
   notices when it stops doing so. */

test.describe('B2 — ARIA state matches reality', () => {
  test('every radio is a radio, and aria-checked mirrors the active class', async ({ page }) => {
    await settle(page);
    const groups = await groupState(page);
    let n = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        n++;
        expect(r.role, `${g.gid}/${r.name} role`).toBe('radio');
        expect(r.ariaChecked, `${g.gid}/${r.name} aria-checked vs .active`)
          .toBe(r.cssActive ? 'true' : 'false');
        expect(r.ariaDisabled, `${g.gid}/${r.name} disabled attribute vs .disabled class`)
          .toBe(r.cssDisabled);
      }
      expect(g.rows.filter((r) => r.ariaChecked === 'true').length,
        `exactly one checked radio in #${g.gid}`).toBe(1);
    }
    expect(n).toBe(RADIO_TOTAL);
  });

  test('it still matches after real keyboard activation across every location', async ({ page }) => {
    await settle(page);
    // Each location rewrites charger availability, which rewrites power
    // availability — three cascading writes, all of them ARIA.
    for (const label of ['Workplace', 'Public', 'Motorway', 'At home']) {
      const btn = page.locator('#location-group button', { hasText: label });
      await btn.focus();
      expect(await page.evaluate(() => document.activeElement.textContent.trim()))
        .toContain(label);
      await page.keyboard.press('Enter');
      await page.waitForFunction((l) => {
        const b = [...document.querySelectorAll('#location-group button')]
          .find((x) => x.textContent.trim() === l);
        return b && b.getAttribute('aria-checked') === 'true';
      }, label);

      for (const g of await groupState(page)) {
        for (const r of g.rows) {
          expect(r.ariaChecked, `after ${label}: ${g.gid}/${r.name} aria-checked`)
            .toBe(r.cssActive ? 'true' : 'false');
          expect(r.ariaDisabled, `after ${label}: ${g.gid}/${r.name} disabled`)
            .toBe(r.cssDisabled);
        }
        expect(g.rows.filter((r) => r.ariaChecked === 'true').length,
          `after ${label}: one checked in #${g.gid}`).toBe(1);
      }
      expect((await groupState(page)).length).toBe(CHECKED_TOTAL);
    }
  });

  test('Space activates a radio, not just Enter', async ({ page }) => {
    await settle(page);
    const pill = page.locator('#power-group button', { hasText: '22 kW' });
    await pill.focus();
    await page.keyboard.press('Space');
    await expect(pill).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => document.activeElement.textContent.trim()))
      .toBe('22 kW');
  });

  test('an unavailable radio is really disabled — out of the tab order and inert', async ({ page }) => {
    await settle(page);
    // The class alone left them focusable and announced as enabled while silently
    // swallowing Enter, which is the worst of both: reachable and useless.
    const before = await page.evaluate(() =>
      document.querySelector('#charger-group button[disabled]').getAttribute('aria-checked'));
    expect(before).toBe('false');
    await page.evaluate(() =>
      document.querySelector('#charger-group button[disabled]').focus());
    // A disabled button cannot take focus at all, so this is the real assertion:
    expect(await page.evaluate(() => document.activeElement.tagName),
      'a disabled radio must not be focusable').toBe('BODY');
    // Not `b.tabIndex >= 0`: a disabled <button> still reports tabIndex 0 while
    // being unfocusable, so that check passes on a broken build and fails on a
    // correct one. The only honest measurement is where real Tab presses land.
    const disabledNames = await page.evaluate(() =>
      [...document.querySelectorAll('#content [role="radio"][disabled]')]
        .map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
    expect(disabledNames.length, 'the default state disables 5 of the 13 radios').toBe(5);
    const visited = (await tabWalk(page)).map((s) => s.name);
    expect(visited).toHaveLength(TAB_STOPS);
    expect(visited.filter((n) => disabledNames.includes(n)),
      'Tab landed on a disabled radio').toEqual([]);
  });
});

/* ─── B3 / B6 · focus order and no trap ─────────────────────────────────────── */

test.describe('B3 — focus order and no keyboard trap', () => {
  test(`${TAB_STOPS} tab stops, in visual order, then out of the document and back`, async ({ page }) => {
    await settle(page);
    const stops = await tabWalk(page);
    expect(stops.map((s) => s.key)).toHaveLength(TAB_STOPS);
    expect(stops[0].key, 'the skip link must be the first tab stop').toBe('A.skip-link');

    // Focus order must equal DOM order. This is the precise form of SC 2.4.3 for
    // this app: the layout is flex/grid driven, so the way visual and focus order
    // could diverge is a control repositioned by CSS while staying put in the DOM.
    const dom = stops.map((s) => s.domIndex);
    expect(dom, `focus order does not follow DOM order: ${stops.map((s) => s.key)}`)
      .toEqual([...dom].sort((a, b) => a - b));

    // …and the two mechanisms that would let them diverge must be absent.
    expect(stops.filter((s) => s.tabIndexAttr && +s.tabIndexAttr > 0).map((s) => s.key),
      'a positive tabindex divorces focus order from DOM order').toEqual([]);
    const reordered = await page.evaluate(() =>
      [...document.querySelectorAll('#content *')].filter((el) => {
        const cs = getComputedStyle(el);
        return (cs.order && cs.order !== '0') || /reverse/.test(cs.flexDirection);
      }).map((el) => el.id || el.className));
    expect(reordered, 'CSS order / reversed flex direction moves content visually only')
      .toEqual([]);

    // Geometric sanity, in DOCUMENT coordinates. Within a row (genuine vertical
    // overlap) focus goes left to right; otherwise it goes down the page, with one
    // permitted upward jump where the DOM crosses into the right-hand column.
    let upwardJumps = 0;
    for (let i = 1; i < stops.length; i++) {
      const p = stops[i - 1], c = stops[i];
      const overlap = Math.min(p.bottom, c.bottom) - Math.max(p.top, c.top);
      const sameRow = overlap > Math.min(p.h, c.h) * 0.5;
      if (sameRow) {
        expect(c.left, `${p.key} -> ${c.key} moves backwards within a row`)
          .toBeGreaterThanOrEqual(p.left - 1);
      } else if (c.top < p.top - 1) {
        upwardJumps++;
        expect(c.key, `${p.key} -> ${c.key} jumps upwards`).toBe('trim-select');
      }
    }
    expect(upwardJumps, 'at most one column crossing').toBeLessThanOrEqual(1);

    // Focus left the document after the last stop (tabWalk stops there). One more
    // Tab must bring it back to the first stop rather than stranding it.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() =>
      String(document.activeElement.className).includes('skip-link')),
    'a Tab past the last stop must re-enter at the first, not strand focus').toBe(true);
  });

  test('the skip link moves focus into main content', async ({ page }) => {
    await settle(page);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() =>
      (document.activeElement.className || '').includes('skip-link'))).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement.id === 'content');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('content');
  });

  test('Shift+Tab retraces the same stops in reverse', async ({ page }) => {
    await settle(page);
    const forward = (await tabWalk(page)).map((s) => s.key);
    // Focus is out of the document; walk back in.
    const back = [];
    for (let i = 0; i < TAB_STOPS + 1; i++) {
      await page.keyboard.press('Shift+Tab');
      const k = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        return a.id || `${a.tagName}.${String(a.className).split(' ')[0]}`;
      });
      if (k === null) break;
      back.push(k);
    }
    expect(back).toEqual(forward.slice().reverse());
  });
});

/* ─── B4 / SC 2.4.7 · a visible focus indicator on every stop ────────────────── */

test.describe('B4 — focus visible', () => {
  test('every tab stop renders an indicator, and the four custom ones are the audited ring', async ({ page }) => {
    await settle(page);
    // Asserted on the COMPUTED value after a REAL Tab press, for two reasons that
    // are each a way this test could have been fake: browsers normalise #293043 to
    // rgb(41, 48, 67), so a stylesheet-text check passes while the ring is broken;
    // and :focus-visible does not match a programmatic .focus(), so a .focus()
    // check measures nothing at all.
    const stops = await tabWalk(page);
    expect(stops).toHaveLength(TAB_STOPS);

    // #temp-slider is opacity:0 — its own UA ring draws zero pixels, so the ring is
    // styled on the sibling .slider-thumb via `:focus-visible ~`. Measuring the
    // input itself would report a healthy ring over an invisible control.
    const viaSibling = new Set(['temp-slider']);
    const audited = new Set(['soc-thumb-from', 'soc-thumb-to', 'trim-select', 'battery-select']);

    for (const s of stops) {
      if (viaSibling.has(s.key)) {
        expect(s.opacity, '#temp-slider is deliberately transparent').toBe('0');
        expect(s.sibOutline, 'the ring must be drawn on the visible sibling thumb')
          .toBe(AUDITED_RING);
        continue;
      }
      const [w, style] = s.outline.split('/');
      expect(style, `${s.key} draws no outline style`).not.toBe('none');
      expect(parseFloat(w), `${s.key} outline width`).toBeGreaterThanOrEqual(1);
      if (audited.has(s.key)) {
        expect(s.outline, `${s.key} must draw the audited ring`).toBe(AUDITED_RING);
      }
    }
  });
});

/* ─── B5 / SC 2.4.11 · nothing focused hides under the sticky bar ────────────── */

test.describe('B5 — focus not obscured', () => {
  test('no focused control is covered by the sticky result bar', async ({ page }) => {
    await settle(page);
    const shown = await showStickyBar(page);
    test.skip(!shown, 'no sticky bar at this viewport (>=960px)');
    // Measured AFTER the scroll settles: a synchronous read right after .focus()
    // catches the smooth scroll mid-flight and reports a false failure. html has
    // scroll-padding-top:72px / scroll-padding-bottom:140px for exactly this.
    const covered = [];
    const keys = await page.evaluate(() =>
      [...document.querySelectorAll('#content button:not([disabled]), #content select, #content input')]
        .map((el, i) => i));
    for (const i of keys) {
      await page.evaluate((idx) => {
        const els = [...document.querySelectorAll(
          '#content button:not([disabled]), #content select, #content input')];
        els[idx].focus();
      }, i);
      await page.waitForTimeout(80);
      const bad = await page.evaluate((idx) => {
        const els = [...document.querySelectorAll(
          '#content button:not([disabled]), #content select, #content input')];
        const el = els[idx];
        const s = document.getElementById('sticky-result');
        if (!s.classList.contains('visible')) return null;
        const r = el.getBoundingClientRect();
        const sb = s.getBoundingClientRect();
        const overlap = !(r.bottom <= sb.top || r.top >= sb.bottom
          || r.right <= sb.left || r.left >= sb.right);
        return overlap ? `${el.id || el.className} ${Math.round(r.top)}-${Math.round(r.bottom)} under sticky ${Math.round(sb.top)}-${Math.round(sb.bottom)}` : null;
      }, i);
      if (bad) covered.push(bad);
    }
    expect(covered, 'focused controls hidden behind the sticky bar').toEqual([]);
  });

  test('the sticky bar aria-hidden tracks whether it is really shown', async ({ page }) => {
    await settle(page);
    const read = () => page.evaluate(() => {
      const s = document.getElementById('sticky-result');
      return {
        shown: s.classList.contains('visible'),
        aria: s.getAttribute('aria-hidden'),
        h: Math.round(s.getBoundingClientRect().height),
      };
    });
    const shown = await showStickyBar(page);
    test.skip(!shown, 'no sticky bar at this viewport (>=960px)');
    const open = await read();
    expect(open.shown).toBe(true);
    expect(open.aria, 'a shown bar must not be aria-hidden').toBe('false');
    expect(open.h, 'a shown bar has real height').toBeGreaterThan(0);

    // Not scrollTo(bottom): at 320x256 the page bottom leaves .result-section
    // scrolled off the TOP, so bottomInView is false and the bar stays shown —
    // a false failure. Scroll the thing the bar is a proxy for into view instead.
    await page.evaluate(() =>
      document.querySelector('.result-section').scrollIntoView({ block: 'end' }));
    await page.waitForFunction(() =>
      !document.getElementById('sticky-result').classList.contains('visible'),
    null, { timeout: 5_000 });
    const closed = await read();
    expect(closed.aria, 'a hidden bar must be aria-hidden').toBe('true');
  });
});

/* ─── B1 / B2 / C3 · the SOC slider contract, on all three paths ─────────────── */

test.describe('SOC slider — keyboard', () => {
  test('every documented key moves the value, and aria tracks each step', async ({ page }) => {
    await settle(page);
    await page.locator('#soc-thumb-from').scrollIntoViewIfNeeded();
    await page.locator('#soc-thumb-from').focus();
    expect((await socState(page)).active).toBe('soc-thumb-from');

    // Arrow +-1, PageUp/PageDown +-10, from the audited 20/80 start.
    const steps = [
      ['ArrowRight', 21], ['ArrowRight', 22], ['ArrowLeft', 21],
      ['ArrowUp', 22], ['ArrowDown', 21],
      ['PageUp', 31], ['PageDown', 21],
    ];
    for (const [key, expected] of steps) {
      await page.keyboard.press(key);
      const s = await socState(page);
      expect(s.from, `${key} from 	-> ${expected}`).toBe(expected);
      expect(s.fromText, 'aria-valuetext must track aria-valuenow')
        .toBe(`${expected} percent`);
      expect(s.fromTip, 'the visible tooltip must agree with the exposed value')
        .toBe(`${expected}%`);
      expect(s.active, `focus must stay on the thumb across ${key}`).toBe('soc-thumb-from');
      expect(s.to, `${key} must not move the other thumb`).toBe(80);
    }
  });

  test('End and Home clamp against the enforced minimum gap, not against 0-100', async ({ page }) => {
    await settle(page);
    await page.locator('#soc-thumb-from').scrollIntoViewIfNeeded();
    await page.locator('#soc-thumb-from').focus();
    await page.keyboard.press('End');
    let s = await socState(page);
    expect(s.from, `End on the lower thumb clamps to 80 - ${MIN_SOC_GAP}`)
      .toBe(80 - MIN_SOC_GAP);
    expect(s.to).toBe(80);
    await page.keyboard.press('Home');
    s = await socState(page);
    expect(s.from).toBe(0);
    expect(s.active).toBe('soc-thumb-from');
  });

  test('the upper thumb clamps against the lower one, from a clean load', async ({ page }) => {
    await settle(page);
    // From a clean load on purpose: driving the lower thumb first pushes the clamp
    // and makes ArrowLeft on the upper thumb look like a dead key. That is
    // documented in a11y-3 as a behaviour that looks like a bug and is not.
    await page.locator('#soc-thumb-to').scrollIntoViewIfNeeded();
    await page.locator('#soc-thumb-to').focus();
    await page.keyboard.press('ArrowRight');
    expect((await socState(page)).to).toBe(81);
    await page.keyboard.press('ArrowLeft');
    expect((await socState(page)).to).toBe(80);
    await page.keyboard.press('Home');
    const s = await socState(page);
    expect(s.to, `Home on the upper thumb clamps to lower + ${MIN_SOC_GAP}`)
      .toBe(s.from + MIN_SOC_GAP);
    await page.keyboard.press('End');
    expect((await socState(page)).to).toBe(100);
    expect((await socState(page)).active).toBe('soc-thumb-to');
  });

  test('both thumbs are separate tab stops', async ({ page }) => {
    await settle(page);
    const stops = (await tabWalk(page)).map((s) => s.key);
    expect(stops).toContain('soc-thumb-from');
    expect(stops).toContain('soc-thumb-to');
    expect(stops.indexOf('soc-thumb-to')).toBe(stops.indexOf('soc-thumb-from') + 1);
  });
});

test.describe('SOC slider — pointer paths (SC 2.5.7)', () => {
  test('a real click on the track moves the nearer thumb and writes the value', async ({ page }) => {
    await settle(page);
    await page.locator('#soc-track').scrollIntoViewIfNeeded();
    const box = await page.locator('#soc-track').boundingBox();
    await page.mouse.click(box.x + box.width * 0.10, box.y + box.height / 2);
    await page.waitForFunction(() =>
      document.getElementById('soc-thumb-from').getAttribute('aria-valuenow') !== '20');
    const s = await socState(page);
    expect(s.from, 'the nearer (lower) thumb moved').toBeLessThan(15);
    expect(s.to, 'the far thumb did not move').toBe(80);
    expect(s.fromText).toBe(`${s.from} percent`);
  });

  test('a real drag writes aria-valuenow, and starts from the enlarged hit area', async ({ page }) => {
    await settle(page);
    await page.locator('#soc-thumb-from').scrollIntoViewIfNeeded();
    const hit = await hitArea(page, 'soc-thumb-from');
    expect(hit.w).toBeGreaterThanOrEqual(24);
    const box = await page.locator('#soc-thumb-from').boundingBox();
    const track = await page.locator('#soc-track').boundingBox();
    // Press 11px BELOW the visual centre — inside the transparent ::before and
    // outside the 18x18 circle. A hit-test alone would not prove a drag starts here.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 11);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.45, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() =>
      document.getElementById('soc-thumb-from').getAttribute('aria-valuenow') !== '20');
    const s = await socState(page);
    expect(s.from, 'the drag path must write the value too').toBeGreaterThan(30);
    expect(s.fromText).toBe(`${s.from} percent`);
    expect(s.to - s.from, 'the gap is enforced on the drag path as well')
      .toBeGreaterThanOrEqual(MIN_SOC_GAP);
  });
});

/* ─── A6 / SC 4.1.3 · the result is announced, and is reachable at all ───────── */

test.describe('A6 — the live region is the only accessible copy of the result', () => {
  test('the region exists at load, polite, and already carries the first result', async ({ page }) => {
    await settle(page);
    const live = page.locator('#time-live');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    // Injecting a region and writing to it in the same tick is not announced, so
    // it must be in the served markup. It is: grep index.html for time-live.
    await expect(live).not.toHaveText('');
  });

  test('the .sr-only contract on the live region is intact', async ({ page }) => {
    // Added because mutation testing found this undetected: stripping the clip
    // from .sr-only broke nothing any other test could see.
    //
    // Two separate things are being held here, and both were real findings:
    //   - the clip itself. A6 spells the recipe out because a live region that is
    //     merely off-screen or merely 1x1-with-overflow behaves differently across
    //     readers, and one that is genuinely displayed changes the visual design.
    //   - an EXPLICIT colour. #time-live sits inside the navy .result-section and
    //     inherited #1b2236 on #1b2236 — 1:1. Nothing rendered, so no user was
    //     affected, but real WAVE does not treat .sr-only as hidden and reported a
    //     Contrast Error that a BITV tester then has to dismiss by hand.
    await settle(page);
    const s = await page.evaluate(() => {
      const el = document.getElementById('time-live');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const parentColor = getComputedStyle(el.parentElement).color;
      return { position: cs.position, clipPath: cs.clipPath, whiteSpace: cs.whiteSpace,
               w: Math.round(r.width), h: Math.round(r.height),
               color: cs.color, parentColor };
    });
    expect(s.position).toBe('absolute');
    expect(s.clipPath, 'the clip-path half of the .sr-only recipe').toBe('inset(50%)');
    expect(s.whiteSpace).toBe('nowrap');
    expect(s.w, 'clipped to 1px wide').toBeLessThanOrEqual(2);
    expect(s.h, 'clipped to 1px tall').toBeLessThanOrEqual(2);
    expect(s.color, 'the colour must be declared, not inherited from the navy panel')
      .not.toBe(s.parentColor);
  });

  test('the slot reels are hidden, so the live region is not a duplicate', async ({ page }) => {
    await settle(page);
    // #time-display's textContent is every digit of every column ("0123456789…"),
    // which is why it is aria-hidden. Un-hide it and a reader gets 30 digits.
    await expect(page.locator('#time-display')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#sticky-time-display')).toHaveAttribute('aria-hidden', 'true');
    const junk = await page.evaluate(() =>
      document.getElementById('time-display').textContent.replace(/\s/g, ''));
    expect(junk.length, 'the reels really do carry unreadable text')
      .toBeGreaterThan(10);
  });

  test('the announced value agrees with the digits actually rendered', async ({ page }) => {
    await settle(page);
    // Reconstruct the visible number from the reel transforms. If the live region
    // and the reels ever disagree, a screen-reader user is told a different figure
    // from the one on screen — and no scanner can see that.
    const read = () => page.evaluate(() => {
      const digits = [...document.querySelectorAll('#time-display .slot-digit .slot-reel')]
        .map((r) => {
          const m = /translateY\(-?([\d.]+)em\)/.exec(r.style.transform || '');
          return m ? String(Math.round(+m[1])) : '?';
        });
      return { digits: digits.join(''), live: document.getElementById('time-live').textContent };
    });
    const before = await read();
    const m = /(\d+) hours (\d+) minutes/.exec(before.live);
    expect(m, `unparseable live text: ${before.live}`).not.toBeNull();
    expect(before.digits, 'reels vs live region')
      .toBe(m[1] + String(m[2]).padStart(2, '0'));
  });

  for (const [label, drive] of [
    ['a location radio', async (page) => {
      await page.locator('#location-group button', { hasText: 'Motorway' }).focus();
      await page.keyboard.press('Enter');
    }],
    ['a power radio', async (page) => {
      // Must be driven in the DC state. On AC the car caps at 11 kW, so
      // effectivePower = min(22, 11) = 11 and 11 kW -> 22 kW genuinely produces
      // the same time. Asserting a change there would be asserting a bug.
      await page.locator('#location-group button', { hasText: 'Motorway' }).focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector(
        '#power-group button[aria-checked="true"]').textContent.trim() === '50 kW');
      await page.locator('#power-group button', { hasText: '150 kW' }).focus();
      await page.keyboard.press('Space');
    }],
    ['the SOC keyboard path', async (page) => {
      await page.locator('#soc-thumb-to').scrollIntoViewIfNeeded();
      await page.locator('#soc-thumb-to').focus();
      await page.keyboard.press('PageDown');
    }],
    ['the SOC track-click path', async (page) => {
      await page.locator('#soc-track').scrollIntoViewIfNeeded();
      const b = await page.locator('#soc-track').boundingBox();
      await page.mouse.click(b.x + b.width * 0.12, b.y + b.height / 2);
    }],
    ['the temperature slider', async (page) => {
      await page.locator('#temp-slider').focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
    }],
    ['the trim select', async (page) => {
      await page.selectOption('#trim-select', 'PoloGTI');
    }],
  ]) {
    test(`${label} writes a fresh announcement`, async ({ page }) => {
      await settle(page);
      // "Write to it from EVERY path that changes the result, not just the common
      // one" — the failure mode is one branch that forgets.
      const before = await page.locator('#time-live').textContent();
      expect(before).not.toBe('');
      await drive(page);
      await expect.poll(
        () => page.locator('#time-live').textContent(),
        { timeout: 4_000, message: `#time-live never changed from "${before}"` },
      ).not.toBe(before);
      await expect(page.locator('#time-live')).toHaveText(/Charging time \d+ hours \d+ minutes/);
    });
  }
});

/* ─── A3 / A4 · the select names must not drift with their values ────────────── */

test.describe('A3 — select names are stable', () => {
  test('both selects are named by their visible label, and the name never moves', async ({ page }) => {
    await settle(page);
    const names = () => page.evaluate(() => ['trim-select', 'battery-select'].map((id) => {
      const s = document.getElementById(id);
      return { id, lb: s.getAttribute('aria-labelledby'), name: window.__nameOf(s) };
    }));
    const before = await names();
    expect(before[0].lb).toBe('trim-fl-label');
    expect(before[1].lb).toBe('battery-fl-label');
    expect(before[1].name, 'the battery label must survive verbatim, "/" and all')
      .toBe('Motor / Battery Capacity');

    // #trim-fl-label is rewritten by JS on change (Neo <-> Polo), which is exactly
    // the shape of the bug where the accessible name moves with the value. It is
    // still a LABEL — it names the family — so what must hold is that the name
    // keeps tracking the visible text, and that #battery-select's does not move.
    await page.selectOption('#trim-select', 'PoloGTI');
    await page.waitForFunction(() =>
      document.getElementById('trim-fl-label').textContent === 'The new ID. Polo');
    const after = await names();
    expect(after[1].name, 'the battery name must not change when the value does')
      .toBe(before[1].name);
    const visible = await page.locator('#trim-fl-label').textContent();
    expect(after[0].name, 'the trim name must still be its visible label')
      .toBe(visible.trim());
  });

  test('both selects are reachable by real Tab and keep focus through a change', async ({ page }) => {
    await settle(page);
    // NOT an arrow-key test. Headless Chromium does not render the native select
    // popup, so page.keyboard.press('ArrowDown') on a focused <select> changes
    // nothing — verified: the value stayed "Trend" through ArrowDown,
    // Alt+ArrowDown and Escape at all four viewports. Asserting a value change
    // there would fail on a perfectly good control, and asserting that it does
    // NOT change would enshrine a harness limitation as an invariant.
    //
    // What is testable, and what actually broke here, is that these are native
    // <select>s (so the UA supplies the keyboard behaviour), that real Tab reaches
    // them, and that the option rebuild triggered by a change does not steal focus.
    const stops = (await tabWalk(page)).map((x) => x.key);
    expect(stops).toContain('trim-select');
    expect(stops).toContain('battery-select');
    for (const id of ['trim-select', 'battery-select']) {
      expect(await page.locator(`#${id}`).evaluate((el) => el.tagName), `#${id} must stay native`)
        .toBe('SELECT');
    }
    await page.locator('#trim-select').focus();
    // selectOption dispatches real input+change events, which is the path that
    // destroys and rebuilds #battery-select's options.
    await page.selectOption('#trim-select', 'Life');
    await page.waitForFunction(() =>
      document.querySelectorAll('#battery-select option').length === 3);
    expect(await page.evaluate(() => document.activeElement.id),
      'focus must survive the panel below re-rendering').toBe('trim-select');
  });
});

/* ─── Focus is never orphaned ────────────────────────────────────────────────── */

test.describe('focus is never lost to <body>', () => {
  test('across every state change this app can make, driven by real events', async ({ page }) => {
    await settle(page);
    const orphaned = [];
    const step = async (what, fn) => {
      await fn();
      await page.waitForTimeout(50);
      const a = await page.evaluate(() => ({
        tag: document.activeElement.tagName,
        id: document.activeElement.id,
        cls: String(document.activeElement.className),
      }));
      if (a.tag === 'BODY' || a.tag === 'HTML') orphaned.push(what);
      return a;
    };

    // Selecting a location disables up to two charger radios and four power
    // radios, via `b.disabled = true`. Setting `disabled` on the FOCUSED element
    // drops focus to <body> — so the activated control must be one that stays
    // enabled, on every path.
    for (const label of ['Motorway', 'Public', 'Workplace', 'At home']) {
      const a = await step(`Enter on ${label}`, async () => {
        await page.locator('#location-group button', { hasText: label }).focus();
        await page.keyboard.press('Enter');
      });
      if (a.tag === 'BUTTON') expect(a.cls).toContain('active');
    }
    for (const label of ['Household socket', 'Wallbox (AC)']) {
      const btn = page.locator('#charger-group button', { hasText: label });
      if (await btn.isEnabled()) {
        await step(`Enter on ${label}`, async () => {
          await btn.focus();
          await page.keyboard.press('Enter');
        });
      }
    }
    await step('SOC keyboard', async () => {
      await page.locator('#soc-thumb-from').scrollIntoViewIfNeeded();
      await page.locator('#soc-thumb-from').focus();
      await page.keyboard.press('ArrowRight');
    });
    await step('SOC track click', async () => {
      const b = await page.locator('#soc-track').boundingBox();
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2);
    });
    await step('temperature slider', async () => {
      await page.locator('#temp-slider').focus();
      await page.keyboard.press('ArrowRight');
    });
    await step('trim change (rebuilds #battery-select options)', async () => {
      await page.locator('#trim-select').focus();
      await page.selectOption('#trim-select', 'Life');
    });
    await step('battery change', async () => {
      await page.locator('#battery-select').focus();
      await page.keyboard.press('ArrowDown');
    });
    expect(orphaned, 'these steps dropped focus to <body>').toEqual([]);
  });
});
