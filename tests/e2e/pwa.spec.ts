import { expect, test, type Page } from '@playwright/test';

async function waitForActiveServiceWorker(page: Page) {
  await expect.poll(() => page.evaluate(async () =>
    'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistrations()).some(
      registration => registration.active?.state === 'activated' && registration.active.scriptURL.endsWith('/sw.js'),
    )), { timeout: 60_000 }).toBe(true);
}

test('PWA manifestとService Workerは静的アセットだけを扱う', async ({ page }) => {
  // All distribution assets are installed sequentially; the readiness check
  // must await activation rather than treating an async predicate as truthy.
  test.setTimeout(90_000);
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

  expect(cacheState.cacheNames.some(name=>/^ldp-static-[a-f0-9]{24}$/.test(name))).toBe(true);
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
          parsed.pathname === '/pwa-manifest.json' ||
          parsed.pathname === '/__ldp_static_ready__' ||
          parsed.pathname.startsWith('/licenses/') ||
          parsed.pathname.startsWith('/assets/') ||
          /^\/ldp_icon(?:-\d+)?\.png$/.test(parsed.pathname))
      );
    }),
  ).toBe(true);

  await page.reload();
  await expect(page.getByText('この世代のオフライン資産は準備済みです。', { exact: true })).toBeVisible();
  await page.context().setOffline(true);
  try {
    const popupPromise=page.waitForEvent('popup');
    await page.getByRole('link', { name: '第三者ライセンス' }).click();
    const popup=await popupPromise;
    await expect(popup.getByRole('heading', { name: '第三者ライセンス' })).toBeVisible();
    const entry=popup.locator('li').filter({has:popup.getByText('dompurify 3.4.17', { exact: true })});
    const href=await entry.getByRole('link', { name: 'LICENSE-MPL' }).getAttribute('href');
    expect(href).toBeTruthy();
    const result=await popup.evaluate(async path=>{const response=await fetch(path!);return {status:response.status,text:await response.text()};},href);
    expect(result.status).toBe(200);
    expect(result.text).toContain('Mozilla Public License Version 2.0');
    await popup.close();
  } finally { await page.context().setOffline(false); }
});
