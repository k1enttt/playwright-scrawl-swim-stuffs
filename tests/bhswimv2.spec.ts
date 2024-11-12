import test, { expect, Page } from "@playwright/test";
import {
  constaint,
  convertProductToMedusaProductV2,
  exportCrawlFiles,
  getNumberOfPages,
  removeDiacritics,
  removeOthers,
} from "./utils";
import { RawProduct } from "./bhswim.type";
import fs from "fs";
import { MedusaProductV2, Product } from "./bhswimv2.type";
import {
  create_product,
  createLocationLevel,
  getAccessToken,
  listInventoryItems,
  listLocationLevels,
  listProductCategories,
  listProducts,
} from "./api";

/**
 * Lấy tất cả url manufacturer từ trang web
 */
test("Step 1 - Lấy danh sách manufacturer", async ({ page }) => {
  const url = "https://bhswim.com/manufacturer/all";

  // Mở trang web
  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });

  const manufacturerLocators = await page
    .locator(".manufacturer-list-page")
    .first()
    .locator(".item-box")
    .all();

  // Lấy danh sách manufacturer
  const manufacturers: { name: string; url: string }[] = [];

  for (const locator of manufacturerLocators) {
    const name = await locator.locator("a").first().innerText();
    const url = (await locator.locator("a").first().getAttribute("href")) || "";
    manufacturers.push({ name, url });
  }

  // Lưu danh sách vào file manufacturer.json
  fs.writeFileSync(
    "./output/v2/1_manufacturer.json",
    JSON.stringify(manufacturers)
  );
});

/**
 * Lấy tất cả url sản phẩm từ manufacturer
 */
test("Step 2 - Lấy danh sách sản phẩm từ manufacturer", async ({ page }) => {
  test.setTimeout(6 * 60 * 60 * 1000);
  const inputFilePath = "./output/v2/1_manufacturer.json";
  const outputFilePath = "./output/v2/2_product-urls.json";

  /**
   * Lấy tất cả url sản phẩm của một manufacturer
   *  */
  async function getUrlList({
    url,
    manufacturer,
  }: {
    url: string;
    manufacturer: string;
  }): Promise<
    {
      productUrl: string;
      manufacturer: string;
    }[]
  > {
    function updateCrawlFile(status: {
      manufacturer: string;
      page: number;
      productUrl: string;
    }) {
      // Lưu danh sách vào file products-{manufacturer_name}.json
      fs.writeFileSync(
        `./output/crawl-by-manufacturers/step2-status.json`,
        JSON.stringify(status)
      );
    }

    // Mở trang web
    await page.goto(url + `?viewmode=grid`, { waitUntil: "domcontentloaded" });

    // Lấy số trang sản phẩm
    let numberOfPages = (await getNumberOfPages(page)).toString();

    // Lấy tất cả url sản phẩm
    const products: {
      productUrl: string;
      manufacturer: string;
    }[] = [];

    for (let i = 1; i <= Number(numberOfPages); i++) {
      // Chuyển trang sản phẩm
      await page.goto(url + `?pagenumber=${i}&viewmode=grid`, {
        waitUntil: "domcontentloaded",
      });

      // Lấy danh sách url sản phẩm
      const itemLocators = await page
        .locator(".products-container")
        .locator(".item-box")
        .all();
      const promises = itemLocators.map(async (item, index) => {
        await item
          .locator(".details")
          .locator("a")
          .first()
          .getAttribute("href", { timeout: 5000 })
          .then(async (url) => {
            if (url) {
              products.push({ productUrl: url, manufacturer });
            }
          })
          .catch(async () => {
            console.log(
              `Error: Không lấy được url sản phẩm - Trang: ${i} - Sản phẩm thứ ${index}`
            );
            throw `Error: Không lấy được url sản phẩm - Trang: ${i} - Sản phẩm thứ ${index}`;
          });
      });
      await Promise.all(promises);
    }
    return products;
  }

  const baseUrl = "https://bhswim.com";

  // Đọc url của từng manufacturer trong file /output/crawl-by-manufacturers/manufacturer.json
  const fileData = fs.readFileSync(inputFilePath, "utf-8");
  const manufacturers = JSON.parse(fileData) as { name: string; url: string }[];

  const productUrls: {
    productUrl: string;
    manufacturer: string;
  }[] = [];

  for (const manufacturer of manufacturers) {
    const urlList = await getUrlList({
      url: baseUrl + manufacturer.url,
      manufacturer: manufacturer.name,
    });
    productUrls.push(...urlList);
    fs.writeFileSync(outputFilePath, JSON.stringify(productUrls));
  }
});

/**
 * Lấy dữ liệu sản phẩm từ danh sách url sản phẩm
 */
test("Step 3 - Lấy dữ liệu sản phẩm từ danh sách url sản phẩm", async ({
  page,
}) => {
  test.setTimeout(6 * 60 * 60 * 1000);
  const inputFilePath = "./output/v2/2_product-urls.json";
  const outputFilePath = "./output/v2/3_product-details.json";
  const processFilePath = "./output/v2/3_process.json";

  const baseUrl = "https://bhswim.com";

  function saveCrawlStatus(status: {
    manufacturer: string;
    productIndex: string;
    productUrl: string;
  }) {
    fs.writeFileSync(processFilePath, JSON.stringify(status));
  }

  // Đọc danh sách url sản phẩm từ file /output/crawl-by-manufacturers/product-urls.json
  const fileData = fs.readFileSync(inputFilePath, "utf-8");
  const productUrls = JSON.parse(fileData) as {
    productUrl: string;
    manufacturer: string;
  }[];

  // Lấy dữ liệu sản phẩm từ từng url
  const products: RawProduct[] = [];
  for (let i = 650; i < productUrls.length; i++) {
    const productVariants = await getProduct(
      page,
      baseUrl + productUrls[i].productUrl,
      productUrls[i].manufacturer
    );
    products.push(...productVariants);

    // Lưu dữ liệu thô
    fs.writeFileSync(outputFilePath, JSON.stringify(products));

    // Lưu quá trình crawl
    saveCrawlStatus({
      manufacturer: productUrls[i].manufacturer,
      productIndex: `${i} / ${productUrls.length}`,
      productUrl: productUrls[i].productUrl,
    });
  }
});

test("Step 4 - Nhóm các variant theo sản phẩm", async () => {
  const inputFilePath = "./output/v2/3_product-details.json";
  const outputFilePath = "./output/v2/4_products.json";
  const products = [] as Product[];

  // Đọc dữ liệu sản phẩm từ file
  const fileData = fs.readFileSync(inputFilePath, "utf-8");
  const productVariants = JSON.parse(fileData) as RawProduct[];

  // Nhóm các variant theo sản phẩm
  productVariants.forEach((product_variant) => {
    const productIndex = products.findIndex(
      (product) => product.handle === product_variant.handle
    );
    if (productIndex === -1) {
      products.push({
        handle: product_variant.handle,
        title: product_variant.title,
        manufacturer: product_variant.manufacturer,
        category: product_variant.category,
        status: product_variant.status,
        discountable: product_variant.discountable,
        shortDescription: product_variant.shortDescription,
        description: product_variant.description,
        thumbnail: product_variant.thumbnail,
        images: product_variant.images,
        priceVnd: product_variant.priceVnd,
        variants: product_variant.variant
          ? [
              {
                title: product_variant.variant.title || product_variant.title,
                inventoryQuantity: product_variant.variant.inventoryQuantity,
                priceVnd: product_variant.variant.priceVnd,
                options: product_variant.variant.options,
                manageInventory: product_variant.variant.manageInventory,
                allowBackOrder: product_variant.variant.allowBackOrder,
              },
            ]
          : null,
      });
    } else {
      if (products[productIndex].variants && product_variant.variant) {
        products[productIndex].variants.push({
          title: product_variant.variant.title,
          inventoryQuantity: product_variant.variant.inventoryQuantity,
          priceVnd: product_variant.variant.priceVnd,
          options: product_variant.variant.options,
          manageInventory: product_variant.variant.manageInventory,
          allowBackOrder: product_variant.variant.allowBackOrder,
        });
      }
    }
  });

  // Lưu dữ liệu sản phẩm
  fs.writeFileSync(outputFilePath, JSON.stringify(products));
});

test("Step 5 - Nạp sản phẩm vào Admin", async () => {
  const inputFilePath = "./output/v2/4_products.json";
  const outputFilePath = "./output/v2/5_standard-products.json";
  const processFilePath = "./output/v2/5_process.json";

  // Đọc dữ liệu sản phẩm từ file
  const fileData = fs.readFileSync(inputFilePath, "utf-8");
  const products = JSON.parse(fileData) as Product[];

  // Chuyển dữ liệu thô thành dữ liệu chuẩn
  const token = (await getAccessToken()).token;
  const newProducts = [] as MedusaProductV2[];

  for (let product of products) {
    console.log("Info: " + product.title);
    const newProduct = await convertProductToMedusaProductV2(token, product);
    // Kiểm tra sản phẩm đã tồn tại hay chưa
    const existedProducts = (await listProducts(token)).products;
    const isExisted = existedProducts.find(
      (p) => p.handle === newProduct.handle
    );

    if (!isExisted) {
      await create_product(token, newProduct);
    } else {
      console.log("Info: Product is existed");
    }

    // Tìm các inventory items có sku trùng với sku của variant
    const existedInventoryItemIds: {
      id: string;
      sku: string;
    }[] = [];
    if (!isExisted) {
      const variant_skus: string[] = [];
      newProduct.variants?.forEach((variant) => {
        variant_skus.push(variant.sku);
      });
      const productCategories = (await listInventoryItems(token))
        .inventory_items;

      productCategories.forEach((inventory_item) => {
        if (variant_skus.includes(inventory_item.sku)) {
          existedInventoryItemIds.push({
            id: inventory_item.id,
            sku: inventory_item.sku,
          });
        }
      });
    }

    if (!isExisted) {
      // Tạo location levels cho inventory items đã tìm được
      for (let inventoryItemId of existedInventoryItemIds) {
        const locationLevels = (
          await listLocationLevels(token, inventoryItemId.id)
        ).inventory_levels;

        if (locationLevels.length === 0) {
          const variantTitle =
            newProduct.variants?.find(
              (variant) => variant.sku === inventoryItemId.sku
            )?.title || "";
          const stocked_quantity =
            product.variants?.find((variant) => variant.title === variantTitle)
              ?.inventoryQuantity || 0;

          await createLocationLevel(
            token,
            inventoryItemId.id,
            stocked_quantity
          );
        } else {
          console.log("Info: Location levels is existed");
        }
      }
    }

    newProducts.push(newProduct);
    fs.writeFileSync(processFilePath, JSON.stringify(product.title));
  }

  // Lưu dữ liệu chuẩn
  fs.writeFileSync(outputFilePath, JSON.stringify(newProducts));
});

async function getProductTitle(page: Page, productUrl: string) {
  return (
    await page
      .locator(".product-name")
      .locator("h1")
      .innerText({ timeout: 5000 })
      .catch(() => {
        throw `Không lấy được title, ${productUrl}`;
      })
  ).trim();
}

function getProductHandle(title: string) {
  return removeOthers(
    removeDiacritics(
      title.toLowerCase().trim().replace(/\s+/g, " ").replace(/ /g, "-")
    )
  );
}

async function getProductCategory(page: Page, productUrl: string) {
  const categories: string[] = [];
  const categoryLocators = await page.locator(".breadcrumb").locator("a").all();

  const promises = categoryLocators.map(async (locator, index) => {
    const label = await locator
      .locator("span")
      .innerText({ timeout: 5000 })
      .catch(() => {
        throw `Không lấy được label của category, ${productUrl}`;
      });

    const url = await locator
      .getAttribute("href", { timeout: 5000 })
      .catch(() => {
        throw `Không lấy được url của category, ${productUrl}`;
      });

    // Lấy category nếu không phải là trang chủ
    if (url != "/") {
      categories.push(label);
    }
  });
  await Promise.all(promises);
  return categories.join(",");
}

async function getProductShortDescription(page: Page) {
  let shortDescription: string = "";
  const haveShortDescription = await expect(page.locator(".short-description"))
    .toHaveCount(1, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (haveShortDescription) {
    shortDescription = (await page.locator(".short-description").innerText())
      .toString()
      .replace("/\n/g", " ")
      .trim();
  }
  return shortDescription;
}

async function getProductDescription(page: Page) {
  let description: string = "";

  const haveFullDescription = await expect(
    page.getByRole("tabpanel", { name: "Thông tin sản phẩm" })
  )
    .toHaveCount(1, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (haveFullDescription) {
    description =
      (await page
        .getByRole("tabpanel", { name: "Thông tin sản phẩm" })
        .locator("div")
        .first()
        .textContent()) || "";
  }

  if (description) {
    description = description.replace(/"/g, '"').trim();
  }
  return description;
}

async function getProductImages(page: Page) {
  const imageLocators = await page.locator(".slick-track").locator("div").all();
  const imageSrcList: string[] = [];

  if (imageLocators.length > 0) {
    for (let locator of imageLocators) {
      const src = await locator
        .locator("a")
        .getAttribute("data-full-image-url", { timeout: 5000 })
        .catch(() => null);
      if (src) {
        imageSrcList.push(src);
      }
    }
  } else {
    const src = await page
      .locator("#sevenspikes-cloud-zoom")
      .locator("a")
      .getAttribute("data-full-image-url", { timeout: 5000 })
      .catch(() => null);
    if (src) {
      imageSrcList.push(src);
    }
  }
  return imageSrcList;
}

async function getProductPrice(page: Page) {
  let price: string | null = null;
  const priceLocator = page.locator(".product-price").locator("strong");

  const isVisiblePrice = await expect(priceLocator)
    .toHaveCount(1, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (isVisiblePrice) {
    price = (await priceLocator.innerText())
      .replace("₫", "")
      .replace(/\./g, "")
      .trim();
  }
  return Number(price);
}

async function getProductOptions(page: Page) {
  const options: Record<string, Option> = {};

  const optionsLocator = page.locator(".attributes").locator("dl");
  const optionLabelLocator = await optionsLocator.locator("dt").all();
  const optionValueLocator = await optionsLocator.locator("dd").all();

  for (let i = 0; i < optionLabelLocator.length; i++) {
    const optionLabel = (
      (await optionLabelLocator[i].locator("label").textContent()) || ""
    ).trim();
    const optionValues = await optionValueLocator[i]
      .locator("ul")
      .locator("li")
      .all();
    const values: string[] = [];
    let type: "squareWithLabel" | "squareWithImage" | "circle" =
      "squareWithLabel";

    for (let optionValue of optionValues) {
      let label = (await optionValue.locator("label").innerText()).trim();

      // Trường hợp option màu sắc
      if (label == "") {
        type = "squareWithLabel";
        label =
          (await optionValue.locator("span").first().getAttribute("title")) ||
          "";

        // Trường hợp option màu sắc có tên ở thẻ tooltip
        // Option này có hình hiện lên khi trỏ vào
        if (label == "") {
          type = "squareWithImage";
          label = await optionValue.locator(".tooltip-header").innerText();
        }
        values.push(label);
      } else {
        type = "circle";
        values.push(label);
      }
    }

    options[optionLabel] = {
      type,
      values,
    };
  }

  return options;
}

async function getProductInventoryQuantity(page: Page) {
  let stock = 0;

  // Kiểm tra trạng thái kho có được hiển thị hay không
  const isVisibleStock = await expect(page.locator(".stock").locator(".value"))
    .toHaveCount(1, {
      timeout: 5000,
    })
    .then(() => true)
    .catch(() => false);

  // Kiểm tra số lượng tồn kho có được hiển thị hay không
  if (isVisibleStock) {
    const inStock = await expect(page.locator(".stock").locator(".value"))
      .toHaveText(/^[0-9].*/, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (inStock) {
      stock = Number(
        (await page.locator(".stock").locator(".value").innerText()).split(
          " "
        )[0]
      );
    } else {
      // Hiện trạng thái kho nhưng không hiện số lượng tồn
      stock = 0;
    }
  } else {
    // Không hiện trạng thái kho
    stock = 0;
  }
  return stock;
}

async function getProductVariant({
  page,
  handle,
  productTitle,
  priceVnd,
  category,
  manufacturer,
  shortDescription,
  description,
  thumbnail,
  images,
  discountable,
  inventoryQuantity,
  options,
  status,
  manageInventory,
  allowBackOrder,
}: {
  page: Page;
  handle: string;
  productTitle: string;
  priceVnd: number;
  category: string;
  manufacturer: string;
  shortDescription: string;
  description: string;
  thumbnail: string;
  images: string[];
  discountable: boolean;
  inventoryQuantity: number;
  options: Record<string, Option>;
  status: "draft" | "proposed" | "published" | "rejected";
  manageInventory: boolean;
  allowBackOrder: boolean;
}) {
  const products: RawProduct[] = [];

  // Tạo variant từ options
  const optionKeys = Object.keys(options);
  const optionValues = Object.values(options);

  if (optionKeys.length === 0) {
    products.push({
      handle,
      title: productTitle,
      priceVnd,
      category,
      manufacturer,
      shortDescription,
      description,
      thumbnail,
      images,
      variant: {
        title: productTitle,
        inventoryQuantity,
        priceVnd,
        options: {},
        manageInventory,
        allowBackOrder,
      },
      status,
      discountable,
    });
  } else if (optionKeys.length === 1) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      const { variantTitle, inventoryQuantity, options } =
        await getSingleOptionVariant(page, optionKeys, optionValues, {
          optionValue: optionValues[0].values[i],
          valueIndex: i.toString(),
        });

      products.push({
        handle,
        title: productTitle,
        priceVnd,
        category,
        manufacturer,
        shortDescription,
        description,
        thumbnail,
        images,
        variant: {
          title: variantTitle,
          inventoryQuantity,
          priceVnd,
          options,
          manageInventory,
          allowBackOrder,
        },
        status,
        discountable,
      });
    }
  } else if (optionKeys.length === 2) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      for (let j = 0; j < optionValues[1].values.length; j++) {
        const { variantTitle, inventoryQuantity, options } =
          await getCoupleOptionVariant(page, optionKeys, optionValues, i, j);

        products.push({
          handle,
          title: productTitle,
          priceVnd,
          category,
          manufacturer,
          shortDescription,
          description,
          thumbnail,
          images,
          variant: {
            title: variantTitle,
            inventoryQuantity,
            priceVnd,
            options,
            manageInventory,
            allowBackOrder,
          },
          status,
          discountable,
        });
      }
    }
  }

  return products;
}

async function getProduct(
  page: Page,
  productUrl: string,
  manufacturer: string
) {
  // Mở trang web
  await page.goto(productUrl, {
    waitUntil: "domcontentloaded",
  });

  const title = await getProductTitle(page, productUrl);
  const handle = getProductHandle(title);
  const category: string = await getProductCategory(page, productUrl);
  const shortDescription: string = await getProductShortDescription(page);
  const description: string = await getProductDescription(page);
  const images: string[] = await getProductImages(page);
  const thumbnail: string = images[0];
  const priceVnd: number = await getProductPrice(page);
  const inventoryQuantity: number = await getProductInventoryQuantity(page);
  const options: Record<string, Option> = await getProductOptions(page);
  const variantList: RawProduct[] = await getProductVariant({
    page,
    handle,
    productTitle: title,
    manufacturer,
    category,
    shortDescription,
    description,
    thumbnail,
    images,
    priceVnd,
    options,
    inventoryQuantity,
    status: "published",
    discountable: true,
    manageInventory: true,
    allowBackOrder: false,
  });
  return variantList;
}

type Option = {
  type: "squareWithLabel" | "squareWithImage" | "circle";
  values: string[];
};

/**
 * Retrieves the variant details for a given product option.
 *
 * @param optionValue - The value of the option to be selected.
 * @param numberOfOption - The total number of options available.
 * @param optionIndex - The index of the option in the list of options, this can be leave empty if `numberOfOption = 1` .
 * @param valueIndex - The index of value of the first option, it's used for square option with image or 'squareWithImage' option type
 *
 * @returns A promise that resolves to an object containing the variant details:
 * - `title`: The title of the variant.
 * - `inventoryQuantity`: The quantity of the variant available in stock.
 * - `priceVnd`: The price of the variant in VND.
 * - `options`: An object representing the selected options.
 */
async function getSingleOptionVariant(
  page: Page,
  optionKeys: string[],
  optionValues: Option[],
  params: {
    optionValue: string;
    valueIndex: string;
  }
) {
  const { optionValue } = params;
  let variantTitle = optionValue;
  let inventoryQuantity: number | null = null;
  let options = {
    [optionKeys[0]]: optionValue,
  };

  if (optionValues[0].type == "squareWithLabel") {
    // Option màu sắc có label
    const childLocator = page.getByTitle(optionValue, {
      exact: true,
    });
    const isDisabledOption =
      (await page
        .locator(".attributes")
        .locator("label")
        .filter({ has: childLocator })
        .locator("input")
        .getAttribute("disabled", { timeout: 5000 })) != null;

    if (!isDisabledOption) {
      // Chờ response trả về từ server sau khi click vào option
      const reponsePromise = page
        .waitForResponse(
          (resp) =>
            resp
              .url()
              .includes("/shoppingcart/productdetails_attributechange") &&
            resp.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => null);

      // Click vào option và chờ response trả về với status 200
      await page
        .locator(".product-essential")
        .getByTitle(optionValue, { exact: true })
        .locator("span")
        .click({ timeout: 5000 });
      const response = await reponsePromise;

      // Lấy số lượng sản phẩm nếu có response 200 từ server
      inventoryQuantity = response
        ? await getProductInventoryQuantity(page)
        : 0;
    } else {
      inventoryQuantity = 0;
      console.log("Option bị disable");
    }
  } else if (optionValues[0].type == "squareWithImage") {
    // Trường hợp option có label và value rỗng
    // Ví dụ: https://bhswim.com/%C3%A1o-b%C6%A1i-thi-%C4%91%E1%BA%A5u-n%E1%BB%AF-tyr-womens-avictor-20-exolon-closed-back-swimsuit

    variantTitle = await page
      .locator(".attributes")
      .locator("li")
      .filter({ has: page.getByText(optionValue, { exact: true }) })
      .locator(".tooltip-header")
      .innerText();
    options = {};
    options[optionKeys[0]] = variantTitle;

    // Kiểm tra option có disabled hay không
    const inputLocator = page
      .locator(".attributes")
      .locator("li")
      .filter({ has: page.getByText(optionValue, { exact: true }) })
      .getByRole("radio")
      .first();
    const isDisabledOption =
      (await inputLocator.getAttribute("disabled", {
        timeout: 5000,
      })) != null;

    // Click vào option nếu option không bị disable
    if (!isDisabledOption) {
      // Chờ response trả về từ server sau khi click vào option
      const reponsePromise = page
        .waitForResponse(
          (resp) =>
            resp
              .url()
              .includes("/shoppingcart/productdetails_attributechange") &&
            resp.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => null);

      // Click vào option và chờ response trả về với status 200
      const buttonLocator = page
        .locator(".attributes")
        .first()
        .locator("li")
        .filter({ has: page.getByText(optionValue, { exact: true }) })
        .locator("span")
        .last();
      await buttonLocator.click({ timeout: 5000 });
      const response = await reponsePromise;

      // Lấy số lượng sản phẩm nếu có response 200 từ server
      inventoryQuantity = response
        ? await getProductInventoryQuantity(page)
        : 0;
    } else {
      inventoryQuantity = 0;
      console.log("Option bị disable");
    }
  } else {
    //** Trường hợp option có dạng tròn */
    await expect(page.getByText(optionValue, { exact: true }))
      .toBeEnabled()
      .then(async () => {
        // Chờ response trả về từ server sau khi click vào option
        const reponsePromise = page
          .waitForResponse(
            (resp) =>
              resp
                .url()
                .includes("/shoppingcart/productdetails_attributechange") &&
              resp.status() === 200,
            { timeout: 10000 }
          )
          .catch(() => null);

        // Click vào option và chờ response trả về với status 200
        await page
          .getByText(optionValue, { exact: true })
          .click({ timeout: 5000 });
        const response = await reponsePromise;

        // Lấy số lượng sản phẩm nếu có response 200 từ server
        inventoryQuantity = response
          ? await getProductInventoryQuantity(page)
          : 0;
      })
      .catch(() => {
        inventoryQuantity = 0;
        console.log("Không click được option", variantTitle);
      });
  }
  return {
    variantTitle,
    inventoryQuantity,
    options,
  };
}

/**
 * Lấy tên và số lượng của option bằng việc click vào option
 * @param index Thứ tự của option, mỗi sản phẩm sẽ chỉ có thể có 1 hoặc 2 options
 * @param type Loại option, gồm 3 loại là hình vuông có tên hoặc có hình ảnh (thường là màu sắc) và hình tròn (thường là kích thước)
 * @param value Giá trị của option, ví dụ option Màu sắc có giá trị Trắng và Đen
 */
async function clickOption(
  page: Page,
  type: "squareWithLabel" | "squareWithImage" | "circle",
  value: string
): Promise<boolean> {
  if (type == "squareWithLabel") {
    // Kiểm tra option có bị disabled hay không
    const childLocator = page.getByTitle(value, {
      exact: true,
    });
    const isDisabledOption =
      (await page
        .locator(".attributes")
        .locator("label")
        .filter({ has: childLocator })
        .locator("input")
        .first()
        .getAttribute("disabled", { timeout: 5000 })) != null;

    if (isDisabledOption) {
      return false;
    }

    // Nếu option không bị disabled, click option
    /// Chờ response trả về từ server sau khi click vào option
    const responsePromise = page
      .waitForResponse(
        (resp) =>
          resp.url().includes("/shoppingcart/productdetails_attributechange") &&
          resp.status() === 200,
        { timeout: 10000 }
      )
      .catch(() => null);
    await page
      .locator(".product-essential")
      .getByTitle(value, { exact: true })
      .locator("span")
      .click({ timeout: 5000 });
    const isSuccessClick = !!(await responsePromise);

    return isSuccessClick;
  } else if (type == "squareWithImage") {
    // Kiểm tra option có disabled hay không
    const inputLocator = page
      .locator(".attributes")
      .locator("li")
      .filter({ has: page.getByText(value, { exact: true }) })
      .getByRole("radio")
      .first();
    const isDisabledOption =
      (await inputLocator
        .getAttribute("disabled", {
          timeout: 5000,
        })
        .catch(() => {})) != null;

    if (isDisabledOption) {
      return false;
    } else {
      const responsePromise = page
        .waitForResponse(
          (resp) =>
            resp
              .url()
              .includes("/shoppingcart/productdetails_attributechange") &&
            resp.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => null);
      await page
        .locator(".attributes")
        .first()
        .locator("li")
        .filter({ has: page.getByText(value, { exact: true }) })
        .locator("span")
        .last()
        .click({ timeout: 5000 });
      const isSuccessClick = !!(await responsePromise);

      return isSuccessClick;
    }
  } else {
    const inputLocator = page
      .locator(".attributes")
      .locator("li")
      .getByLabel(value, { exact: true })
      .first();
    const isDisabledOption =
      (await inputLocator.getAttribute("disabled", { timeout: 5000 })) != null;

    if (isDisabledOption) {
      return false;
    } else {
      const responsePromise = page
        .waitForResponse(
          (resp) =>
            resp
              .url()
              .includes("/shoppingcart/productdetails_attributechange") &&
            resp.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => null);
      await page
        .getByText(value, { exact: true })
        .first()
        .click({ timeout: 5000 });
      const isSuccessClick = !!(await responsePromise);

      return isSuccessClick;
    }
  }
}

/**
 * Lấy thông tin của variant, bao gồm title, số lượng sp, giá và các giá trị của options
 * @param optionIndex1 Vị trí giá trị của option thứ nhất, ví dụ giá trị `Cam` của option có tập giá trị là `[Cam, Đỏ, Vàng]` thì vị trí giá thị là `0`
 * @param optionIndex2 Vị trí giá trị của option thứ hai
 * @returns `title`: Tiêu đề của variant
 * @returns `inventoryQuantity`: Số lượng sản phẩm
 * @returns `priceVnd`: Giá tiền
 * @returns `options`: Các giá trị của options
 */
async function getCoupleOptionVariant(
  page: Page,
  optionKeys: string[],
  optionValues: Option[],
  optionIndex1: number,
  optionIndex2: number
): Promise<{
  variantTitle: string;
  inventoryQuantity: number;
  options: Record<string, string>;
}> {
  const title = {
    1: optionValues[0].values[optionIndex1],
    2: optionValues[1].values[optionIndex2],
  };
  const options = {
    [optionKeys[0]]: optionValues[0].values[optionIndex1],
    [optionKeys[1]]: optionValues[1].values[optionIndex2],
  };
  let inventoryQuantity = 0;
  let isFirstSuccessClick = false;
  let isSecondSucessClick = false;

  // Click option 1
  isFirstSuccessClick = await clickOption(
    page,
    optionValues[0].type,
    optionValues[0].values[optionIndex1]
  );

  // Click option 2
  if (isFirstSuccessClick) {
    isSecondSucessClick = await clickOption(
      page,
      optionValues[1].type,
      optionValues[1].values[optionIndex2]
    );
  }

  // Lưu số lượng sản phẩm
  inventoryQuantity =
    isFirstSuccessClick && isSecondSucessClick
      ? await getProductInventoryQuantity(page)
      : 0;

  // Xuất kết quả
  return {
    variantTitle: `${title[1]} / ${title[2]}`,
    inventoryQuantity,
    options,
  };
}
