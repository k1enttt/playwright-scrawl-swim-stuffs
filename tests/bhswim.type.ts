export type Product = {
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
  variants?:
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
      }[]
    | null;
  options?: Record<
    string,
    {
      required: boolean;
      values: {
        label: string;
        value: string;
      }[];
    }
  > | null;
};
