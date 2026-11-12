import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// No authenticated account or payment action is used by these checks.
test('Safari install landing has one Admin identity and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin-install.html');
  await expect(page.getByRole('heading', { name: 'Install Admin Portal' })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/admin-manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/admin-icon-192.png');
  const manifest = await page.request.get('/admin-manifest.webmanifest');
  expect((await manifest.json()).start_url).toBe('/AdminLogin?source=pwa');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('link', { name: 'Open Admin Portal', exact: true }).click();
  await expect(page).toHaveURL(/\/AdminLogin$/);
});

test('Admin production response has correct metadata before JavaScript runs', async ({ browser, baseURL }) => {
  const shell = await readFile('dist/admin.html', 'utf8');
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.route('**/AdminLogin', route => route.fulfill({ contentType: 'text/html', body: shell }));
  await page.goto('/AdminLogin');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/admin-manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/admin-icon-192.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'RL Admin');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://royallagn.com/AdminLogin');
  await context.close();
});

test('older iOS Home Screen bookmark launches the secure Admin entry', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
  await page.goto('/admin-install.html');
  await expect(page).toHaveURL(/\/AdminLogin\?source=pwa$/);
});
