import { expect, test as base } from "@playwright/test";

/**
 * Shared fixture: every existing spec is a launch with onboarding already
 * completed, so the first-run overlay never covers the shell under test.
 * `e2e/onboarding.spec.ts` imports from `@playwright/test` directly to get a
 * genuine fresh-context first launch.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "localstacker.onboarding",
        JSON.stringify({ state: { completedAt: 1 }, version: 0 }),
      );
    });
    await use(page);
  },
});

export { expect };
