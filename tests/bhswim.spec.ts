import { test, expect, Page } from "@playwright/test";
import { Product } from "./bhswim.type";
import fs from "fs";
import { sleep } from "./utils";

async function getProduct(page: Page): Promise<Product> {
  // Lấy tên sản phẩm
  const productTitle = await expect(page.locator(".product-name").locator("h1"))
    .toHaveCount(1)
    .then(async () => {
      return (
        (await page.locator(".product-name").locator("h1").textContent()) || ""
      );
    });

  console.log(productTitle);

  // Lấy slug của sản phẩm
  const handler = productTitle
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/'/g, "");

  // Lấy giá sản phẩm
  let productPrice: string | null = null;
  const priceLocator = page.locator(".product-price").locator("strong");
  await expect(priceLocator)
    .toHaveCount(1)
    .then(async () => {
      productPrice = (await priceLocator.innerText())
        .replace("₫", "")
        .replace(/\./g, "")
        .trim();
    })
    .catch(() => {
      productPrice = null;
    });

  // Lấy tên nhà sản xuất
  const manufacturer = await page
    .locator(".manufacturers")
    .locator(".value")
    .locator("a")
    .textContent();

  let quantity: number | null = null;
  try {
    // Chờ 1 giây để tránh trường hợp số lượng sản phẩm chưa được load
    await sleep(1000);

    // Lấy số lượng sản phẩm
    const stock = (
      await page.locator(".stock").locator(".value").innerText()
    ).split(" ");
    expect(stock).toHaveLength(3);
    quantity = Number(stock[0]);
  } catch (error) {
    quantity = null;
  }

  // Lấy mô tả ngắn
  let shortDescription: string | null = null;
  // Kiểm tra xem có mô tả ngắn không
  await expect(page.locator(".short-description"))
    .toHaveCount(1)
    .then(async () => {
      shortDescription = await page.locator(".short-description").textContent();
    })
    .catch(() => {
      shortDescription = null;
    });
  /**
   * Phân biệt kết quả khi sử dụng inner text, text content, all inner texts và all text contents:
   * - All inner texts: []
   * - All text contents: []
   * - Inner text: formatted text
   * - Text content: raw text
   */

  const descriptionLocator = page
    .getByRole("tabpanel", { name: "Thông tin sản phẩm" })
    .locator("div")
    .first();
  let description: string | null = null;
  await expect(descriptionLocator)
    .toHaveCount(1)
    .then(async () => {
      description = await page
        .getByRole("tabpanel", { name: "Thông tin sản phẩm" })
        .locator("div")
        .first()
        .innerText()
        .then((text) => text.trim());
    })
    .catch(() => {
      description = null;
    });

  // Lấy danh sách ảnh
  const imageLocators = await page.locator(".slick-track").locator("div").all();
  const imageSrcList: string[] = [];

  if (imageLocators.length > 0) {
    for (let locator of imageLocators) {
      const src = await locator
        .locator("a")
        .getAttribute("data-full-image-url");
      if (src) {
        imageSrcList.push(src);
      }
    }
  } else {
    const src = await page
      .locator("#sevenspikes-cloud-zoom")
      .locator("a")
      .getAttribute("data-full-image-url");
    if (src) {
      imageSrcList.push(src);
    }
  }

  // Lấy thông tin các options
  const options: Record<string, { required: boolean; values: string[] }> = {};

  const optionsLocator = page.locator(".attributes").locator("dl");
  const optionLabelLocator = await optionsLocator.locator("dt").all();
  const optionValueLocator = await optionsLocator.locator("dd").all();

  for (let i = 0; i < optionLabelLocator.length; i++) {
    const optionLabel = (
      (await optionLabelLocator[i].locator("label").textContent()) || ""
    ).trim();
    const required = !!optionLabelLocator[i].locator(".required");
    const optionValues = await optionValueLocator[i]
      .locator("ul")
      .locator("li")
      .all();
    const values: string[] = [];

    for (let optionValue of optionValues) {
      const value = (await optionValue.locator("label").innerText()).trim();

      if (value == "") {
        const style = await optionValue
          .locator(".attribute-square")
          .getAttribute("style");
        const hexCode =
          style?.match(/#[0-9a-fA-F]{6}/)?.[0] ||
          style?.match(/#[0-9a-fA-F]{3}/)?.[0] ||
          "";
        values.push(hexCode);
      } else {
        values.push(value);
      }
    }

    options[optionLabel] = { required, values };
  }

  // Tạo variant từ options
  const optionKeys = Object.keys(options);
  const optionValues = Object.values(options);

  const variants: {
    title: string;
    inventoryQuantity: number;
    // allowBackOrder: boolean;
    priceVnd: number | null;
    options: Record<string, string>;
    // manageInventory: boolean;
  }[] = [];
  if (optionKeys.length === 1) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      const title = optionValues[0].values[i];
      const allowBackOrder = false;
      const manageInventory = true;
      const priceVnd = productPrice ? Number(productPrice) : null;
      const options = {
        [optionKeys[0]]: optionValues[0].values[i],
      };
      const inventoryQuantity = quantity || 0;

      variants.push({
        title,
        inventoryQuantity,
        // allowBackOrder,
        priceVnd,
        options,
        // manageInventory,
      });
    }
  } else if (optionKeys.length === 2) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      for (let j = 0; j < optionValues[1].values.length; j++) {
        const title = `${optionValues[0].values[i]} / ${optionValues[1].values[j]}`;
        const inventoryQuantity = quantity || 0;
        const allowBackOrder = false;
        const manageInventory = true;
        const priceVnd = productPrice ? Number(productPrice) : null;
        const options = {
          [optionKeys[0]]: optionValues[0].values[i],
          [optionKeys[1]]: optionValues[1].values[j],
        };

        variants.push({
          title,
          inventoryQuantity,
          // allowBackOrder,
          priceVnd,
          options,
          // manageInventory,
        });
      }
    }
  }

  const product: Product = {
    handler,
    title: productTitle,
    priceVnd: productPrice ? Number(productPrice) : null,
    manufacturer: manufacturer || null,
    quantity: Number(quantity),
    status: "published",
    // discountable: true,
    shortDescription,
    description,
    thumbnail: imageSrcList[0],
    images: imageSrcList,
    variants: variants.length > 0 ? variants : null,
    options,
  };

  return product;
}

test("test", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const pageUrl = "https://bhswim.com";
  const categories = {
    newProducts: { name: "Sản phẩm mới", url: "/newproducts" },
  };
  const productPerPage: 20 | 30 | 50 = 20;
  const products: Product[] = [];
  const productUrl: string[] = [];

  // Mở trang web và chuyển đến trang danh sách sản phẩm
  await page.goto(pageUrl);
  await page
    .getByRole("link", { name: categories.newProducts.name })
    .first()
    .click();

  // Lấy số lượng trang sản phẩm
  const pageNumber = await page
    .getByRole("link", { name: " Cuối cùng" })
    .getAttribute("data-page");

  // Lấy danh sách sản phẩm trên từng trang
  for (let i = 1; i <= 1; i++) {
    const url =
      pageUrl +
      categories.newProducts.url +
      `?pagenumber=${i}&pagesize=${productPerPage}`;
    await page.goto(url);
    // Lấy danh sách url sản phẩm
    await expect(page.locator(".item-grid").locator(".item-box")).toHaveCount(
      productPerPage
    );
    const itemLocators = await page
      .locator(".item-grid")
      .locator(".item-box")
      .all();

    for (let item of itemLocators) {
      const url = await item.getByRole("link").first().getAttribute("href");
      if (url) {
        productUrl.push(url);
      }
    }
  }
  // Lấy thông tin sản phẩm
  // for (let url of productUrl) {
  await page.goto(pageUrl + productUrl[0]);
  const product = await getProduct(page);
  products.push(product);
  // }

  fs.writeFileSync("san-pham-moi.txt", JSON.stringify(products));
});
