import { test, expect, type Page } from "@playwright/test";
import { installMockAppUser } from "./helpers/mockAppUser";
const first = {
  id: "11111111-3333-4333-8333-111111111111",
  business_name: "First Test Vendor",
  status: "not_contacted",
  priority: "medium",
  phone: "9999999999",
  category_id: "category",
  cluster_id: "cluster",
  created_at: "2026-11-13",
  crm_vendor_categories: { name: "Photography" },
  crm_clusters: { name: "Pune" },
  crm_sales_executives: null,
};
const second = {
  ...first,
  id: "22222222-3333-4333-8333-222222222222",
  business_name: "Second Test Vendor",
};
async function setup(page: Page) {
  await installMockAppUser(page, "admin");
  const state = {
    rows: [{ ...first }, { ...second }],
    deleted: [] as string[],
    fail: false,
  };
  await page.route("**/rest/v1/crm_vendors*", async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("id")?.replace("eq.", "");
    if (route.request().method() === "DELETE") {
      expect(id).toBeTruthy();
      expect(url.searchParams.get("id")).toBe(`eq.${id}`);
      if (state.fail)
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ message: "Delete denied" }),
        });
      state.deleted.push(id!);
      state.rows = state.rows.filter((row) => row.id !== id);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ id }),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      headers: {
        "content-range": `0-${Math.max(0, state.rows.length - 1)}/${state.rows.length}`,
      },
      body: JSON.stringify(
        id ? state.rows.find((row) => row.id === id) : state.rows,
      ),
    });
  });
  return state;
}

async function openDelete(page: Page) {
  await page
    .getByRole("button", {
      name: `Actions for ${first.business_name}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vendor actions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete vendor", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete this CRM vendor?", exact: true }),
  ).toBeVisible();
}

test("three-dot menu deletes one vendor and preserves bulk selection", async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/AdminCrmVendors");
  const actions = page.getByRole("button", {
    name: `Actions for ${first.business_name}`,
    exact: true,
  });
  await expect(actions).toBeVisible();
  await expect(page.getByText("Delete Vendor", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("page-loader")).toBeHidden();
  await actions.click();
  await expect(
    page.getByRole("heading", { name: "Vendor actions", exact: true }),
  ).toBeVisible();
  for (const name of [
    "Call vendor",
    "Change vendor status",
    "Edit vendor",
    "Delete vendor",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("actions-menu-mobile.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Delete vendor", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete this CRM vendor?", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("delete-confirm-mobile.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Cancel vendor deletion" }).click();
  expect(state.deleted).toEqual([]);
  await openDelete(page);
  await page.getByRole("button", { name: "Confirm delete vendor" }).click();
  await expect(actions).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Actions for ${second.business_name}`,
      exact: true,
    }),
  ).toBeVisible();
  expect(state.deleted).toEqual([first.id]);
  await page.getByLabel("Select vendors", { exact: true }).click();
  await page.getByText(second.business_name, { exact: true }).click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByText("Delete", { exact: true })).toBeVisible();
});

test("profile single delete redirects to list and scopes one ID", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto(`/AdminCrmVendorProfile?vendorId=${first.id}`);
  await page
    .getByRole("button", {
      name: `Delete vendor ${first.business_name}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Confirm delete vendor" }).click();
  await expect(page).toHaveURL(/\/AdminCrmVendors$/);
  expect(state.deleted).toEqual([first.id]);
  await expect(
    page.getByRole("button", {
      name: `Actions for ${second.business_name}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("failed single delete keeps the vendor and shows an error", async ({
  page,
}) => {
  const state = await setup(page);
  state.fail = true;
  await page.goto("/AdminCrmVendors");
  await openDelete(page);
  await page.getByRole("button", { name: "Confirm delete vendor" }).click();
  await expect(page.getByRole("alert")).toContainText("Delete denied");
  expect(state.deleted).toEqual([]);
  await page.getByRole("button", { name: "Cancel vendor deletion" }).click();
  await expect(
    page.getByRole("button", {
      name: `Actions for ${first.business_name}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("desktop actions dialog is compact and closes with Escape", async ({
  page,
}, info) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/AdminCrmVendors");
  await page
    .getByRole("button", {
      name: `Actions for ${first.business_name}`,
      exact: true,
    })
    .click();
  const heading = page.getByRole("heading", {
    name: "Vendor actions",
    exact: true,
  });
  await expect(heading).toBeVisible();
  const dialog = heading.locator("..").locator("..").locator("..");
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(440);
  expect(box!.x).toBeGreaterThan(400);
  await expect(page.getByTestId("page-loader")).toBeHidden();
  await page.screenshot({
    path: info.outputPath("actions-menu-desktop.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(heading).toHaveCount(0);
});
