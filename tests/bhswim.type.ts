export type RawProduct = {
  handler: string;
  title: string;
  manufacturer: string | null;
  status: "published" | "draft";
  quantity: number | null;
  discountable?: boolean;
  shortDescription: string | null;
  description: string | null;
  thumbnail: string | null;
  images: string[] | null;
  priceVnd: number | null;
  variant?:
    | {
        title: string;
        inventoryQuantity: number | null;
        allowBackOrder?: boolean;
        priceVnd: number | null;
        options: Record<
          string,
          {
            label: string;
            value: string;
          }
        >;
        manageInventory?: boolean;
      }
    | null;
};

export type MedusaProduct = {
  "Product Id": string;
  "Product Handle": string;
  "Product Title": string;
  "Product Subtitle": string;
  "Product Description": string;
  "Product Status": "published" | "draft";
  "Product Thumbnail": string;
  "Product Weight": string;
  "Product Length": string;
  "Product Width": string;
  "Product Height": string;
  "Product HS Code": string;
  "Product Origin Country": string;
  "Product MID Code": string;
  "Product Material": string;
  "Product Collection Title": string;
  "Product Collection Handle": string;
  "Product Type": string;
  "Product Tags": string;
  "Product Discountable": boolean;
  "Product External Id": string;
  "Product Profile Name": string;
  "Product Profile Type": string;
  "Variant Id": string;
  "Variant Title": string;
  "Variant SKU": string;
  "Variant Barcode": string;
  "Variant Inventory Quantity": number;
  "Variant Allow Backorder": boolean;
  "Variant Manage Inventory": boolean;
  "Variant Weight": string;
  "Variant Length": string;
  "Variant Width": string;
  "Variant Height": string;
  "Variant HS Code": string;
  "Variant Origin Country": string;
  "Variant MID Code": string;
  "Variant Material": string;
  "Price EUR": string;
  "Price USD": string;
  "Price VND": string;
  "Option 1 Name": string;
  "Option 1 Value": string;
  "Option 2 Name": string;
  "Option 2 Value": string;
  "Image 1 Url": string;
  "Image 2 Url": string;
  "Image 3 Url": string;
  "Image 4 Url": string;
  "Image 5 Url": string;
  "Image 6 Url": string;
  "Image 7 Url": string;
  "Image 8 Url": string;
  "Image 9 Url": string;
  "Image 10 Url": string;
};

