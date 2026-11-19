import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const base = process.env.SHOT_URL || "http://127.0.0.1:47321";
const out = process.env.SHOT_DIR || "/tmp/livingo-shots";
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const logs = [];
page.on("console", (message) => {
  if (message.type() === "error") logs.push(message.text());
});
page.on("pageerror", (error) => logs.push(String(error)));

async function clickText(selector, text) {
  const clicked = await page.evaluate(
    (sel, label) => {
      const node = [...document.querySelectorAll(sel)].find((element) => element.textContent?.includes(label));
      if (!(node instanceof HTMLElement)) return false;
      node.click();
      return true;
    },
    selector,
    text,
  );
  if (!clicked) throw new Error(`Could not click ${selector} containing ${text}`);
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${base}/welcome`, { waitUntil: "networkidle0" });
await clickText("button", "Try the sample pair");
await page.waitForFunction(() => document.body.innerText.includes("day streak"));
await page.screenshot({ path: `${out}/home_streak.png` });

await clickText("a", "Add another word");
await page.waitForFunction(() => document.body.innerText.includes("Today's word"));
await page.screenshot({ path: `${out}/add_word.png` });

await page.goto(`${base}/words/demo-sv-fika`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("Explanation"));
await page.waitForSelector("img");
await page.screenshot({ path: `${out}/card_attachments.png`, fullPage: true });

await page.goto(`${base}/quiz`, { waitUntil: "networkidle0" });
await clickText("button", "Start");
await page.waitForFunction(
  () => document.body.innerText.includes("What does this mean?") || document.body.innerText.includes("How do you say it?"),
);
await page.screenshot({ path: `${out}/quiz.png` });

await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
await page.goto(`${base}/`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("day streak"));
await page.screenshot({ path: `${out}/home_desktop.png` });

console.log(JSON.stringify({ out, logs }, null, 2));
await browser.close();
