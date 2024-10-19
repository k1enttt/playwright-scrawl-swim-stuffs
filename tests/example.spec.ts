import { test, expect } from "@playwright/test";
import {
  checkValidId,
  convertJsonToCsv,
  convertRawToSearchingData,
  mergeVariant,
  removeDiacritics,
  removeOthers,
  sleep,
} from "./utils";
import { MedusaProduct, RawProduct, SearchIndex } from "./bhswim.type";
import fs from "fs";

test("has title", async ({ page }) => {
  await page.goto("https://playwright.dev/");

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test("get started link", async ({ page }) => {
  await page.goto("https://playwright.dev/");

  // Click the get started link.
  await page.getByRole("link", { name: "Get started" }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(
    page.getByRole("heading", { name: "Installation" })
  ).toBeVisible();
});

test("lấy-số-lượng-từng-option", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);

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
  // await page.goto(pageUrl, { waitUntil: "commit" });
  await page.goto("https://bhswim.com/newproducts", { waitUntil: "commit" });

  // Lấy số lượng trang sản phẩm
  for (let category of categories) {
    if (category.label != "Sản phẩm mới") break;

    // Lấy danh sách sản phẩm trên từng trang
    for (let i = 1; i <= 1; i++) {
      const url =
        pageUrl + category.url + `?pagenumber=${i}&pagesize=${productPerPage}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      // Lấy danh sách url sản phẩm
      const itemLocators = await page
        .locator(".products-container")
        .locator(".item-box")
        .all();

      const promises = itemLocators.map(async (item) => {
        await item
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
  for (const item of productUrls) {
    const productUrl = pageUrl + item.url;
    await page.goto(productUrl).then(async () => {
      // Lấy tên sản phẩm
      const productTitle = await expect(
        page.locator(".product-name").locator("h1")
      )
        .toHaveCount(1)
        .then(async () => {
          return (
            (await page.locator(".product-name").locator("h1").textContent()) ||
            ""
          );
        });

      console.log(productTitle);
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
        const optionValuesLocators = await optionValueLocator[i]
          .locator("ul")
          .locator("li")
          .all();
        const values: { label: string; value: string }[] = [];

        for (let optionValue of optionValuesLocators) {
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
              (await optionValue
                .locator("span")
                .first()
                .getAttribute("title")) || "";
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

      if (optionKeys.length === 0) {
        logger.write(`{
      "title": "${productTitle}",
      "variant": {
        "title": ${productTitle},
        "inventoryQuantity": 0,
        "options": {},
      },
      "status": "published"
    },\n`);
      } else if (optionKeys.length === 1) {
        for (let i = 0; i < optionValues[0].values.length; i++) {
          const title = optionValues[0].values[i].label;
          const options = {
            [optionKeys[0]]: optionValues[0].values[i],
          };
          let inventoryQuantity: number | null = null;

          const childLocator = page.getByTitle(
            optionValues[0].values[i].label,
            { exact: true }
          );
          const isDisabledOption = await page
            .locator("label")
            .filter({ has: childLocator })
            .locator("input")
            .getAttribute("disabled");

          if (isDisabledOption == null) {
            await page
              .getByTitle(optionValues[0].values[i].label, { exact: true })
              .locator("span")
              .click();
            await sleep(500);
            inventoryQuantity = Number(
              (
                await page.locator(".stock").locator(".value").innerText()
              ).split(" ")[0]
            );
          }

          logger.write(`{
        "title": "${productTitle}",
        "variant": {
          "title": "${title}",
          "inventoryQuantity": ${inventoryQuantity ? inventoryQuantity : null},
          "options": ${options},
          "allowBackOrder": false,
          "manageInventory": true,
        },
        "status": "published"
      },\n`);
        }
      } else if (optionKeys.length === 2) {
        for (let i = 0; i < optionValues[0].values.length; i++) {
          for (let j = 0; j < optionValues[1].values.length; j++) {
            const title = `${optionValues[0].values[i].label} / ${optionValues[1].values[j].label}`;
            const allowBackOrder = false;
            const manageInventory = true;
            const options = {
              [optionKeys[0]]: optionValues[0].values[i],
              [optionKeys[1]]: optionValues[1].values[j],
            };
            let inventoryQuantity: number | null = null;

            const childLocator = page.getByTitle(
              optionValues[0].values[i].label,
              { exact: true }
            );
            const isDisabledOption = await page
              .locator("label")
              .filter({ has: childLocator })
              .locator("input")
              .getAttribute("disabled");

            if (isDisabledOption == null) {
              await page
                .getByTitle(optionValues[0].values[i].label, { exact: true })
                .locator("span")
                .click();
              await sleep(500);
              inventoryQuantity = Number(
                (
                  await page.locator(".stock").locator(".value").innerText()
                ).split(" ")[0]
              );
            }

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
              })
              .catch(() => {});

            logger.write(`{
          "title": "${productTitle}",
          "variant": {
            "title": "${title}",
            "inventoryQuantity": ${inventoryQuantity},
            "options": ${options},
         },
        },\n`);
          }
        }
      }
    });
  }
  console.log("Crawl sản phẩm xong");
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

test("Lay-href-categories", async ({ page }) => {
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

  // Lấy href của các category
  await page.getByRole("link", { name: "Sản phẩm mới" }).first().click();
  const categoryLocators = await page
    .locator(".block-category-navigation")
    .locator("a")
    .all();

  for (const locator of categoryLocators) {
    const url = await locator.getAttribute("href");
    if (url) {
      console.log(url);
      // Add to the categories object
      const key = url.split("/")[url.split("/").length - 1];
      const name = (await locator.innerText()).trim();
      categories[key] = { name, url };
    }
  }

  console.log(categories);
});

test("vào-từng-cate", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  const pageUrl = "https://bhswim.com";
  const productPerPage: 20 | 30 | 50 = 20;
  const categories: { label: string; url: string }[] = [
    {
      label: "Sản phẩm mới",
      url: "/newproducts",
    },
  ];
  const products: RawProduct[] = [];
  const productUrls: string[] = [];

  // Mở trang web
  await page.goto(pageUrl);

  // Lấy href của các category
  await page.getByRole("link", { name: "Sản phẩm mới" }).first().click();
  const categoryLocators = await page
    .locator(".block-category-navigation")
    .locator("li")
    .all();

  for (const locator of categoryLocators) {
    const url = await locator.locator("a").getAttribute("href");
    if (url) {
      console.log(url);
      const label = (await locator.innerText()).trim();
      categories.push({ label, url });
    }
  }

  // Lấy số lượng trang sản phẩm
  const pageNumber = await page
    .getByRole("link", { name: " Cuối cùng" })
    .getAttribute("data-page");

  for (let category of categories) {
    // Lấy danh sách sản phẩm trên từng trang
    for (let i = 1; i <= Number(pageNumber); i++) {
      const url =
        pageUrl + category.url + `?pagenumber=${i}&pagesize=${productPerPage}`;
      await page.goto(url);
      // Lấy danh sách url sản phẩm
      const itemLocators = await page
        .locator(".products-container")
        .locator(".item-box")
        .all();

      for (let item of itemLocators) {
        const url = await item.getByRole("link").first().getAttribute("href");
        if (url) {
          productUrls.push(url);
        }
      }
    }
  }
});

test("crawl-multitags", async ({ page }) => {
  const productList = [
    "https://bhswim.com/%C3%A1o-b%C6%A1i-thi-%C4%91%E1%BA%A5u-n%E1%BB%AF-tyr-womens-avictor-20-exolon-closed-back-swimsuit",
    "https://bhswim.com/k%C3%ADnh-b%C6%A1i-tr%C3%A1ng-g%C6%B0%C6%A1ng-tyr-black-ops-140-ev-adult-2",
  ];

  for (let product of productList) {
    const secondPage = await page.context().newPage();
    await page.goto(product);
    const tags = await page.locator(".tags").locator("a").all();
    for (let tag of tags) {
      console.log(await tag.innerText());
    }
  }
});

test("Lăn chuột xuống cuối trang", async ({ page }) => {
  test.setTimeout(6 * 60 * 60 * 1000);
  const url = "https://bhswim.com/hoat-dong-nu";

  // Mở trang web
  await page.goto(url);

  // Lăn chuột xuống cuối trang

  // Scroll to the bottom:
  let prevHeight = -1;
  const maxScrolls = 100;
  let scrollCount = 0;

  while (scrollCount < maxScrolls) {
    // Execute JavaScript to scroll to the bottom of the page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for new content to load (change this value as needed)
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight !== prevHeight) {
        break;
      }
    }
    // Check whether the scroll height changed - means more pages are there
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === prevHeight) {
      break;
    }
    prevHeight = newHeight;
    scrollCount++;
  }

  // Đếm số lượng sản phẩm
  const productListLocator = await page
    .locator(".products-wrapper")
    .locator(".item-box")
    .all();
  console.log(`- Số lượng sản phẩm: ${productListLocator.length}`);
});

test("Lấy danh sách category", async ({ page }) => {
  test.setTimeout(6 * 60 * 60 * 1000);
  const categories: { label: string; url: string }[] = [
    {
      label: "Sản phẩm mới",
      url: "/newproducts",
    },
  ];

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
        console.log(`- ${label}: ${url}`);
      }
    }
  }
  await getCategories();
});

test("Lấy danh sách con của category", async ({ page }) => {
  const label = "DỤNG CỤ BƠI LỘI (130)";
  const url = "/dung-cu-boi-loi-nam";
  const baseUrl = "https://bhswim.com";

  // Mở trang web
  await page.goto(baseUrl + url, {
    waitUntil: "domcontentloaded",
  });

  // Lấy href của các category con
  const subCategoriesLocator = await page
    .locator(".block-category-navigation")
    .getByRole("listitem")
    .filter({ has: page.getByText(label, { exact: true }) })
    .last()
    .locator("ul")
    .first()
    .locator("li")
    .all();

  for (const locator of subCategoriesLocator) {
    const url = await locator
      .locator("a")
      .getAttribute("href", { timeout: 5000 })
      .catch(() => null);
    if (url) {
      const label = (await locator.locator("a").innerText()).trim();
      console.log(`- ${label}: ${url}`);
    }
  }
});

test("Lấy danh sách sản phẩm từ category", async ({ page }) => {
  const baseUrl = "https://bhswim.com";
  const url = "/dung-cu-boi-loi-nam";
  const category = "DỤNG CỤ BƠI LỘI (130)";

  const productListLocator = page
    .locator(".products-wrapper")
    .locator(".item-box")
    .all();
});

/**
 * Test dùng để gộp hết dữ liệu crawl từ các file trong thư mục output/crawl thành một file duy nhất
 * và xuất ra thành index documents thành file search.json dùng để tìm kiếm
 */
test("Export search indexes", async () => {
  // Đọc dữ liệu của từng file trong thư mục output/crawl/
  const files = fs.readdirSync("./output/crawl");
  let products: MedusaProduct[] = [];
  for (let file of files) {
    const rawData = fs.readFileSync(`./output/crawl/${file}`, "utf-8");
    const data = JSON.parse(rawData);
    products.push(...data);
  }

  // Chuyển dữ liệu thành format search index
  const searchIndexes = convertRawToSearchingData(products);

  // Xuất dữ liệu ra file
  fs.writeFileSync("./output/search.json", JSON.stringify(searchIndexes));
});

/**
 * Test dùng để kiểm tra xem các handle của sản phẩm có hợp lệ không
 * Handle hợp lệ: chỉ chứa các ký tự a-z, A-Z, 0-9, dấu gạch ngang (-) và daa dấu gạch dưới (_)
 */
test("Check valid product handle", async () => {
  const searchIndexes = fs.readFileSync("./output/products.json", "utf-8");
  const data = JSON.parse(searchIndexes) as MedusaProduct[];
  for (let item of data) {
    const isValidId = checkValidId(item["Product Handle"]);
    if (!isValidId) {
      throw new Error(`Invalid id: ${item["Product Handle"]}`);
    }
  }
});

/**
 * Test dùng để lấy dữ liệu sản phẩm đã crawl và thay đổi dữ liệu thành dạng csv
 * Các bước thay đổi dữ liệu:
 * 1. Chỉnh sửa `handle`:
 *  - Chuyển tất cả chữ cái có dấu thành chữ cái không dấu
 *  - Loại bỏ các ký tự đặc biệt
 * 2. Thêm tên sales channel: Default Sale Channel
 */
test("Làm sạch handler cho sản phẩm", () => {
  // Đọc dữ liệu từ các file trong thư mục output/crawl
  const files = fs.readdirSync("./output/crawl");
  let products: MedusaProduct[] = [];
  for (let file of files) {
    const rawData = fs.readFileSync(`./output/crawl/${file}`, "utf-8");
    const data = JSON.parse(rawData);
    products.push(...data);
  }

  // Làm sạch handler của từng sản phẩm trong dữ liệu
  const cleanedProducts: MedusaProduct[] = products.map((product) => {
    return {
      ...product,
      "Product Handle": removeOthers(
        removeDiacritics(product["Product Handle"])
      ),
      "Sales Channel 1 Name": "Default Sale Channel",
    };
  });

  // Xuất thành một file csv của dữ liệu sản phẩm đã làm sạch
  fs.writeFileSync("./output/products.json", JSON.stringify(cleanedProducts));
  convertJsonToCsv("./output/products.json", "./output/products.csv");
});

test("Làm sạch handler cho search index documents", () => {
  // Đọc dữ liệu từ file search.json
  const files = fs.readFileSync("./output/search.json", "utf-8");
  let products: SearchIndex[] = [];

  // Làm sạch handler của từng sản phẩm trong dữ liệu
  const cleanedProducts: SearchIndex[] = products.map((product) => {
    return {
      ...product,
      handler: removeOthers(removeDiacritics(product.handle)),
    };
  });

  // Xuất thành một file csv của dữ liệu sản phẩm đã làm sạch
  fs.writeFileSync("./output/search.json", JSON.stringify(cleanedProducts));
});

/**
 * Test dùng để lấy search index document đã có và gộp chung các variant của cùng một sản phẩm thành 1 document
 */
test("Gộp các variant của cùng một sản phẩm thành 1 document", () => {
  // Đọc dữ liệu từ file search.json
  const searchIndexes = fs.readFileSync(
    "./output/crawl-by-manufacturers/meilisearch.json",
    "utf-8"
  );
  const data = JSON.parse(searchIndexes) as {
    id: string;
    handle: string;
    title: string;
    category: string;
    short_description: string;
    description: string;
    variant: string;
    thumbnail: string;
  }[];

  // Gộp các variant của cùng một sản phẩm thành 1 document
  const mergedData = mergeVariant(data);

  // Tách category thành mảng các category
  const productsWithCategories = mergedData.map((item) => {
    const categories = item.category.split(",");
    return {
      ...item,
      category: categories,
    };
  });

  // Xuất dữ liệu ra file search.json
  fs.writeFileSync(
    "./output/final/meilisearch-converted.json",
    JSON.stringify(productsWithCategories)
  );
});

/**
 * Test chỉ sử dụng 1 lần
 * Test dùng để xóa các variant lặp lại trong search index documents
 */
test("Xóa các variant lặp lại trong search index documents", () => {
  // Đọc dữ liệu từ file search.json
  const searchIndexes = fs.readFileSync("./output/search.json", "utf-8");
  const data = JSON.parse(searchIndexes) as SearchIndex[];
  const sampleData = [
    {
      id: "4",
      handler: "đồ-bơi-1-mảnh-trẻ-em-yingfa-24u722-kids-swimsuit",
      title: "Đồ Bơi 1 Mảnh Trẻ Em YINGFA 24U722 Kid's Swimsuit",
      category: "",
      short_description: "",
      description: "",
      variant: [
        "Tím nhạt / Size 8",
        "Tím nhạt / Size 10",
        "Tím nhạt / Size 6",
        "Tím nhạt / Size 8",
        "Tím nhạt / Size 10",
        "Tím nhạt / Size 6",
      ],
    },
    {
      id: "5",
      handler: "kính-bơi-trẻ-em-yingfa-j390af-kids-swim-goggles",
      title: "Kính Bơi Trẻ Em YINGFA J390AF Kid's Swim Goggles",
      category: "",
      short_description: "",
      description: "",
      variant: [
        "-1 Đen/Đỏ",
        "-2 Đen/Trắng",
        "-3 Xanh/Cam",
        "-4 Xanh/Hồng",
        "-5 Xanh lá/Vàng",
        "-1 Đen/Đỏ",
        "-2 Đen/Trắng",
        "-3 Xanh/Cam",
        "-4 Xanh/Hồng",
        "-5 Xanh lá/Vàng",
      ],
    },
  ];

  // Xóa các variant lặp lại
  const cleanedData = data.map((item) => {
    const variants = item.variants;
    const uniqueVariants = variants.filter(
      (variant, index, self) => index === self.findIndex((v) => v === variant)
    );

    return {
      ...item,
      variant: uniqueVariants,
    };
  });

  // Xuất dữ liệu ra file search.json
  fs.writeFileSync("./output/search.json", JSON.stringify(cleanedData));
});

test("Liệt kê các category đã crawl", async () => {
  const searchIndexesFiles = [
    "meilisearch-1-converted.json",
    "meilisearch-2-converted.json",
  ];

  const searchIndexes: SearchIndex[] = [];
  const categories: string[] = [];

  for (let file of searchIndexesFiles) {
    const readStream = fs.readFileSync(
      `./output/crawl-by-manufacturers/${file}`,
      "utf-8"
    );
    const data = JSON.parse(readStream) as SearchIndex[];
    searchIndexes.push(...data);
  }

  for (let item of searchIndexes) {
    if (!categories.includes(item.category)) {
      categories.push(item.category);
    }
  }

  console.log(categories);
});
