import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  // Use the staging environment URL since e2e tests must execute against staging
  await page.goto(`/`);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Scarsdale Buzz/);
});

test('login button navigation', async ({ page }) => {
  await page.goto(`/`);

  // Evaluate the Javascript to change the location matching the onClick handler
  await page.evaluate(() => {
    window.location.href = 'login.html';
  });

  // Expect the URL to contain login.
  await expect(page).toHaveURL(/.*login/);
});
