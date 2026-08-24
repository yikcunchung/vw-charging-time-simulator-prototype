// The scanner half. axe runs INSIDE Playwright rather than under jest-axe: jsdom
// has no layout, so target-size, reflow and the 24x24 ::before hit area of the SOC
// thumbs cannot be evaluated there at all — jest-axe would report a clean pass on
// three criteria it never tested.
//
// Read the a11y-2 traps section before changing anything here. In particular:
//   - `violations` is not the whole result. `incomplete` is where an obscured or
//     over-a-gradient element lands, so a genuinely undersized target can be
//     missing from `violations` because axe could not decide, not because it passed.
//   - axe is blind to unnamed inline SVGs. That is the defect that shipped in this
//     app, and the accessibility tree is the only thing that sees it.

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const {
  settle, hitArea, waitForStableBox, showStickyBar,
  RADIO_TOTAL, DISABLED_BY_DEFAULT,
} = require('./settle');

function axeRun(page) {
  return new AxeBuilder({ page })
    .include('#content')
    .options({ rules: Object.fromEntries(DISABLED_BY_DEFAULT.map((r) => [r, { enabled: true }])) })
    .analyze();
}

/**
 * Split violations into the ones this app is audited against and the AAA-only ones.
 *
 * Forcing all nine default-disabled rules on turns `color-contrast-enhanced` on
 * too, and that is SC 1.4.6 — Level AAA, 7:1. The claim on this app is AA. Two
 * nodes fail it at every viewport (`.soc-recommended-label` and `.disclaimer-copy`,
 * both #606574 measured at 5.33:1) and both comfortably PASS the AA rule at 4.5:1.
 * Folding them into the same number would either force a permanently red suite or,
 * far worse, invite someone to "fix" it by lowering the bar for every rule.
 */
function partition(violations) {
  const aaaOnly = (v) => v.tags.includes('wcag2aaa') && !v.tags.includes('wcag2aa')
    && !v.tags.includes('wcag2a') && !v.tags.includes('wcag21aa') && !v.tags.includes('wcag22aa');
  return {
    audited: violations.filter((v) => !aaaOnly(v)),
    aaa: violations.filter(aaaOnly),
  };
}

const fmt = (vs) => vs.map((v) => `${v.id} (${v.tags.join(',')}): ${v.nodes.length} node(s) — ${v.nodes.map((n) => n.target).join(' | ')}`);

test.describe('axe', () => {
  test('0 violations at or below AA, default state', async ({ page }) => {
    await settle(page);
    const { audited } = partition((await axeRun(page)).violations);
    expect(fmt(audited)).toEqual([]);
  });

  test('target-size actually ran — the silent skip is the trap', async ({ page }) => {
    await settle(page);
    const r = await axeRun(page);
    const ran = [...r.passes, ...r.violations, ...r.incomplete].map((x) => x.id);
    expect(ran, 'target-size must appear in the results, or SC 2.5.8 went untested')
      .toContain('target-size');
    // And prove the tag filter trap is not in play either: a runOnly tag filter
    // silently drops every rule without one of those tags.
    expect(ran.length, 'a plausible number of rules ran, not a filtered subset')
      .toBeGreaterThan(30);
  });

  test('the AAA contrast bucket has not grown beyond the two audited nodes', async ({ page }) => {
    await settle(page);
    const { aaa } = partition((await axeRun(page)).violations);
    const nodes = aaa.flatMap((v) => v.nodes.map((n) => String(n.target)));
    // Not "ignore AAA" — pinned. New AAA contrast debt shows up as a failure here.
    expect(nodes.sort()).toEqual(['.disclaimer-copy', '.soc-recommended-label']);
  });

  test('the needs-review bucket contains nothing but contrast', async ({ page }) => {
    await settle(page);
    const r = await axeRun(page);
    // 18 color-contrast nodes were resolved by hand on composited pixels (worst
    // 14.50:1) because of a full-height page gradient — see a11y-1 SC 1.4.3. Any
    // OTHER rule landing in `incomplete` is a new unresolved finding, and quietly
    // reading only `violations` is how it would be missed.
    const other = r.incomplete
      .filter((v) => !['color-contrast', 'color-contrast-enhanced'].includes(v.id));
    expect(fmt(other), 'new incomplete findings need resolving by hand').toEqual([]);
  });

  test('0 violations with the DC/motorway state selected', async ({ page }) => {
    await settle(page);
    // "All states, not just the default." Motorway disables both AC chargers and
    // enables DC, which flips the disabled attribute on 5 of the 13 radios and
    // changes which are in the tab order.
    await page.locator('#location-group button', { hasText: 'Motorway' }).focus();
    await page.keyboard.press('Enter');
    await page.locator('#power-group button', { hasText: '150 kW' }).focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#power-group button[aria-checked="true"]')
      .textContent.trim() === '150 kW');
    const { audited } = partition((await axeRun(page)).violations);
    expect(fmt(audited)).toEqual([]);
  });

  test('0 violations with the sticky result bar shown', async ({ page }) => {
    await settle(page);
    const shown = await showStickyBar(page);
    test.skip(!shown, 'no sticky bar at this viewport (>=960px)');
    // While shown it is aria-hidden="false" and 105-123px tall, so it adds AX
    // nodes and its own text to the contrast pass. The default-state run never
    // sees it, because checkVisibility() only runs on scroll.
    const { audited } = partition((await axeRun(page)).violations);
    expect(fmt(audited)).toEqual([]);
  });

  test('0 violations after switching to a different model family', async ({ page }) => {
    await settle(page);
    await page.selectOption('#trim-select', 'PoloGTI');
    await page.waitForFunction(() =>
      document.getElementById('car-img').getAttribute('src').includes('idpolo-gti'));
    await page.waitForFunction(() => document.getElementById('car-img').complete);
    const { audited } = partition((await axeRun(page)).violations);
    expect(fmt(audited)).toEqual([]);
  });
});

test.describe('accessibility tree — what axe cannot see', () => {
  test('0 exposed role=image nodes are unnamed', async ({ page }) => {
    await settle(page);
    // THE defect that shipped in this app: 7 decorative inline <svg>s exposed as
    // unnamed graphics, and axe (98 rules), WAVE and Nu all reported clean.
    // svg-img-alt and role-img-alt are INAPPLICABLE to an <svg> with no role, and
    // image-alt only inspects <img>. The AX tree is the only check that works.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const images = nodes.filter((n) => n.role && n.role.value === 'image');
    const unnamed = images
      .filter((n) => !n.ignored)
      .filter((n) => !(n.name && n.name.value && n.name.value.trim()))
      .map((n) => (n.name ? n.name.value : '(no name property)'));
    expect(unnamed, `${images.length} role=image nodes in the tree`).toEqual([]);
  });

  test('0 exposed interactive nodes are unnamed', async ({ page }) => {
    await settle(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const roles = ['button', 'slider', 'combobox', 'radio', 'link', 'checkbox', 'menuitem'];
    const interactive = nodes
      .filter((n) => !n.ignored && n.role && roles.includes(n.role.value));
    const unnamed = interactive
      .filter((n) => !(n.name && n.name.value && n.name.value.trim()))
      .map((n) => n.role.value);
    // 25 in the default state: 13 radios, 5 info buttons, 2 SOC sliders, 1 temp
    // slider, 2 comboboxes, the CTA and the skip link.
    expect(interactive.length, 'the tree is populated').toBeGreaterThanOrEqual(20);
    expect(unnamed).toEqual([]);
  });
});

test.describe('names', () => {
  test('every radio has a unique, non-empty name within its group', async ({ page }) => {
    await settle(page);
    const groups = await page.evaluate(() =>
      ['location-group', 'charger-group', 'power-group'].map((gid) => ({
        gid,
        names: [...document.querySelectorAll(`#${gid} [role="radio"]`)].map((b) => window.__nameOf(b)),
      })));
    let total = 0;
    for (const g of groups) {
      total += g.names.length;
      expect(g.names.filter((n) => n === ''), `unnamed radios in #${g.gid}`).toEqual([]);
      expect(new Set(g.names).size, `duplicate names in #${g.gid}: ${JSON.stringify(g.names)}`)
        .toBe(g.names.length);
    }
    expect(total).toBe(RADIO_TOTAL);
  });

  test('SC 2.5.3 — every visible label is contained in the accessible name', async ({ page }) => {
    await settle(page);
    // axe has NO rule for this. It broke here before as "Motor / Battery Capacity"
    // named "Motor and battery capacity" — one character rewritten, Level A failure.
    const bad = await page.evaluate(() => {
      const out = [];
      const check = (el, visible) => {
        const name = window.__nameOf(el);
        const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
        if (norm(visible) && !norm(name).includes(norm(visible))) {
          out.push({ el: el.id || el.className, visible, name });
        }
      };
      for (const b of document.querySelectorAll('#content [role="radio"]')) {
        check(b, b.textContent);
      }
      for (const id of ['trim-select', 'battery-select']) {
        const sel = document.getElementById(id);
        const lb = document.getElementById(sel.getAttribute('aria-labelledby'));
        // The visible label, not the options: option text is not a label.
        if (lb) check(sel, lb.textContent);
      }
      const cta = document.querySelector('.cta-button');
      if (cta) check(cta, cta.textContent);
      return out;
    });
    expect(bad, 'visible label not contained in the accessible name').toEqual([]);
  });

  test('the car image alt follows its src across all 7 trims', async ({ page }) => {
    await settle(page);
    // src was reassigned without alt, so the alt stayed "Volkswagen ID.3 Neo" for
    // all 7 trims — wrong in 4 of them, and no scanner can tell.
    const trims = await page.$$eval('#trim-select option', (os) => os.map((o) => o.value));
    expect(trims).toHaveLength(7);
    const seen = [];
    for (const t of trims) {
      await page.selectOption('#trim-select', t);
      await page.waitForFunction((tv) => {
        const i = document.getElementById('car-img');
        return i.getAttribute('src').includes(tv.toLowerCase().replace('polo', '')) || true;
      }, t);
      const pair = await page.evaluate(() => {
        const i = document.getElementById('car-img');
        return { src: i.getAttribute('src'), alt: i.alt };
      });
      expect(pair.alt.trim(), `empty alt for ${t}`).not.toBe('');
      seen.push(`${t}:${pair.src}|${pair.alt}`);
    }
    // Every trim must produce a distinct src AND a distinct alt.
    const srcs = seen.map((s) => s.split('|')[0]);
    const alts = seen.map((s) => s.split('|')[1]);
    expect(new Set(srcs).size, `duplicate src across trims: ${srcs}`).toBe(7);
    expect(new Set(alts).size, `duplicate alt across trims: ${alts}`).toBe(7);
  });

  test('one h1, real landmarks, and a skip link pointing at a live id', async ({ page }) => {
    await settle(page);
    const s = await page.evaluate(() => {
      const skip = document.querySelector('a.skip-link');
      const href = skip && skip.getAttribute('href');
      return {
        h1: document.querySelectorAll('h1').length,
        levels: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]),
        banner: document.querySelectorAll('[role="banner"], header').length,
        main: document.querySelectorAll('[role="main"], main').length,
        skipHref: href,
        skipTargetExists: !!(href && href.startsWith('#') && document.getElementById(href.slice(1))),
      };
    });
    expect(s.h1).toBe(1);
    expect(s.banner).toBeGreaterThanOrEqual(1);
    expect(s.main).toBe(1);
    expect(s.skipTargetExists, `skip link points at ${s.skipHref}, which does not exist`).toBe(true);
    for (let i = 1; i < s.levels.length; i++) {
      expect(s.levels[i] - s.levels[i - 1], `heading level jump at index ${i}`)
        .toBeLessThanOrEqual(1);
    }
  });
});

test.describe('targets — SC 2.5.8', () => {
  test('no visible target measures under 24x24', async ({ page }) => {
    await settle(page);
    // Cards and pills transition, so measure only after the box stops changing —
    // a control sampled mid-transition reports a size it never renders at.
    await waitForStableBox(page, '#location-group button');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#content button, #content select, #content input, #content a[href]')]
        .filter((el) => !el.disabled)
        .filter((el) => {
          for (let n = el; n; n = n.parentElement) {
            if (n.nodeType === 1 && getComputedStyle(n).display === 'none') return false;
          }
          return true;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.id || el.className, w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
        })
        .filter((b) => b.w > 0 && (b.w < 24 || b.h < 24)));
    // The SOC thumbs are excluded from this selector on purpose — they are 18x18
    // divs with a 24x24 ::before, so a box measurement is the wrong test for them.
    // They get their own ray-cast below.
    expect(small, 'targets under 24x24').toEqual([]);
  });

  for (const id of ['soc-thumb-from', 'soc-thumb-to']) {
    test(`#${id} hit area is 24x24 by ray-cast, not by its 18x18 box`, async ({ page }) => {
      await settle(page);
      const box = await page.locator(`#${id}`).boundingBox();
      expect(Math.round(box.width), 'the visual circle really is 18px').toBe(18);
      const hit = await hitArea(page, id);
      expect(hit.w, `hit width, rays ${JSON.stringify(hit)}`).toBeGreaterThanOrEqual(24);
      expect(hit.h, `hit height, rays ${JSON.stringify(hit)}`).toBeGreaterThanOrEqual(24);
    });
  }

  test('the two thumbs cannot be driven close enough to fail the spacing rule', async ({ page }) => {
    await settle(page);
    await page.locator('#soc-thumb-from').scrollIntoViewIfNeeded();
    await page.locator('#soc-thumb-from').focus();
    // Drive hard against the clamp: 12 x PageUp is +120 against a 0-100 range.
    for (let i = 0; i < 12; i++) await page.keyboard.press('PageUp');
    const m = await page.evaluate(() => {
      const a = document.getElementById('soc-thumb-from').getBoundingClientRect();
      const b = document.getElementById('soc-thumb-to').getBoundingClientRect();
      return {
        from: +document.getElementById('soc-thumb-from').getAttribute('aria-valuenow'),
        to: +document.getElementById('soc-thumb-to').getAttribute('aria-valuenow'),
        sepPx: +((b.left + b.width / 2) - (a.left + a.width / 2)).toFixed(2),
      };
    });
    expect(m.to - m.from, 'MIN_SOC_GAP is enforced on the keyboard path').toBe(24);
    // Both hit areas are 24x24 and centred, so >=24px centre-to-centre means they
    // do not overlap. Measured worst case is 55.38px at 320x256.
    expect(m.sepPx, `centre-to-centre at the clamp: ${JSON.stringify(m)}`)
      .toBeGreaterThanOrEqual(24);
  });
});

test.describe('reflow — SC 1.4.10 / 1.4.4', () => {
  test('no page-level horizontal scroll, in either sticky-bar state', async ({ page }) => {
    await settle(page);
    const h = () => page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    const a = await h();
    expect(a.sw, `document overflows: ${JSON.stringify(a)}`).toBeLessThanOrEqual(a.cw);
    await showStickyBar(page);
    const b = await h();
    expect(b.sw, `document overflows with the sticky bar shown: ${JSON.stringify(b)}`)
      .toBeLessThanOrEqual(b.cw);
  });

  test('the control set is identical at every width', async ({ page }) => {
    await settle(page);
    // SC 1.4.10 is about content LOSS. .btn-group used to be overflow-x:auto with
    // the scrollbar suppressed, so at 320px five options — including the selected
    // one — were off-screen with no cue that more existed.
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('#content button, #content select, #content input, #content [role="slider"]')]
        .map((el) => (el.getAttribute('aria-label') || el.textContent || el.id).replace(/\s+/g, ' ').trim()));
    // 24 = 5 info buttons + 13 radios + 2 SOC thumbs + 1 range input + 2 selects
    // + the CTA. That is the 20 tab stops, minus the skip link (an <a>, outside
    // this selector), plus the 5 radios the default state disables.
    expect(controls).toHaveLength(24);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('#content button, #content select, #content input')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1);
        })
        .map((el) => el.id || el.className));
    expect(clipped, 'controls outside the viewport horizontally').toEqual([]);
  });
});

test.describe('hygiene', () => {
  test('no JS exception on load or through a full interaction pass', async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await settle(page);
    for (const label of ['Workplace', 'Public', 'Motorway', 'At home']) {
      await page.locator('#location-group button', { hasText: label }).focus();
      await page.keyboard.press('Enter');
    }
    await page.locator('#soc-thumb-to').focus();
    for (const k of ['ArrowLeft', 'PageDown', 'Home', 'End']) await page.keyboard.press(k);
    await page.locator('#temp-slider').focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    for (const t of ['PoloGTI', 'Life', 'Trend']) await page.selectOption('#trim-select', t);
    await showStickyBar(page);
    expect(errs).toEqual([]);
  });

  test('no duplicate ids and no orphan aria-labelledby reference', async ({ page }) => {
    await settle(page);
    const bad = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      const orphans = [...document.querySelectorAll('[aria-labelledby]')]
        .flatMap((el) => el.getAttribute('aria-labelledby').split(/\s+/)
          .filter((id) => !document.getElementById(id))
          .map((id) => `${el.id || el.className} -> #${id}`));
      return { dupes, orphans };
    });
    expect(bad.dupes).toEqual([]);
    expect(bad.orphans).toEqual([]);
  });
});
