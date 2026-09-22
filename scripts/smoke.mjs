/**
 * Browser smoke test: load every route in real Chrome and fail if any of them
 * errors or comes up empty.
 *
 * This exists because the unit suite cannot cover the failure it catches.
 * Plotly needs a canvas/WebGL context that jsdom does not provide, so no
 * Vitest test ever mounts a real chart — and some of Plotly's own code reads
 * Node-only globals that exist under Vitest but not in a browser. We shipped
 * exactly that bug once: typecheck, lint and 236 passing tests were all green
 * while three of six pages rendered a blank white screen.
 *
 * Usage:  npm run smoke          (starts nothing; expects the dev server up)
 *         npm run smoke -- --url http://localhost:4173   (e.g. vite preview)
 *
 * Uses the system Chrome via Playwright's `channel: "chrome"`, so there is no
 * browser download to manage in CI or on a fresh checkout.
 */
import { chromium } from "playwright";

const urlArg = process.argv.indexOf("--url");
const BASE = urlArg !== -1 ? process.argv[urlArg + 1] : "http://localhost:5173";

const ROUTES = ["/", "/explore", "/temperature", "/correlations", "/data", "/features", "/about"];

/** Routes that must end up rendering a Plotly figure. */
const CHART_ROUTES = new Set(["/explore", "/temperature", "/correlations"]);

/** Ignorable console noise. Keep this list short and justified. */
const IGNORE = [/favicon/i, /Download the React DevTools/i];

const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

const failures = [];
const browser = await chromium.launch({ channel: "chrome" });

for (const [label, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORE.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));

  for (const route of ROUTES) {
    errors.length = 0;
    let text;
    let plots;
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(700);
      text = (await page.locator("main").innerText()).trim();
      plots = await page.locator(".js-plotly-plot").count();
    } catch (e) {
      failures.push(`${label} ${route}: navigation failed — ${e.message.split("\n")[0]}`);
      continue;
    }

    if (text.length < 40) failures.push(`${label} ${route}: page is blank (${text.length} chars)`);
    if (CHART_ROUTES.has(route) && plots === 0) {
      failures.push(`${label} ${route}: expected a Plotly figure, found none`);
    }
    for (const e of errors) failures.push(`${label} ${route}: console error — ${e.slice(0, 200)}`);

    const status = failures.length ? "" : "ok";
    console.log(
      `  ${label.padEnd(7)} ${route.padEnd(14)} ${String(text.length).padStart(5)} chars` +
        `${CHART_ROUTES.has(route) ? `  ${plots} plot(s)` : ""}  ${status}`,
    );
  }
  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll routes rendered cleanly.");
