import { MedusaProductV2 } from "./bhswimv2.type";

const backend_url = "http://localhost:9000";
const location_id = "sloc_01JC9Y20J3B9S5RNFV38SC5C4E"; // Vietname Warehouse
export const default_sales_channel_id = "sc_01JBQRKMSEMNKX075ZB2VH5R3P";

export async function getAccessToken() {
  const email = "kientathuc@gmail.com";
  const password = "supersecret";

  const response = await fetch(`${backend_url}/auth/user/emailpass`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (response.status !== 200) {
    throw new Error("Failed to get access token");
  }

  const data = await response.json();
  return data;
}

export async function create_product(token: string, data: MedusaProductV2) {
  const response = await fetch(`${backend_url}/admin/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (response.status !== 200) {
    throw new Error("Failed to create product" + " " + data.options);
  }
  console.log("Success: Create product.");
  const product = await response.json();
  return product;
}

export async function listInventoryItems(token: string) {
  const order = "-created_at";
  const limit = 50;

  const response = await fetch(
    `${backend_url}/admin/inventory-items?order=${order}&limit=${limit}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status !== 200) {
    throw new Error("Failed to list inventory items");
  }

  const data = await response.json();
  return data;
}

export async function createLocationLevel(
  token: string,
  inventory_item_id: string,
  stocked_quantity: number
) {
  const response = await fetch(
    `${backend_url}/admin/inventory-items/${inventory_item_id}/location-levels`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        location_id,
        stocked_quantity,
      }),
    }
  );

  if (response.status !== 200) {
    throw new Error("Error: Failed to create location level");
  }
  console.log(`Success: Create location level for ${inventory_item_id}.`);
  const data = await response.json();
  return data;
}

export async function listLocationLevels(
  token: string,
  inventory_item_id: string
) {
  const response = await fetch(
    `${backend_url}/admin/inventory-items/${inventory_item_id}/location-levels`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (response.status !== 200) {
    throw new Error("Error: Failed to list location levels");
  }
  console.log(`Success: List location levels for ${inventory_item_id}.`);
  const data = await response.json();
  return data;
}

export async function listProductCategories(token: string) {
  const response = await fetch(`${backend_url}/admin/product-categories`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status !== 200) {
    throw new Error("Error: Failed to list product categories");
  }
  console.log("Success: List product categories.");
  const data = await response.json();
  return data;
}

export async function createProductCategory(
  token: string,
  data: { name: string; handle: string; parent_id: string | null }
) {
  const response = await fetch(`${backend_url}/admin/product-categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (response.status !== 201) {
    throw new Error("Failed to create product category");
  }

  const category = await response.json();
  return category;
}

export async function listProducts(token: string) {
  const response = await fetch(`${backend_url}/admin/products`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status !== 200) {
    throw new Error("Error: Failed to list products");
  }
  console.log("Success: List products.");
  const data = await response.json();
  return data;
}
