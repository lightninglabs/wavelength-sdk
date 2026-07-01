import { expect, type Locator, type Page } from '@playwright/test';

export async function cssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

export async function goLight(page: Page): Promise<void> {
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme === 'light') return;
  const toggle = page.getByRole('button', { name: /theme/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
}

export interface BoxEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export async function edges(locator: Locator): Promise<BoxEdges> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
}

export function normHex(s: string): string {
  const trimmed = (s || '').trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(trimmed)
    ? `#${[...trimmed.slice(1)].map((c) => c + c).join('')}`
    : trimmed;
}
