import { test, expect } from '@playwright/test';

/**
 * Page quality tests — capture screenshots and verify layout integrity.
 *
 * Run: npx playwright test
 * View report: npx playwright show-report
 */

test.describe('Page quality screenshots', () => {
  test('landing page renders correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/landing.png', fullPage: true });
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/login.png' });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('register page renders correctly', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/register.png' });
  });

  test('unauthenticated report redirect works', async ({ page }) => {
    await page.goto('/dashboard/reports/test', { waitUntil: 'networkidle' });
    // Should redirect to login
    expect(page.url()).toContain('/login');
  });

  test('dashboard redirects when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/login');
  });
});

test.describe('Authenticated pages', () => {
  // To run these, set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL || 'demo@trt.local';
    const password = process.env.TEST_USER_PASSWORD || '';
    if (!password) {
      test.skip(true, 'Set TEST_USER_PASSWORD to run authenticated tests');
    }
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 5000 }).catch(() => {});
  });

  test('dashboard home renders', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/dashboard.png', fullPage: true });
  });

  test('report detail renders with single sidebar (no nesting)', async ({ page }) => {
    // Get latest report ID from the reports list
    await page.goto('/dashboard/reports', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/reports-list.png' });

    // Click first report link
    const reportLink = page.locator('a[href*="/dashboard/reports/"]').first();
    if (await reportLink.isVisible()) {
      await reportLink.click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'tests/screenshots/report-detail.png', fullPage: true });

      // Verify NO nested dashboard (only one sidebar should exist)
      const sidebars = await page.locator('[class*="sidebar"], [class*="Sidebar"]').count();
      expect(sidebars).toBeLessThanOrEqual(1);
    }
  });

  test('labs page renders', async ({ page }) => {
    await page.goto('/dashboard/labs', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/labs.png' });
  });

  test('analysis page renders', async ({ page }) => {
    await page.goto('/dashboard/analysis', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'tests/screenshots/analysis.png', fullPage: true });
  });
});
