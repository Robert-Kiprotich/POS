import API from "../services/api";
import { db } from "./db";





const list = (d: any) => d?.results || d?.data || (Array.isArray(d) ? d : []);

async function fetchAll(url: string, params: any = {}) {
  const out: any[] = [];
  let next: string | null = url;
  let first = true;
  while (next) {
    const res: any = await API.get(next, first ? { params: { page_size: 1000, ...params } } : undefined);
    first = false;
    out.push(...list(res.data));
    next = res.data?.next || null;
  }
  return out;
}

// Used ONLY for the status icon and the catalog pull. The sales sync does not depend on it.
export async function isReallyOnline() {
  if (!navigator.onLine) return false;
  try {
    await API.get("health/", { timeout: 4000 });
    return true;
  } catch (e: any) {
    return !!e.response;   // any HTTP response means the server is reachable
  }
}

export async function pullCatalog(_branchId?: number | null) {
  if (!(await isReallyOnline())) return;
  const [products, categories] = await Promise.all([fetchAll("products/"), fetchAll("categories/")]);
  await db.transaction("rw", db.products, db.categories, db.meta, async () => {
    await db.products.clear();   await db.products.bulkPut(products);
    await db.categories.clear(); await db.categories.bulkPut(categories);
    await db.meta.put({ key: "last_synced", value: new Date().toISOString() });
  });
}

export type SyncResult = {
  pending: number;
  sent: number;
  failed: number;
  message: string;
};

let running = false;

async function runSync(): Promise<SyncResult> {
  if (running) return { pending: 0, sent: 0, failed: 0, message: "A sync is already running" };
  running = true;
  const result: SyncResult = { pending: 0, sent: 0, failed: 0, message: "" };
  try {
    const pending = await db.outbox.where("status").equals("pending").sortBy("created_at");
    result.pending = pending.length;
    console.log(`[sync] tick ${new Date().toLocaleTimeString()}: ${pending.length} pending sale(s)`);

    if (pending.length === 0) {
      result.message = "Nothing to sync";
      return result;
    }

    for (const sale of pending) {
      try {
        console.log(`[sync] POST sales/ ${sale.client_uuid}`);
        const res = await API.post("sales/", sale.payload, { timeout: 15000 });
        console.log(`[sync] server replied ${res.status}`, res.data?.order_number ?? res.data);
        await db.outbox.delete(sale.client_uuid);
        result.sent++;
      } catch (err: any) {
        const code = err.response?.status;
        console.warn(`[sync] FAILED ${sale.client_uuid}`, code ?? "no response (offline?)", err.response?.data ?? err.message);
        if (!code || code >= 500 || [401, 408, 429].includes(code)) {
          result.message = code ? `Server error ${code}, will retry` : "No connection, will retry";
          break;
        }
        await db.outbox.update(sale.client_uuid, {
          status: "failed",
          error: JSON.stringify(err.response?.data),
        });
        result.failed++;
      }
    }
    if (!result.message) result.message = `Sent ${result.sent}, failed ${result.failed}`;
    return result;
  } catch (e: any) {
    console.error("[sync] crashed", e);
    result.message = "Sync error: " + (e?.message || e);
    return result;
  } finally {
    running = false;
  }
}

export async function syncOutbox(): Promise<SyncResult> {
  if ("locks" in navigator) {
    let out: SyncResult = { pending: 0, sent: 0, failed: 0, message: "Another tab is syncing" };
    await (navigator as any).locks.request("pos-outbox-sync", { ifAvailable: true }, async (lock: any) => {
      if (!lock) return;
      out = await runSync();
    });
    return out;
  }
  return runSync();
}

// Starts immediately. Does not depend on branch, login hooks or connectivity checks.
export function startOutboxPolling() {
  console.log("[sync] polling STARTED (every 30s)");
  syncOutbox();
  const id = setInterval(syncOutbox, 30_000);
  (window as any).syncNow = syncOutbox;      // type  await syncNow()  in the console to test
  return () => {
    console.log("[sync] polling stopped");
    clearInterval(id);
  };
}

export function startCatalogLoop(branchId?: number | null) {
  pullCatalog(branchId).catch(e => console.warn("[catalog] pull failed", e));
  const id = setInterval(() => pullCatalog(branchId).catch(() => {}), 5 * 60_000);
  return () => clearInterval(id);
}