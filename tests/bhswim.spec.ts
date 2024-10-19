import { expect, Page, test } from "@playwright/test";
import { RawProduct } from "./bhswim.type";
import fs from "fs";
import {
  exportCrawlFiles,
  exportCrawlInfo,
  getNumberOfPages,
  removeDiacritics,
  removeOthers,
  sleep,
} from "./utils";
import { randomInt } from "crypto";

test("crawl", async ({ page }) => {
  test.setTimeout(6 * 60 * 60 * 1000);
  const startPage = 0;
  const pageUrl = "https://bhswim.com";
  const productPerPage: 20 | 30 | 50 = 20;
  const categories: { label: string; url: string }[] = [
    {
      label: "Sản phẩm mới",
      url: "/newproducts",
    },
  ];
  let products: RawProduct[] = [];
  const productUrls: { url: string; category: string }[] = [];

  // Mở trang web
  await page.goto("https://bhswim.com/newproducts", {
    waitUntil: "domcontentloaded",
  });

  // Lấy href của các category
  async function getCategories() {
    const categoryLocators = await page
      .locator(".block-category-navigation")
      .locator("a")
      .all();

    for (const locator of categoryLocators) {
      const url = await locator
        .getAttribute("href", { timeout: 5000 })
        .catch(() => null);
      if (url) {
        const label = (await locator.innerText()).trim();
        categories.push({ label, url });
      }
    }
  }
  await getCategories();

  const pageNumber = await page
    .getByRole("link", { name: " Cuối cùng" })
    .getAttribute("data-page");

  // Lấy số lượng trang sản phẩm
  for (let category of categories) {
    // Lấy danh sách sản phẩm trên từng trang
    for (let i = startPage; i <= Number(pageNumber); i++) {
      const url =
        pageUrl + category.url + `?pagenumber=${i}&pagesize=${productPerPage}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      // Lấy danh sách url sản phẩm
      const itemLocators = await page
        .locator(".products-container")
        .locator(".item-box")
        .all();

      const promises = itemLocators.map(async (item) => {
        item
          .getByRole("link")
          .first()
          .getAttribute("href")
          .then((url) => {
            if (url) {
              productUrls.push({ url, category: category.label });
            }
          });
      });
      await Promise.all(promises);
    }

    console.log(`Danh sách url của [${category.label}] đã lấy xong`);
  }

  // Lấy thông tin sản phẩm
  let countOfProduct = 0;
  for (const item of productUrls) {
    countOfProduct++;
    const productUrl = pageUrl + item.url;
    await page.goto(productUrl, { waitUntil: "domcontentloaded" }).then(
      async () =>
        await getProductOld(page, item.category).then((productVariants) => {
          products.push(...productVariants);
        })
    );
    exportCrawlInfo({
      currentProductUrl: productUrl,
      currentPage: countOfProduct / productPerPage,
      currentCategory: item.category,
    });
    if (countOfProduct !== 0 && countOfProduct % productPerPage === 0) {
      exportCrawlFiles(products);
    }
  }
  console.log("Crawl sản phẩm xong");

  // Xuất dữ liệu sản phẩm
  exportCrawlFiles(products);
});

async function getProductOld(
  page: Page,
  category: string
): Promise<RawProduct[]> {
  let products: RawProduct[] = [];

  // Lấy tên sản phẩm
  let productTitle: string | null = null;
  const isTitleVisible = await expect(
    page.locator(".product-name").locator("h1")
  )
    .toBeVisible({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (isTitleVisible) {
    productTitle =
      (await page.locator(".product-name").locator("h1").innerText()).trim() ||
      "";
  }

  console.log(productTitle);

  // Lấy slug của sản phẩm
  /**
   * Để tạo slug cho sản phẩm cần phải làm sạch tên sản phẩm:
   * 1. Chuyển tất cả ký tự thành chữ thường [toLowerCase()]
   * 2. Loại bỏ khoảng trắng ở đầu và cuối chuỗi [trim()]
   * 3. Loại bỏ khoảng trắng dư thừa ở giữa chuỗi [replace(/\s+/g, " ")]
   * 4. Thay thế khoảng trắng bằng dấu gạch ngang [replace(/ /g, "-")]
   * 5. Thay thể tất cả các chữ cái Tiếng Việt có dấu thành không dấu [removeDiacritics()]
   * 6. Loại bỏ các ký tự đặc biệt [removeOthers()]
   */
  const handle = productTitle
    ? removeOthers(
        removeDiacritics(
          productTitle
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ")
            .replace(/ /g, "-")
        )
      )
    : randomInt(1000000).toString();

  // Lấy giá sản phẩm
  let productPrice: string | null = null;
  const priceLocator = page.locator(".product-price").locator("strong");
  await expect(priceLocator)
    .toHaveCount(1, { timeout: 5000 })
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
    .textContent({ timeout: 5000 })
    .then((text) => (text ? text.trim() : null))
    .catch(() => null);

  let quantity: number | null = null;
  // Chờ 1 giây để tránh trường hợp số lượng sản phẩm chưa được load
  await sleep(1000);

  /**
   * Lấy số lượng sản phẩm
   * @returns Promise<void>
   */
  const getStock = async () => {
    let stock = 0;

    // Kiểm tra trạng thái kho có được hiển thị hay không
    const isVisibleStock = await expect(
      page.locator(".stock").locator(".value")
    )
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
  };

  // Lấy số lượng sản phẩm
  quantity = await getStock();

  // Lấy mô tả ngắn
  let shortDescription: string | null = null;
  // Kiểm tra xem có mô tả ngắn không
  expect(page.locator(".short-description"))
    .toHaveCount(1)
    .then(async () => {
      shortDescription = (await page.locator(".short-description").innerText())
        .toString()
        .replace("/\n/g", " ")
        .trim();
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

  let description: string | null = null;
  try {
    if (
      await page
        .getByRole("tabpanel", { name: "Thông tin sản phẩm" })
        .isVisible()
    )
      description = await page
        .getByRole("tabpanel", { name: "Thông tin sản phẩm" })
        .locator("div")
        .first()
        .textContent();
    if (description) {
      description = description.replace(/"/g, '"').trim();
    }
  } catch (error) {
    description = null;
  }

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
      type: "squareWithLabel" | "squareWithImage" | "circle";
      values: string[];
    }
  > = {};

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
  console.log(`- Options: ${JSON.stringify(options)}`);

  // Tạo variant từ options
  const optionKeys = Object.keys(options);
  const optionValues = Object.values(options);

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
  async function getSingleOptionVariant({
    optionValue,
    valueIndex,
  }: {
    optionValue: string;
    valueIndex: number;
  }) {
    let title = optionValue;
    const priceVnd = productPrice ? Number(productPrice) : null;
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
        inventoryQuantity = response ? await getStock() : 0;
      } else {
        inventoryQuantity = 0;
        console.log("Option bị disable");
      }
    } else if (optionValues[0].type == "squareWithImage") {
      // Trường hợp option có label và value rỗng
      // Ví dụ: https://bhswim.com/%C3%A1o-b%C6%A1i-thi-%C4%91%E1%BA%A5u-n%E1%BB%AF-tyr-womens-avictor-20-exolon-closed-back-swimsuit

      title = `Mặc định ${valueIndex + 1}`;
      options = {};
      options["Mặc định"] = title;

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
          .filter({ hasText: optionValue })
          .locator("span")
          .last();
        await buttonLocator.click({ timeout: 5000 });
        const response = await reponsePromise;

        // Lấy số lượng sản phẩm nếu có response 200 từ server
        inventoryQuantity = response ? await getStock() : 0;
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
          await page.getByText(optionValue, { exact: true }).click({timeout: 5000});
          const response = await reponsePromise;

          // Lấy số lượng sản phẩm nếu có response 200 từ server
          inventoryQuantity = response ? await getStock() : 0;
        })
        .catch(() => {
          inventoryQuantity = 0;
          console.log("Không click được option", title);
        });
    }
    return {
      title,
      inventoryQuantity,
      priceVnd,
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
            resp
              .url()
              .includes("/shoppingcart/productdetails_attributechange") &&
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
        (await inputLocator.getAttribute("disabled", {
          timeout: 5000,
        })) != null;

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
          .filter({ hasText: value })
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
        (await inputLocator.getAttribute("disabled", { timeout: 5000 })) !=
        null;

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
    optionIndex1: number,
    optionIndex2: number
  ): Promise<{
    title: string;
    inventoryQuantity: number;
    priceVnd: number;
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

    // Lưu giá
    const priceVnd = productPrice ? Number(productPrice) : 0;

    // Click option 1
    isFirstSuccessClick = await clickOption(
      optionValues[0].type,
      optionValues[0].values[optionIndex1]
    );

    // Click option 2
    if (isFirstSuccessClick) {
      isSecondSucessClick = await clickOption(
        optionValues[1].type,
        optionValues[1].values[optionIndex2]
      );
    }

    // Lưu số lượng sản phẩm
    inventoryQuantity =
      isFirstSuccessClick && isSecondSucessClick ? await getStock() : 0;

    // Xuất kết quả
    return {
      title: `${title[1]} / ${title[2]}`,
      inventoryQuantity,
      priceVnd,
      options,
    };
  }

  if (optionKeys.length === 0) {
    products.push({
      handle,
      title: productTitle || "",
      priceVnd: productPrice ? Number(productPrice) : null,
      category,
      manufacturer: manufacturer || null,
      shortDescription,
      description,
      thumbnail: imageSrcList[0],
      images: imageSrcList,
      variant: {
        title: productTitle || "",
        inventoryQuantity: Number(quantity),
        priceVnd: productPrice ? Number(productPrice) : null,
        options: {},
        manageInventory: true,
      },
      status: "published",
    });
  } else if (optionKeys.length === 1) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      const { title, inventoryQuantity, priceVnd, options } =
        await getSingleOptionVariant({
          optionValue: optionValues[0].values[i],
          valueIndex: i,
        });

      products.push({
        handle,
        title: productTitle || "",
        priceVnd: productPrice ? Number(productPrice) : null,
        category,
        manufacturer: manufacturer || null,
        shortDescription,
        description,
        thumbnail: imageSrcList[0],
        images: imageSrcList,
        variant: {
          title,
          inventoryQuantity,
          priceVnd,
          options,
        },
        status: "published",
      });
    }
  } else if (optionKeys.length === 2) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      for (let j = 0; j < optionValues[1].values.length; j++) {
        const { title, inventoryQuantity, priceVnd, options } =
          await getCoupleOptionVariant(i, j);

        products.push({
          handle,
          title: productTitle || "",
          priceVnd: productPrice ? Number(productPrice) : null,
          category,
          manufacturer: manufacturer || null,
          shortDescription,
          description,
          thumbnail: imageSrcList[0],
          images: imageSrcList,
          variant: {
            title,
            inventoryQuantity,
            priceVnd,
            options,
            manageInventory: true,
          },
          status: "published",
        });
      }
    }
  }

  return products;
}

/**
 * Test dùng để kiểm tra các trường hợp cụ thể, đặc biệt là các trường hợp không phải là trường hợp chung
 */
test("Bad cases", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const productUrl = {
    // Option cuông có hình ảnh
    "Kính bơi tráng gương TYR Tracer-X Racing Mirrored Nano Goggles":
      "https://bhswim.com/k%C3%ADnh-b%C6%A1i-tr%C3%A1ng-g%C6%B0%C6%A1ng-tyr-tracer-x-racing-mirrored-nano-goggles",
    "Áo bơi TYR American Dream Diamondfit Swimsuit":
      "https://bhswim.com/%C3%A1o-b%C6%A1i-tyr-american-dream-diamondfit-swimsuit",
    "Quần bơi thi đấu TYR Men’s Venzo Camo High-Waist Jammer Swimsuit Nam":
      "https://bhswim.com/quan-boi-tyr-mens-venzo-camo-high-waist-jammer-swimsuit-nam",
    "Kính Bơi Trẻ Em YINGFA J390AF Kid's Swim Goggles":
      "https://bhswim.com/k%C3%ADnh-b%C6%A1i-tr%E1%BA%BB-em-yingfa-j390af-kids-swim-goggles",
    "Cục ngậm TYR Ultralite Snorkel 2.0 Mouthpiece Replacement":
      "https://bhswim.com/k%C3%ADnh-b%C6%A1i-tr%C3%A1ng-g%C6%B0%C6%A1ng-tyr-black-ops-140-ev-adult-2",
    // Sản phẩm có option kích trước đặt trước option màu sắc
    "Quần bơi lửng Nam TYR Sonoma Jammer":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-l%E1%BB%ADng-nam-tyr-sonoma-jammer",
    // Số lượng của variant không đúng
    "Quần bơi tam giác 2 mặt Nam TYR Diablos Reversible Racer":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-tam-gi%C3%A1c-2-m%E1%BA%B7t-nam-tyr-diablos-reversible-racer",
    // Số lượng của variant không đúng
    "Quần bơi tam giác 2 mặt Nam TYR Coraline Reversible Racer":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-tam-gi%C3%A1c-2-m%E1%BA%B7t-nam-tyr-coraline-reversible-racer",
    "Chân vịt bơi lội ngắn TYR Crossblade Training":
      "https://bhswim.com/ch%C3%A2n-v%E1%BB%8Bt-b%C6%A1i-l%E1%BB%99i-ng%E1%BA%AFn-tyr-crossblade-training",
    "Áo bơi thi đấu Arena Women's Powerskin Carbon Air 2 Full Body Open Back Swimsuit Nữ":
      "https://bhswim.com/%C3%A1o-b%C6%A1i-thi-%C4%91%E1%BA%A5u-arena-womens-powerskin-carbon-air-2-full-body-open-back-swimsuit-n%E1%BB%AF",
    // Tên nhà sản xuất hiển thị như short description
    "Quần bơi tam giác YINGFA 6308":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-tam-gi%C3%A1c-yingfa-6308",
    // Option bị lặp lại
    "Áo Bơi 1 Mảnh Nữ TYR Shibori Bella":
      "https://bhswim.com/%C3%A1o-b%C6%A1i-1-m%E1%BA%A3nh-n%E1%BB%AF-tyr-shibori-bella",
    // Option bị trùng với option khác ở phần sản phẩm tương tự
    "ỐNG THỞ GIỮA TẬP BƠI YINGFA G7205":
      "https://bhswim.com/%E1%BB%91ng-th%E1%BB%9F-gi%E1%BB%AFa-t%E1%BA%ADp-b%C6%A1i-yingfa-g7205-xanh-d%C6%B0%C6%A1n",
  };
  let products: RawProduct[] = [];
  await page
    .goto(productUrl["ỐNG THỞ GIỮA TẬP BƠI YINGFA G7205"], {
      waitUntil: "domcontentloaded",
    })
    .then(
      async () =>
        await getProductOld(page, "Sản phẩm mới").then((productVariants) => {
          products.push(...productVariants);
        })
    );

  exportCrawlFiles(products, true);
});

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
    "./output/crawl-by-manufacturers/manufacturer.json",
    JSON.stringify(manufacturers)
  );
});

/**
 * Lấy tất cả url sản phẩm từ manufacturer
 */
test("Step 2 - Lấy danh sách sản phẩm từ manufacturer", async ({ page }) => {
  test.setTimeout(6 * 60 * 60 * 1000);

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
              updateCrawlFile({
                manufacturer: manufacturer,
                page: i,
                productUrl: url,
              });
            }
          })
          .catch(async () => {
            console.log(
              `Không lấy được url sản phẩm\n Trang: ${i} - Sản phẩm thứ ${index}`
            );
          });
      });
      await Promise.all(promises);
    }
    return products;
  }

  const baseUrl = "https://bhswim.com";

  // Đọc url của từng manufacturer trong file /output/crawl-by-manufacturers/manufacturer.json
  const fileData = fs.readFileSync(
    "./output/crawl-by-manufacturers/manufacturer.json",
    "utf-8"
  );
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
    // Lưu danh sách vào file products-{manufacturer_name}.json
    fs.writeFileSync(
      `./output/crawl-by-manufacturers/product-urls.json`,
      JSON.stringify(productUrls)
    );
  }
});

/**
 * Lấy dữ liệu sản phẩm từ danh sách url sản phẩm
 */
test("Step 3 - Lấy dữ liệu sản phẩm từ danh sách url sản phẩm", async ({
  page,
}) => {
  test.setTimeout(6 * 60 * 60 * 1000);

  const baseUrl = "https://bhswim.com";

  function saveCrawlStatus(status: {
    manufacturer: string;
    productIndex: string;
    productUrl: string;
  }) {
    fs.writeFileSync(
      "./output/crawl-by-manufacturers/step3-status.json",
      JSON.stringify(status)
    );
  }

  // Đọc danh sách url sản phẩm từ file /output/crawl-by-manufacturers/product-urls.json
  const fileData = fs.readFileSync(
    "./output/crawl-by-manufacturers/product-urls.json",
    "utf-8"
  );
  const productUrls = JSON.parse(fileData) as {
    productUrl: string;
    manufacturer: string;
  }[];

  // Lấy dữ liệu sản phẩm từ từng url
  const products: RawProduct[] = [];
  for (let i = 0; i < productUrls.length; i++) {
    const productVariants = await getProduct(
      page,
      baseUrl + productUrls[i].productUrl,
      productUrls[i].manufacturer
    );
    products.push(...productVariants);

    // Lưu danh sách sản phẩm vào file /output/crawl-by-manufacturers/products-medusa.json
    exportCrawlFiles(products);

    // Lưu trạng thái crawl
    saveCrawlStatus({
      manufacturer: productUrls[i].manufacturer,
      productIndex: `${i} / ${productUrls.length}`,
      productUrl: productUrls[i].productUrl,
    });
  }
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
  inventoryQuantity,
  options,
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
  inventoryQuantity: number;
  options: Record<string, Option>;
}) {
  const products: RawProduct[] = [];

  // Tạo variant từ options
  const optionKeys = Object.keys(options);
  const optionValues = Object.values(options);

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
  async function getSingleOptionVariant({
    optionValue,
    valueIndex,
  }: {
    optionValue: string;
    valueIndex: number;
  }) {
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
          .click({timeout: 5000});
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
        await buttonLocator.click({timeout: 5000});
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
          await page.getByText(optionValue, { exact: true }).click({timeout: 5000});
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
            resp
              .url()
              .includes("/shoppingcart/productdetails_attributechange") &&
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
        (await inputLocator.getAttribute("disabled", { timeout: 5000 })) !=
        null;

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
    optionIndex1: number,
    optionIndex2: number
  ): Promise<{
    variantTitle: string;
    inventoryQuantity: number;
    priceVnd: number;
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
      optionValues[0].type,
      optionValues[0].values[optionIndex1]
    );

    // Click option 2
    if (isFirstSuccessClick) {
      isSecondSucessClick = await clickOption(
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
      priceVnd,
      options,
    };
  }

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
        manageInventory: true,
      },
      status: "published",
    });
  } else if (optionKeys.length === 1) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      const { variantTitle, inventoryQuantity, options } =
        await getSingleOptionVariant({
          optionValue: optionValues[0].values[i],
          valueIndex: i,
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
        },
        status: "published",
      });
    }
  } else if (optionKeys.length === 2) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      for (let j = 0; j < optionValues[1].values.length; j++) {
        const { variantTitle, inventoryQuantity, priceVnd, options } =
          await getCoupleOptionVariant(i, j);

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
            manageInventory: true,
          },
          status: "published",
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
  });
  return variantList;
}

type Option = {
  type: "squareWithLabel" | "squareWithImage" | "circle";
  values: string[];
};
