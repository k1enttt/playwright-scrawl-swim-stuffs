export type Product = {
  handle: string;
  title: string;
  manufacturer: string | null;
  category: string;
  status: "draft" | "proposed" | "published" | "rejected";
  discountable: boolean;
  shortDescription: string;
  description: string;
  thumbnail: string;
  images: string[] | null;
  priceVnd: number | null;
  variants:
    | {
        title: string;
        inventoryQuantity: number | null;
        allowBackOrder: boolean;
        priceVnd: number | null;
        options: Record<string, string>;
        manageInventory: boolean;
      }[]
    | null;
};

export type MedusaProductV2 = {
  title: string;
  subtitle: string;
  description: string;
  discountable: boolean;
  images: { url: string }[];
  thumbnail: string;
  handle: string;
  status: "draft" | "proposed" | "published" | "rejected";
  categories: {
    id: string;
  }[];
  options?: {
    title: string;
    values: string[];
  }[];
  variants?:
    | {
        title: string;
        sku: string;
        prices: {
          currency_code: string;
          amount: number;
        }[];
        allow_backorder: boolean;
        manage_inventory: boolean;
        options: Record<string, string>;
      }[];
  sales_channels: { id: string }[];
};
