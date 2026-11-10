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
    await popup.getByRole('link',{name:'Tiny 12.3.0 内包物のライセンス・由来・変更',exact:true}).click();
    await expect(popup.getByRole('heading',{name:'Tiny内包物の第三者ライセンス原文',exact:true})).toBeVisible();
    await expect(popup.getByText(/DOMPurifyはApache-2.0を選択/)).toBeVisible();
    const entry=popup.locator('li').filter({has:popup.getByText('dompurify 3.4.17',{exact:true})});
    await expect(entry.getByRole('link',{name:'LICENSE-MPL',exact:true})).toBeVisible();
    await expect(popup.locator('li').filter({has:popup.getByText('@babel/helpers 7.29.10',{exact:true})}).getByRole('link',{name:'LICENSE',exact:true})).toBeVisible();
    const verified=await popup.evaluate(async()=>{
      const manifest=await(await fetch('./manifest.json')).json();
      const items=[...manifest.items,manifest.sourceNotices,manifest.generatorReference,...manifest.patches];
      for(const item of items){
        const response=await fetch(item.path);if(!response.ok)return false;
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)return false;
      }
      return manifest.items.length===69;
    });
    expect(verified).toBe(true);
    await popup.goBack();
    await expect(popup.getByRole('heading', { name: 'WASM 依存候補の原文' })).toBeVisible();
    await expect(popup.getByText('調査対象の候補であり、WASM に含まれることや依存一覧の網羅性を示すものではありません。')).toBeVisible();
    const encoding=popup.locator('li').filter({has:popup.getByText('encoding_rs 0.8.35',{exact:true})});
    const unicode=popup.locator('li').filter({has:popup.getByText('unicode-ident 1.0.24',{exact:true})});
    await expect(encoding.getByRole('link')).toHaveCount(4);
    await expect(unicode.getByRole('link')).toHaveCount(3);
    const candidatePaths=await Promise.all([
      encoding.getByRole('link',{name:'LICENSE-WHATWG',exact:true}).getAttribute('href'),
      unicode.getByRole('link',{name:'LICENSE-UNICODE',exact:true}).getAttribute('href'),
    ]);
    expect(candidatePaths.every(Boolean)).toBe(true);
    const candidateTexts=await popup.evaluate(async paths=>Promise.all(paths.map(async path=>{const response=await fetch(path!);return {status:response.status,text:await response.text()};})),candidatePaths);
    expect(candidateTexts[0].status).toBe(200);
    expect(candidateTexts[0].text).toContain('WHATWG');
    expect(candidateTexts[1].status).toBe(200);
    expect(candidateTexts[1].text).toContain('UNICODE LICENSE V3');
    await popup.close();
  } finally { await page.context().setOffline(false); }
});
