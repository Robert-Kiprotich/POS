import { db } from "./db";
import { syncOutbox } from "./sync";

function getCashierId() {
  try {
    return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "{}").id ?? null;
  } catch { return null; }
}

/** payload = the same object the POS sends to "sales/". It may already contain a client_uuid. */
export async function saveSale(payload: any) {
  const client_uuid = payload.client_uuid || crypto.randomUUID();
  const now = new Date().toISOString();

  await db.transaction("rw", db.outbox, db.branchStock, async () => {
    await db.outbox.add({
      client_uuid,
      payload: { ...payload, client_uuid, sold_at: now, cashier: getCashierId(), was_offline: true },
      created_at: now,
      status: "pending",
    });
    for (const line of payload.items || []) {
      const row = await db.branchStock
        .where("product").equals(line.product)
        .and(r => r.branch === payload.branch)
        .first();
      if (row) await db.branchStock.update(row.id, { stock_quantity: row.stock_quantity - Number(line.quantity) });
    }
  });

  syncOutbox();
  return client_uuid;
}