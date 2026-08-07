import { expect, test, type Page } from '@playwright/test';

async function waitForActiveServiceWorker(page: Page) {
  await page.waitForFunction(
    async () =>
      'serviceWorker' in navigator &&
      (await navigator.serviceWorker.getRegistrations()).some(
        (registration) => registration.active?.scriptURL.endsWith('/sw.js'),
      ),
    undefined,
    { timeout: 30_000 },
  );
}

test('PWA manifestとService Workerは静的アセットだけを扱う', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await waitForActiveServiceWorker(page);

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return response.json();
  });
  expect(manifest).toMatchObject({
    name: 'Local Document Preprocessor',
    short_name: 'LDP',
    start_url: '/',
    display: 'standalone',
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/ldp_icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/ldp_icon-512.png', sizes: '512x512' }),
    ]),
  );

  await page.evaluate(async () => {
    await fetch('/?ldp-user-data=must-not-be-cached');
  });
  const appOrigin = new URL(page.url()).origin;
  const cacheState = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const urls = (
      await Promise.all(
        cacheNames.map(async (cacheName) =>
          (await caches.open(cacheName)).keys(),
        ),
      )
    ).flat().map((request) => request.url);
    const serviceWorkers = await navigator.serviceWorker.getRegistrations();
    return { cacheNames, urls, serviceWorkers: serviceWorkers.length };
  });

  expect(cacheState.cacheNames).toContain('ldp-static-v1');
  expect(cacheState.serviceWorkers).toBeGreaterThan(0);
  expect(cacheState.urls.some((url) => url.includes('ldp-user-data'))).toBe(false);
  expect(
    cacheState.urls.every((url) => {
      const parsed = new URL(url);
      return (
        parsed.origin === appOrigin &&
        parsed.search === '' &&
        (parsed.pathname === '/' ||
          parsed.pathname === '/index.html' ||
          parsed.pathname === '/manifest.webmanifest' ||
          parsed.pathname.startsWith('/assets/') ||
          /^\/ldp_icon(?:-\d+)?\.png$/.test(parsed.pathname))
      );
    }),
  ).toBe(true);
});
