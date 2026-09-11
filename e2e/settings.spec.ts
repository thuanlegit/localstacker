import { test, expect } from "./fixtures";

test.describe("Settings e2e", () => {
  test("settings entry, palette selection, theme toggle, and persistence", async ({
    page,
  }) => {
    await page.goto("/");

    const initialBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );

    // 1. Load app -> page.keyboard.press("Meta+,") -> expect tab bar text Settings visible and Appearance heading visible
    await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "ControlOrMeta+,");
    await expect(page.getByRole("tab", { name: /Settings/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();

    // 2. Click the Nord palette button -> expect html to have data-palette="nord" and body bg changes
    await page.getByRole("button", { name: "Nord" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "nord");

    const nordBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    expect(nordBg).not.toEqual(initialBg);

    // 3. Select Theme = Light -> html lacks class dark
    const themeTrigger = page.getByRole("combobox", { name: "Theme" });
    await themeTrigger.click();
    await page.getByRole("option", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // 4. Reload -> data-palette persists as nord (localStorage)
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "nord");
  });
});
