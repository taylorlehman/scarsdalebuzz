import { test, expect } from '@playwright/test';

test.describe('Footer Year Verification', () => {
    const pages = [
        '/directory/index.html',
        '/data-deletion.html',
        '/directory/suggest.html',
        '/privacy.html',
        '/terms.html'
    ];

    for (const pageUrl of pages) {
        test(`Footer should contain 2026 on ${pageUrl}`, async ({ page }) => {
            await page.goto(pageUrl);
            const footer = page.locator('footer');
            await expect(footer).toContainText('2026');
        });
    }

    test('Footer should contain current year on /index.html', async ({ page }) => {
        await page.goto('/index.html');
        const footer = page.locator('footer');
        const currentYear = new Date().getFullYear().toString();
        // Since index.html uses dynamic JS, we expect it to be the current year (2026)
        await expect(footer).toContainText(currentYear);
    });
});
