import { test, expect, Page } from "@playwright/test";
import { RawProduct } from "./bhswim.type";
import fs from "fs";
import { convertJsonToCsvManually, convertJsonToCsv, convertRawToMedusaProduct, sleep } from "./utils";

async function getProduct(page: Page): Promise<RawProduct> {
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
  const options: Record<
    string,
    {
      required: boolean;
      values: {
        label: string;
        value: string;
      }[];
    }
  > = {};

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
    const values: { label: string; value: string }[] = [];

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

        const label =
          (await optionValue.locator("span").first().getAttribute("title")) ||
          "";
        values.push({ label, value: hexCode });
      } else {
        const label = value;
        values.push({ label, value });
      }
    }

    options[optionLabel] = { required, values };
  }

  // Tạo variant từ options
  const optionKeys = Object.keys(options);
  const optionValues = Object.values(options);

  const variants: {
    title: string;
    inventoryQuantity: number | null;
    priceVnd: number | null;
    options: Record<string, { label: string; value: string }>;
    // allowBackOrder: boolean;
    manageInventory: boolean;
  }[] = [];

  if (optionKeys.length === 1) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      const title = optionValues[0].values[i].label;
      const allowBackOrder = false;
      const manageInventory = true;
      const priceVnd = productPrice ? Number(productPrice) : null;
      const options = {
        [optionKeys[0]]: optionValues[0].values[i],
      };
      await page
        .getByTitle(optionValues[0].values[i].label)
        .locator("span")
        .click();
      await sleep(500);
      const inventoryQuantity = Number(
        (await page.locator(".stock").locator(".value").innerText()).split(
          " "
        )[0]
      );

      variants.push({
        title,
        inventoryQuantity,
        priceVnd,
        options,
        // allowBackOrder,
        manageInventory,
      });
    }
  } else if (optionKeys.length === 2) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      for (let j = 0; j < optionValues[1].values.length; j++) {
        const title = `${optionValues[0].values[i].label} / ${optionValues[1].values[j].label}`;
        const allowBackOrder = false;
        const manageInventory = true;
        const priceVnd = productPrice ? Number(productPrice) : null;
        const options = {
          [optionKeys[0]]: optionValues[0].values[i],
          [optionKeys[1]]: optionValues[1].values[j],
        };
        await page
          .getByTitle(optionValues[0].values[i].label)
          .locator("span")
          .click();

        let inventoryQuantity: number | null = null;
        await expect(
          page.getByText(optionValues[1].values[j].label, { exact: true })
        )
          .toBeEnabled()
          .then(async () => {
            await page
              .getByText(optionValues[1].values[j].label, { exact: true })
              .click();
            await sleep(500);
            inventoryQuantity = Number(
              (
                await page.locator(".stock").locator(".value").innerText()
              ).split(" ")[0]
            );
          }).catch(() => {});

        variants.push({
          title,
          inventoryQuantity,
          priceVnd,
          options,
          // allowBackOrder,
          manageInventory,
        });
      }
    }
  }

  const product: RawProduct = {
    handler,
    title: productTitle,
    priceVnd: productPrice ? Number(productPrice) : null,
    manufacturer: manufacturer || null,
    quantity: Number(quantity),
    shortDescription,
    description,
    thumbnail: imageSrcList[0],
    images: imageSrcList,
    variants: variants.length > 0 ? variants : null,
    options,
    status: "published",
    // discountable: true,
  };

  return product;
}

test("crawl", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const pageUrl = "https://bhswim.com";
  const categories = {
    newProducts: { name: "Sản phẩm mới", url: "/newproducts" },
  };
  const productPerPage: 20 | 30 | 50 = 20;
  const products: RawProduct[] = [];
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
    await page.goto(url, { timeout: 10000 });
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
  await page.goto(pageUrl + productUrl[6]);
  const product = await getProduct(page);
  products.push(product);
  // }

  const convertedData = convertRawToMedusaProduct(products[0]);
  fs.writeFileSync("san-pham-moi.json", JSON.stringify(convertedData));
  convertJsonToCsv();
});

test("lay-ton-kho", async ({ page }) => {
  await page.goto(
    "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-l%E1%BB%ADng-nam-arena-ast22182-42cm-2"
  );
  const stock = (
    await page.locator(".stock").locator(".value").innerText()
  ).split(" ");
  expect(stock).toHaveLength(3);
  const quantity = Number(stock[0]);
  console.log(quantity);

  (await page.locator(".attributes").locator("dd").all())[1]
    .locator("li")
    .first()
    .locator("label")
    .click();

  await sleep(500);
  const stock2 = (
    await page.locator(".stock").locator(".value").innerText()
  ).split(" ");
  expect(stock2).toHaveLength(3);
  const quantity2 = Number(stock2[0]);
  console.log(quantity2);
  await sleep(5000);
});
