// apps/docs/tests/doc-title.spec.js
// Verifies that DocLayout supplies exactly one h1 per doc page, drawn from
// the frontmatter title (since MDX bodies are authored starting at ##).
import { test, expect } from '@playwright/test';

test('doc page has exactly one h1 from frontmatter title', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const h1s = page.locator('main h1');
  await expect(h1s).toHaveCount(1);
  await expect(h1s.first()).toContainText('Quickstart');
});
