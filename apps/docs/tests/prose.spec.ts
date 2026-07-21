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

test('quickstart prose link styling spares chrome that draws its own border', async ({ page }) => {
  // The prose link rules cover .wdk-qs__content, so components that are links
  // but not prose have to be excluded by class or their own borders lose to
  // this selector's specificity. Both live on the native quickstart: linked
  // Cards in the closing grid, and the page-actions menu.
  await page.goto('/native-ios-android/quickstart/');

  const card = page.locator('.wdk-qs__content a.wdk-card').first();
  await expect(card).toBeVisible();
  const cardBorders = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return (['Top', 'Right', 'Bottom', 'Left'] as const).map(
      (side) => `${cs[`border${side}Width`]} ${cs[`border${side}Style`]}`,
    );
  });
  // A dashed prose underline would make the bottom edge differ from the rest.
  expect(new Set(cardBorders).size).toBe(1);
  expect(cardBorders[0]).toBe('1px solid');

  const actionRow = page.locator('.wdk-qs__content a.wdk-page-actions__row').first();
  if (await actionRow.count()) {
    const style = await actionRow.evaluate((el) => getComputedStyle(el).borderBottomStyle);
    expect(style).not.toBe('dashed');
  }
});

test('quickstart lead-in spacing applies only to authored lead-in content', async ({ page }) => {
  // The rule targets content the page author put before the first step. The
  // layout's own header is always the first step's previous sibling, so an
  // unscoped selector would silently pad every quickstart.
  await page.goto('/web/get-started/quickstart/');
  const webFirstStep = page.locator('.wdk-qs__content .wdk-step').first();
  // This page opens directly with a Step: no lead-in, so no extra margin.
  expect(await webFirstStep.evaluate((el) => getComputedStyle(el).marginTop)).toBe('0px');

  await page.goto('/native-ios-android/quickstart/');
  const nativeFirstStep = page.locator('.wdk-qs__content .wdk-step').first();
  // This page opens with lead-in prose, so the gap is applied.
  expect(await nativeFirstStep.evaluate((el) => getComputedStyle(el).marginTop)).toBe('48px');
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
