import { test, expect } from '@playwright/test';
import { db } from './firebase-admin';

const TEST_UID = 'test_user_account_e2e';

test.describe('User Account Management', () => {

    test.beforeAll(async () => {
        // Setup: Create a test user document in Firestore
        await db().collection('users').doc(TEST_UID).set({
            firstName: 'Test',
            lastName: 'User',
            address: 'Init Address',
            phone: '000-000-0000',
            createdAt: new Date()
        });
    });

    test.afterAll(async () => {
        // Teardown: Remove the test user document
        await db().collection('users').doc(TEST_UID).delete();
    });

    test('Profile Updates require authentication', async ({ page }) => {
        await page.goto(`/account.html`);
        // Should gracefully redirect if unauthenticated
        await expect(page).toHaveURL(/.*login.html/);
    });

    // Example structure for authenticated test
    test.fixme('Profile Updates: User can update Address and Phone Number', async ({ page }) => {
        // 1. Assuming user is authenticated via storageState or global setup
        await page.goto(`/account.html`);

        // Wait for the auth listener to resolve and elements to become visible
        await expect(page.locator('#address-input')).toBeVisible();

        // 2. Perform updates
        await page.locator('#address-input').fill('123 Test Ave');
        await page.locator('#phone-input').fill('914-555-0000');
        await page.locator('#save-profile-btn').click();

        // 3. Verify success message
        const successMsg = page.locator('#profile-message');
        await expect(successMsg).toBeVisible();
        await expect(successMsg).toHaveText(/Profile updated successfully/);
    });
});
