#!/usr/bin/env node
// One-off Playwright script that captures README screenshots.
// Run after `make backend` and `make frontend` are both up (or use ./scripts/capture-screenshots.sh).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = join(repoRoot, "assets", "screenshots");
mkdirSync(outDir, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };
const FRONTEND = process.env.NODUS_FRONTEND_URL ?? "http://localhost:5173";

async function waitForServers(page) {
  // Poll the frontend until it serves index.html (Vite returns 200 after warm-up).
  for (let i = 0; i < 60; i += 1) {
    try {
      const resp = await page.request.get(FRONTEND, { timeout: 1000 });
      if (resp.ok()) return;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Frontend not reachable at ${FRONTEND}`);
}

async function capture(name, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await waitForServers(page);
    await fn(page);
    const path = join(outDir, `${name}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`✓ ${name}.png`);
  } finally {
    await browser.close();
  }
}

await capture("radar-overview", async (page) => {
  await page.goto(`${FRONTEND}/radar`, { waitUntil: "networkidle" });
  // Wait for SVG to be present and at least a few dots rendered.
  await page.waitForSelector("svg", { state: "visible" });
  await page.waitForTimeout(1500); // settle in for any layout animations
});

await capture("list-view", async (page) => {
  await page.goto(`${FRONTEND}/list`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
});

await capture("topic-detail", async (page) => {
  // Deep-link to a topic — pre-selects it and opens the detail panel.
  await page.goto(`${FRONTEND}/radar/ai-agents`, { waitUntil: "networkidle" });
  await page.waitForSelector("svg", { state: "visible" });
  await page.waitForTimeout(1500);
});

console.log(`Saved to ${outDir}`);
