// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Served over HTTP, not file:// — the audit is claimed against the deployed build,
// and the whole ARIA contract of the three button groups is written by JS on
// DOMContentLoaded. file:// changes load ordering and caching in ways that would
// make the suite lie about what it measured.
//
// Ports already claimed by sibling configs in this workspace: 4173 visualizer,
// 4174 nala, 4175 cost-simulator, 4176 tariffs, 4177 range-simulator. 4178 keeps
// all six runnable side by side. Do not "tidy" this back to a lower number: a
// collision does not fail loudly — Playwright either reuses the neighbour's server
// and audits the WRONG APP, or fails to bind and every test in the affected worker
// errors out, which reads exactly like a suite of undetected defects.
const PORT = 4178;

const chrome = devices['Desktop Chrome'];

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  // The four viewports the audit is claimed at. 320x256 @ dsf 4 is literal 400%
  // browser zoom — dsf 1 would be a small screen, which is a different test.
  projects: [
    { name: 'desktop-1440', use: { ...chrome, viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-768',   use: { ...chrome, viewport: { width: 768,  height: 1024 } } },
    { name: 'mobile-390',   use: { ...chrome, viewport: { width: 390,  height: 844 } } },
    { name: 'zoom-400',     use: { ...chrome, viewport: { width: 320,  height: 256 }, deviceScaleFactor: 4 } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
