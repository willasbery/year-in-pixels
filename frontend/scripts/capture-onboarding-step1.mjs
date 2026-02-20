#!/usr/bin/env node
import { chromium, devices } from 'playwright';

const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Usage: node scripts/capture-onboarding-step1.mjs <output-path> [device] [theme] [step]');
  process.exit(1);
}

const baseUrl = process.env.ONBOARDING_CAPTURE_URL ?? 'http://127.0.0.1:4173/onboarding.html';
const deviceArg = process.argv[3]?.trim();
const themeArg = process.argv[4]?.trim().toLowerCase();
const stepArg = process.argv[5]?.trim().toLowerCase();
const interactionArg = process.argv[6]?.trim().toLowerCase();
const deviceName = deviceArg || process.env.ONBOARDING_CAPTURE_DEVICE?.trim() || 'iphone15';
const theme = themeArg || process.env.ONBOARDING_CAPTURE_THEME?.trim().toLowerCase();
const captureStep = stepArg || process.env.ONBOARDING_CAPTURE_STEP?.trim().toLowerCase();
const interaction = interactionArg || process.env.ONBOARDING_CAPTURE_INTERACTION?.trim().toLowerCase();
const stepIndexByName = {
  intro: 1,
  login: 2,
  mood: 3,
  reminder: 4,
  shortcut: 5,
};
const normalizedDeviceName = deviceName?.toLowerCase() ?? '';
const isDesktopPreset = normalizedDeviceName === 'desktop';
const isIphone15Preset =
  normalizedDeviceName === 'iphone15' ||
  normalizedDeviceName === 'iphone16' ||
  normalizedDeviceName === 'iphone17';
const hasNamedDevice = Boolean(deviceName && devices[deviceName]);

const browser = await chromium.launch();
const page = isIphone15Preset
  ? await browser.newPage({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    })
  : isDesktopPreset
    ? await browser.newPage({ viewport: { width: 1280, height: 900 } })
  : hasNamedDevice
    ? await browser.newPage({ ...devices[deviceName] })
    : await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
if (theme === 'dark' || theme === 'light') {
  await page.emulateMedia({ colorScheme: theme });
}
const targetUrl = new URL(baseUrl);

await page.goto(targetUrl.toString(), { waitUntil: 'networkidle' });
await page.waitForTimeout(250);

const numericStep = captureStep ? Number.parseInt(captureStep, 10) : Number.NaN;
const targetStep = Number.isFinite(numericStep)
  ? numericStep
  : captureStep && stepIndexByName[captureStep]
    ? stepIndexByName[captureStep]
    : 1;

if (targetStep > 1) {
  const viewport = page.viewportSize() ?? { width: 393, height: 852 };
  const swipeY = Math.round(viewport.height * 0.5);
  const startX = Math.round(viewport.width * 0.84);
  const endX = Math.round(viewport.width * 0.18);

  for (let index = 1; index < targetStep; index += 1) {
    await page.mouse.move(startX, swipeY);
    await page.mouse.down();
    await page.mouse.move(endX, swipeY, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
}
await page.locator(`text=STEP ${targetStep}`).first().waitFor({ timeout: 4000 });
if (interaction === 'no-reminders') {
  await page.getByText('No reminders', { exact: true }).first().click();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(300);
await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();
