import { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../services/api";
import { showSuccess, showError, showWarning } from "../../components/alerts/Alerts";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useBranchAccess } from "../../hooks/useBranchAccess";


const PAYMENT_METHODS = ["Cash", "Card", "M-Pesa", "Bank Transfer", "Other"] as const;
const SALE_TYPES = ["Retail", "Wholesale","Credit"] as const;

type SaleItem = {
  uid: string;
  product_id: number | "";
  product_name: string;
    pack_size?: string;     // ← add

  item_number: string;
  retail_price: number;
  wholesale_price: number;
  unit_price: number; // derived from retail_price/wholesale_price based on the first payment's Sale Type, unless manually edited
  tax_rate: number;
  quantity: number | "";
  available_stock: number;
};

type Payment = {
  uid: string;
  sale_type: typeof SALE_TYPES[number];
  method: typeof PAYMENT_METHODS[number];
  amount: string;
  reference: string;
  received_by: string; // user id of the sales clerk who received the payment
};

// Matches SaleReceiptSerializer on the backend (GET /sales/receipts/).
type SaleReceipt = {
  id: number | string;
  order_number: string;
  customer_name: string;
  sale_type: string;
  grand_total: number;
  created_at: string; // ISO timestamp
  receipt_text: string;
  status?: string; // "Pending" or "Completed"
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function money(n: number) {
  if (isNaN(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const RECEIPTS_KEY = "pos_receipts_v1";
const MAX_SAVED_RECEIPTS = 300;

function readSavedReceipts(): SaleReceipt[] {
  try {
    const raw = localStorage.getItem(RECEIPTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedReceipts(list: SaleReceipt[]) {
  try {
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify(list.slice(0, MAX_SAVED_RECEIPTS)));
  } catch (err) {
    console.error("Could not save receipts locally:", err);
  }
}

/** Combine local + server receipts, de-duplicated by order number, newest first. */
function mergeReceipts(a: SaleReceipt[], b: SaleReceipt[]): SaleReceipt[] {
  const map = new Map<string, SaleReceipt>();
  [...a, ...b].forEach(r => {
    const key = r.order_number && r.order_number !== "-" ? r.order_number : String(r.id);
    const existing = map.get(key);
    if (!existing || (!existing.receipt_text && r.receipt_text)) map.set(key, r);
  });
  return Array.from(map.values()).sort(
    (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
  );
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isSalesClerk(user: any) {
  const roleName = (user?.role?.role_name || user?.role_name || "").toLowerCase();
  return roleName.includes("sales clerk") || roleName.includes("cashier");
}

/** Renders the same plain-text receipt layout used for the thermal printout and the saved-receipt history. */
function buildReceiptText(opts: {
  orderNumber: string;
  customerName: string;
  cashierName: string;
  saleType: string;
  items: SaleItem[];
  payments: Payment[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  balance: number;
  pending?: boolean;
}): string {
  const width = 42; // characters — fits a standard 80mm thermal roll
  const line = "-".repeat(width);
  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((width - s.length) / 2));
    return " ".repeat(pad) + s;
  };
  const cols = (left: string, right: string) => {
    const space = Math.max(1, width - left.length - right.length);
    return left + " ".repeat(space) + right;
  };

  const itemLines = opts.items.map(i => {
        const total = i.unit_price * (Number(i.quantity) || 0) * (1 + i.tax_rate / 100);
    const name = i.product_name.length > width ? i.product_name.slice(0, width) : i.product_name;
    const detail = cols(`  ${i.quantity} x ${money(i.unit_price)}`, money(total));
    return `${name}\n${detail}`;
  }).join("\n");

  const paymentLines = opts.payments
    .filter(p => parseFloat(p.amount) > 0)
    .map(p => cols(p.method, money(parseFloat(p.amount) || 0)))
    .join("\n");

  const now = new Date();
  return [
    center("SUPER  AGRO SOLUTIONS"),          // TODO: replace with real shop details
    center("P.o Box 173, Mpeketoni"),
    center("Tel:  0700496690"),
    line,
    cols("Receipt#:", opts.orderNumber),
    cols("Date:", now.toLocaleDateString()),
    cols("Time:", now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
   
    cols("Customer:", opts.customerName),
    cols("Sale Type:", opts.saleType),
    line,
    itemLines,
    line,
    cols("Subtotal:", money(opts.subtotal)),
    cols("Tax:", money(opts.taxTotal)),
    cols("Discount:", `-${money(opts.discount)}`),
    line,
   cols("TOTAL:", money(opts.grandTotal)),
    line,
    ...(opts.pending ? [center("** PAYMENT PENDING **")] : []),
    paymentLines || cols("Payment:", money(opts.amountPaid)),
    cols("Balance:", money(Math.abs(opts.balance)) + (opts.balance < 0 ? " (change)" : "")),
    line,
    cols("You Were Served By:", opts.cashierName || "-"),
    center("Thank you for shopping!"),
    center("Goods sold in good condition"),
    center("are non-refundable."),
  ].join("\n");
}

function isA4Type(saleType: string) {
  return saleType === "Wholesale" || saleType === "Credit";
}

function printReceiptText(receiptText: string, title: string, saleType: string) {
  const a4 = isA4Type(saleType);
  const win = window.open("", "_blank", a4 ? "width=900,height=700" : "width=1,height=1,left=-1000,top=-1000");
  if (!win) {
    showWarning("Allow popups to enable receipt printing.", "Print Blocked");
    return;
  }

  const css = a4
    ? `@page { size: A4 portrait; margin: 15mm; }
       html, body { margin: 0; padding: 0; }
       pre { font-family: "Courier New", monospace; font-size: 13px; line-height: 1.4;
             white-space: pre-wrap; margin: 0; }`
    : `@page { size: 80mm auto; margin: 0; }
       html, body { margin: 0; padding: 0; }
       body { padding: 8px; }
       pre { font-family: "Courier New", monospace; font-size: 12px; line-height: 1.25;
             white-space: pre-wrap; margin: 0; }`;

  win.document.write(
    `<html><head><title>${title}</title><style>${css}</style></head><body><pre>${receiptText}</pre></body></html>`
  );
  win.document.close();

  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (err) {
      console.error("Print failed:", err);
    } finally {
      setTimeout(() => win.close(), 1000);
    }
  }, 300);
}
function emptyPayment(): Payment {
  return { uid: uid(), sale_type: "Retail", method: "Cash", amount: "", reference: "", received_by: "" };
}

export default function POS() {
   const { branches, isHO, userBranchId, hoId, loading: loadingAccess } = useBranchAccess();
  const [branchId, setBranchId] = useState<number | "">("");
  const [branchStock, setBranchStock] = useState<Record<number, any>>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [salesClerks, setSalesClerks] = useState<any[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);

  const [customerId, setCustomerId] = useState<number | "">("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [items, setItems] = useState<SaleItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [pendingQty, setPendingQty] = useState<Record<number, number>>({});

  const [discountAmount, setDiscountAmount] = useState("0");

  const [payments, setPayments] = useState<Payment[]>([emptyPayment()]);

    const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Receipt of the most recently completed sale, used by the Print button
const [lastReceipt, setLastReceipt] = useState<{ text: string; orderNumber: string; saleType: string } | null>(null);  // Receipt history — now stored server-side (GET/POST via /sales/) instead
  // of localStorage, so it's shared across tills/devices.
    const [receipts, setReceipts] = useState<SaleReceipt[]>(() => readSavedReceipts());
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [panelView, setPanelView] = useState<"receipts" | "today">("receipts");
  // Branch users are locked to their own branch; Head Office defaults to HQ and can switch.
  useEffect(() => {
    if (loadingAccess) return;
    setBranchId(prev => prev || (isHO ? (hoId ?? branches[0]?.id ?? "") : (userBranchId ?? "")));
  }, [loadingAccess, isHO, hoId, userBranchId, branches]);
  // Persist to localStorage whenever the list changes (survives page reloads)
  const loadReceipts = useCallback(async () => {
    if (!branchId) return;
    setLoadingReceipts(true);
    try {
      const res = await API.get("sales/receipts/", { params: { branch: branchId, page_size: 300 } });
      const raw: SaleReceipt[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setReceipts(raw);
    } catch (err) {
      console.error("Error loading saved receipts:", err);
    } finally {
      setLoadingReceipts(false);
    }
  }, [branchId]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);
   const todaysSales = useMemo(() => receipts.filter(r => isToday(r.created_at)), [receipts]);
  const todaysTotal = todaysSales.reduce((s, r) => s + (Number(r.grand_total) || 0), 0);

  const filteredReceipts = useMemo(() => {
    const base = panelView === "today" ? todaysSales : receipts;
    if (!receiptSearch.trim()) return base;
    const q = receiptSearch.toLowerCase();
    return base.filter(r =>
      (r.order_number || "").toLowerCase().includes(q) ||
      (r.customer_name || "").toLowerCase().includes(q)
    );
  }, [receiptSearch, receipts, todaysSales, panelView]);

  // Pricing mode for the whole cart is driven by the first payment's Sale
  // Type (mirrors how the receipt's cashier name is taken from payments[0]).
  const saleType = payments[0]?.sale_type ?? "Retail";
  const customerRequired = saleType === "Wholesale" || saleType === "Credit";

  const loadLookups = useCallback(async (silent = false) => {
    if (!silent) setLoadingLookups(true);
    try {
                 const [custRes, prodRes, userRes] = await Promise.all([
        API.get("customers/"),
        API.get("products/"),
        API.get("users/"),
      ]);
      setCustomers(custRes.data?.results || custRes.data?.data || (Array.isArray(custRes.data) ? custRes.data : []));
      setProducts(prodRes.data?.results || prodRes.data?.data || (Array.isArray(prodRes.data) ? prodRes.data : []));
      const allUsers = userRes.data?.results || userRes.data?.data || (Array.isArray(userRes.data) ? userRes.data : []);
      setSalesClerks(allUsers.filter(isSalesClerk));
    } catch (err) {
      console.error("Error loading sale lookups:", err);
     } finally {
      if (!silent) setLoadingLookups(false);
    }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);
    const loadBranchStock = useCallback(async () => {
    if (!branchId) { setBranchStock({}); return; }
    try {
      const res = await API.get("branch-stocks/", { params: { branch: branchId, page_size: 5000 } });
      const rows: any[] = res.data?.results || (Array.isArray(res.data) ? res.data : []);
      const map: Record<number, any> = {};
      rows.forEach(r => { map[r.product] = r; });
      setBranchStock(map);
    } catch (err) {
      console.error("Error loading branch stock:", err);
    }
  }, [branchId]);

  // New branch = new stock and prices, so start with a clean cart
  useEffect(() => {
    loadBranchStock();
    setItems([]);
    setPayments([emptyPayment()]);
  }, [loadBranchStock]);

  const branchClerks = useMemo(
    () => salesClerks.filter(u => !branchId || u.branch === branchId),
    [salesClerks, branchId]
  );
   useAutoRefresh(() => {
    loadLookups(true);
    loadReceipts();
    loadBranchStock();
  }, 30000);

  // Re-price every line item whenever the driving Sale Type (payments[0])
  // changes. This intentionally overwrites any unit price the clerk
  // hand-edited on a line, since the toggle represents "this whole sale is
  // retail / wholesale" rather than a per-line setting.
  useEffect(() => {
    setItems(prev => prev.map(i => ({
      ...i,
unit_price: saleType === "Wholesale" ? i.wholesale_price : i.retail_price,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleType]);

  const selectedCustomer = customers.find(c => c.id === customerId);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
    ).slice(0, 8);
  }, [customerSearch, customers]);

 const filteredProducts = useMemo(() => {
  if (!productSearch.trim()) return [];
  const q = productSearch.toLowerCase();
  return products.filter(p =>
    (p.name         || "").toLowerCase().includes(q) ||
    (p.item_number  || "").toLowerCase().includes(q) ||
    (p.manufacturer || "").toLowerCase().includes(q)
  ).slice(0, 8);
}, [productSearch, products]);
  function pricesFor(product: any) {
    const bs = branchStock[product.id];
    const retail = parseFloat(bs?.effective_retail_price ?? product.retail_price) || 0;
    const wholesale = parseFloat(bs?.effective_wholesale_price ?? product.wholesale_price) || 0;
    return { retail, wholesale: wholesale || retail };
  }
  function priceFor(product: any) {
    const p = pricesFor(product);
    return saleType === "Wholesale" ? p.wholesale : p.retail;
  }
  function stockFor(productId: number) {
    return Number(branchStock[productId]?.stock_quantity) || 0;
  }
  function qtyFor(productId: number) {
    return pendingQty[productId] ?? 1;
  }

  function addItem(product: any) {
    if (!branchId) {
      showWarning("Select a branch before adding items.", "No Branch Selected");
      return;
    }
    const available = stockFor(product.id);
    const qty = Math.max(1, qtyFor(product.id));
    if (qty > available) {
      showWarning(`Only ${available} in stock for ${product.name}.`, "Not Enough Stock");
      return;
    }
      const { retail: retailPrice, wholesale: wholesalePrice } = pricesFor(product);
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id
                      ? { ...i, quantity: available ? Math.min((Number(i.quantity) || 0) + qty, available) : (Number(i.quantity) || 0) + qty }
            : i
        );
      }
      return [...prev, {
        uid: uid(),
        product_id: product.id,
        product_name: product.name,
        pack_size: product.pack_size || "",
        item_number: product.item_number || "",
        retail_price: retailPrice,
        wholesale_price: wholesalePrice,
       unit_price: saleType === "Wholesale" ? wholesalePrice : retailPrice,
        tax_rate: parseFloat(product.tax_rate) || 0,
        quantity: qty,
        available_stock: available,
      }];
    });
    setPendingQty(prev => ({ ...prev, [product.id]: 1 }));
  }

  function handleProductSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = productSearch.trim();
    if (!code) return;
    const exact = products.find(p => (p.item_number || "").toLowerCase() === code.toLowerCase());
    if (exact) {
      addItem(exact);
      setProductSearch("");
    } else if (filteredProducts.length === 1) {
      addItem(filteredProducts[0]);
      setProductSearch("");
    } else if (filteredProducts.length === 0) {
      showError(`No product found for "${code}".`, "Item Not Found", 2500);
    }
  }

  function updateItem(uidVal: string, patch: Partial<SaleItem>) {
    setItems(prev => prev.map(i => i.uid === uidVal ? { ...i, ...patch } : i));
  }

  function removeItem(uidVal: string) {
    setItems(prev => prev.filter(i => i.uid !== uidVal));
  }

  function addPayment() {
    setPayments(prev => [...prev, emptyPayment()]);
  }

  function updatePayment(uidVal: string, patch: Partial<Payment>) {
    setPayments(prev => prev.map(p => p.uid === uidVal ? { ...p, ...patch } : p));
  }

  function removePayment(uidVal: string) {
    setPayments(prev => prev.filter(p => p.uid !== uidVal));
  }

   const qtyOf = (i: SaleItem) => Number(i.quantity) || 0;
  const subtotal = items.reduce((s, i) => s + i.unit_price * qtyOf(i), 0);
  const taxTotal = items.reduce((s, i) => s + i.unit_price * qtyOf(i) * (i.tax_rate / 100), 0);
  const discount = parseFloat(discountAmount) || 0;
  const grandTotal = Math.max(subtotal + taxTotal - discount, 0);
  const amountPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const balance = grandTotal - amountPaid;

  /** Clears every field on the form so the till is ready for the next sale. */
  function resetSaleForm() {
    setItems([]);
    setDiscountAmount("0");
    setPayments([emptyPayment()]);
    setCustomerId("");
    setCustomerSearch("");
    setShowCustomerDropdown(false);
    setProductSearch("");
    setShowProductDropdown(false);
    setPendingQty({});
          loadBranchStock();
    setError("");
  }
  function handlePrint() {
    if (!lastReceipt) {
      showWarning("Complete a sale first, then print its receipt.", "Nothing to Print");
      return;
    }
      printReceiptText(lastReceipt.text, `Receipt ${lastReceipt.orderNumber}`, lastReceipt.saleType);
  }
  async function handleSubmit() {
    setError("");
    if (!branchId) {
      showWarning("Select a branch for this sale before checking out.", "No Branch Selected");
      return;
    }
   const badQty = items.find(i => !Number(i.quantity) || Number(i.quantity) < 1);
    if (badQty) {
      showWarning(`Enter a quantity for "${badQty.product_name}".`, "Quantity Required");
      return;
    }
const isCredit = saleType === "Credit";
const isWholesale = saleType === "Wholesale";
// Wholesale can be paid later, so an unpaid or part-paid sale is "Pending"
const isPending = isWholesale && amountPaid < grandTotal - 0.005;

if ((isCredit || isWholesale) && !customerId) {
  showWarning(`Select a customer for a ${saleType.toLowerCase()} sale.`, "Customer Required");
  return;
}
if (!isCredit && !isWholesale && amountPaid < grandTotal - 0.005) {
  showWarning(
    `Retail sales must be paid in full. Balance remaining: ${money(grandTotal - amountPaid)}.`,
    "Full Payment Required"
  );
  return;
}

    const cashier = salesClerks.find(u => String(u.id) === String(payments[0]?.received_by));
    const cashierName = cashier ? `${cashier.firstname || ""} ${cashier.lastname || ""}`.trim() || cashier.username : "";
    const customerName = selectedCustomer ? selectedCustomer.name : "Walk-in Customer";

    // Built up front (before the order number is known) so we can send the
    // final text — with the real order number — to the backend in one call.
    const draftReceiptText = (orderNumber: string) => buildReceiptText({
      orderNumber,
      customerName,
      cashierName,
      saleType,
      items,
      payments,
      subtotal,
      taxTotal,
      discount,
      grandTotal,
      amountPaid,
      balance,
       pending: isPending,
    });

    const payload = {
      branch: branchId,
       sale_type: saleType,
       status: isPending ? "Pending" : "Completed",
      customer: customerId || null,
      discount_amount: discount,
            items: items.map(i => ({ product: i.product_id, quantity: Number(i.quantity), unit_price: i.unit_price })),
      payments: payments
        .filter(p => parseFloat(p.amount) > 0)
        .map(p => ({
          sale_type: p.sale_type,
          method: p.method,
          amount: parseFloat(p.amount) || 0,
          reference: p.reference,
          received_by: p.received_by,
        })),
      // Placeholder text; overwritten below once we know the real order number,
      // then sent as a follow-up PATCH so the stored receipt matches exactly
      // what gets printed.
      receipt_text: "",
    };

    setSubmitting(true);
    try {
      const res = await API.post("sales/", payload);
      const saleId = res.data?.id ?? res.data?.data?.id ?? null;
      const orderNumber = res.data?.order_number || "-";
      const receiptText = isCredit ? "" : draftReceiptText(orderNumber);

      // Persist the final receipt text now that the order number is known.
      if (saleId && !isCredit) {
        try {
          await API.patch(`sales/${saleId}/`, { receipt_text: receiptText });
        } catch (patchErr) {
          console.error("Failed to save receipt_text on the sale:", patchErr);
        }
      }

      // Optimistically show it in the panel immediately rather than waiting
      // on a refetch; loadReceipts() will reconcile with the server later.
      setReceipts(prev => [{
        id: saleId ?? uid(),
        order_number: orderNumber,
        customer_name: customerName,
        sale_type: saleType,
        grand_total: grandTotal,
        created_at: new Date().toISOString(),
        receipt_text: receiptText,
      }, ...prev]);

setLastReceipt(isCredit ? null : { text: receiptText, orderNumber, saleType });
await showSuccess(
  isCredit
    ? (orderNumber !== "-" ? `Credit sale ${orderNumber} recorded.` : "Credit sale recorded.")
    : isPending
      ? `Wholesale sale ${orderNumber} recorded. Payment pending.`
      : (orderNumber !== "-" ? `Sale ${orderNumber} completed successfully.` : "Sale completed successfully."),
  isCredit ? "Credit Sale Recorded" : isPending ? "Sale Pending Payment" : "Sale Complete",
  1600
);
      resetSaleForm();
    } catch (err: any) {
      const data = err.response?.data;
      let msg = data?.message || data?.detail;
      if (!msg && Array.isArray(data)) msg = data[0];
      if (!msg && data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const firstVal = data[firstField];
        msg = firstField ? `${firstField}: ${Array.isArray(firstVal) ? firstVal[0] : firstVal}` : undefined;
      }
      msg = msg || "Failed to complete sale. Please check the details and try again.";
      setError(msg);
      showError(msg, "Checkout Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    
    <div className="page-wrapper">
      <style>{`
  .pos-items-table .pos-num-input {
    text-align: center;
    font-weight: 600;
  }
  @media (max-width: 767px) {
    .pos-items-table .pos-num-input {
      height: 42px;
      font-size: 16px;      /* 16px also stops iOS from zooming in on focus */
      padding: 4px 6px;
    }
    .pos-items-table td, .pos-items-table th { vertical-align: middle; }
  }
`}</style>
      <div className="content">
        <div className="d-flex flex-column" style={{ height: "calc(100vh - 130px)", minHeight: 520 }}>

          {/* ── Top bar: title, Billing To, Receipts ─────────────────── */}
          <div className="card shadow-none border mb-2 flex-shrink-0">
            <div className="card-body py-2 px-3 d-flex align-items-center justify-content-between gap-3 flex-wrap">
              <h4 className="fw-semibold mb-0">New Sale</h4>

              <div className="position-relative flex-grow-1" style={{ maxWidth: 380 }}>
                <div className="d-flex align-items-center gap-2">
                  <input
  type="text"
  className={`form-control form-control-sm fs-13 fw-medium ${customerRequired && !selectedCustomer ? "border-danger" : ""}`}
  placeholder={customerRequired ? "Billing to: select customer (required)" : "Billing to: Walk-in Customer"}
  value={selectedCustomer ? selectedCustomer.name : customerSearch}
  onChange={e => { setCustomerSearch(e.target.value); setCustomerId(""); setShowCustomerDropdown(true); }}
  onFocus={() => setShowCustomerDropdown(true)}
/>
                  {selectedCustomer && (
                    <button className="btn btn-sm btn-link text-muted px-1"
                      onClick={() => { setCustomerId(""); setCustomerSearch(""); }} title="Reset to Walk-in">
                      <i className="ti ti-x" />
                    </button>
                  )}
                </div>
                {showCustomerDropdown && !selectedCustomer && (
                  <div className="card shadow-lg border position-absolute w-100 mt-1" style={{ zIndex: 1040, maxHeight: 220, overflowY: "auto" }}>
                  {!customerRequired && (
  <button type="button" className="btn btn-link text-start w-100 fs-13 py-2 px-3 text-decoration-none text-dark border-bottom"
    onClick={() => { setCustomerId(""); setCustomerSearch(""); setShowCustomerDropdown(false); }}>
    <div className="fw-medium">Walk-in Customer</div>
    <div className="text-muted fs-11">No account · default</div>
  </button>
)}
                    {loadingLookups ? (
                      <div className="p-2 text-muted fs-12">Loading…</div>
                    ) : filteredCustomers.length === 0 ? (
                      <div className="p-2 text-muted fs-12">No customers found.</div>
                    ) : filteredCustomers.map(c => (
                      <button key={c.id} type="button" className="btn btn-link text-start w-100 fs-13 py-2 px-3 text-decoration-none text-dark"
                        onClick={() => { setCustomerId(c.id); setShowCustomerDropdown(false); }}>
                        <div className="fw-medium">{c.name}</div>
                        <div className="text-muted fs-11">{c.phone}{c.loyalty_points ? ` · ${c.loyalty_points} pts` : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
                 {isHO ? (
                <select
                  className="form-select form-select-sm fs-13"
                  style={{ width: 180 }}
                  value={branchId}
                  onChange={e => setBranchId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Select branch…</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ) : (
                <span className="badge bg-primary-transparent text-primary fs-12">
                  {branches.find((b: any) => b.id === branchId)?.name || "Your branch"}
                </span>
              )}
                            <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  data-bs-toggle="offcanvas"
                  data-bs-target="#receipts-offcanvas"
                  onClick={() => setPanelView("receipts")}
                >
                  <i className="ti ti-receipt me-1" />Receipts
                  {receipts.length > 0 && <span className="badge bg-primary ms-1 fs-10">{receipts.length}</span>}
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  data-bs-toggle="offcanvas"
                  data-bs-target="#receipts-offcanvas"
                  onClick={() => setPanelView("today")}
                >
                  <i className="ti ti-calendar-event me-1" />Today's Sales
                  {todaysSales.length > 0 && <span className="badge bg-success ms-1 fs-10">{todaysSales.length}</span>}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger fs-13 py-2 mb-2 d-flex align-items-center flex-shrink-0">
              <i className="ti ti-alert-circle me-2" />{error}
            </div>
          )}

          {/* ── Two equal columns ────────────────────────────────────── */}
          <div className="row g-3 flex-grow-1" style={{ minHeight: 0 }}>

            {/* LEFT: Items (tall) */}
            <div className="col-xl-6 d-flex flex-column" style={{ minHeight: 0 }}>
              <div className="card shadow-none border mb-0 flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
                <div className="card-header py-2 border-bottom d-flex align-items-center justify-content-between flex-shrink-0">
                  <h6 className="mb-0 fw-semibold fs-14"><i className="ti ti-shopping-cart me-2 text-primary" />Items</h6>
                  <span className="badge bg-primary-transparent text-primary fs-11">{items.length}</span>
                </div>

                <div className="card-body p-2 d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
                  {/* Product search */}
                  <div className="position-relative mb-2 flex-shrink-0">
                    <input
                      type="text" className="form-control form-control-sm fs-13"
                      placeholder="Search product by name or item number…"
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                      onFocus={() => setShowProductDropdown(true)}
                      onKeyDown={handleProductSearchKeyDown}
                    />
                    {showProductDropdown && productSearch.trim() && (
                      <div className="card shadow-lg border position-absolute w-100 mt-1" style={{ zIndex: 1040, maxHeight: 320, overflowY: "auto" }}>
                        {loadingLookups ? (
                          <div className="p-2 text-muted fs-12">Loading…</div>
                        ) : filteredProducts.length === 0 ? (
                          <div className="p-2 text-muted fs-12">No products found.</div>
                        ) : filteredProducts.map(p => (
                          <div
                            key={p.id}
                            role="button"
                            className="list-group-item list-group-item-action d-flex align-items-center justify-content-between fs-13 py-2 px-3 border-bottom"
                            style={{ cursor: "pointer" }}
                            onClick={() => { addItem(p); setProductSearch(""); setShowProductDropdown(false); }}
                          >
                            <div className="flex-grow-1">
                              <div className="fw-medium">{p.name}</div>
                              <div className="fw-medium">
  {p.name}
  {p.pack_size && <span className="text-muted fw-normal"> · {p.pack_size}</span>}
</div>
<div className="text-muted fs-11">
  {p.manufacturer && <>{p.manufacturer} · </>}
  {p.item_number} · Stock: {stockFor(p.id)} · {money(priceFor(p))} ({saleType})
</div>
                            </div>
                            <input
                              type="number" min={1} className="form-control form-control-sm"
                              style={{ width: 64 }}
                              title="Quantity"
                              value={qtyFor(p.id)}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setPendingQty(prev => ({ ...prev, [p.id]: Math.max(1, Number(e.target.value)) }))}
                              onKeyDown={e => {
                                if (e.key === "Enter") { addItem(p); setProductSearch(""); setShowProductDropdown(false); }
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Items table: fills the remaining height and scrolls inside */}
                  {items.length === 0 ? (
                    <div className="text-center text-muted py-4 fs-13 my-auto">
                      <i className="ti ti-shopping-cart-off fs-2 d-block mb-2" />No items added yet — search above and click a product to add it
                    </div>
                  ) : (
                 <div className="table-responsive flex-grow-1" style={{ minHeight: 0, overflow: "auto" }}>
  <table className="table table-sm mb-0 fs-13 pos-items-table" style={{ minWidth: 560 }}>
    <thead>
      <tr>
        {["Product", "Qty", "Unit Price", "Tax", "Line Total", ""].map((h, i) => (
          <th key={i}
            className={h === "Line Total" ? "text-end" : ""}
            style={{
              position: "sticky", top: 0, zIndex: 1, background: "#f8f9fa",
              minWidth: [150, 90, 120, 60, 110, 40][i],
            }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {items.map(i => (
        <tr key={i.uid}>
          <td className="fw-medium">{i.product_name}
            {i.pack_size && <span className="text-muted fw-normal"> · {i.pack_size}</span>}
          </td>
          
          <td>
                       <input
              type="number"
              inputMode="numeric"
              min={1}
              className="form-control form-control-sm pos-num-input"
              style={{ minWidth: 72 }}
              value={i.quantity}
              onFocus={e => e.target.select()}
              onChange={e => {
                const v = e.target.value;
                updateItem(i.uid, { quantity: v === "" ? "" : Math.max(0, Math.floor(Number(v))) });
              }}
              onBlur={() => {
                if (!Number(i.quantity) || Number(i.quantity) < 1) updateItem(i.uid, { quantity: 1 });
              }}
            />
          </td>
          <td>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              className="form-control form-control-sm pos-num-input"
              style={{ minWidth: 100 }}
              value={i.unit_price}
              onFocus={e => e.target.select()}
              onChange={e => updateItem(i.uid, { unit_price: Math.max(0, Number(e.target.value)) })}
            />
          </td>
          <td className="text-muted">{i.tax_rate}%</td>
          
                    <td className="text-end fw-semibold">{money(i.unit_price * qtyOf(i) * (1 + i.tax_rate / 100))}</td>
          <td>
            <button className="btn btn-sm btn-link text-danger px-1" onClick={() => removeItem(i.uid)}>
              <i className="ti ti-trash" />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Sale Summary on top, Payments below */}
            <div className="col-xl-6 d-flex flex-column" style={{ minHeight: 0 }}>

              {/* Sale Summary */}
              <div className="card shadow-none border mb-2 flex-shrink-0">
                <div className="card-header py-2 border-bottom d-flex align-items-center justify-content-between">
                  <h6 className="mb-0 fw-semibold fs-14"><i className="ti ti-receipt me-2 text-primary" />Sale Summary</h6>
                  <span className="badge bg-primary-transparent text-primary fs-11">{saleType}</span>
                </div>
                <div className="card-body p-3">
                  <div className="row g-3">
                    <div className="col-6 border-end">
                      <div className="d-flex justify-content-between fs-13 mb-1">
                        <span className="text-muted">Subtotal</span><span>{money(subtotal)}</span>
                      </div>
                      <div className="d-flex justify-content-between fs-13 mb-1">
                        <span className="text-muted">Tax</span><span>{money(taxTotal)}</span>
                      </div>
                      <div className="d-flex justify-content-between fs-13">
                        <span className="text-muted">Discount</span><span className="text-danger">-{money(discount)}</span>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="d-flex justify-content-between fs-15 fw-semibold mb-1">
                        <span>Total</span><span>{money(grandTotal)}</span>
                      </div>
                      <div className="d-flex justify-content-between fs-13 mb-1">
                        <span className="text-muted">Amount Paid</span><span className="text-success">{money(amountPaid)}</span>
                      </div>
                      <div className="d-flex justify-content-between fs-13">
                        <span className="text-muted">Balance</span>
                        <span className={balance > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>
                          {money(Math.abs(balance))}{balance < 0 ? " (change)" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                 
                </div>
              </div>

              {/* Payments */}
              <div className="card shadow-none border mb-0 flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
                <div className="card-header py-2 border-bottom flex-shrink-0">
                  <h6 className="mb-0 fw-semibold fs-14"><i className="ti ti-credit-card me-2 text-primary" />Payments</h6>
                </div>
                <div className="card-body p-3 flex-grow-1" style={{ minHeight: 0, overflowY: "auto" }}>
                  {payments.map((p, idx) => (
                    <div key={p.uid} className="mb-3 pb-3" style={{ borderBottom: idx < payments.length - 1 ? "1px dashed #eee" : "none" }}>
                      <div className="row g-2 mb-2">
                        <div className="col-4">
                          <label className="form-label fs-12 mb-1">Amount Received</label>
                          <input type="number" min={0} step="0.01" className="form-control form-control-sm fs-13"
                            value={p.amount} onChange={e => updatePayment(p.uid, { amount: e.target.value })} />
                        </div>
                        <div className="col-4">
                          <label className="form-label fs-12 mb-1">Sale Type</label>
                          <select className="form-select form-select-sm fs-13" value={p.sale_type}
                            onChange={e => updatePayment(p.uid, { sale_type: e.target.value as Payment["sale_type"] })}>
                            {SALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="col-4">
                          <label className="form-label fs-12 mb-1">Method</label>
                          <select className="form-select form-select-sm fs-13" value={p.method}
                            onChange={e => updatePayment(p.uid, { method: e.target.value as Payment["method"] })}>
                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="row g-2 align-items-end">
                        <div className={idx === 0 ? "col-8" : "col-10"}>
                          <label className="form-label fs-12 mb-1">Cashier Name</label>
                          <select className="form-select form-select-sm fs-13" value={p.received_by}
                            onChange={e => updatePayment(p.uid, { received_by: e.target.value })}>
                            <option value="">Select sales clerk…</option>
                            {salesClerks.map(u => (
                              <option key={u.id} value={u.id}>
                                {`${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username}
                              </option>
                            ))}
                          </select>
                        </div>
                        {idx === 0 && (
                          <div className="col-4">
                            <label className="form-label fs-12 mb-1">Discount</label>
                            <input type="number" min={0} step="0.01" className="form-control form-control-sm fs-13"
                              value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} />
                          </div>
                        )}
                        {payments.length > 1 && (
                          <div className="col-2 d-flex justify-content-end">
                            <button className="btn btn-sm btn-link text-danger px-1" onClick={() => removePayment(p.uid)}>
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        )}
                      </div>

                    {idx === 0 && (
  <div className="fs-11 text-muted mt-1">
    {p.sale_type === "Credit"
      ? "Credit sale: items use retail prices. Leave Amount empty to put the full total on credit, or enter a deposit."
      : p.sale_type === "Wholesale"
        ? "Wholesale: leave Amount empty (or enter less than the total) to record the sale as Pending and pay later."
        : `Sale Type prices every item from the product's ${p.sale_type.toLowerCase()} price.`}
  </div>
)}
                    </div>
                  ))}
                </div>
                 <div className="card-footer p-2 d-flex gap-2 flex-shrink-0">
                  <button
  className="btn btn-primary flex-fill"
  disabled={submitting || !items.length}
  onClick={handleSubmit}
>
 {submitting ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="ti ti-check me-1" />}
{saleType === "Credit"
  ? "Complete Credit Sale"
  : saleType === "Wholesale" && amountPaid < grandTotal - 0.005
    ? "Complete (Pay Later)"
    : "Complete Sale"}
</button>
                  <button
                    className="btn btn-outline-danger flex-fill"
                    disabled={submitting || !items.length}
                    onClick={resetSaleForm}
                  >
                    <i className="ti ti-trash me-1" />Clear
                  </button>
                  <button
                    className="btn btn-outline-secondary flex-fill"
                    disabled={!lastReceipt}
                    onClick={handlePrint}
                  >
                    <i className="ti ti-printer me-1" />Print
                  </button>
                </div>
              </div>



            </div>
          </div>
        </div>
      </div>

          {/* SAVED RECEIPTS / TODAY'S SALES (one offcanvas, two views) */}
      <div
        className="offcanvas offcanvas-end"
        tabIndex={-1}
        id="receipts-offcanvas"
        aria-labelledby="receiptsOffcanvasLabel"
        style={{ width: "420px" }}
      >
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-15 fw-semibold" id="receiptsOffcanvasLabel">
            {panelView === "today" ? "Today's Sales" : "Saved Receipts"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close" />
        </div>
        <div className="offcanvas-body d-flex flex-column">

          {/* View switch */}
          <div className="btn-group btn-group-sm w-100 mb-3" role="group">
            <button
              type="button"
              className={`btn ${panelView === "today" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setPanelView("today")}
            >
              Today ({todaysSales.length})
            </button>
            <button
              type="button"
              className={`btn ${panelView === "receipts" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setPanelView("receipts")}
            >
              All receipts ({receipts.length})
            </button>
          </div>

          {/* Today's summary */}
          {panelView === "today" && (
            <div className="row g-2 mb-3">
              <div className="col-6">
                <div className="border rounded p-2">
                  <div className="text-muted fs-11">Sales today</div>
                  <div className="fw-semibold fs-15">{todaysSales.length}</div>
                </div>
              </div>
              <div className="col-6">
                <div className="border rounded p-2">
                  <div className="text-muted fs-11">Total today</div>
                  <div className="fw-semibold fs-15 text-success">{money(todaysTotal)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="d-flex gap-2 mb-3">
            <input
              type="text"
              className="form-control form-control-sm fs-13"
              placeholder="Search order # or customer…"
              value={receiptSearch}
              onChange={e => setReceiptSearch(e.target.value)}
            />
            <button className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={loadReceipts} disabled={loadingReceipts} title="Refresh from server">
              <i className={`ti ti-refresh ${loadingReceipts ? "fa-spin" : ""}`} />
            </button>
          </div>

          {loadingReceipts && receipts.length === 0 ? (
            <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
              <span className="spinner-border spinner-border-sm me-2" />Loading receipts…
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="text-center text-muted py-5 fs-13">
              <i className="ti ti-receipt-off fs-1 d-block mb-2" />
              {receipts.length === 0
                ? "No receipts saved yet."
                : panelView === "today" && todaysSales.length === 0
                  ? "No sales made today yet."
                  : "No receipts match your search."}
            </div>
          ) : (
            <div className="d-flex flex-column gap-2 overflow-auto">
              {filteredReceipts.map(r => (
                <div key={`${r.id}-${r.order_number}`} className="border rounded p-2 fs-13">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <div className="fw-semibold">{r.order_number}</div>
                      <div className="text-muted fs-11">
                        {panelView === "today"
                          ? new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : new Date(r.created_at).toLocaleString()}
                      </div>
                      <div className="text-muted fs-11">{r.customer_name} · {r.sale_type}</div>
                      {r.status === "Pending" && <span className="badge bg-warning-transparent text-warning fs-10">Pending</span>}
                    </div>
                    <div className="text-end flex-shrink-0">
                      <div className="fw-semibold">{money(Number(r.grand_total) || 0)}</div>
                      <button
                        className="btn btn-sm btn-outline-primary mt-1 py-0 px-2 fs-11"
                  onClick={() => printReceiptText(r.receipt_text, `Receipt ${r.order_number}`, r.sale_type)}
                        disabled={!r.receipt_text}
                      >
                        <i className="ti ti-printer me-1" />Reprint
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
