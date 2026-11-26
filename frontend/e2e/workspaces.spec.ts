import { expect, test, type Page } from "@playwright/test";

// External assets (ESPN logos, live scoreboard) may be unreachable in CI; they are not app errors.
const IGNORED = /espncdn|site\.api\.espn\.com|ERR_TUNNEL|ERR_NAME|Failed to load resource|CORS/i;

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const PAGES: { path: string; expect: RegExp; name: string }[] = [
  { name: "command-center", path: "", expect: /Slate: model against the market/ },
  { name: "live", path: "live/", expect: /Games|No games in the current window/ },
  { name: "markets", path: "markets/", expect: /Home spread by sportsbook|No games/ },
  { name: "markets-totals", path: "markets/?tab=totals", expect: /Total|total/ },
  { name: "research-teams", path: "research/?tab=teams", expect: /Teams/ },
  { name: "research-players", path: "research/?tab=players", expect: /NBA players/ },
  { name: "research-compare", path: "research/?tab=compare", expect: /vs/ },
  { name: "picks", path: "picks/", expect: /Graded/ },
  { name: "picks-streaks", path: "picks/?tab=breakdown", expect: /Streaks & splits/ },
  { name: "model", path: "model/", expect: /Model versions/ },
  { name: "settings", path: "settings/", expect: /Display preferences/ },
];

for (const p of PAGES) {
  test(`${p.name} renders without errors`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.goto(p.path);
    await expect(page.locator("main")).toContainText(p.expect, { timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: info.outputPath(`${p.name}.png`) });
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("old routes redirect into workspaces", async ({ page }) => {
  await page.goto("spreads/");
  await expect(page).toHaveURL(/\/markets\/?$/);
  await page.goto("nba/");
  await expect(page).toHaveURL(/\/live\/?\?tab=nba/);
});

test("command palette finds a team and navigates", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "keyboard shortcut is a desktop affordance");
  await page.goto("");
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Jump to a game, team, player/);
  await expect(input).toBeVisible();
  await input.fill("Thunder");
  const teams = page.locator("[cmdk-group]").filter({ has: page.locator("[cmdk-group-heading]", { hasText: "Teams" }) });
  await teams.getByRole("option", { name: /Oklahoma City Thunder/ }).first().click();
  await expect(page).toHaveURL(/\/teams\/\d+/);
  await expect(page.locator("main")).toContainText("Oklahoma City Thunder");
});

test("theme toggle switches to light and persists", async ({ page }) => {
  await page.goto("");
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "");
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "");
});

test("streaks table expands a team row", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "row expansion checked once");
  await page.goto("picks/?tab=breakdown");
  await page.getByRole("button", { name: "Expand row" }).first().click();
  await expect(page.locator("main")).toContainText(/Results|Model by market|Last 10 forecasts/);
});

test("game page head-to-head tab and model residuals render", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "checked once");
  const errors = watchErrors(page);
  await page.goto("model/");
  await expect(page.locator("main")).toContainText("Residual analysis", { timeout: 20_000 });
  await page.goto("");
  await page.locator("main table tbody tr").first().click();
  await expect(page).toHaveURL(/\/games\/\d+/);
  await page.getByRole("tab", { name: "Head-to-head" }).click();
  await expect(page.locator("main")).toContainText(/previous meetings|No previous meetings/);
  expect(errors, errors.join("\n")).toEqual([]);
});
