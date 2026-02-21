import { test, expect } from '@playwright/test';
import { db } from './firebase-admin';

const TEST_UID = 'test_user_recommendations_e2e';
const TEST_SERVICE_ID = 'test_service_rec_e2e';

test.describe('My Recommendations Dashboard', () => {

    test.beforeAll(async () => {
        // Setup: Create a test user and a recommendation
        await db().collection('services').doc(TEST_SERVICE_ID).set({
            businessName: 'My Recommended Service',
            category: 'Electrician',
            recommendations: 1
        });

        await db().collection('services').doc(TEST_SERVICE_ID)
            .collection('recommendations').doc(TEST_UID).set({
                userId: TEST_UID,
                text: 'Highly recommended!',
                createdAt: new Date()
            });
    });

    test.afterAll(async () => {
        // Teardown: Cleanup the service and nested recommendations
        await db().collection('services').doc(TEST_SERVICE_ID).collection('recommendations').doc(TEST_UID).delete();
        await db().collection('services').doc(TEST_SERVICE_ID).delete();
    });

    test('My Recommendations requires authentication', async ({ page }) => {
        await page.goto('/sunny/index.html?view=my_recommendations');
        // Wait slightly to allow the app to run auth state rules
        await page.waitForTimeout(500);
        // Directory handles "my_recommendations" as a URL param that enforces auth client-side,
        // or redirects to login if unauthenticated
        await expect(page).toHaveURL(/.*login.html/);
    });

    test.fixme('List Accuracy: Displays all services recommended by user', async ({ page }) => {
        // Assumes user is authenticated and has at least one mock recommendation
        await page.goto('/sunny/index.html?view=my_recommendations');

        // Header should acknowledge the view
        const header = page.locator('.page-title');
        await expect(header).toHaveText('My Recommendations');

        // List should render with service cards
        const results = page.locator('.service-card');
        const count = await results.count();
        expect(count).toBeGreaterThan(0);
    });
});
