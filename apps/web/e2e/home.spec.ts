import { test, expect } from '@playwright/test';

test('has expected title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // The layout defines static title as t('brand'), or dynamic tenant name.
  // We'll just verify the page loads and has a title element.
  await expect(page).toHaveTitle(/.*Mohamy Pro.*/i);
});
