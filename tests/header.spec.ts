import { test, expect } from '@playwright/test';

test.describe('Shared Header Navigation', () => {

    test('Header contains "Suggest New Business" link and navigates correctly', async ({ page }) => {
        // Go to directory page
        await page.goto('/directory/index.html');

        // Check if "Suggest New Business" link exists in desktop nav
        const suggestLink = page.locator('nav.hidden.md\\:flex a[href*="suggest.html"]');
        await expect(suggestLink).toBeVisible();
        await expect(suggestLink).toHaveText('Suggest New Business');

        // Click the link
        await suggestLink.click();

        // Verify navigation to suggest page
        await expect(page).toHaveURL(/.*\/directory\/suggest\.html/);

        // Verify the link is active on the suggest page
        // The active class contains "border-b border-scandi-clay"
        const activeSuggestLink = page.locator('nav.hidden.md\\:flex a[href*="suggest.html"]');
        await expect(activeSuggestLink).toHaveClass(/border-b/);
        await expect(activeSuggestLink).toHaveClass(/border-scandi-clay/);

        // Verify the Directory link is NOT active
        const dirLink = page.locator('nav.hidden.md\\:flex a[href*="directory/index.html"]');
        await expect(dirLink).not.toHaveClass(/border-b/);
    });

    test('Mobile menu contains "Suggest New Business" link', async ({ page }) => {
        // Set viewport to mobile size
        await page.setViewportSize({ width: 375, height: 667 });

        // Go to directory page
        await page.goto('/directory/index.html');

        // Open mobile menu
        await page.locator('#mobile-menu-btn').click();

        // Check if "Suggest New Business" link exists in mobile menu
        const mobileSuggestLink = page.locator('#mobile-menu a[href*="suggest.html"]');
        await expect(mobileSuggestLink).toBeVisible();
        await expect(mobileSuggestLink).toHaveText('Suggest New Business');
        
        // Click the link
        await mobileSuggestLink.click();

        // Verify navigation to suggest page
        await expect(page).toHaveURL(/.*\/directory\/suggest\.html/);
    });

});
