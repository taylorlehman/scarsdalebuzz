import { test, expect } from '@playwright/test';
import { db } from './firebase-admin';

const TEST_SERVICE_ID = 'test_service_directory_e2e';

test.describe('Core Directory & Recommendations Flow', () => {

    test.beforeAll(async () => {
        // Setup: Create a test service document in Firestore
        await db().collection('services').doc(TEST_SERVICE_ID).set({
            businessName: 'Test Plumber',
            category: 'Plumbing',
            phone: '555-0192',
            recommendations: 0,
            createdAt: new Date()
        });
    });

    test.afterAll(async () => {
        // Teardown: Remove the test service document and any suggestions created
        await db().collection('services').doc(TEST_SERVICE_ID).delete();

        // Cleanup based on the suggest.html test
        const snapshot = await db().collection('services').where('businessName', '==', 'Test Plumber').get();
        const batch = db().batch();
        snapshot.docs.forEach(doc => {
            if (doc.id !== TEST_SERVICE_ID) batch.delete(doc.ref);
        });
        await batch.commit();
    });

    test('Directory Access Control: Unauthenticated user is redirected to login', async ({ page }) => {
        await page.goto('/sunny/index.html');
        await expect(page).toHaveURL(/.*login.html/);
    });

    test.fixme('Directory Access Control: Authenticated user can see directory', async ({ page }) => {
        // Requires authenticated context
        await page.goto('/sunny/index.html');
        // Ensure the service list container is rendered
        await expect(page.locator('#services-list')).toBeVisible();
    });

    test.fixme('Service Suggestion: User can suggest a new service', async ({ page }) => {
        await page.goto('/sunny/suggest.html');

        await page.locator('#business-name').fill('Test Plumber');
        await page.locator('#category').selectOption({ label: 'Plumbing' });
        await page.locator('#business-phone').fill('555-0192');
        await page.locator('#recommendation-text').fill('Great reliable plumbing service.');

        // Submit form
        await page.locator('button[type="submit"]').click();

        // Verify success redirect or message
        await expect(page).toHaveURL(/.*index.html/);
    });

    test.fixme('Recommendations: User can add a recommendation to existing service', async ({ page }) => {
        // Navigate to a specific service view page
        await page.goto('/sunny/view.html?id=MOCK_SERVICE_ID');

        await page.locator('#recommend-btn').click();
        await page.locator('#recommend-modal textarea').fill('They did an amazing job!');
        await page.locator('#submit-recommendation-btn').click();

        // Verify success state in the UI (like a new recommendation block appearing)
        const recentRec = page.locator('.recommendation-block').first();
        await expect(recentRec).toContainText('They did an amazing job!');
    });

    test.fixme('Liking Services: User can like a service from the directory', async ({ page }) => {
        await page.goto('/sunny/index.html');

        const likeBtn = page.locator('.like-btn').first();
        const initialLikes = await likeBtn.textContent();
        // Assuming UI handles likes via this button class
        await likeBtn.click();

        // Check if the number goes up visually
        await expect(likeBtn).not.toHaveText(initialLikes || '');
    });

    test.fixme('Directory Search: Returns expected services based on keywords', async ({ page }) => {
        await page.goto('/sunny/index.html');

        // Perform search
        await page.locator('#search-input').fill('plumber');
        // Wait for the debounced search to execute
        await page.waitForTimeout(500);

        const results = page.locator('.service-card');
        const count = await results.count();
        expect(count).toBeGreaterThan(0);
        // Ensure title contains the keyword or category
        await expect(results.first()).toContainText(/plumb/i);
    });

    test.fixme('Directory Filtering: Filters by specific service categories', async ({ page }) => {
        await page.goto('/sunny/index.html');

        // Trigger category filter
        await page.locator('.category-pill:has-text("Electrician")').click();

        // Verify that cards shown belong to the Electrician category
        const categoryTags = page.locator('.service-category');
        const count = await categoryTags.count();
        for (let i = 0; i < count; i++) {
            await expect(categoryTags.nth(i)).toHaveText(/Electrician/i);
        }
    });

    test.fixme('Shared User Lists: Renders correctly for shared lists', async ({ page }) => {
        await page.goto('/sunny/index.html?view=user&userId=MOCK_USER_ID');
        // Ensure the title header reflects the shared view
        const header = page.locator('h1');
        await expect(header).toContainText(/Recommendations/i);
        // Should display a populated list or specific placeholder
        await expect(page.locator('#services-list')).toBeVisible();
    });
});
