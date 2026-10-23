import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";
import { showConfirm, showSuccess, showError } from "../../components/alerts/Alerts";
import { buildInvoiceHtml, printInvoice } from "../../utils/invoiveTemplate";
import { useNavigate, useLocation } from "react-router";

// ───────────────────────── helpers ─────────────────────────
const money = (n: any) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => new Date().toISOString().slice(0, 10);
const DRAFT_KEY = "supply_draft";
const PAYMENT_METHODS = ["cash", "card", "mpesa", "bank_transfer", "other"] as const;
const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", mpesa: "M-Pesa", bank_transfer: "Bank Transfer", other: "Other",
};

const STATUS_CLS: Record<string, string> = {
  received: "badge bg-success-transparent text-success",
  cancelled: "badge bg-secondary-transparent text-secondary",
};

const emptyForm = {
  supplier: "",
  supply_date: today(),
 
  notes: "",
  received_by: "",
    create_bill: false,
  tax_rate: "16",
  update_cost_price: false,
};

type Line = { product: number; name: string; item_number: string; quantity: number | string; unit_cost: number | string; taxable: boolean };
function errorMessage(err: any, fallback = "Something went wrong. Please try again.") {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.error || data.detail) return data.error || data.detail;
  const first = Object.entries(data)[0] as [string, any];
  if (first) {
    const msg = Array.isArray(first[1]) ? first[1][0] : typeof first[1] === "object" ? JSON.stringify(first[1]) : first[1];
    return first[0] === "non_field_errors" ? String(msg) : `${first[0]}: ${msg}`;
  }
  return fallback;
}

const asList = (data: any): any[] => data?.results || data?.data || (Array.isArray(data) ? data : []);

const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function exportExcel(rows: any[]) {
  const head = ["Reference", "Date", "Supplier","Products", "Units", "Total cost", "Invoice", "Status"];
  const data = rows.map(s => [
    s.reference, s.supply_date, s.supplier_name, "", s.items?.length || 0,
    s.total_units, Number(s.total_cost), s.purchase_invoice_number || "", s.status_display,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Supplies");
  XLSX.writeFile(wb, `supplies_${today()}.xlsx`);
}

function InvoicePreview({ inv }: { inv: any }) {
  // body padding is for the on-screen preview only; printing uses the @page margin
  const html = useMemo(
    () => buildInvoiceHtml(inv).html.replace("</style>", "body{padding:18px}</style>"),
    [inv]
  );
  const [h, setH] = useState(900);
  return (
    <iframe
      title="Invoice"
      srcDoc={html}
      style={{ width: "100%", height: h, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff" }}
      onLoad={e => {
        const d = (e.target as HTMLIFrameElement).contentDocument;
        if (d) setH(d.documentElement.scrollHeight + 20);
      }}
    />
  );
}

// ───────────────────────── component ─────────────────────────
export default function SupplyList() {
  const [supplies, setSupplies] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // filters / paging
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // product search
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // view / invoice / delete
  const [viewing, setViewing] = useState<any | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<any | null>(null);
  const [invoiceTax, setInvoiceTax] = useState("0");
  const [invoiceDue, setInvoiceDue] = useState("");
  const [invoice, setInvoice] = useState<any | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [mode, setMode] = useState<"form" | "view">("form");
  const [users, setUsers] = useState<any[]>([]); 
  const navigate = useNavigate();
const location = useLocation();
const [supplierQuery, setSupplierQuery] = useState("");
const [showSupplierList, setShowSupplierList] = useState(false);
const [showPaymentForm, setShowPaymentForm] = useState(false);
const [payMethod, setPayMethod] = useState<typeof PAYMENT_METHODS[number]>("cash");
const [payAmount, setPayAmount] = useState("");
const [payReference, setPayReference] = useState("");
const [payDate, setPayDate] = useState(today());
const [savingPayment, setSavingPayment] = useState(false);
const [payError, setPayError] = useState("");
const [viewLoading, setViewLoading] = useState(false);


  
  // ── load ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("supplies/", { params: { page_size: 500 } });
      setSupplies(asList(res.data));
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading supplies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await API.get("suppliers/", { params: { page_size: 500 } });
      setSuppliers(asList(res.data));
    } catch (err) {
      console.error("Error loading suppliers:", err);
    }
  }, []);

  useEffect(() => { load(); loadSuppliers(); }, [load, loadSuppliers]);
  useEffect(() => { setPage(1); }, [search, supplierFilter, statusFilter, dateFrom, dateTo]);
  const loadUsers = useCallback(async () => {
  try {
    const res = await API.get("users/", { params: { page_size: 500 } });
    setUsers(asList(res.data));
  } catch (err) {
    console.error("Error loading users:", err);
  }
}, []);

useEffect(() => { load(); loadSuppliers(); loadUsers(); }, [load, loadSuppliers, loadUsers]);

const userName = (u: any) => `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username;
  // ── filtering ──
  const filtered = useMemo(() => {
    let list = supplies;
    if (supplierFilter !== "all") list = list.filter(s => String(s.supplier) === supplierFilter);
    if (statusFilter !== "all") list = list.filter(s => s.status === statusFilter);
    if (dateFrom) list = list.filter(s => s.supply_date >= dateFrom);
    if (dateTo) list = list.filter(s => s.supply_date <= dateTo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.reference || "").toLowerCase().includes(q) ||
        (s.supplier_name || "").toLowerCase().includes(q) ||
       
        (s.items || []).some((i: any) =>
          (i.product_name || "").toLowerCase().includes(q) ||
         (i.item_number || "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [supplies, supplierFilter, statusFilter, dateFrom, dateTo, search]);
  // ── supplier type-ahead ──
  const supplierSuggestions = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    const active = suppliers.filter(s => s.is_active);
    if (!q) return active.slice(0, 8);
    const starts   = active.filter(s => (s.name || "").toLowerCase().startsWith(q));
    const contains = active.filter(
      s => !(s.name || "").toLowerCase().startsWith(q) && (s.name || "").toLowerCase().includes(q)
    );
    return [...starts, ...contains].slice(0, 8);
  }, [supplierQuery, suppliers]);

  const exactSupplierMatch = suppliers.some(
    s => (s.name || "").trim().toLowerCase() === supplierQuery.trim().toLowerCase()
  );

  function selectSupplier(s: any) {
    setForm((f: any) => ({ ...f, supplier: String(s.id) }));
    setSupplierQuery(s.name);
    setShowSupplierList(false);
  }

  function goRegisterSupplier() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, lines }));
    } catch { /* ignore */ }
    navigate("/suppliers", {   // ← replace with your all_routes entry if you have one
      state: { registerSupplier: true, name: supplierQuery.trim(), returnTo: "/supplies" },
    });
  }

  // Returning from supplier registration: reopen the form with the new supplier selected
  useEffect(() => {
    const st = location.state as any;
    if (!st?.newSupplierId || suppliers.length === 0) return;
    const s = suppliers.find(x => x.id === st.newSupplierId);
    if (!s) return;

    let draft: any = null;
    try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* ignore */ }
    sessionStorage.removeItem(DRAFT_KEY);

    setMode("form");
    setViewing(null);
    setEditingId(null);
    setForm({
      ...emptyForm,
      ...(draft?.form || {}),
      supply_date: draft?.form?.supply_date || today(),
      supplier: String(s.id),
    });
    setLines(draft?.lines || []);
    setSupplierQuery(s.name);
    setProductQuery(""); setProductResults([]);
    setFormError("");
    setShowForm(true);

    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps
    // Coming from an invoice: open that supply and its payment form
  useEffect(() => {
    const st = location.state as any;
    if (!st?.openSupplyId || supplies.length === 0) return;
    const s = supplies.find(x => x.id === st.openSupplyId);
    if (s) {
      openView(s);
      if (st.openPayment) setShowPaymentForm(true);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, supplies]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeFilterCount = [supplierFilter !== "all", statusFilter !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;
  function resetFilters() {
    setSupplierFilter("all"); setStatusFilter("all"); setDateFrom(""); setDateTo(""); setSearch("");
  }

  // ── product search (debounced) ──
  useEffect(() => {
    if (!showForm) return;
    const q = productQuery.trim();
    if (!q) { setProductResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await API.get("products/", { params: { search: q, is_active: true, page_size: 15 } });
        setProductResults(asList(res.data).slice(0, 15));
      } catch (err) {
        console.error("Product search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [productQuery, showForm]);

  function addProduct(p: any) {
    setLines(ls => {
      const i = ls.findIndex(l => l.product === p.id);
      if (i >= 0) return ls.map((l, n) => (n === i ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l));
      return [...ls, { product: p.id, name: p.name, item_number: p.item_number, quantity: 1, unit_cost: Number(p.cost_price || 0), taxable: Number(p.tax_rate || 0) > 0 }];
    });
    setProductQuery("");
    setProductResults([]);
  }

  const updateLine = (idx: number, field: "quantity" | "unit_cost", value: string) =>
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  const removeLine = (idx: number) => setLines(ls => ls.filter((_, i) => i !== idx));
  const toggleTax = (idx: number) =>
  setLines(ls => ls.map((l, i) => (i === idx ? { ...l, taxable: !l.taxable } : l)));
 const vatRate = Number(form.tax_rate) || 0;
const lineNet = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0);
const formUnits = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);
const formSub = lines.reduce((a, l) => a + lineNet(l), 0);
const formVat = lines.reduce((a, l) => a + (l.taxable ? lineNet(l) * vatRate / 100 : 0), 0);
const formTotal = formSub + formVat;
  // ── create / edit ──
  function openCreate() {
    setMode("form");
    setViewing(null);
    setEditingId(null);
    setForm({ ...emptyForm, supply_date: today() });
    setLines([]);
        setSupplierQuery("");
    setProductQuery(""); setProductResults([]);
    setFormError("");
    setShowForm(true);
  }

 async function refreshViewing(id: number, spinner = true) {
  if (spinner) setViewLoading(true);
  try {
    const res = await API.get(`supplies/${id}/`);
    const raw = res.data?.data ?? res.data;
    if (raw?.id != null) setViewing(raw);
  } catch (err) {
    console.error("Error loading supply:", err);
  } finally {
    setViewLoading(false);
  }
}

function openView(s: any) {
  setViewing(s);
  setMode("view");
  setFormError("");
  setShowPaymentForm(false);
  setPayError("");
  setPayAmount(""); setPayReference(""); setPayMethod("cash"); setPayDate(today());
  setShowForm(true);
  refreshViewing(s.id);
}

async function submitPayment() {
  setPayError("");
  const amt = parseFloat(payAmount);
  if (!amt || amt <= 0) return setPayError("Enter a valid payment amount.");
  setSavingPayment(true);
  try {
    await API.post("business-payments/", {
      category: "invoice",                 // must match your BusinessPayment.Category value
      purchase_invoice: viewing.purchase_invoice,
      amount: amt,
      method: payMethod,
      reference: payReference,
      payment_date: payDate,
      description: `Payment for supply ${viewing.reference}`,
    });
    setShowPaymentForm(false);
    setPayAmount(""); setPayReference(""); setPayMethod("cash"); setPayDate(today());
    await refreshViewing(viewing.id, false);
    load();
    showSuccess("Payment was recorded.", "Payment saved");
  } catch (err: any) {
    setPayError(errorMessage(err, "Failed to record payment."));
  } finally {
    setSavingPayment(false);
  }
}

  function openEdit(s: any) {
    setMode("form");
    setViewing(null);
    setEditingId(s.id);
    setSupplierQuery(s.supplier_name || "");
       const taxedLine = (s.items || []).find((i: any) => Number(i.tax_rate) > 0);
    setForm({
      ...emptyForm,
      supplier: String(s.supplier),
      supply_date: s.supply_date,
     
      notes: s.notes || "",
      tax_rate: taxedLine ? String(Number(taxedLine.tax_rate)) : "16",
    });
    setLines((s.items || []).map((i: any) => ({
      product: i.product, name: i.product_name, item_number: i.item_number,
      quantity: i.quantity, unit_cost: Number(i.unit_cost), taxable: Number(i.tax_rate) > 0,
    })));
    setProductQuery(""); setProductResults([]);
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    if (!saving) setShowForm(false);
  }

  async function handleSubmit() {
    setFormError("");
    if (!form.supplier) return setFormError("Select a supplier from the suggestions, or register a new one.");
    if (!form.supply_date) return setFormError("Enter the supply date.");
    if (lines.length === 0) return setFormError("Search and add at least one product.");
    for (const l of lines) {
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1) return setFormError(`Enter a whole quantity of 1 or more for "${l.name}".`);
      if (Number(l.unit_cost) < 0 || l.unit_cost === "") return setFormError(`Enter a unit cost for "${l.name}" (0 if unknown).`);
    }
    if (form.create_bill && !editingId && formTotal <= 0)
      return setFormError("Enter unit costs before creating an invoice.");

    const payload: any = {
      supplier: Number(form.supplier),
      supply_date: form.supply_date,
      
      received_by: form.received_by ? Number(form.received_by) : null,
      notes: form.notes,
      update_cost_price: form.update_cost_price,
      items: lines.map(l => ({
        product: l.product, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) || 0,
        tax_rate: l.taxable ? vatRate : 0,
      })),
        };
    if (!editingId) {
      payload.create_bill = form.create_bill;
      
    }

    if (editingId) {
      const ok = await showConfirm(
        "Stock in the Store will be adjusted by the difference, and the invoice (if any) will be updated.",
        "Save changes to this supply?",
        "Yes, save changes"
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = editingId
        ? await API.put(`supplies/${editingId}/`, payload)
        : await API.post("supplies/", payload);
      setShowForm(false);
      load();
      showSuccess(
        editingId ? "The supply was updated." : `Supply ${res.data?.reference || ""} was recorded and added to the Store.`,
        editingId ? "Supply updated" : "Supply saved"
      );
    } catch (err: any) {
      console.error("Error saving supply:", err);
      const msg = errorMessage(err, "Could not save the supply. Please try again.");
      setFormError(msg);
      showError(msg, "Could not save supply", 6000);
    } finally {
      setSaving(false);
    }
  }

  // ── invoice ──
  async function fetchInvoice(supply: any, body: any = {}) {
    setInvoiceBusy(true);
    setInvoiceError("");
    try {
      const res = await API.post(`supplies/${supply.id}/generate_invoice/`, body);
      setInvoice(res.data);
      load();
      if (res.status === 201) showSuccess(`Invoice ${res.data.invoice_number} was generated.`, "Invoice created");
    } catch (err: any) {
      setInvoiceError(errorMessage(err, "Could not generate the invoice."));
    } finally {
      setInvoiceBusy(false);
    }
  }

  function openInvoice(supply: any) {
    setShowForm(false);
    setInvoice(null);
    setInvoiceError("");
    setInvoiceTax("0");
    setInvoiceDue("");
    if (supply.has_invoice) {
      setInvoiceFor(supply);
      fetchInvoice(supply); // returns the existing invoice, never a duplicate
    } else {
      setInvoiceFor(supply);
    }
  }

  function closeInvoice() {
    if (invoiceBusy) return;
    setInvoice(null);
    setInvoiceFor(null);
    setInvoiceError("");
  }

  // ── delete ──
  async function handleDelete(sp: any) {
    const ok = await showConfirm(
      `Delete ${sp.reference} from ${sp.supplier_name}? Its quantities will be taken back out of the Store and its invoice (if any) will be removed. This can't be undone.`,
      "Delete this supply?",
      "Yes, delete it"
    );
    if (!ok) return;
    try {
      await API.delete(`supplies/${sp.id}/`);
      load();
      showSuccess(`${sp.reference} was deleted.`, "Supply deleted");
    } catch (err: any) {
      showError(errorMessage(err, "Could not delete the supply."), "Could not delete", 6000);
    }
  }

  const set = (field: string) => (e: any) => setForm((f: any) => ({ ...f, [field]: e.target.value }));
  const live = supplies.filter(s => s.status !== "cancelled");

  // ───────────────────────── render ─────────────────────────
  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Supplies</h4>
            <p className="text-muted fs-13 mb-0">Deliveries received from suppliers. Stock goes into the Store.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportExcel(filtered)} disabled={!filtered.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <i className="ti ti-plus me-1" />Record Supply
            </button>
          </div>
        </div>

     {/* Stat tiles */}
{!loading && supplies.length > 0 && (() => {
  const paid = live.reduce((a, s) => a + Number(s.amount_paid || 0), 0);
  const balance = live.reduce((a, s) => a + Number(s.balance_due || 0), 0);
  const tiles = [
    { label: "Supplies", value: live.length, icon: "ti-package-import", bg: "bg-primary-gradient-100", color: "text-primary" },
    { label: "Units received", value: live.reduce((a, s) => a + (s.total_units || 0), 0), icon: "ti-stack-2", bg: "bg-success-gradient-100", color: "text-success" },
    { label: "Total cost", value: money(live.reduce((a, s) => a + Number(s.total_cost || 0), 0)), icon: "ti-cash", bg: "bg-warning-gradient-100", color: "text-warning" },
    { label: "Amount paid", value: money(paid), icon: "ti-circle-check", bg: "bg-success-gradient-100", color: "text-success" },
    { label: "Balance", value: money(balance), icon: "ti-clock-dollar", bg: "bg-danger-gradient-100", color: balance > 0 ? "text-danger" : "text-success" },
    { label: "Without invoice", value: live.filter(s => !s.has_invoice).length, icon: "ti-file-off", bg: "bg-danger-gradient-100", color: "text-danger" },
  ];
  return (
    <div className="row g-3 mb-4">
      {tiles.map(t => (
        <div key={t.label} className="col-6 col-md-4 col-xl-2">
          <div className="card mb-0 shadow-none border">
            <div className="card-body p-3 position-relative">
              <p className="fw-medium mb-1 fs-13">{t.label}</p>
              <h5 className={`mb-0 ${t.color}`}>{t.value}</h5>
              <div className={`avatar avatar-rounded avatar-sm ${t.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                <i className={`ti ${t.icon} fs-5 ${t.color}`} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
})()}
        {/* Table card */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 300 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search reference, supplier, product…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
                <option value="all">All suppliers</option>
                {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From" />
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To" />
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger" onClick={resetFilters}><i className="ti ti-x me-1" />Clear</button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading supplies…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-package-import fs-1 mb-2" />
                <p className="fs-14 mb-0">{supplies.length === 0 ? "No supplies yet. Record your first delivery." : "No supplies match your filters."}</p>
                {supplies.length === 0
                  ? <button className="btn btn-sm btn-primary mt-3" onClick={openCreate}><i className="ti ti-plus me-1" />Record Supply</button>
                  : activeFilterCount > 0 && <button className="btn btn-sm btn-link mt-2" onClick={resetFilters}>Clear filters</button>}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="text-nowrap">Reference</th>
                      <th className="text-nowrap">Date</th>
                      <th className="text-nowrap">Supplier</th>
                      
                      <th className="text-end text-nowrap">Products</th>
                      <th className="text-end text-nowrap">Units</th>
                      <th className="text-end text-nowrap">Total cost</th>
                      <th className="text-nowrap">Invoice</th>
                      <th className="text-nowrap">Status</th>
                      <th className="text-end text-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(s => (
                      <tr key={s.id}>
                        <td className="fw-semibold text-dark text-nowrap">
                          <a href="#" onClick={e => { e.preventDefault(); openView(s); }}>{s.reference}</a>
                        </td>
                        <td className="text-nowrap">{s.supply_date}</td>
                        <td className="text-nowrap">{s.supplier_name}</td>
                       
                        <td className="text-end">{s.items?.length || 0}</td>
                        <td className="text-end">{s.total_units}</td>
                        <td className="text-end fw-semibold">{money(s.total_cost)}</td>
                        <td className="text-nowrap">
                          {s.has_invoice
                            ? <span className="badge bg-info-transparent text-info">{s.purchase_invoice_number}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td><span className={STATUS_CLS[s.status] || "badge bg-secondary-transparent text-secondary"}>{s.status_display}</span></td>
                        <td className="text-end text-nowrap">
                          <button className="btn btn-sm btn-icon btn-outline-primary me-1" title="View" onClick={() => openView(s)}>
                            <i className="ti ti-eye" />
                          </button>
                          {s.can_edit && (
                            <button className="btn btn-sm btn-icon btn-outline-secondary me-1" title="Edit" onClick={() => openEdit(s)}>
                              <i className="ti ti-edit" />
                            </button>
                          )}
                          {s.status !== "cancelled" && (
                            <button className="btn btn-sm btn-icon btn-outline-success me-1"
                              title={s.has_invoice ? "View invoice" : "Generate invoice"} onClick={() => openInvoice(s)}>
                              <i className="ti ti-file-invoice" />
                            </button>
                          )}
                          <button className="btn btn-sm btn-icon btn-outline-danger" title="Delete"
                            onClick={() => handleDelete(s)}>
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

          {!loading && filtered.length > 0 && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = (page - 1) * pageSize + 1;
            const end = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> suppl{filtered.length !== 1 ? "ies" : "y"}</span>
                <div className="d-flex align-items-center gap-1">
                  <select className="form-select form-select-sm fs-12 w-auto" value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  {totalPages > 1 && (
                    <nav className="ms-2">
                      <ul className="pagination pagination-sm mb-0">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p - 1)}><i className="ti ti-chevron-left" /></button>
                        </li>
                        <li className="page-item disabled"><span className="page-link">{page} / {totalPages}</span></li>
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p + 1)}><i className="ti ti-chevron-right" /></button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ================= Record / Edit Supply ================= */}
      {showForm && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeForm} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: "min(760px, 100vw)" }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">
                {mode === "view" && viewing
                  ? <>{viewing.reference} <span className={`ms-2 ${STATUS_CLS[viewing.status]}`}>{viewing.status_display}</span></>
                  : editingId ? "Edit Supply" : "Record Supply"}
              </h5>
              <button type="button" className="btn-close" onClick={closeForm} />
            </div>


            <div className="offcanvas-body">
              {mode === "view" && viewing ? (
                <div className="fs-13">
                  <div className="row g-3 mb-3">
                    <div className="col-6 col-md-3"><div className="text-muted fs-12">Supplier</div><div className="fw-semibold">{viewing.supplier_name}</div><div className="text-muted fs-12">{viewing.supplier_phone}</div></div>
                    <div className="col-6 col-md-3"><div className="text-muted fs-12">Supply date</div><div className="fw-semibold">{viewing.supply_date}</div></div>
                    
                    <div className="col-6 col-md-3"><div className="text-muted fs-12">Received by</div><div className="fw-semibold">{viewing.received_by_name}</div></div>
                  </div>
{viewing.has_invoice && (() => {
  const total = Number(viewing.invoice_total ?? viewing.total_cost ?? 0);
  const paid = Number(viewing.amount_paid || 0);
  const balance = Number(viewing.balance_due ?? total - paid);
  return (
    <div className="row g-2 mb-3">
      {[
        { label: "Invoice total", value: money(total), cls: "" },
        { label: "Paid", value: money(paid), cls: "text-success" },
        { label: "Balance", value: money(balance), cls: balance > 0 ? "text-danger" : "text-success" },
      ].map(t => (
        <div key={t.label} className="col-4">
          <div className="border rounded p-2">
            <p className="text-muted fs-12 mb-1">{t.label}</p>
            <h6 className={`mb-0 fw-semibold ${t.cls}`}>{t.value}</h6>
          </div>
        </div>
      ))}
    </div>
  );
})()}
                  <div className="table-responsive border rounded">
                    <table className="table table-sm mb-0 fs-13">
                      <thead className="table-light">
                        <tr><th>#</th><th>Product</th><th>Item #</th><th className="text-end">Qty</th><th className="text-end">Unit cost</th><th className="text-end">Line total</th></tr>
                      </thead>
                      <tbody>
                        {(viewing.items || []).map((i: any, n: number) => (
                          <tr key={i.id}>
                            <td>{n + 1}</td><td className="fw-medium">{i.product_name}</td><td className="text-muted">{i.item_number}</td>
                            <td className="text-end">{i.quantity}</td><td className="text-end">{money(i.unit_cost)}</td>
                            <td className="text-end fw-semibold">{money(i.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="table-light">
                          <td colSpan={3} className="fw-semibold">Total</td>
                          <td className="text-end fw-semibold">{viewing.total_units}</td>
                          <td />
                          <td className="text-end fw-bold">{money(viewing.total_cost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {viewing.notes && <div className="mt-3"><div className="text-muted fs-12">Notes</div><div style={{ whiteSpace: "pre-line" }}>{viewing.notes}</div></div>}
                  {viewing.has_invoice && <div className="mt-3 text-muted fs-12">Invoice: <strong>{viewing.purchase_invoice_number}</strong></div>}
                  {viewing.has_invoice && viewing.status !== "cancelled" && (() => {
  const payments: any[] = Array.isArray(viewing.payments) ? viewing.payments : [];
  const total = Number(viewing.invoice_total ?? viewing.total_cost ?? 0);
  const balance = Number(viewing.balance_due ?? total - Number(viewing.amount_paid || 0));
  return (
    <div className="card shadow-none border mt-3 mb-0">
      <div className="card-header py-2 border-bottom d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <i className="ti ti-credit-card text-primary" />
          <h6 className="mb-0 fw-semibold fs-14">Payments</h6>
          <span className="badge bg-primary-transparent text-primary fs-11">{payments.length}</span>
        </div>
        {balance > 0 && (
          <button className="btn btn-sm btn-primary" onClick={() => setShowPaymentForm(v => !v)}>
            <i className="ti ti-plus me-1" />Record payment
          </button>
        )}
      </div>

      {showPaymentForm && (
        <div className="card-body border-bottom bg-light py-3">
          {payError && <div className="alert alert-danger fs-12 py-2">{payError}</div>}
          <div className="row g-2">
            <div className="col-sm-6">
              <label className="form-label fs-12 mb-1">Method</label>
              <select className="form-select form-select-sm fs-13" value={payMethod}
                onChange={e => setPayMethod(e.target.value as any)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="col-sm-6">
              <label className="form-label fs-12 mb-1">Amount</label>
              <input type="number" min={0} step="0.01" className="form-control form-control-sm fs-13"
                value={payAmount} onChange={e => setPayAmount(e.target.value)}
                placeholder={balance.toFixed(2)} />
            </div>
            <div className="col-sm-6">
              <label className="form-label fs-12 mb-1">Reference</label>
              <input type="text" className="form-control form-control-sm fs-13"
                value={payReference} onChange={e => setPayReference(e.target.value)}
                placeholder="M-Pesa code, cheque no…" />
            </div>
            <div className="col-sm-6">
              <label className="form-label fs-12 mb-1">Payment date</label>
              <input type="date" className="form-control form-control-sm fs-13" max={today()}
                value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div className="col-12 d-flex gap-2 justify-content-end">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowPaymentForm(false)}>Cancel</button>
              <button className="btn btn-sm btn-primary" disabled={savingPayment} onClick={submitPayment}>
                {savingPayment ? <span className="spinner-border spinner-border-sm" /> : "Save payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-body p-0">
        {viewLoading && payments.length === 0 ? (
          <div className="text-center text-muted py-3 fs-13">
            <span className="spinner-border spinner-border-sm me-2" />Loading…
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center text-muted py-4 fs-13">
            <i className="ti ti-credit-card-off fs-2 d-block mb-2" />No payments recorded yet
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm mb-0 fs-13">
              <thead className="table-light">
                <tr>
                  <th className="ps-3">Method</th><th>Amount</th><th>Reference</th>
                  <th>Paid by</th><th>Date</th><th className="pe-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const cancelled = p.status === "cancelled";
                  return (
                    <tr key={p.id} className={cancelled ? "text-muted" : ""}
                        style={cancelled ? { textDecoration: "line-through" } : undefined}>
                      <td className="ps-3">
                        <span className="badge bg-info-transparent text-info">
                          {p.method_display || METHOD_LABELS[p.method] || p.method}
                        </span>
                      </td>
                      <td className={`fw-semibold ${cancelled ? "" : "text-success"}`}>{money(p.amount)}</td>
                      <td className="text-muted">{p.reference || "—"}</td>
                      <td className="text-muted">{p.created_by_name}</td>
                      <td className="text-muted text-nowrap">{p.payment_date}</td>
                      <td className="pe-3">
                        <span className={cancelled
                          ? "badge bg-secondary-transparent text-secondary"
                          : "badge bg-success-transparent text-success"}>
                          {p.status_display}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
})()}
                  {!viewing.can_edit && viewing.status !== "cancelled" && (
                    <div className="alert alert-warning fs-12 py-2 mt-3 mb-0">
                      This supply can't be edited because its invoice has payments. Cancel those payments first.
                    </div>
                  )}
                </div>
              ) : (
              <>
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              <div className="row g-2 mb-3">
                                <div className="col-md-6">
                  <label className="form-label fs-13 fw-medium">Supplier <span className="text-danger">*</span></label>
                  <div className="position-relative">
                    <input
                      type="text"
                      autoComplete="off"
                      className={`form-control ${form.supplier ? "is-valid" : ""}`}
                      placeholder="Type to search suppliers…"
                      value={supplierQuery}
                      onChange={e => {
                        setSupplierQuery(e.target.value);
                        setForm((f: any) => ({ ...f, supplier: "" }));
                        setShowSupplierList(true);
                      }}
                      onFocus={() => setShowSupplierList(true)}
                      onBlur={() => {
                        setShowSupplierList(false);
                        if (!form.supplier) {
                          const m = suppliers.find(
                            s => s.is_active && (s.name || "").trim().toLowerCase() === supplierQuery.trim().toLowerCase()
                          );
                          if (m) selectSupplier(m);
                        }
                      }}
                    />
                    {showSupplierList && (supplierSuggestions.length > 0 || supplierQuery.trim()) && (
                      <div className="list-group position-absolute w-100 shadow-sm"
                           style={{ zIndex: 30, top: "100%", maxHeight: 260, overflowY: "auto" }}>
                        {supplierSuggestions.map(s => (
                          <button key={s.id} type="button"
                            className="list-group-item list-group-item-action fs-13 py-2"
                            onMouseDown={e => { e.preventDefault(); selectSupplier(s); }}>
                            <span className="fw-medium">{s.name}</span>
                            {s.phone && <span className="text-muted ms-2 fs-12">{s.phone}</span>}
                          </button>
                        ))}
                        {supplierQuery.trim() && !exactSupplierMatch && (
                          <div className="list-group-item fs-12 text-muted">
                            {supplierSuggestions.length === 0
                              ? <>No supplier named "<strong>{supplierQuery.trim()}</strong>". </>
                              : <>Not in the list? </>}
                            <a href="#" className="fw-semibold"
                               onMouseDown={e => { e.preventDefault(); goRegisterSupplier(); }}>
                              <i className="ti ti-plus" /> Register this supplier
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-md-3">
                  <label className="form-label fs-13 fw-medium">Supply date <span className="text-danger">*</span></label>
                  <input type="date" className="form-control" max={today()} value={form.supply_date} onChange={set("supply_date")} />
                </div>
                
              </div>
              <div className="row g-2 mb-3">
  <div className="col-md-6">
    <label className="form-label fs-13 fw-medium">Received by</label>
    <select className="form-select" value={form.received_by} onChange={set("received_by")}>
      <option value="">Me (logged-in user)</option>
      {users
        .filter(u => u.is_active !== false || String(u.id) === String(form.received_by))
        .map(u => <option key={u.id} value={String(u.id)}>{userName(u)}</option>)}
    </select>
    <div className="text-muted fs-12 mt-1">The person who physically received the goods.</div>
  </div>
</div>

              {/* Product search */}
              <div className="mb-3 position-relative">
                <label className="form-label fs-13 fw-medium">Add products</label>
                <div className="input-group">
                  <span className="input-group-text bg-transparent"><i className="ti ti-search text-muted" /></span>
                  <input className="form-control" placeholder="Search by product name or item number…"
                    value={productQuery} onChange={e => setProductQuery(e.target.value)} />
                  {searching && <span className="input-group-text bg-transparent"><span className="spinner-border spinner-border-sm" /></span>}
                </div>
                {productQuery.trim() && !searching && productResults.length === 0 && (
                  <div className="text-muted fs-12 mt-1">No products found for "{productQuery}".</div>
                )}
                {productResults.length > 0 && (
                  <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 20, maxHeight: 280, overflowY: "auto" }}>
                    {productResults.map(p => {
                      const added = lines.some(l => l.product === p.id);
                      return (
                        <button key={p.id} type="button" className="list-group-item list-group-item-action d-flex justify-content-between align-items-center fs-13"
                          onClick={() => addProduct(p)}>
                          <span>
                            <span className="fw-medium">{p.name}</span>
                            <span className="text-muted ms-2">{p.item_number}</span>
                          </span>
                          <span className="text-muted fs-12">
                            {added ? "Added · click to add 1 more" : `Cost ${money(p.cost_price)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lines */}
              <div className="border rounded mb-3">
                {lines.length === 0 ? (
                  <div className="text-center text-muted py-4 fs-13">
                    <i className="ti ti-shopping-cart-plus fs-2 d-block mb-1" />
                    No products added yet. Search above and click a product to add it.
                  </div>
                ) : (
                  <div className="table-responsive">
                  <table className="table table-sm mb-0 fs-13 align-middle">
  <thead className="table-light">
    <tr>
      <th>Product</th>
      <th style={{ width: 100 }}>Quantity</th>
      <th style={{ width: 120 }}>Unit cost</th>
      <th className="text-center" style={{ width: 60 }}>VAT</th>
      <th className="text-end" style={{ width: 130 }}>Line total</th>
      <th style={{ width: 40 }} />
    </tr>
  </thead>
  <tbody>
    {lines.map((l, idx) => (
      <tr key={l.product}>
        <td>
          <div className="fw-medium">{l.name}</div>
          <div className="text-muted fs-12">{l.item_number}</div>
        </td>
        <td>
          <input type="number" min={1} step={1} className="form-control form-control-sm"
            value={l.quantity} onChange={e => updateLine(idx, "quantity", e.target.value)} />
        </td>
        <td>
          <input type="number" min={0} step="0.01" className="form-control form-control-sm"
            value={l.unit_cost} onChange={e => updateLine(idx, "unit_cost", e.target.value)} />
        </td>
        <td className="text-center">
          <input type="checkbox" className="form-check-input" checked={l.taxable} onChange={() => toggleTax(idx)} />
        </td>
        <td className="text-end fw-semibold">
          {money(lineNet(l) * (1 + (l.taxable ? vatRate : 0) / 100))}
        </td>
        <td className="text-end">
          <button className="btn btn-sm btn-icon btn-outline-danger" title="Remove" onClick={() => removeLine(idx)}>
            <i className="ti ti-x" />
          </button>
        </td>
      </tr>
    ))}
  </tbody>
  <tfoot>
    <tr className="table-light">
      <td className="fw-semibold">{lines.length} product{lines.length !== 1 ? "s" : ""}</td>
      <td className="fw-semibold">{formUnits} units</td>
      <td colSpan={2} className="text-end text-muted">Subtotal {money(formSub)} · VAT {money(formVat)}</td>
      <td className="text-end fw-bold">{money(formTotal)}</td>
      <td />
    </tr>
  </tfoot>
</table>
                  </div>
                )}
              </div>
                <div className="mb-3" style={{ maxWidth: 200 }}>
  <label className="form-label fs-13 fw-medium">VAT rate (%)</label>
  <input type="number" min={0} max={100} step="0.01" className="form-control form-control-sm"
    value={form.tax_rate} onChange={set("tax_rate")} />
  <div className="text-muted fs-12 mt-1">Applied only to lines ticked "VAT".</div>
</div>
              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Notes</label>
                <textarea className="form-control" rows={2} value={form.notes} onChange={set("notes")}
                  placeholder="Condition of goods, driver, anything worth remembering…" />
              </div>

              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" id="updateCost" checked={form.update_cost_price}
                  onChange={e => setForm((f: any) => ({ ...f, update_cost_price: e.target.checked }))} />
                <label className="form-check-label fs-13" htmlFor="updateCost">
                  Update each product's cost price to the unit cost entered
                </label>
              </div>

              {!editingId && (
                <>
                  <div className="form-check form-switch mb-2">
                    <input className="form-check-input" type="checkbox" id="createBill" checked={form.create_bill}
                      onChange={e => setForm((f: any) => ({ ...f, create_bill: e.target.checked }))} />
                    <label className="form-check-label fs-13" htmlFor="createBill">Also generate the purchase invoice</label>
                  </div>
                 
                </>
              )}
              {editingId && (
                <div className="text-muted fs-12">
                  Stock in the Store is adjusted by the difference. If this supply has an invoice, it is updated too.
                </div>
              )}
              </>
              )}
            </div>
            {mode === "view" && viewing ? (
              <div className="offcanvas-footer border-top p-3 d-flex justify-content-between align-items-center gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={closeForm}>Close</button>
                <div className="d-flex gap-2">
                  {viewing.can_edit && (
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(viewing)}>
                      <i className="ti ti-edit me-1" />Edit
                    </button>
                  )}
                  {viewing.status !== "cancelled" && (
                    <button className="btn btn-success btn-sm" onClick={() => openInvoice(viewing)}>
                      <i className="ti ti-file-invoice me-1" />{viewing.has_invoice ? "View invoice" : "Generate invoice"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-between align-items-center gap-2">
              <span className="fs-13 text-muted">{formUnits} units · <strong className="text-dark">{money(formTotal)}</strong></span>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={closeForm} disabled={saving}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                  {editingId ? "Save changes" : "Save supply"}
                </button>
              </div>
            </div>
            )}
          </div>
        </>
      )}

      {/* ================= Generate / View Invoice ================= */}
      {invoiceFor && (
  <>
    <div className="offcanvas-backdrop fade show" onClick={closeInvoice} />
    <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: "min(760px, 100vw)" }} tabIndex={-1}>
      <div className="offcanvas-header border-bottom">
        <h5 className="offcanvas-title fw-semibold">
          {invoice ? `Invoice ${invoice.invoice_number}` : "Generate invoice"}
        </h5>
        <button type="button" className="btn-close" onClick={closeInvoice} disabled={invoiceBusy} />
      </div>

      <div className="offcanvas-body fs-13">
        {invoiceError && <div className="alert alert-danger fs-13 py-2">{invoiceError}</div>}

        {!invoice && invoiceBusy && (
          <div className="d-flex align-items-center justify-content-center py-4 text-muted">
            <span className="spinner-border spinner-border-sm me-2" />Loading invoice…
          </div>
        )}

        {!invoice && !invoiceBusy && !invoiceFor.has_invoice && (
          <>
            <p className="mb-3">
              Create a purchase invoice for <strong>{invoiceFor.reference}</strong> from {invoiceFor.supplier_name}{" "}
              listing all {invoiceFor.items?.length || 0} products ({money(invoiceFor.total_cost)} before tax).
            </p>
            <div className="row g-2" style={{ maxWidth: 420 }}>
              <div className="col-6">
                <label className="form-label fs-12 fw-medium">Tax rate (%)</label>
                <input type="number" min={0} max={100} step="0.01" className="form-control form-control-sm"
                  value={invoiceTax} onChange={e => setInvoiceTax(e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label fs-12 fw-medium">Due date</label>
                <input type="date" className="form-control form-control-sm" min={invoiceFor.supply_date}
                  value={invoiceDue} onChange={e => setInvoiceDue(e.target.value)} />
              </div>
            </div>
            <div className="text-muted fs-12 mt-2">Leave the due date empty to use the supplier's payment terms.</div>
          </>
        )}

      {invoice && <InvoicePreview inv={invoice} />}
      </div>

      <div className="offcanvas-footer border-top p-3 d-flex justify-content-between align-items-center gap-2">
        <button className="btn btn-outline-secondary btn-sm" onClick={closeInvoice} disabled={invoiceBusy}>Close</button>
        {invoice ? (
          <button className="btn btn-primary btn-sm" onClick={() => printInvoice(invoice)}>
            <i className="ti ti-printer me-1" />Print
          </button>
        ) : !invoiceFor.has_invoice && (
          <button className="btn btn-success btn-sm" disabled={invoiceBusy}
            onClick={() => fetchInvoice(invoiceFor, { tax_rate: Number(invoiceTax) || 0, due_date: invoiceDue || undefined })}>
            {invoiceBusy ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-file-invoice me-1" />}
            Generate invoice
          </button>
        )}
      </div>
    </div>
  </>
)}
    </div>
  );
}
