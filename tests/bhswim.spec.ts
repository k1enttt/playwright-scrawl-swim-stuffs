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

  const streamFile = "./output/stream-products.json";

  // Tạo file mới nếu chưa tồn tại, ngược lại ghi đè lên file cũ
  var logger = fs.createWriteStream(streamFile);
  logger.write("");

  // Chuyển logger thành mode append
  logger = fs.createWriteStream(streamFile, { flags: "a" });

  // Open the array
  logger.write("[\n");

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
        await getProduct(page, item.category, logger).then(
          (productVariants) => {
            products.push(...productVariants);
          }
        )
    );
    if (countOfProduct !== 0 && countOfProduct % productPerPage === 0) {
      exportFiles(products);
    }
  }
  console.log("Crawl sản phẩm xong");

  // Close the array
  logger.write("]");
  logger.end();

  // Xuất dữ liệu sản phẩm để nạp vào Admin
  exportFiles(products);
});

async function getProduct(
  page: Page,
  category: string,
  logger: fs.WriteStream
): Promise<RawProduct[]> {
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
      type: "square" | "circle";
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
    let type: "square" | "circle" = "square";

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
        values.push(label);
        if (type != "square") {
          type = "square";
        }
      } else {
        const label = value;
        values.push(label);
        if (type != "circle") {
          type = "circle";
        }
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

  if (optionKeys.length === 0) {
    logger.write(`{
      "handler": "${handler}",
      "title": "${productTitle}",
      "priceVnd": ${productPrice ? productPrice : '""'},
      "category": "${category}",
      "manufacturer": ${manufacturer ? `"${manufacturer}"` : '""'},
      "discountable": true,
      "shortDescription": ${shortDescription ? `"${shortDescription}"` : '""'},
      "description": ${description ? `"${description}"` : '""'},
      "thumbnail": "${imageSrcList[0]}",
      "images": ${JSON.stringify(imageSrcList)},
      "variant": {
        "title": ${productTitle ? `"${productTitle}"` : '""'},
        "inventoryQuantity": ${quantity ? quantity : '""'},
        "priceVnd": ${productPrice ? productPrice : '""'},
        "options": {},
        "manageInventory": true,
        "allowBackOrder": false
      },
      "status": "published"
    },\n`);
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
      let title = optionValues[0].values[i];
      const priceVnd = productPrice ? Number(productPrice) : null;
      let options = {
        [optionKeys[0]]: optionValues[0].values[i],
      };
      let inventoryQuantity: number | null = null;

      if (optionValues[0].type == "square") {
        const isValidLocator = !!optionValues[0].values[i];

        // Trường hợp option có label và value rỗng
        // Ví dụ: https://bhswim.com/%C3%A1o-b%C6%A1i-thi-%C4%91%E1%BA%A5u-n%E1%BB%AF-tyr-womens-avictor-20-exolon-closed-back-swimsuit
        if (!isValidLocator) {
          title = `Mặc định ${i + 1}`;
          options = {};
          options["Mặc định"] = title;
          await expect(page.locator(".stock").locator(".value"))
            .toHaveCount(1, { timeout: 1000 })
            .then(async () => {
              await expect(page.locator(".stock").locator(".value"))
                .toHaveText(/^[0-9].*/, { timeout: 1000 })
                .then(async () => {
                  const stock = (
                    await page.locator(".stock").locator(".value").innerText()
                  ).split(" ");
                  inventoryQuantity = Number(stock[0]);
                })
                .catch(() => {
                  inventoryQuantity = 0;
                  console.log("Không tìm được số lượng của", title);
                });
            })
            .catch(() => {
              console.log("Không tồn tại số lượng của", title);
            });
        } else {
          const childLocator = page.getByTitle(optionValues[0].values[i], {
            exact: true,
          });
          const isDisabledOption = await page
            .locator("label")
            .filter({ has: childLocator })
            .locator("input")
            .getAttribute("disabled");

          if (isDisabledOption == null) {
            await page
              .locator(".product-essential")
              .getByTitle(optionValues[0].values[i], { exact: true })
              .locator("span")
              .click();
            await page.waitForTimeout(500);
            await expect(page.locator(".stock").locator(".value"))
              .toHaveCount(1, { timeout: 1000 })
              .then(async () => {
                await expect(page.locator(".stock").locator(".value"))
                  .toHaveText(/^[0-9].*/, { timeout: 1000 })
                  .then(async () => {
                    const stock = (
                      await page.locator(".stock").locator(".value").innerText()
                    ).split(" ");
                    inventoryQuantity = Number(stock[0]);
                  })
                  .catch(() => {
                    inventoryQuantity = 0;
                    console.log("Không tìm được số lượng của", title);
                  });
              })
              .catch(() => {
                console.log("Không tồn tại số lượng của", title);
              });
          }
        }
      } else {
        await expect(page.getByText(optionValues[0].values[i], { exact: true }))
          .toBeEnabled()
          .then(async () => {
            await page
              .getByText(optionValues[0].values[i], { exact: true })
              .click();
            await expect(page.locator(".stock").locator(".value"))
              .toHaveCount(1, { timeout: 1000 })
              .then(async () => {
                await sleep(500);
                await expect(page.locator(".stock").locator(".value"))
                  .toHaveText(/^[0-9].*/, { timeout: 1000 })
                  .then(async () => {
                    const stock = (
                      await page.locator(".stock").locator(".value").innerText()
                    ).split(" ");
                    inventoryQuantity = Number(stock[0]);
                  })
                  .catch(() => {
                    console.log("Không tìm được số lượng của", title);
                  });
              })
              .catch(() => {
                console.log("Không tồn tại số lượng của", title);
              });
          })
          .catch(() => {
            console.log("Không click được option", title);
          });
      }

      logger.write(`{
        "handler": "${handler}",
        "title": "${productTitle}",
        "priceVnd": ${productPrice ? productPrice : '""'},
        "category": "${category}",
        "manufacturer": ${manufacturer ? `"${manufacturer}"` : '""'},
        "discountable": true,
        "shortDescription": ${
          shortDescription ? `"${shortDescription}"` : '""'
        },
        "description": ${description ? `"${description.toString()}"` : '""'},
        "thumbnail": "${imageSrcList[0]}",
        "images": ${JSON.stringify(imageSrcList)},
        "variant": {
          "title": "${title}",
          "inventoryQuantity": ${inventoryQuantity ? inventoryQuantity : '""'},
          "priceVnd": ${priceVnd ? priceVnd : '""'},
          "options": ${JSON.stringify(options)},
          "allowBackOrder": false,
          "manageInventory": true
        },
        "status": "published"
      },\n`);
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
        },
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
         * Sự kiện click vào option có hình vuông, đa số các option có hình vuông là option màu sắc
         * @param index number
         */
        const clickSquareOption = async (index: number) => {
          const isValidLocator = !!optionValues[index].values[i];

          // Sản phẩm có label rỗng ""
          if (!isValidLocator) {
            title = `Mặc định ${i + 1} / ${optionValues[1].values[j]}`;
            options = {};
            options["Mặc định"] = `Mặc định ${i + 1}`;
            options[optionKeys[1]] = optionValues[1].values[j];
            await expect(page.locator(".stock").locator(".value"))
            .toHaveCount(1, { timeout: 1000 })
            .then(async () => {
              await expect(page.locator(".stock").locator(".value"))
                .toHaveText(/^[0-9].*/, { timeout: 1000 })
                .then(async () => {
                  const stock = (
                    await page.locator(".stock").locator(".value").innerText()
                  ).split(" ");
                  inventoryQuantity = Number(stock[0]);
                })
                .catch(() => {
                  inventoryQuantity = 0;
                  console.log("Không tìm được số lượng của", title);
                });
            })
            .catch(() => {
              console.log("Không tồn tại số lượng của", title);
            });
            return true;
          } else {
            const childLocator = page.getByTitle(optionValues[index].values[i], {
              exact: true,
            });
            const isDisabledOption = await page
              .locator("label")
              .filter({ has: childLocator })
              .first()
              .locator("input")
              .getAttribute("disabled");

            // Sản phẩm có option bị disable, isDisabledOption = null nếu option không bị disable,
            // ngược lại isDisabledOption = undefined
            if (isDisabledOption == null) {
              await page
                .locator(".product-essential")
                .getByTitle(optionValues[index].values[i], { exact: true })
                .locator("span")
                .click();
              return true;
            } else {
              inventoryQuantity = 0;
              console.log("Option bị disable");
              return false;
            }
          }
        };

        /**
         * Sự kiện click vào option có hình tròn, đa số các option có hình tròn là option kích cỡ
         * @param index number
         */
        const clickCircleOption = async (index: number) => {
          await expect(
            page.getByText(optionValues[index].values[j], { exact: true })
          )
            .toBeEnabled()
            .then(async () => {
              await page
                .getByText(optionValues[index].values[j], { exact: true })
                .click();
            })
            .catch(() => {
              console.log("Không click được option", title);
            });
        };

        if (optionValues[0].type == "square") {
          const isValidLocator = !!optionValues[0].values[i];

          if (!isValidLocator) {
            title = `Mặc định ${i + 1} / ${optionValues[1].values[j]}`;
            options = {};
            options["Mặc định"] = `Mặc định ${i + 1}`;
            options[optionKeys[1]] = optionValues[1].values[j];
          } else {
            const childLocator = page.getByTitle(optionValues[0].values[i], {
              exact: true,
            });
            const isDisabledOption = await page
              .locator("label")
              .filter({ has: childLocator })
              .first()
              .locator("input")
              .getAttribute("disabled");

            if (isDisabledOption == null) {
              await page
                .locator(".product-essential")
                .getByTitle(optionValues[0].values[i], { exact: true })
                .locator("span")
                .click();

              await expect(
                page.getByText(optionValues[1].values[j], { exact: true })
              )
                .toBeEnabled()
                .then(async () => {
                  await page
                    .getByText(optionValues[1].values[j], { exact: true })
                    .click();
                  await page.waitForTimeout(500);
                  await expect(page.locator(".stock").locator(".value"))
                    .toHaveCount(1, { timeout: 1000 })
                    .then(async () => {
                      await expect(page.locator(".stock").locator(".value"))
                        .toHaveText(/^[0-9].*/, { timeout: 1000 })
                        .then(async () => {
                          const stock = (
                            await page
                              .locator(".stock")
                              .locator(".value")
                              .innerText()
                          ).split(" ");
                          inventoryQuantity = Number(stock[0]);
                        })
                        .catch(() => {
                          inventoryQuantity = 0;
                          console.log("Không tìm được số lượng của", title);
                        });
                    })
                    .catch(() => {
                      console.log(
                        "Không lấy được số lượng sản phẩm của",
                        title
                      );
                    });
                })
                .catch(() => {
                  console.log("Không click được option", title);
                });
            } else {
              inventoryQuantity = 0;
              console.log("Option bị disable");
            }
          }
        } else {
          await expect(
            page.getByText(optionValues[1].values[j], { exact: true })
          )
            .toBeEnabled()
            .then(async () => {
              await page
                .getByText(optionValues[1].values[j], { exact: true })
                .click();
            })
            .catch(() => {
              console.log("Không click được option", title);
            });
        }

        if (optionValues[1].type == "square") {
        } else {
          await expect(
            page.getByText(optionValues[1].values[j], { exact: true })
          )
            .toBeEnabled()
            .then(async () => {
              await page
                .getByText(optionValues[1].values[j], { exact: true })
                .click();
              await page.waitForTimeout(500);
              await expect(page.locator(".stock").locator(".value"))
                .toHaveCount(1, { timeout: 1000 })
                .then(async () => {
                  await expect(page.locator(".stock").locator(".value"))
                    .toHaveText(/^[0-9].*/, { timeout: 1000 })
                    .then(async () => {
                      const stock = (
                        await page
                          .locator(".stock")
                          .locator(".value")
                          .innerText()
                      ).split(" ");
                      inventoryQuantity = Number(stock[0]);
                    })
                    .catch(() => {
                      inventoryQuantity = 0;
                      console.log("Không tìm được số lượng của", title);
                    });
                })
                .catch(() => {
                  console.log("Không lấy được số lượng sản phẩm của", title);
                });
            })
            .catch(() => {
              console.log("Không click được option", title);
            });
        }

        logger.write(`{
          "handler": "${handler}",
          "title": "${productTitle}",
          "priceVnd": ${productPrice ? productPrice : '""'},
          "category": "${category}",
          "manufacturer": ${manufacturer ? `"${manufacturer}"` : '""'},
          "discountable": true,
          "shortDescription": ${
            shortDescription ? `"${shortDescription}"` : '""'
          },
          "description": ${description ? `"${description}"` : '""'},
          "thumbnail": "${imageSrcList[0]}",
          "images": ${JSON.stringify(imageSrcList)},
          "variant": {
            "title": "${title}",
            "inventoryQuantity": ${
              inventoryQuantity ? inventoryQuantity : '""'
            },
            "priceVnd": ${priceVnd ? priceVnd : '""'},
            "options": ${JSON.stringify(options)},
            "allowBackOrder": ${allowBackOrder},
            "manageInventory": ${manageInventory}
          },
          "status": "published"
        },\n`);

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
  const streamFile = "./output/stream-products.json";
  // Tạo file mới nếu chưa tồn tại, ngược lại ghi đè lên file cũ
  var logger = fs.createWriteStream(streamFile);
  logger.write("");

  // Chuyển logger thành mode append
  logger = fs.createWriteStream(streamFile, { flags: "a" });

  // Open the array
  logger.write("[\n");

  const productUrl = {
    "Áo bơi TYR American Dream Diamondfit Swimsuit":
      "https://bhswim.com/%C3%A1o-b%C6%A1i-tyr-american-dream-diamondfit-swimsuit",
    "Quần bơi thi đấu TYR Men’s Venzo Camo High-Waist Jammer Swimsuit Nam":
      "https://bhswim.com/quan-boi-tyr-mens-venzo-camo-high-waist-jammer-swimsuit-nam",
    "Kính Bơi Trẻ Em YINGFA J390AF Kid's Swim Goggles":
      "https://bhswim.com/k%C3%ADnh-b%C6%A1i-tr%E1%BA%BB-em-yingfa-j390af-kids-swim-goggles",
    "Cục ngậm TYR Ultralite Snorkel 2.0 Mouthpiece Replacement":
      "https://bhswim.com/k%C3%ADnh-b%C6%A1i-tr%C3%A1ng-g%C6%B0%C6%A1ng-tyr-black-ops-140-ev-adult-2",
    // sản phẩm có option kích trước đặt trước option màu sắc
    "Quần bơi lửng Nam TYR Sonoma Jammer":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-l%E1%BB%ADng-nam-tyr-sonoma-jammer",
    // số lượng của variant không đúng
    "Quần bơi tam giác 2 mặt Nam TYR Diablos Reversible Racer":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-tam-gi%C3%A1c-2-m%E1%BA%B7t-nam-tyr-diablos-reversible-racer",
    //số lượng của variant không đúng
    "Quần bơi tam giác 2 mặt Nam TYR Coraline Reversible Racer":
      "https://bhswim.com/qu%E1%BA%A7n-b%C6%A1i-tam-gi%C3%A1c-2-m%E1%BA%B7t-nam-tyr-coraline-reversible-racer",
  };
  let products: RawProduct[] = [];
  await page
    .goto(
      productUrl["Quần bơi tam giác 2 mặt Nam TYR Diablos Reversible Racer"],
      {
        waitUntil: "domcontentloaded",
      }
    )
    .then(
      async () =>
        await getProduct(page, "Sản phẩm mới", logger).then(
          (productVariants) => {
            products.push(...productVariants);
          }
        )
    );

  // Close the array
  logger.write("]");

  exportFiles(products, true);
});
