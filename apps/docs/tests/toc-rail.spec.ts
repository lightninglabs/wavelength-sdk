import { test, expect } from '@playwright/test';

// Tests for the "On this page" TOC rail layout and active-section scroll-spy
// (GR-toc-fix).
//
// Layout: the TOC rail (.wdk-toc, rendered by TableOfContents.astro) is a
// fixed column pinned to the right screen edge. While the footer is off-screen
// it spans to the viewport bottom; once the footer enters view RightRailCap
// shortens it so the panel ends at the footer top.
//
// The guide article page (/guides/create-a-wallet/) has enough prose and
// code blocks to overflow the viewport, so scrolling actually moves between
// sections.
const PAGE = '/guides/create-a-wallet/';

test('clicking a TOC link lands the heading below the sticky header, not under it', async ({ page }) => {
  // The glossary is a plain prose page whose TOC targets are markdown headings.
  // Regression: those headings lacked scroll-margin-top, so an anchor jump left
  // the heading hidden under the sticky header.
  await page.goto('/glossary/');
  const header = (await page.locator('.wdk-header').boundingBox())!;
  const headerBottom = header.y + header.height;

  await page.locator('.wdk-toc a[href="#bolt-11"]').click();

  const heading = page.locator('#bolt-11');
  await expect(async () => {
    const box = (await heading.boundingBox())!;
    // Cleared the header (the bug): the heading top sits at or below it.
    expect(box.y).toBeGreaterThanOrEqual(headerBottom - 1);
    // Actually scrolled to the anchor: it rests near the top, not mid-page.
    expect(box.y).toBeLessThan(headerBottom + 48);
  }).toPass({ timeout: 3000 });
});

test('TOC rail is fixed flush to the right screen edge and spans below the header', async ({ page }) => {
  await page.goto(PAGE);
  const toc = page.locator('.wdk-toc');
  await expect(toc).toBeVisible();

  const box = await toc.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      right: rect.right,
      top: rect.top,
      height: rect.height,
      position: style.position,
    };
  });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  // Pinned to the right screen edge (position: fixed; right: 0).
  expect(box.position).toBe('fixed');
  expect(box.right).toBeCloseTo(viewport!.width, 0);

  // Spans to the viewport bottom while the footer is below the fold.
  expect(box.top + box.height).toBeGreaterThan(viewport!.height - 4);
});

test('TOC rail bottom aligns with footer top when footer is in view', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(async () => {
    const tocBottom = await page.locator('.wdk-toc').evaluate((el) => el.getBoundingClientRect().bottom);
    const footerTop = await page.locator('.wdk-footer').evaluate((el) => el.getBoundingClientRect().top);
    expect(tocBottom).toBeCloseTo(footerTop, 0);
  }).toPass({ timeout: 3000 });
});

test('TOC rail content is inset from the rail edges (heading + links are padded)', async ({ page }) => {
  await page.goto(PAGE);
  const toc = page.locator('.wdk-toc');
  await expect(toc).toBeVisible();

  const padding = await toc.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      top: parseFloat(style.paddingTop),
      left: parseFloat(style.paddingLeft),
    };
  });
  expect(padding.top).toBeGreaterThan(0);
  expect(padding.left).toBeGreaterThan(0);

  // The title row (accent square + "On this page") sits inside that padded
  // box, not flush against the rail's outer edge.
  const titleLeft = await toc.locator('.wdk-toc__title').evaluate((el) => el.getBoundingClientRect().left);
  const tocLeft = await toc.evaluate((el) => el.getBoundingClientRect().left);
  expect(titleLeft).toBeGreaterThan(tocLeft);
});

test('content column makes room for the fixed TOC rail (no overlap)', async ({ page }) => {
  await page.goto(PAGE);
  const content = page.locator('.wdk-guide__content');
  const toc = page.locator('.wdk-toc');
  await expect(content).toBeVisible();
  await expect(toc).toBeVisible();

  const contentRight = await content.evaluate((el) => el.getBoundingClientRect().right);
  const tocLeft = await toc.evaluate((el) => el.getBoundingClientRect().left);
  expect(contentRight).toBeLessThanOrEqual(tocLeft + 1);
});

test('exactly one TOC link is active on load, matching the first heading', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('.wdk-toc__link[aria-current="true"]')).toHaveCount(1);

  const firstHeadingId = await page.locator('.wdk-guide__content h2[id], .wdk-guide__content h3[id]').first().getAttribute('id');
  const activeHref = await page.locator('.wdk-toc__link[aria-current="true"]').getAttribute('href');
  expect(activeHref).toBe(`#${firstHeadingId}`);
});

test('scrolling to a later section moves the active TOC link forward', async ({ page }) => {
  await page.goto(PAGE);

  const headings = page.locator('.wdk-guide__content h2[id], .wdk-guide__content h3[id]');
  const headingIds = await headings.evaluateAll((els) => els.map((el) => el.id));
  expect(headingIds.length).toBeGreaterThan(1);

  // Confirm the starting active link (first heading).
  await expect(page.locator('.wdk-toc__link[aria-current="true"]')).toHaveCount(1);
  const startHref = await page.locator('.wdk-toc__link[aria-current="true"]').getAttribute('href');
  expect(startHref).toBeTruthy();
  const startIndex = headingIds.indexOf(startHref!.slice(1));
  expect(startIndex).toBe(0);

  // Scroll so the last heading sits well inside the scroll-spy's effective
  // intersection zone. scrollIntoViewIfNeeded() only scrolls the minimum
  // distance needed to make an element visible at all, which can leave it
  // near the viewport edge and outside the observer's shrunk rootMargin, so
  // scroll explicitly to put the heading near the top of the viewport.
  const lastId = headingIds[headingIds.length - 1];
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - 100);
  }, lastId);

  // Exactly one link remains active, and it corresponds to a later heading.
  await expect(async () => {
    const active = page.locator('.wdk-toc__link[aria-current="true"]');
    await expect(active).toHaveCount(1);
    const href = await active.getAttribute('href');
    expect(href).toBeTruthy();
    const index = headingIds.indexOf(href!.slice(1));
    expect(index).toBeGreaterThan(startIndex);
  }).toPass({ timeout: 5000 });
});

// Sanity check that the ReferenceLayout symbol rail picked up the same
// fixed-edge geometry (layout/padding only - its scroll-spy script is
// untouched and already covered by reference-layout.spec.js).
test('reference symbol rail is a fixed full-height column flush to the right screen edge', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  const rail = page.locator('.wdk-ref__rail');
  await expect(rail).toBeVisible();

  const box = await rail.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return { right: rect.right, position: style.position, paddingTop: parseFloat(style.paddingTop) };
  });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  expect(box.position).toBe('fixed');
  expect(box.right).toBeCloseTo(viewport!.width, 0);
  expect(box.paddingTop).toBeGreaterThan(0);
});
