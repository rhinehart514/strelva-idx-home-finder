import { expect, test } from "@playwright/test";

test("buyer can search and preview an inquiry without a network handoff", async ({
  page,
}) => {
  const inquiryPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/inquiries")) {
      inquiryPosts.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Agency listing preview · Strelva Labs");
  await expect(page.getByText("Demonstration listings only.")).toBeVisible();

  await page.locator("#listing-query").fill("14216");
  await page.getByRole("button", { name: "Find homes" }).click();
  await expect(page.getByRole("heading", { name: "1 home" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "202 Example Avenue" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ask about this home" }).click();
  await expect(page.getByRole("dialog")).toContainText("Browser-only preview");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Preview inquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Inquiry previewed" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("stayed in your browser");
  expect(inquiryPosts).toEqual([]);
});
