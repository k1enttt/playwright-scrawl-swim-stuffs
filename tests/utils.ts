import csvjson from "csvjson";
import fs from "fs";
import { MedusaProduct, RawProduct, SearchIndex } from "./bhswim.type";
import { expect, Page } from "@playwright/test";

const diacriticsMap: { [key: string]: string } = {
  á: "a",
  à: "a",
  ả: "a",
  ã: "a",
  ạ: "a",
  ă: "a",
  ắ: "a",
  ằ: "a",
  ẳ: "a",
  ẵ: "a",
  ặ: "a",
  â: "a",
  ấ: "a",
  ầ: "a",
  ẩ: "a",
  ẫ: "a",
  ậ: "a",
  é: "e",
  è: "e",
  ẻ: "e",
  ẽ: "e",
  ẹ: "e",
  ê: "e",
  ế: "e",
  ề: "e",
  ể: "e",
  ễ: "e",
  ệ: "e",
  í: "i",
  ì: "i",
  ỉ: "i",
  ĩ: "i",
  ị: "i",
  ó: "o",
  ò: "o",
  ỏ: "o",
  õ: "o",
  ọ: "o",
  ô: "o",
  ố: "o",
  ồ: "o",
  ổ: "o",
  ỗ: "o",
  ộ: "o",
  ơ: "o",
  ớ: "o",
  ờ: "o",
  ở: "o",
  ỡ: "o",
  ợ: "o",
  ú: "u",
  ù: "u",
  ủ: "u",
  ũ: "u",
  ụ: "u",
  ư: "u",
  ứ: "u",
  ừ: "u",
  ử: "u",
  ữ: "u",
  ự: "u",
  ý: "y",
  ỳ: "y",
  ỷ: "y",
  ỹ: "y",
  ỵ: "y",
  Á: "A",
  À: "A",
  Ả: "A",
  Ã: "A",
  Ạ: "A",
  Ă: "A",
  Ắ: "A",
  Ằ: "A",
  Ẳ: "A",
  Ẵ: "A",
  Ặ: "A",
  Â: "A",
  Ấ: "A",
  Ầ: "A",
  Ẩ: "A",
  Ẫ: "A",
  Ậ: "A",
  É: "E",
  È: "E",
  Ẻ: "E",
  Ẽ: "E",
  Ẹ: "E",
  Ê: "E",
  Ế: "E",
  Ề: "E",
  Ể: "E",
  Ễ: "E",
  Ệ: "E",
  Í: "I",
  Ì: "I",
  Ỉ: "I",
  Ĩ: "I",
  Ị: "I",
  Ó: "O",
  Ò: "O",
  Ỏ: "O",
  Õ: "O",
  Ọ: "O",
  Ô: "O",
  Ố: "O",
  Ồ: "O",
  Ổ: "O",
  Ỗ: "O",
  Ộ: "O",
  Ơ: "O",
  Ớ: "O",
  Ờ: "O",
  Ở: "O",
  Ỡ: "O",
  Ợ: "O",
  Ú: "U",
  Ù: "U",
  Ủ: "U",
  Ũ: "U",
  Ụ: "U",
  Ư: "U",
  Ứ: "U",
  Ừ: "U",
  Ử: "U",
  Ữ: "U",
  Ự: "U",
  Ý: "Y",
  Ỳ: "Y",
  Ỷ: "Y",
  Ỹ: "Y",
  Ỵ: "Y",
  Đ: "D",
  đ: "d",
};
export function removeDiacritics(str: string): string {
  return str.replace(/[^\u0000-\u007E]/g, function (a) {
    return diacriticsMap[a] || a;
  });
}

export function removeOthers(str: string): string {
  // Remove all the character that are not a-z, A-Z, - and _
  return str.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function checkValidId(id: string) {
  // Valid id must only contain a-z, A-Z, 0-9, - and _
  return /^[a-zA-Z0-9_-]*$/.test(id);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getValueFromPrice(price: string) {
  return parseInt(price.replace(/[^0-9]/g, ""));
}

export const convertRawToMedusaProduct = (
  rawProduct: RawProduct
): MedusaProduct | null => {
  if (!rawProduct.variant) {
    return null;
  }

  const categories = rawProduct.category?.split(",");
  const categoryHandle = categories
    ?.map((category) =>
      removeOthers(
        removeDiacritics(category.toLowerCase())
      ).replace(/\s+/g, "-")
    )
    .join("_");

  const product: MedusaProduct = {
    "Product Id": "",
    "Product Handle": rawProduct.handle,
    "Product Title": rawProduct.title,
    "Product Subtitle": rawProduct.shortDescription || "", // Assuming no subtitle in RawProduct
    "Product Description": rawProduct.description || "",
    "Product Status": rawProduct.status,
    "Product Thumbnail": rawProduct.thumbnail || "",
    "Product Weight": "", // Assuming no weight in RawProduct
    "Product Length": "", // Assuming no length in RawProduct
    "Product Width": "", // Assuming no width in RawProduct
    "Product Height": "", // Assuming no height in RawProduct
    "Product HS Code": "", // Assuming no HS code in RawProduct
    "Product Origin Country": "", // Assuming no origin country in RawProduct
    "Product MID Code": "", // Assuming no MID code in RawProduct
    "Product Material": "", // Assuming no material in RawProduct
    "Product Collection Title": "", // Assuming no collection title in RawProduct
    "Product Collection Handle": "", // Assuming no collection handle in RawProduct
    "Product Type": "", // Assuming no type in RawProduct
    "Product Tags": rawProduct.category || "", // Assuming no tags in RawProduct
    "Product Discountable": true, // Assuming all products are discountable
    "Product External Id": "", // Assuming no external ID in RawProduct
    "Product Profile Name": "", // Assuming no profile name in RawProduct
    "Product Profile Type": "", // Assuming no profile type in RawProduct
    "Variant Id": "", // Assuming no variant ID in RawProduct
    "Variant Title": rawProduct.variant.title || "",
    "Variant SKU": "", // Assuming no SKU in RawProduct
    "Variant Barcode": "", // Assuming no barcode in RawProduct
    "Variant Inventory Quantity": rawProduct.variant.inventoryQuantity || 0,
    "Variant Allow Backorder": false,
    "Variant Manage Inventory": true,
    "Variant Weight": "", // Assuming no weight in RawProduct
    "Variant Length": "", // Assuming no length in RawProduct
    "Variant Width": "", // Assuming no width in RawProduct
    "Variant Height": "", // Assuming no height in RawProduct
    "Variant HS Code": "", // Assuming no HS code in RawProduct
    "Variant Origin Country": "", // Assuming no origin in RawProduct
    "Variant MID Code": "", // Assuming no MID code in RawProduct;
    "Variant Material": "", // Assuming no material in RawProduct;
    "Price EUR": "", // Assuming no EUR price in RawProduct
    "Price USD": "", // Assuming no USD price in RawProduct;
    "Price VND": rawProduct.priceVnd?.toString() || "",
    "Option 1 Name": rawProduct.variant.options
      ? Object.keys(rawProduct.variant.options)[0] || ""
      : "",
    "Option 1 Value": rawProduct.variant.options
      ? Object.values(rawProduct.variant.options)[0] || ""
      : "",
    "Option 2 Name": rawProduct.variant.options
      ? Object.keys(rawProduct.variant.options)[1] || ""
      : "",
    "Option 2 Value": rawProduct.variant.options
      ? Object.values(rawProduct.variant.options)[1] || ""
      : "",
    "Image 1 Url": "",
    "Image 2 Url": "",
    "Image 3 Url": "",
    "Image 4 Url": "",
    "Image 5 Url": "",
    "Image 6 Url": "",
    "Image 7 Url": "",
    "Image 8 Url": "",
    "Image 9 Url": "",
    "Image 10 Url": "",
    "Image 11 Url": "",
    "Image 12 Url": "",
    "Image 13 Url": "",
    "Image 14 Url": "",
    "Image 15 Url": "",
    "Sales Channel 1 Name": "Default Sale Channel",
    "Product Category 1 Handle": categoryHandle || "",
    "Product Category 1 Name": rawProduct.category || "",
  };

  if (rawProduct.images) {
    for (let i = 1; i <= 15; i++) {
      product[`Image ${i} Url`] = rawProduct.images[i] || "";
    }
  }

  return product;
};

export function convertJsonToCsv(inputPath: string, outputPath: string) {
  // "./output/products.json"
  var data = fs.readFileSync(inputPath, {
    encoding: "utf8",
  });
  var options = {
    delimiter: ";",
    wrap: false,
    headers: "key",
  };
  /* supported options
 
    delimiter = <String> optional default value is ","
    wrap  = <String|Boolean> optional default value is false
    headers = <String> optional supported values are "full", "none", "relative", "key"
    objectDenote = <String> optional default value is "."
    arrayDenote = <String> optional default value is "[]"
*/

  const csvData = csvjson.toCSV(data, options);

  /*
  returns
  
  book.person[].firstName,book.person[].lastName,book.person[].age,book.person[].address.streetAddress,book.person[].address.city,book.person[].address.state,book.person[].address.postalCode,book.person[].hobbies[]
  Jane,Doe,25,21 2nd Street,Las Vegas,NV,10021-3100,gaming;volleyball
  Agatha,Doe,25,21 2nd Street,Las Vegas,NV,10021-3100,dancing;politics
  
  */

  // Write CSV data to file
  // "./output/products.csv"
  fs.writeFile(outputPath, csvData, "utf-8", (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Conversion successful. CSV file created.");
  });
}

export function convertRawToSearchingData(
  medusaProducts: (MedusaProduct | null)[]
) {
  let count = 0;
  return medusaProducts.map((product) => {
    if (!product) {
      return null;
    }
    return {
      id: (++count).toString(),
      handle: product["Product Handle"],
      title: product["Product Title"],
      category: product["Product Category 1 Name"],
      short_description: product["Product Subtitle"],
      description: product["Product Description"],
      variant: product["Variant Title"],
      thumbnail: product["Product Thumbnail"],
    };
  });
}

export function exportCrawlFiles(data: RawProduct[], isTest?: boolean) {
  const convertedData = data.map((product) =>
    convertRawToMedusaProduct(product)
  );

  // Xuất dữ liệu để nạp vào MeiliSearch
  const searchFile = isTest
    ? `./output/search-test.json`
    : `./output/crawl-by-manufacturers/meilisearch.json`;
  const searchData = convertRawToSearchingData(convertedData);

  // Xuất dữ liệu sản phẩm ở dạng json
  fs.writeFileSync(searchFile, JSON.stringify(searchData));
  const medusaFile = isTest
    ? `./output/products-test.json`
    : `./output/crawl-by-manufacturers/products.json`;
  fs.writeFileSync(medusaFile, JSON.stringify(convertedData));

  // Xuất dữ liệu sản phẩm ở dạng csv
  const csvFile = isTest
    ? `./output/products-medusa-test.csv`
    : `./output/crawl-by-manufacturers/products-medusa.csv`;
  convertJsonToCsv(medusaFile, csvFile);
}

export function exportCrawlInfo({
  currentProductUrl,
  currentPage,
  currentCategory,
}: {
  currentProductUrl: string;
  currentPage: number;
  currentCategory: string;
}) {
  const crawlInfoFile = "./output/crawl-info.json";

  fs.writeFileSync(
    crawlInfoFile,
    JSON.stringify({ currentProductUrl, currentPage, currentCategory })
  );

  console.log("Đã xuất thông tin crawl");
}

/**
 * Merges an array of product variant data into a consolidated array of search index entries.
 *
 * @param data - An array of product variant objects, each containing the following properties:
 *   - `id`: The unique identifier for the product variant.
 *   - `handler`: The handler or identifier for the product.
 *   - `title`: The title of the product.
 *   - `category`: The category to which the product belongs.
 *   - `short_description`: A short description of the product.
 *   - `description`: A detailed description of the product.
 *   - `variant`: The variant identifier of the product.
 *
 * @returns An array of `SearchIndex` objects, where each object represents a consolidated product entry with merged variants.
 */
export function mergeVariant(
  data: {
    id: string;
    handle: string;
    title: string;
    category: string;
    short_description: string;
    description: string;
    variant: string;
    thumbnail: string;
  }[]
): SearchIndex[] {
  const mergedData: SearchIndex[] = [];
  let documentId = 0;
  data.forEach((product) => {
    const index = mergedData.findIndex(
      (item) => item.handle === product.handle
    );
    if (index === -1) {
      documentId++;
      mergedData.push({
        id: documentId.toString(),
        handle: product.handle,
        title: product.title,
        category: product.category,
        short_description: product.short_description,
        description: product.description,
        variants: [product.variant],
        thumbnail: product.thumbnail,
      });
    } else {
      // If the variant is not already in the array, add it
        if (!mergedData[index].variants.includes(product.variant)) {
          mergedData[index].variants.push(product.variant);
      }
    }
  });

  return mergedData;
}

export async function getNumberOfPages(page: Page): Promise<number> {
  // Lấy số trang sản phẩm
  let numberOfPages = 1;
  let haveLastPage = true;
  let haveMoreThanOnePage = true;

  // Kiểm tra xem có trang cuối cùng không
  haveLastPage = await expect(
    page.locator(".products-wrapper").locator(".last-page")
  )
    .toHaveCount(1, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (haveLastPage) {
    numberOfPages = Number(
      await page
        .locator(".products-wrapper")
        .locator(".last-page")
        .first()
        .locator("a")
        .getAttribute("data-page")
    );
  } else {
    // Kiểm tra xem có số trang có nhiều hơn 1 không
    haveMoreThanOnePage = await expect(
      page.locator(".products-wrapper").locator(".next-page")
    )
      .toHaveCount(1, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (haveMoreThanOnePage) {
      numberOfPages =
        (
          await page
            .locator(".products-wrapper")
            .locator(".pager")
            .locator("li")
            .all()
        ).length - 1;
    }
  }
  return numberOfPages;
}
