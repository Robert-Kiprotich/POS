import Dexie from "dexie";
import type { Table } from "dexie";
export interface OutboxSale {
  client_uuid: string;
  payload: any;
  created_at: string;
  status: "pending" | "failed";
  error?: string;
}

class PosDB extends Dexie {
  products!: Table<any, number>;
  categories!: Table<any, number>;
  branchStock!: Table<any, number>;
  outbox!: Table<OutboxSale, string>;
  meta!: Table<{ key: string; value: any }, string>;
    customers!: Table<any, number>;
  users!: Table<any, number>;

  constructor() {
    super("pos");
    this.version(1).stores({
      products: "id, name, item_number",
      categories: "id",
      branchStock: "id, product, branch",
      outbox: "client_uuid, status, created_at",
      meta: "key",
    });
     this.version(2).stores({
      customers: "id, phone",
      users: "id",
    });
  }
}

export const db = new PosDB();

export async function searchProducts(q: string, limit = 20) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return db.products
    .filter(p =>
      p.is_active !== false &&
      ((p.name || "").toLowerCase().includes(s) ||
       (p.item_number || "").toLowerCase().includes(s) ||
       (p.manufacturer || "").toLowerCase().includes(s))
    )
    .limit(limit)
    .toArray();
}