import test from "@playwright/test";
import fs from "fs";
import { MedusaProduct } from "./bhswim.type";

type APIProduct = {
  product: {
    title: string;
    subtitle: string;
    description: string;
    images: string[];
    thumbnail: string;
    handle: string;
    status: string;
    tags: {
      value: string;
    }[];
    options: {
      title: string;
    }[];
    variants: {
      title: string;
      inventory_quantity: number;
      allow_backorder: boolean;
      manage_inventory: boolean;
      prices: {
        amount: number;
        currency_code: string;
      }[];
      options: {
        value: string;
      }[];
    }[];
  };
  category_handle: string;
};

test("Export products data suitable for the API", async () => {
  // Parse sản phẩm từ file /output/final/products.json
  const data = fs.readFileSync("./output/final/products.json", "utf-8");
  const previousProducts = JSON.parse(data) as MedusaProduct[];

  // Chuyển đổi sản phẩm sang dạng phù hợp cho API
  const products: APIProduct[] = previousProducts.map(
    (product: MedusaProduct) => {
      const images: string[] = [];
      for (let i = 1; i <= 15; i++) {
        const image = product[`Image ${i} Url`];
        if (image) {
          const imageIndex = images.findIndex((item) => item === image);
          if (imageIndex === -1) {
            images.push(image);
          }
        }
      }
      const options: { title: string }[] = [];
      ["Option 1", "Option 2"].forEach((option) => {
        const optionName = product[`${option} Name`];
        if (optionName) {
          options.push({
            title: optionName,
          });
        }
      });

      const variants: {
        title: string;
        inventory_quantity: number;
        allow_backorder: boolean;
        manage_inventory: boolean;
        prices: {
          amount: number;
          currency_code: string;
        }[];
        options: {
          value: string;
        }[];
      }[] = [];

      // [BUG] Variant của sp "Áo Bơi Thi Đấu Nữ TYR Women’s Avictor 2.0 Exolon Closed Back Swimsuit"
      // chỉ có 1 variant, nhưng trong file products.json có 2 variant

      variants.push({
        title: product["Variant Title"],
        inventory_quantity: product["Variant Inventory Quantity"],
        allow_backorder: product["Variant Allow Backorder"],
        manage_inventory: product["Variant Manage Inventory"],
        prices: [
          {
            amount: Number(product["Price VND"]),
            currency_code: "VND",
          },
        ],
        options: [],
      });

      variants.forEach((variant) => {
        ["Option 1", "Option 2"].forEach((option) => {
          const optionValue = product[`${option} Value`];
          if (optionValue) {
            variant.options.push({
              value: optionValue,
            });
          }
        });
      });

      return {
        product: {
          title: product["Product Title"],
          subtitle: product["Product Subtitle"],
          description: product["Product Description"],
          images,
          thumbnail: product["Product Thumbnail"],
          handle: product["Product Handle"],
          status: product["Product Status"],
          tags: product["Product Tags"].split(",").map((tag: string) => {
            return {
              value: tag,
            };
          }),
          options,
          variants,
        },
        category_handle: product["Product Category 1 Handle"],
      };
    }
  );

  // Gom variant theo handle của sản phẩm
  const productsMap: APIProduct[] = [];
  products.forEach((product) => {
    const productIndex = productsMap.findIndex(
      (item) => item.product.handle === product.product.handle
    );
    if (productIndex === -1) {
      productsMap.push(product);
    } else {
      productsMap[productIndex].product.variants.push(
        ...product.product.variants
      );
    }
  });

  // Ghi ra file /output/final/products-api.json
  fs.writeFileSync(
    "./output/products-api.json",
    JSON.stringify(products, null, 2)
  );
});
