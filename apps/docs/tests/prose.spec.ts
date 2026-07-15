// apps/docs/tests/prose.spec.js
// Verifies that .wdk-doc__content prose styles are applied to rendered MDX
// bodies, and that the signature accent h2 underline motif is present.
import { test, expect } from '@playwright/test';

test('in-content h2 carries the accent underline motif', async ({ page }) => {
  // Use a standard DocLayout page (quickstart now uses QuickstartLayout).
  await page.goto('/introduction/what-is-wavelength-sdk/');

  // Confirm an in-content h2 exists (MDX bodies start at ##; h1 is injected
  // by DocLayout from frontmatter).
  const h2 = page.locator('.wdk-doc__content h2').first();
  await expect(h2).toBeVisible();

  // Assert the ::after pseudo-element has non-zero height (3px) and a
  // non-transparent background color - proving the accent underline is applied.
  const afterStyles = await page.evaluate(() => {
    const el = document.querySelector('.wdk-doc__content h2');
    if (!el) return null;
    const cs = getComputedStyle(el, '::after');
    return {
      content: cs.content,
      height: cs.height,
      background: cs.backgroundColor,
    };
  });

  expect(afterStyles).not.toBeNull();
  // content must not be 'none' (the pseudo must be present).
  expect(afterStyles!.content).not.toBe('none');
  // height must be 3px.
  expect(afterStyles!.height).toBe('3px');
  // background must not be fully transparent.
  expect(afterStyles!.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(afterStyles!.background).not.toBe('transparent');
});

test('in-content h2 uses display font and correct size', async ({ page }) => {
  // Use a standard DocLayout page (quickstart now uses QuickstartLayout).
  await page.goto('/introduction/what-is-wavelength-sdk/');

  const h2Styles = await page.evaluate(() => {
    const el = document.querySelector('.wdk-doc__content h2');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
    };
  });

  expect(h2Styles).not.toBeNull();
  // Must use the display font (Work Sans).
  expect(h2Styles!.fontFamily.toLowerCase()).toContain('work sans');
  // Font size must be >= 20px (1.25rem; we set 1.5rem = 24px).
  expect(parseFloat(h2Styles!.fontSize)).toBeGreaterThanOrEqual(20);
  // Font weight must be 600.
  expect(h2Styles!.fontWeight).toBe('600');
});

test('linked inline code is visually distinct from an unlinked code chip', async ({ page }) => {
  await page.goto('/guides/create-a-wallet/');

  const linkedCode = page.locator('.wdk-guide__content a[href*="WalletEngine"] code').first();
  const unlinkedCode = page.locator('.wdk-guide__content code').filter({ hasText: 'autoStart: true' }).first();

  await expect(linkedCode).toBeVisible();
  await expect(unlinkedCode).toBeVisible();
  expect(await linkedCode.evaluate((el) => getComputedStyle(el).color)).not.toBe(
    await unlinkedCode.evaluate((el) => getComputedStyle(el).color),
  );
  await expect(linkedCode.locator('..')).toHaveCSS('border-bottom-style', 'none');
});
