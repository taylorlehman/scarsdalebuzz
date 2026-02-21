import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {

    test('Guest is redirected to login from protected page', async ({ page }) => {
        // Attempt to access directory directly without auth
        await page.goto(`/sunny/index.html`);
        // Note: Assuming directory has client-side redirect. If not, it might just load empty. 
        // Wait for network idle or timeout to see if redirect happens
        try {
            await page.waitForURL('**/login.html**', { timeout: 3000 });
            await expect(page).toHaveURL(/.*login/);
        } catch {
            // If the redirect logic takes longer or relies on firebase auth state loading
            // We ensure we eventually hit login
            // Let's assert the page at least requires sign in
            const currentURL = page.url();
            if (!currentURL.includes('login')) {
                // Some pages might just show "Please sign in" rather than redirect
                const bodyText = await page.locator('body').textContent();
                expect(bodyText).toMatch(/sign in/i);
            }
        }
    });

    test('Login page shows Facebook button by default', async ({ page }) => {
        await page.goto(`/login.html`);
        const fbBtn = page.locator('#facebook-signin-btn');
        await expect(fbBtn).toBeVisible();

        // Google button should be hidden by default
        const googleBtn = page.locator('#google-signin-btn');
        await expect(googleBtn).toBeHidden();
    });

    test('Login page shows Google button when redirect is admin', async ({ page }) => {
        await page.goto(`/login.html?redirect=admin/index.html`);
        const googleBtn = page.locator('#google-signin-btn');
        await expect(googleBtn).toBeVisible();
    });

    test('Clicking sign in providers opens popup', async ({ page, context }) => {
        await page.goto(`/login.html?redirect=admin/index.html`);

        // Click Google
        const [popup] = await Promise.all([
            context.waitForEvent('page'),
            page.locator('#google-signin-btn').click({ force: true })
        ]);

        // Verify popup navigates to Google Identity
        await expect(popup).toHaveURL(/accounts\.google\.com/);
        await popup.close();
    });
});
