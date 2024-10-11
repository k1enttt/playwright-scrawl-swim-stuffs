import { expect, Page, test } from "@playwright/test";
import { RawProduct } from "./bhswim.type";
import fs from "fs";
import { exportFiles, sleep } from "./utils";
import { randomInt } from "crypto";

test("crawl", async ({ page }) => {
  test.setTimeout(6 * 60 * 60 * 1000);

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
  // await page.getByRole("link", { name: "Sản phẩm mới" }).first().click();
  // TODO: Tạm thời bỏ qua việc lấy danh sách category
  // await sleep(800);
  // const categoryLocators = await page
  //   .locator(".block-category-navigation")
  //   .locator("a")
  //   .all();
  // expect(categoryLocators).toHaveLength(6);

  // for (const locator of categoryLocators) {
  //   const url = await locator.getAttribute("href");
  //   if (url) {
  //     console.log(url);
  //     const label = (await locator.innerText()).trim();
  //     categories.push({ label, url });
  //   }
  // }

  // Lấy số lượng trang sản phẩm
  const pageNumber = await page
    .getByRole("link", { name: " Cuối cùng" })
    .getAttribute("data-page");

  for (let category of categories) {
    if (category.label != "Sản phẩm mới") break;

    // Lấy danh sách sản phẩm trên từng trang
    for (let i = 8; i <= Number(pageNumber); i++) {
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
        await getProduct(page, item.category).then((productVariants) => {
          products.push(...productVariants);
        })
    );
    if (countOfProduct !== 0 && countOfProduct % productPerPage === 0) {
      exportFiles(products);
    }
  }
  console.log("Crawl sản phẩm xong");

  // Xuất dữ liệu sản phẩm để nạp vào Admin
  exportFiles(products);
});

async function getProduct(page: Page, category: string): Promise<RawProduct[]> {
  let products: RawProduct[] = [];

  // Lấy tên sản phẩm
  let productTitle: string | null = null;
  try {
    productTitle =
      (await page.locator(".product-name").locator("h1").textContent()) || "";
  } catch (error) {
    productTitle = null;
  }
  console.log(productTitle);

  // const productTitle = await expect(page.locator(".product-name").locator("h1"))
  //   .toHaveCount(1)
  //   .then(async () => {
  //     return (
  //       (await page.locator(".product-name").locator("h1").textContent()) || ""
  //     );
  //   });

  // Lấy slug của sản phẩm
  const handler = productTitle
    ? productTitle.toLowerCase().replace(/ /g, "-").replace(/'/g, "")
    : randomInt(1000000).toString();

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
    .textContent()
    .then((text) => (text ? text.trim() : null))
    .catch(() => null);

  let quantity: number | null = null;
  // Chờ 1 giây để tránh trường hợp số lượng sản phẩm chưa được load
  await sleep(1000);

  // Lấy số lượng sản phẩm
  expect(page.locator(".stock").locator(".value"))
    .toHaveCount(1)
    .then(async () => {
      const stock = (
        await page.locator(".stock").locator(".value").innerText()
      ).split(" ");
      expect(stock).toHaveLength(3);
      quantity = Number(stock[0]);
      console.log(`- Số lượng: ${quantity}`);
    })
    .catch(() => {
      quantity = null;
      console.log(`- Số lượng: null`);
    });

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
      const isDisabledOption = await page
        .locator("label")
        .filter({ has: childLocator })
        .locator("input")
        .getAttribute("disabled", { timeout: 500 });

      if (isDisabledOption == null) {
        // Chờ response trả về từ server sau khi click vào option
        const reponsePromise = page
          .waitForResponse(
            (resp) =>
              resp
                .url()
                .includes("/shoppingcart/productdetails_attributechange") &&
              resp.status() === 200,
            { timeout: 1000 }
          )
          .catch(() => null);

        // Click vào option và chờ response trả về với status 200
        await page
          .locator(".product-essential")
          .getByTitle(optionValue, { exact: true })
          .locator("span")
          .click();
        const response = await reponsePromise;

        // Lấy số lượng sản phẩm nếu có response 200 từ server
        if (response) {
          const stock = (
            await page.locator(".stock").locator(".value").innerText()
          ).split(" ");
          inventoryQuantity = Number(stock[0]);
        }
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
        .first()
        .locator("li")
        .filter({ hasText: optionValue })
        .getByRole("radio");
      const isDisabledOption = await inputLocator.getAttribute("disabled", {
        timeout: 500,
      });

      // Click vào option nếu option không bị disable
      if (isDisabledOption == null) {
        // Chờ response trả về từ server sau khi click vào option
        const reponsePromise = page
          .waitForResponse(
            (resp) =>
              resp
                .url()
                .includes("/shoppingcart/productdetails_attributechange") &&
              resp.status() === 200,
            { timeout: 1000 }
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
        await buttonLocator.click();
        const response = await reponsePromise;

        // Lấy số lượng sản phẩm nếu có response 200 từ server
        if (response) {
          const stock = (
            await page.locator(".stock").locator(".value").innerText()
          ).split(" ");
          inventoryQuantity = Number(stock[0]);
        }
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
              { timeout: 1000 }
            )
            .catch(() => null);

          // Click vào option và chờ response trả về với status 200
          await page.getByText(optionValue, { exact: true }).click();
          const response = await reponsePromise;

          // Lấy số lượng sản phẩm nếu có response 200 từ server
          if (response) {
            const stock = (
              await page.locator(".stock").locator(".value").innerText()
            ).split(" ");
            inventoryQuantity = Number(stock[0]);
          }
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

  async function getCoupleOptionVariant({
    optionValue1,
    optionValue2,
    valueIndex,
  }: {
    optionValue1: string;
    optionValue2: string;
    valueIndex: number;
  }) {
    
  }

  if (optionKeys.length === 0) {
    products.push({
      handler,
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
      const variant = await getSingleOptionVariant({
        optionValue: optionValues[0].values[i],
        valueIndex: i,
      });

      products.push({
        handler,
        title: productTitle || "",
        priceVnd: productPrice ? Number(productPrice) : null,
        category,
        manufacturer: manufacturer || null,
        shortDescription,
        description,
        thumbnail: imageSrcList[0],
        images: imageSrcList,
        variant: variant,
        status: "published",
      });
    }
  } else if (optionKeys.length === 2) {
    for (let i = 0; i < optionValues[0].values.length; i++) {
      for (let j = 0; j < optionValues[1].values.length; j++) {
        let title = `${optionValues[0].values[i]} / ${optionValues[1].values[j]}`;
        const allowBackOrder = false;
        const manageInventory = true;
        const priceVnd = productPrice ? Number(productPrice) : null;
        let options = {
          [optionKeys[0]]: optionValues[0].values[i],
          [optionKeys[1]]: optionValues[1].values[j],
        };
        let inventoryQuantity: number = 0;

        /**
         * Lấy số lượng sản phẩm
         * @returns Promise<void>
         */
        const getStock = async () => {
          const stock = (
            await page.locator(".stock").locator(".value").innerText()
          ).split(" ");
          inventoryQuantity = Number(stock[0]);
        };

        /**
         * Sự kiện click vào option có hình vuông, đa số các option có hình vuông là option màu sắc
         * @param index number
         */
        const clickSquareOption = async (index: number) => {
          // Trường hợp option màu không có label, thì label = "id=...""
          const isLabelHaveId = optionValues[index].values[i].match(/id=/);

          // Sản phẩm có label rỗng ""
          if (isLabelHaveId) {
            title = `Mặc định ${i + 1} / ${optionValues[1].values[j]}`;
            options = {};
            options["Mặc định"] = `Mặc định ${i + 1}`;
            options[optionKeys[1]] = optionValues[1].values[j];

            // Kiểm tra option có disabled hay không
            const childLocator = page.getByTitle(
              optionValues[index].values[i],
              {
                exact: true,
              }
            );
            /** Trả về giá trị `""` khi nút bị disabled, ngược lại trả về `null` thì nút có thể click được */
            const isDisabledOption = await page
              .locator("label")
              .filter({ has: childLocator })
              .first()
              .locator("input")
              .getAttribute("disabled", { timeout: 500 });

            // Click vào option nếu option không bị disable
            if (isDisabledOption == null) {
              // Chờ response trả về từ server sau khi click vào option
              const reponsePromise = page
                .waitForResponse(
                  (resp) =>
                    resp
                      .url()
                      .includes(
                        "/shoppingcart/productdetails_attributechange"
                      ) && resp.status() === 200,
                  { timeout: 1000 }
                )
                .catch(() => null);

              // Click vào option và chờ response trả về với status 200
              await page
                .locator(`#${optionValues[index].values[i]} span`)
                .nth(1)
                .click();
              const response = await reponsePromise;

              // Lấy số lượng sản phẩm nếu có response 200 từ server
              if (index == 1 && response) {
                await getStock();
              }
            } else {
              // Option bị disable
              return false;
            }

            return true;
          } else {
            const childLocator = page.getByTitle(
              optionValues[index].values[i],
              {
                exact: true,
              }
            );
            /**
             * Trả về giá trị `""` khi nút bị disabled, ngược lại trả về `null` thì nút có thể click được
             */
            const isDisabledOption = await page
              .locator("label")
              .filter({ has: childLocator })
              .first()
              .locator("input")
              .getAttribute("disabled", { timeout: 500 });

            if (isDisabledOption == null) {
              // Chờ response trả về từ server sau khi click option
              const responsePromise = page
                .waitForResponse(
                  (resp) =>
                    resp
                      .url()
                      .includes(
                        "/shoppingcart/productdetails_attributechange"
                      ) && resp.status() === 200,
                  { timeout: 1000 }
                )
                .catch(() => null);

              // Click vào option và đợi response 200 trả về
              await page
                .locator(".product-essential")
                .getByTitle(optionValues[index].values[i], { exact: true })
                .locator("span")
                .click();
              const response = await responsePromise;

              // Lấy số lượng
              if (index == 1 && response) {
                await getStock();
              }
            } else {
              inventoryQuantity = 0;
              console.log("Option bị disable");
              return false;
            }
            return true;
          }
        };

        /**
         * Sự kiện click vào option có hình tròn, đa số các option có hình tròn là option kích cỡ
         * @param index number
         */
        const clickCircleOption = async (index: number) => {
          const isEnabled = await expect(
            page.getByText(optionValues[index].values[j], { exact: true })
          )
            .toBeEnabled({ timeout: 500 })
            .then(() => true)
            .catch(() => false);

          if (isEnabled) {
            // Đợi response trả về sau khi click vào option
            const responsePromise = page
              .waitForResponse(
                (resp) =>
                  resp
                    .url()
                    .includes("/shoppingcart/productdetails_attributechange") &&
                  resp.status() === 200,
                { timeout: 1000 }
              )
              .catch(() => null);

            // Click vào option
            await page
              .getByText(optionValues[index].values[j], { exact: true })
              .click();
            const response = await responsePromise;

            // Lấy số lượng sản phẩm
            if (index == 1 && response) {
              await getStock();
            }
          } else {
            inventoryQuantity = 0;
            return false;
          }
          return true;
        };

        if (optionValues[0].type == "squareWithLabel") {
          // const isValidLocator = !!optionValues[0].values[i];

          // if (!isValidLocator) {
          //   title = `Mặc định ${i + 1} / ${optionValues[1].values[j]}`;
          //   options = {};
          //   options["Mặc định"] = `Mặc định ${i + 1}`;
          //   options[optionKeys[1]] = optionValues[1].values[j];
          // } else {
          //   const childLocator = page.getByTitle(optionValues[0].values[i], {
          //     exact: true,
          //   });
          //   const isDisabledOption = await page
          //     .locator("label")
          //     .filter({ has: childLocator })
          //     .first()
          //     .locator("input")
          //     .getAttribute("disabled");

          //   if (isDisabledOption == null) {
          //     await page
          //       .locator(".product-essential")
          //       .getByTitle(optionValues[0].values[i], { exact: true })
          //       .locator("span")
          //       .click();

          //     await expect(
          //       page.getByText(optionValues[1].values[j], { exact: true })
          //     )
          //       .toBeEnabled()
          //       .then(async () => {
          //         await page
          //           .getByText(optionValues[1].values[j], { exact: true })
          //           .click();
          //         await page.waitForTimeout(500);
          //         await expect(page.locator(".stock").locator(".value"))
          //           .toHaveCount(1, { timeout: 1000 })
          //           .then(async () => {
          //             await expect(page.locator(".stock").locator(".value"))
          //               .toHaveText(/^[0-9].*/, { timeout: 1000 })
          //               .then(async () => {
          //                 const stock = (
          //                   await page
          //                     .locator(".stock")
          //                     .locator(".value")
          //                     .innerText()
          //                 ).split(" ");
          //                 inventoryQuantity = Number(stock[0]);
          //               })
          //               .catch(() => {
          //                 inventoryQuantity = 0;
          //                 console.log("Không tìm được số lượng của", title);
          //               });
          //           })
          //           .catch(() => {
          //             console.log(
          //               "Không lấy được số lượng sản phẩm của",
          //               title
          //             );
          //           });
          //       })
          //       .catch(() => {
          //         console.log("Không click được option", title);
          //       });
          //   } else {
          //     inventoryQuantity = 0;
          //     console.log("Option bị disable");
          //   }
          // }
          await clickSquareOption(0);
        } else {
          // await expect(
          //   page.getByText(optionValues[1].values[j], { exact: true })
          // )
          //   .toBeEnabled()
          //   .then(async () => {
          //     await page
          //       .getByText(optionValues[1].values[j], { exact: true })
          //       .click();
          //   })
          //   .catch(() => {
          //     console.log("Không click được option", title);
          //   });
          await clickCircleOption(0);
        }

        if (optionValues[1].type == "squareWithLabel") {
          await clickSquareOption(1);
        } else {
          // await expect(
          //   page.getByText(optionValues[1].values[j], { exact: true })
          // )
          //   .toBeEnabled()
          //   .then(async () => {
          //     await page
          //       .getByText(optionValues[1].values[j], { exact: true })
          //       .click();
          //     await page.waitForTimeout(500);
          //     await expect(page.locator(".stock").locator(".value"))
          //       .toHaveCount(1, { timeout: 1000 })
          //       .then(async () => {
          //         await expect(page.locator(".stock").locator(".value"))
          //           .toHaveText(/^[0-9].*/, { timeout: 1000 })
          //           .then(async () => {
          //             const stock = (
          //               await page
          //                 .locator(".stock")
          //                 .locator(".value")
          //                 .innerText()
          //             ).split(" ");
          //             inventoryQuantity = Number(stock[0]);
          //           })
          //           .catch(() => {
          //             inventoryQuantity = 0;
          //             console.log("Không tìm được số lượng của", title);
          //           });
          //       })
          //       .catch(() => {
          //         console.log("Không lấy được số lượng sản phẩm của", title);
          //       });
          //   })
          //   .catch(() => {
          //     console.log("Không click được option", title);
          //   });
          await clickCircleOption(1);
        }

        products.push({
          handler,
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
            manageInventory,
          },
          status: "published",
        });
      }
    }
  }

  return products;
}

test("Bad cases", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const productUrl = {
    "Áo bơi TYR American Dream Diamondfit Swimsuit":
      "https://bhswim.com/%C3%A1o-b%C6%A1i-tyr-american-dream-diamondfit-swimsuit",
    "Quần bơi thi đấu TYR Men’s Venzo Camo High-Waist Jammer Swimsuit Nam":
      "https://bhswim.com/quan-boi-tyr-mens-venzo-camo-high-waist-jammer-swimsuit-nam",
    // Số lượng của variant không đúng
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
  };
  let products: RawProduct[] = [];
  await page
    .goto(
      productUrl["Cục ngậm TYR Ultralite Snorkel 2.0 Mouthpiece Replacement"],
      {
        waitUntil: "domcontentloaded",
      }
    )
    .then(
      async () =>
        await getProduct(page, "Sản phẩm mới").then((productVariants) => {
          products.push(...productVariants);
        })
    );

  exportFiles(products, true);
});
