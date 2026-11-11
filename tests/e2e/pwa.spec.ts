import { expect, test, type Page } from '@playwright/test';

async function waitForActiveServiceWorker(page: Page) {
  await expect.poll(() => page.evaluate(async () =>
    'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistrations()).some(
      registration => registration.active?.state === 'activated' && registration.active.scriptURL.endsWith('/sw.js'),
    )), { timeout: 60_000 }).toBe(true);
}

test('PWA manifestとService Workerは静的アセットだけを扱う', async ({ page, browser }, testInfo) => {
  testInfo.annotations.push({type:'browser-version',description:browser.version()});
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
    const pdfLib=popup.locator('li').filter({has:popup.getByText('pdf-lib 1.17.1',{exact:true})});
    await expect(pdfLib.getByRole('link',{name:'INTERNAL-NOTICES.txt',exact:true})).toBeVisible();
    await expect(pdfLib.getByRole('link',{name:'APACHE-2.0.txt',exact:true})).toBeVisible();
    await expect(pdfLib.getByRole('link',{name:'PDFKIT-MIT.txt',exact:true})).toBeVisible();
    await expect(pdfLib.getByRole('link',{name:'BASE64-MIT.txt',exact:true})).toBeVisible();
    await expect(pdfLib.getByRole('link',{name:'PDFJS-LICENSE.txt',exact:true})).toBeVisible();
    await expect(pdfLib.getByText('（固定参照commitの原文）',{exact:true})).toHaveCount(1);
    await expect(pdfLib.getByText('（参考候補・実借用版は未特定）',{exact:true})).toHaveCount(4);
    const internalTexts=await popup.evaluate(async()=>{
      const inventory=await(await fetch('./inventory.json')).json();const pkg=inventory.packages.find((p:{name:string})=>p.name==='pdf-lib');
      const texts=[];
      for(const original of pkg.originals){
        const response=await fetch(original.path);if(!response.ok)throw Error('notice unavailable');const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==original.sha256)throw Error('notice hash');texts.push(new TextDecoder().decode(bytes));
      }return texts.join('\n');
    });
    expect(internalTexts).toContain('Copyright 2012 Mozilla Foundation');
    expect(internalTexts).toContain('Copyright 1996-2003 Glyph & Cog, LLC');
    expect(internalTexts).toContain('Copyright (c) 2012 Niklas von Hertzen');
    expect(internalTexts).toContain('Apache License');
    expect(internalTexts).toContain('Copyright (c) 2014 Devon Govett');
    const pako=popup.locator('li').filter({has:popup.getByText('pako 1.0.11',{exact:true})});
    await expect(pako.getByRole('link')).toHaveCount(2);
    await expect(pako.getByRole('link',{name:'ZLIB-README.txt',exact:true})).toBeVisible();
    await expect(popup.getByText('pakoはMITとZlibの両条件を適用し、移植元・権利表示・変更説明も提供しています。',{exact:true})).toBeVisible();
    const pakoOriginals=await popup.evaluate(async()=>{
      const inventory=await(await fetch('./inventory.json')).json();
      const pkg=inventory.packages.find((item:{name:string})=>item.name==='pako');
      const texts=[];
      for(const original of pkg.originals){
        const response=await fetch(original.path);if(!response.ok)return {valid:false,texts};
        const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==original.sha256)return {valid:false,texts};texts.push(new TextDecoder().decode(bytes));
      }
      return {valid:pkg.originals.length===2,texts};
    });
    expect(pakoOriginals.valid).toBe(true);
    expect(pakoOriginals.texts.some(text=>text.includes('Permission is hereby granted'))).toBe(true);
    expect(pakoOriginals.texts.some(text=>text.includes('This port is based on zlib 1.2.8.')&&text.includes('1995-2013 Jean-loup Gailly and Mark Adler')&&text.includes('2014-2017 Vitaly Puzrin and Andrey Tupitsin'))).toBe(true);
    await expect(popup.getByRole('heading', { name: 'WASM 依存候補の原文' })).toBeVisible();
    await expect(popup.getByText('調査対象の候補であり、WASM に含まれることや依存一覧の網羅性を示すものではありません。')).toBeVisible();
    const encoding=popup.locator('li').filter({has:popup.getByText('encoding_rs 0.8.35',{exact:true})});
    const unicode=popup.locator('li').filter({has:popup.getByText('unicode-ident 1.0.24',{exact:true})});
    const zlib=popup.locator('li').filter({has:popup.getByText('zlib-rs 0.6.6',{exact:true})});
    await expect(zlib.getByRole('link',{name:'LICENSE',exact:true})).toBeVisible();
    await expect(encoding.getByRole('link')).toHaveCount(4);
    await expect(unicode.getByRole('link')).toHaveCount(3);
    const candidatePaths=await Promise.all([
      encoding.getByRole('link',{name:'LICENSE-WHATWG',exact:true}).getAttribute('href'),
      unicode.getByRole('link',{name:'LICENSE-UNICODE',exact:true}).getAttribute('href'),
      zlib.getByRole('link',{name:'LICENSE',exact:true}).getAttribute('href'),
    ]);
    expect(candidatePaths.every(Boolean)).toBe(true);
    const candidateTexts=await popup.evaluate(async paths=>Promise.all(paths.map(async path=>{const response=await fetch(path!);return {status:response.status,text:await response.text()};})),candidatePaths);
    expect(candidateTexts[0].status).toBe(200);
    expect(candidateTexts[0].text).toContain('WHATWG');
    expect(candidateTexts[1].status).toBe(200);
    expect(candidateTexts[1].text).toContain('UNICODE LICENSE V3');
    expect(candidateTexts[2].status).toBe(200);
    expect(candidateTexts[2].text).toContain('2024 Trifecta Tech Foundation');
    await expect(popup.getByRole('heading',{name:'PDFiumの原文候補と貢献表示案',exact:true})).toBeVisible();
    await expect(popup.getByText('固定source/DEPSの提供準備資料です。公開WASM内の実リンク・条件充足は未確認です。',{exact:true})).toBeVisible();
    await expect(popup.getByRole('link',{name:'条件付き貢献表示案',exact:true})).toBeVisible();
    const pdfiumNotices=await popup.evaluate(async()=>{
      const inventory=await(await fetch('./inventory.json')).json(),candidate=inventory.pdfiumNoticeCandidates;
      const items=[...candidate.groups.flatMap((g:{originals:{path:string;sha256:string}[]})=>g.originals),candidate.credits];
      const texts=[];
      for(const item of items){
        const response=await fetch(item.path);if(!response.ok)throw Error('candidate unavailable');const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)throw Error('candidate hash');texts.push(new TextDecoder().decode(bytes));
      }
      return {groups:candidate.groups.length,files:items.length,text:texts.join('\n')};
    });
    expect(pdfiumNotices.groups).toBe(6);expect(pdfiumNotices.files).toBe(10);
    expect(pdfiumNotices.text).toContain('Copyright (C) 2010 The Android Open Source Project');
    expect(pdfiumNotices.text).toContain('LLVM');
    expect(pdfiumNotices.text).toContain('Boost Software License');
    expect(pdfiumNotices.text).toContain('not a verified list');
    expect(pdfiumNotices.text).toContain('FreeType Team');
    expect(pdfiumNotices.text).toContain('Independent JPEG Group');
    await expect(popup.getByRole('heading',{name:'WASM内のデータと権利表示',exact:true})).toBeVisible();
    const dataNotices=await popup.evaluate(async()=>{
      const inventory=await(await fetch('./inventory.json')).json(),texts=[];
      for(const item of inventory.confirmedWasmData.originals){
        const response=await fetch(item.path);if(!response.ok)throw Error('data notice unavailable');
        const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)throw Error('data notice hash');texts.push(new TextDecoder().decode(bytes));
      }
      return texts;
    });
    expect(dataNotices).toHaveLength(3);
    expect(dataNotices[0]).toContain('Redistributions in binary form');
    expect(dataNotices[0]).toContain('Neither the name of Adobe');
    expect(dataNotices[1]).toContain('Original code copyright 2014 Foxit');
    expect(dataNotices[2]).toContain('Copyright (c) 1990-1994 Adobe Systems Incorporated');
    await expect(popup.getByRole('link',{name:'MMフォント内のAdobe著作権表示（許諾条件確認中）',exact:true})).toBeVisible();
    await expect(popup.getByRole('heading',{name:'MMフォント初出時の参考原文',exact:true})).toBeVisible();
    await expect(popup.getByText('初出時の参考資料です。MMフォントの全許諾や文字輪郭の由来の確定を示すものではありません。',{exact:true})).toBeVisible();
    const origins=await popup.evaluate(async()=>{
      const inventory=await(await fetch('./inventory.json')).json(),texts=[];
      for(const item of inventory.mmFontOrigin.originals){
        const response=await fetch(item.path);if(!response.ok)throw Error('origin unavailable');const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)throw Error('origin hash');texts.push(new TextDecoder().decode(bytes));
      }
      return texts;
    });
    expect(origins).toHaveLength(2);
    expect(origins[0]).toContain('Redistribution and use in source and binary forms');
    expect(origins[1]).toContain('Foxit Software Inc');
    expect(origins[1]).toContain('Google Inc.');
    await expect(popup.getByRole('heading',{name:'配布準備用の候補原文・条件別の告知案',exact:true})).toBeVisible();
    await expect(popup.getByText('固定ソース候補を保守的にまとめた資料です。完全な内包一覧や配布承認ではありません。',{exact:true})).toBeVisible();
    const conditionBundle=await popup.evaluate(async()=>{
      const inventory=await(await fetch('./inventory.json')).json(),bundle=inventory.conditionPreparation;
      const items=[...bundle.units.flatMap((u:{originals:{path:string;sha256:string}[]})=>u.originals),bundle.credits];
      let total=0;
      for(const item of items){
        const response=await fetch(item.path);if(!response.ok)throw Error('condition material unavailable');const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==item.sha256)throw Error('condition material hash');total+=bytes.byteLength;
      }
      return {units:bundle.units.length,files:items.length,total,approved:bundle.releaseApproval};
    });
    expect(conditionBundle.units).toBe(119);expect(conditionBundle.files).toBe(229);
    expect(conditionBundle.total).toBeGreaterThan(1_111_370);expect(conditionBundle.approved).toBe(false);
    await popup.close();
  } finally { await page.context().setOffline(false); }
});
