# API Link Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent, subtle links for documented SDK symbols in reference components and curated guide prose.

**Architecture:** A typed symbol registry owns symbol-to-route mapping. `ApiLink` consumes that registry for intentional prose links, while `ParamsTable` and `Returns` use it automatically for simple named types. Content changes add only first-mention links in high-value onboarding and guide prose.

**Tech Stack:** Astro, MDX, TypeScript, Astro Playwright tests, CSS custom properties.

## Global Constraints

- Do not link code blocks or every repeated prose occurrence.
- Preserve primitive, union, function, and unknown type labels as plain code.
- Keep linked badges subtle and keyboard-accessible.
- Do not introduce em dashes into repository content.

---

### Task 1: Add registry resolution tests

**Files:**
- Create: `apps/docs/src/config/api-links.test.ts`
- Test: `apps/docs/src/config/api-links.test.ts`

- [ ] **Step 1: Write failing tests** for core, web, React Native, and React symbol routes, plus unknown and compound labels.
- [ ] **Step 2: Run the test** with `node --test apps/docs/src/config/api-links.test.ts`; confirm failure because the registry module does not exist.

### Task 2: Implement the typed registry and prose link component

**Files:**
- Create: `apps/docs/src/config/api-links.ts`
- Create: `apps/docs/src/components/mdx/ApiLink.astro`
- Modify: `apps/docs/src/content.config.ts` only if MDX component registration requires it.

- [ ] **Step 1: Implement the registry** with explicit symbol routes and a resolver that returns `undefined` for primitives, compound types, or unknown labels.
- [ ] **Step 2: Implement `ApiLink`** with `symbol`, optional `label`, and optional `page` props. Use a code label by default and render an ordinary prose link.
- [ ] **Step 3: Run the registry tests** and confirm they pass.

### Task 3: Integrate automatic links in reference components

**Files:**
- Modify: `apps/docs/src/components/mdx/ParamsTable.astro`
- Modify: `apps/docs/src/components/mdx/Returns.astro`
- Modify: `apps/docs/src/styles/theme.css` or component-local styles as needed.

- [ ] **Step 1: Add failing rendering assertions** for linked named types and plain compound/primitive types.
- [ ] **Step 2: Run the targeted docs test** and confirm failure.
- [ ] **Step 3: Resolve simple type labels through the registry** and preserve existing markup for non-linkable labels.
- [ ] **Step 4: Add subtle underline and focus styles** for linked badges and return labels.
- [ ] **Step 5: Run targeted tests** and confirm pass.

### Task 4: Add curated prose links

**Files:**
- Modify: reference introductions in `apps/docs/src/content/docs/reference/*.mdx`
- Modify: `apps/docs/src/content/docs/guides/create-a-wallet.mdx`
- Modify: `apps/docs/src/content/docs/guides/show-balance-and-activity.mdx`
- Modify: `apps/docs/src/content/docs/guides/handle-phases-and-errors.mdx`
- Modify: `apps/docs/src/content/docs/guides/send-a-payment.mdx`
- Modify: `apps/docs/src/content/docs/guides/use-a-passkey.mdx`
- Modify: web and React Native quickstarts.

- [ ] **Step 1: Replace only high-value first mentions** with `ApiLink`.
- [ ] **Step 2: Leave repeated mentions, generic method words, and code fences unchanged.**
- [ ] **Step 3: Run a repository scan** to verify the selected terms now have intentional links.

### Task 5: Verify the docs app

- [ ] **Step 1:** Run `pnpm --filter @lightninglabs/walletdk-docs typecheck`.
- [ ] **Step 2:** Run `pnpm --filter @lightninglabs/walletdk-docs build`.
- [ ] **Step 3:** Run relevant Playwright tests for reference layout and MDX components.
- [ ] **Step 4:** Review the final diff for accidental links, em dashes, and unrelated changes.
