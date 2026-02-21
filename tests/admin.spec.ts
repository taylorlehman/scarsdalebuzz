import { test, expect } from '@playwright/test';
import { db } from './firebase-admin';

const MOCK_NON_ADMIN_UID = 'test_non_admin_e2e';
const MOCK_PENDING_BETA_UID = 'test_pending_beta_e2e';
const MOCK_DELETE_USER_UID = 'test_delete_me_e2e';

test.describe('Admin Workflows', () => {

    test.beforeAll(async () => {
        // Setup: Create various user states
        const batch = db().batch();

        batch.set(db().collection('users').doc(MOCK_NON_ADMIN_UID), {
            email: 'nonadmin@example.com',
            admin: false,
            createdAt: new Date()
        });

        batch.set(db().collection('users').doc(MOCK_PENDING_BETA_UID), {
            email: 'Pending Beta User',
            betaStatus: 'pending',
            createdAt: new Date()
        });

        batch.set(db().collection('users').doc(MOCK_DELETE_USER_UID), {
            email: 'Delete Me User',
            createdAt: new Date()
        });

        await batch.commit();
    });

    test.afterAll(async () => {
        // Teardown: Cleanup all created users
        const batch = db().batch();
        batch.delete(db().collection('users').doc(MOCK_NON_ADMIN_UID));
        batch.delete(db().collection('users').doc(MOCK_PENDING_BETA_UID));
        batch.delete(db().collection('users').doc(MOCK_DELETE_USER_UID));
        await batch.commit();
    });

    test('Admin Dashboard Access: Non-admin user is rejected', async ({ page }) => {
        // Attempting to visit the admin directory directly
        await page.goto(`/admin/index.html`);
        // The client-side logic should redirect non-admins back to the directory or login
        await expect(page).toHaveURL(/.*(login|sunny\/index).html/);
    });

    // These tests require logging in as an admin via a test state
    test.fixme('Grant Admin Capabilities: Admin can make another user an admin', async ({ page }) => {
        await page.goto(`/admin/users.html`);

        // Find a mock user row
        const targetUserRow = page.locator('.user-row:has-text("mockuser@example.com")');
        await targetUserRow.locator('.grant-admin-btn').click();

        // Verify confirmation or UI state change
        await expect(targetUserRow.locator('.admin-badge')).toBeVisible();
    });

    test.fixme('Approve Beta Users: Admin can approve a pending Sunny Beta user', async ({ page }) => {
        await page.goto(`/admin/users.html`);

        // Find pending user row
        const pendingRow = page.locator('.user-row:has-text("Pending Beta User")');
        await pendingRow.locator('.approve-beta-btn').click();

        // Verify status changes to approved
        await expect(pendingRow.locator('.status-badge')).toHaveText('Approved');
    });

    test.fixme('Delete Users: Admin can successfully delete a user', async ({ page }) => {
        await page.goto(`/admin/users.html`);

        // Find target user row
        const deleteRow = page.locator('.user-row:has-text("Delete Me User")');
        await deleteRow.locator('.delete-user-btn').click();

        // Handle confirmation dialog if applicable
        page.on('dialog', dialog => dialog.accept());

        // Ensure row is removed from DOM
        await expect(deleteRow).toBeHidden();
    });
});
