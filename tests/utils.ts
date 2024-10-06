import csvjson from "csvjson";
import fs from "fs";
import path from "path";
import { MedusaProduct, RawProduct } from "./bhswim.type";
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const convertRawToMedusaProduct = (rawProduct: RawProduct): MedusaProduct | null => {
  if (!rawProduct.variant) {
    return null;
  }

  const product: MedusaProduct = {
    "Product Id": "",
    "Product Handle": rawProduct.handler,
    "Product Title": rawProduct.title,
    "Product Subtitle": "", // Assuming no subtitle in RawProduct
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
    "Product Tags": "", // Assuming no tags in RawProduct
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
      ? Object.keys(rawProduct.variant.options)[0]
      : "",
    "Option 1 Value": rawProduct.variant.options
      ? Object.values(rawProduct.variant.options)[0].label
      : "",
    "Option 2 Name": rawProduct.variant.options
      ? Object.keys(rawProduct.variant.options)[1]
      : "",
    "Option 2 Value": rawProduct.variant.options
      ? Object.values(rawProduct.variant.options)[1].label
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
  };

  for (const image in rawProduct.images) {
    if (parseInt(image) >= 5) {
      break;
    }
    product[`Image ${parseInt(image) + 1} Url`] = rawProduct.images[image];
  }

  return product;
};

export function convertJsonToCsv() {
  var data = fs.readFileSync(path.join(__dirname, "../san-pham-moi.json"), {
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
  fs.writeFile("output.csv", csvData, "utf-8", (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Conversion successful. CSV file created.");
  });
}
