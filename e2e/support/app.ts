import {expect, type Page} from '@playwright/test';

// Opens the app and waits for React to hydrate it. page.goto() resolves on the
// server-rendered HTML, before hydration: typing into a controlled input then
// skips its onChange, so the form state stays empty and submit stays
// disabled. Astro removes an island's `ssr` attribute once it has hydrated.
export async function openApp(page: Page) {
	await page.goto('/');
	await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
}
