import { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../services/api";
import { printHtml } from "../../utils/printHtml";
import { buildListHtml, downloadHtmlPdf } from "../../utils/invoiveTemplate";

const listOf = (res: any) => res.data?.results || (Array.isArray(res.data) ? res.data : []);
const num = (n: any) => Number(n || 0).toLocaleString("en-KE");
const money = (n: any) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDateTime = (d: string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function errMsg(err: any, fallback: string) {
  const d = err.response?.data;
  if (!d) return fallback;
  if (typeof d === "string") return fallback;
  const first = d.error || d.detail || Object.values(d)[0];
  return Array.isArray(first) ? String(first[0]) : first ? String(first) : fallback;
}
// true when every word typed appears somewhere in the row's values
const matchesAll = (query: string, values: any[]) => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = values.map(v => String(v ?? "")).join(" ").toLowerCase();
  return words.every(w => hay.includes(w));
};
const TYPE_LABELS: Record<string, string> = {
  received: "Received into Store",
  to_head_office: "Moved to Head Office",
  adjustment: "Adjustment",
  damaged: "Damaged",
  expired: "Expired",
  returned: "Returned",
  disposed: "Disposed",
};
const TYPE_CLS: Record<string, string> = {
  received: "badge bg-success-transparent text-success",
  to_head_office: "badge bg-primary-transparent text-primary",
  adjustment: "badge bg-warning-transparent text-warning",
  damaged: "badge bg-danger-transparent text-danger",
  expired: "badge bg-danger-transparent text-danger",
  returned: "badge bg-info-transparent text-info",
  disposed: "badge bg-secondary-transparent text-secondary",
};

const BUCKETS = {
  damaged: "damaged_quantity",
  expired: "expired_quantity",
  returned: "returned_quantity",
} as const;
const BUCKET_LABEL: Record<string, string> = { damaged: "Damaged", expired: "Expired", returned: "Returned" };

type Line = { product: string; quantity: string };
type Mode = null | "receive" | "move" | "writeoff" | "status" | "issue";

export default function Store() {
  const [tab, setTab] = useState<"stock" | "issues" | "history">("stock");

  // ── stock ──
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // ── history ──
  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histType, setHistType] = useState("");
  const [histSearch, setHistSearch] = useState("");

  // ── offcanvas ──
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");
  const [receive, setReceive] = useState({ product: "", quantity: "" });
  const [receiveKind, setReceiveKind] = useState<"stock" | "return">("stock");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [lines, setLines] = useState<Line[]>([{ product: "", quantity: "" }]);
  const [writeOff, setWriteOff] = useState<any>({ row: null, quantity: "", reason: "damaged" });
  const [statusForm, setStatusForm] = useState<any>({ row: null, from: "damaged", to: "good", quantity: "" });
  const [flash, setFlash] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [confirmedBy, setConfirmedBy] = useState("");
  const [authorisedBy, setAuthorisedBy] = useState("");
  const [issue, setIssue] = useState({ type: "damaged", quantity: "", price: "" });
const [issueSearch, setIssueSearch] = useState("");
  useEffect(() => {
    API.get("store/users/")
      .then(r => setUsers(Array.isArray(r.data) ? r.data : listOf(r)))
      .catch(e => console.error("Could not load users:", e));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params: any = { page_size: 1000 };
      ;
      if (lowOnly) params.low_stock = "true";
      const [list, st] = await Promise.all([
        API.get("store/", { params }),
        API.get("store/stats/"),
      ]);
      setRows(listOf(list));
      setStats(st.data);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else setError(errMsg(err, "Could not load the store."));
    } finally { setLoading(false); }
  }, [lowOnly]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const params: any = { page_size: 500 };
      if (histType) params.movement_type = histType;
    
      const res = await API.get("store-movements/", { params });
      setHistory(listOf(res));
    } catch (err: any) {
      setError(errMsg(err, "Could not load store history."));
    } finally { setHistLoading(false); }
  }, [histType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);
  useEffect(() => { setPage(1); }, [search, lowOnly]);
  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("products/", { params: { page_size: 1000, is_active: "true" } });
        setProducts(listOf(res));
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Receive form: search products as the user types (debounced)
  useEffect(() => {
    if ((mode !== "receive" && mode !== "issue") || selectedProduct) return;
    const q = productQuery.trim();
    if (!q) { setProductResults([]); setSearchingProducts(false); return; }
    setSearchingProducts(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await API.get("products/", { params: { search: q, is_active: "true", page_size: 20 } });
        if (!cancelled) setProductResults(listOf(res).slice(0, 20));
      } catch (e) {
        console.error("Product search failed:", e);
      } finally {
        if (!cancelled) setSearchingProducts(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [productQuery, mode, selectedProduct]);

  function pickProduct(p: any) {
    setSelectedProduct(p);
    setReceive(r => ({ ...r, product: String(p.id) }));
    setProductQuery(""); setProductResults([]);
  }
  function clearProduct() {
    setSelectedProduct(null);
    setReceive(r => ({ ...r, product: "" }));
  }

  // Products that have good stock in the store (for the Move form)
  const inStore = useMemo(() => rows.filter(r => r.quantity > 0), [rows]);
  const availableFor = (productId: string) =>
    rows.find(r => String(r.product) === String(productId))?.quantity ?? 0;
const issueRows = useMemo(() => rows.filter(r => Number(r.issue_units) > 0), [rows]);

const visibleIssueRows = useMemo(() => issueRows.filter(r => matchesAll(issueSearch, [
  r.product_name, r.item_number, r.cost_price, money(r.cost_price),
  r.damaged_quantity, r.expired_quantity, r.returned_quantity,
  r.issue_units, r.issue_value, money(r.issue_value),
])), [issueRows, issueSearch]);

// totals follow the search, so the tiles, table footer and report all agree
const issueTotals = useMemo(() => visibleIssueRows.reduce((t, r) => ({
  damaged: t.damaged + Number(r.damaged_quantity || 0),
  expired: t.expired + Number(r.expired_quantity || 0),
  returned: t.returned + Number(r.returned_quantity || 0),
  value: t.value + Number(r.issue_value || 0),
}), { damaged: 0, expired: 0, returned: 0, value: 0 }), [visibleIssueRows]);
const visibleRows = useMemo(() => rows.filter(r => matchesAll(search, [
  r.product_name, r.item_number, r.category_name,
  r.manufacturer, r.supplier_name,
  r.quantity, r.cost_price, money(r.cost_price), r.total_value, money(r.total_value),
  r.reorder_level,
  r.quantity <= 0 ? "out of stock" : r.is_low_stock ? "low" : "ok",
  r.damaged_quantity, r.expired_quantity, r.returned_quantity,
])), [rows, search]);

const visibleHistory = useMemo(() => history.filter(m => matchesAll(histSearch, [
  fmtDateTime(m.created_at), m.product_name, m.item_number,
  m.movement_type_display, m.movement_type,
  m.quantity_change, m.balance_after,
  m.unit_cost, m.unit_cost != null ? money(m.unit_cost) : "",
  m.loss_value, m.unit_cost != null ? money(m.loss_value) : "",
  m.note, m.confirmed_by_name, m.authorised_by_name, m.created_by_name,
])), [history, histSearch]);
  function closePanel() { setMode(null); }
function openIssue() {
  setIssue({ type: "damaged", quantity: "", price: "" });
  setReceive({ product: "", quantity: "" });
  setProductQuery(""); setProductResults([]); setSelectedProduct(null);
  setConfirmedBy(""); setNote(""); setFormError(""); setMode("issue");
}

async function submitIssue() {
  setFormError("");
  if (!receive.product) return setFormError("Select a product.");
  if (!confirmedBy) return setFormError("Select who confirmed this.");
  setSaving(true);
  try {
    if (issue.type === "price") {
      const price = Number(issue.price);
      if (issue.price === "" || isNaN(price) || price < 0) { setSaving(false); return setFormError("Enter a valid new price."); }
      await API.post("store/adjust_price/", { product: receive.product, cost_price: price, confirmed_by: confirmedBy, note });
      done("Price updated.");
    } else {
      const qty = Number(issue.quantity);
      if (!qty || qty <= 0 || !Number.isInteger(qty)) { setSaving(false); return setFormError("Enter a whole quantity greater than zero."); }
      if (issue.type !== "returned" && qty > availableFor(receive.product)) {
        setSaving(false); return setFormError(`Only ${availableFor(receive.product)} good unit(s) in the store.`);
      }
      await API.post("store/record_issue/", { product: receive.product, issue_type: issue.type, quantity: qty, confirmed_by: confirmedBy, note });
      done(`Recorded ${qty} as ${issue.type}.`);
    }
  } catch (err: any) { setFormError(errMsg(err, "Could not save this.")); }
  finally { setSaving(false); }
}
  function openReceive(kind: "stock" | "return" = "stock") {
    setReceiveKind(kind);
    setConfirmedBy("");
    setReceive({ product: "", quantity: "" });
    setProductQuery(""); setProductResults([]); setSelectedProduct(null);
    setNote(""); setFormError(""); setMode("receive");
  }
  function openMove(productId?: string) {
    setLines([{ product: productId ? String(productId) : "", quantity: "" }]);
    setNote(""); setFormError(""); setConfirmedBy(""); setAuthorisedBy(""); setMode("move");
  }
  function openWriteOff(row: any) {
    setWriteOff({ row, quantity: "", reason: "damaged" });
    setConfirmedBy(""); setNote(""); setFormError(""); setMode("writeoff");
  }
  function openStatus(row: any) {
    const from = (Object.keys(BUCKETS) as (keyof typeof BUCKETS)[]).find(b => Number(row[BUCKETS[b]]) > 0) || "damaged";
    setStatusForm({ row, from, to: "good", quantity: "" });
    setConfirmedBy(""); setNote(""); setFormError(""); setMode("status");
  }

  function done(message: string) {
    setMode(null); setFlash(message); load();
    if (tab === "history") loadHistory();
    setTimeout(() => setFlash(""), 4000);
  }

  async function submitReceive() {
    setFormError("");
    const qty = Number(receive.quantity);
    if (!receive.product) return setFormError("Select a product.");
    if (!qty || qty <= 0 || !Number.isInteger(qty)) return setFormError("Enter a whole quantity greater than zero.");
    if (!confirmedBy) return setFormError("Select who confirmed this stock.");
    setSaving(true);
    try {
      await API.post(receiveKind === "return" ? "store/receive_return/" : "store/receive/",
        { product: receive.product, quantity: qty, note, confirmed_by: confirmedBy });
      done(receiveKind === "return"
        ? "Return recorded. Inspect it in the Issues tab."
        : "Stock received into the store.");
    } catch (err: any) { setFormError(errMsg(err, "Could not receive this stock.")); }
    finally { setSaving(false); }
  }

  async function submitMove() {
    setFormError("");
    const filled = lines.filter(l => l.product || l.quantity);
    if (filled.length === 0) return setFormError("Add at least one product.");
    if (!authorisedBy) return setFormError("Select who authorised this move.");
    const seen = new Set<string>();
    for (const l of filled) {
      const qty = Number(l.quantity);
      if (!l.product) return setFormError("Select a product on every line.");
      if (seen.has(l.product)) return setFormError("A product appears twice. Combine it into one line.");
      seen.add(l.product);
      if (!qty || qty <= 0 || !Number.isInteger(qty)) return setFormError("Enter a whole quantity greater than zero on every line.");
      if (qty > availableFor(l.product)) {
        const name = products.find(p => String(p.id) === l.product)?.name || "this product";
        return setFormError(`Only ${availableFor(l.product)} of ${name} in the store.`);
      }
    }
    setSaving(true);
    try {
      const res = await API.post("store/move_to_head_office/", {
        items: filled.map(l => ({ product: l.product, quantity: Number(l.quantity) })),
        note,
        authorised_by: authorisedBy,
      });
      done(`Moved ${res.data.lines} product${res.data.lines !== 1 ? "s" : ""} to ${res.data.moved_to}.`);
    } catch (err: any) { setFormError(errMsg(err, "Could not move this stock.")); }
    finally { setSaving(false); }
  }

  async function postStatus(rowId: number, from: string, to: string, qty: number, msg: string) {
    if (!confirmedBy) return setFormError("Select who confirmed this change.");
    setSaving(true);
    try {
      await API.post(`store/${rowId}/change_status/`,
        { from_status: from, to_status: to, quantity: qty, confirmed_by: confirmedBy, note });
      done(msg);
    } catch (err: any) { setFormError(errMsg(err, "Could not change the status.")); }
    finally { setSaving(false); }
  }

  async function submitWriteOff() {
    setFormError("");
    const qty = Number(writeOff.quantity);
    if (!qty || qty <= 0 || !Number.isInteger(qty)) return setFormError("Enter a whole quantity greater than zero.");
    if (qty > writeOff.row.quantity) return setFormError(`Only ${writeOff.row.quantity} good units in the store.`);
    await postStatus(writeOff.row.id, "good", writeOff.reason, qty, `Marked as ${writeOff.reason}.`);
  }

  async function submitStatus() {
    setFormError("");
    const qty = Number(statusForm.quantity);
    const avail = Number(statusForm.row[BUCKETS[statusForm.from as keyof typeof BUCKETS]] || 0);
    if (!qty || qty <= 0 || !Number.isInteger(qty)) return setFormError("Enter a whole quantity greater than zero.");
    if (qty > avail) return setFormError(`Only ${avail} ${statusForm.from} unit(s) available.`);
    await postStatus(statusForm.row.id, statusForm.from, statusForm.to, qty,
      statusForm.to === "good" ? "Restocked as good stock." : "Disposed.");
  }
const withSearch = (base: string, q: string) =>
  [base, q.trim() && `Search: "${q.trim()}"`].filter(Boolean).join(" · ");
  // ── reports (print + PDF) ──
  function buildReport() {
    const stamp = new Date().toISOString().slice(0, 10);

if (tab === "stock") {
  const html = buildListHtml({
    title: "Store Stock",
    subtitle: withSearch(lowOnly ? "Low stock only" : "Central store", search),
    summary: stats ? [
      { label: "Products", value: num(stats.products) },
      { label: "Units in store", value: num(stats.units_in_store) },
      { label: "Stock value (cost)", value: money(stats.stock_value) },
      { label: "Low stock", value: num(stats.low_stock) },
      { label: "Out of stock", value: num(stats.out_of_stock) },
    ] : [],
    columns: [
      { label: "Product" },
      { label: "Supplier" },
      { label: "Manufacturer" },
      { label: "In store", align: "r" },
      { label: "Cost price", align: "r" },
      { label: "Total", align: "r" },
      { label: "Reorder level", align: "r" },
      { label: "Status" },
    ],
    rows: visibleRows.map(r => [
      r.product_name,
      r.supplier_name || "—",
      r.manufacturer || "—",
      num(r.quantity),
      money(r.cost_price),
      money(r.total_value),
      num(r.reorder_level),
      r.quantity <= 0 ? "Out of stock" : r.is_low_stock ? "Low" : "OK",
    ]),
  });
  return { html, filename: `store_stock_${stamp}`, landscape: true };
}

    if (tab === "issues") {
      const searching = search.trim() !== "";
const html = buildListHtml({
  title: "Store Stock",
  subtitle: withSearch(lowOnly ? "Low stock only" : "Central store", search),
  summary: searching ? [
    { label: "Products", value: num(visibleRows.length) },
    { label: "Units in store", value: num(visibleRows.reduce((s, r) => s + Number(r.quantity || 0), 0)) },
    { label: "Stock value (cost)", value: money(visibleRows.reduce((s, r) => s + Number(r.total_value || 0), 0)) },
    { label: "Low stock", value: num(visibleRows.filter(r => r.quantity > 0 && r.is_low_stock).length) },
    { label: "Out of stock", value: num(visibleRows.filter(r => r.quantity <= 0).length) },
  ] : stats ? [
    { label: "Products", value: num(stats.products) },
    { label: "Units in store", value: num(stats.units_in_store) },
    { label: "Stock value (cost)", value: money(stats.stock_value) },
    { label: "Low stock", value: num(stats.low_stock) },
    { label: "Out of stock", value: num(stats.out_of_stock) },
  ] : [],
        columns: [
          { label: "Product" }, { label: "Item #" },
          { label: "Cost price", align: "r" },
          { label: "Damaged", align: "r" }, { label: "Expired", align: "r" },
          { label: "Returned", align: "r" }, { label: "Total units", align: "r" },
          { label: "Value (cost)", align: "r" },
        ],
        rows: issueRows.map(r => [
          r.product_name, r.item_number || "", money(r.cost_price),
          num(r.damaged_quantity), num(r.expired_quantity), num(r.returned_quantity),
          num(r.issue_units), money(r.issue_value),
        ]),
      });
      return { html, filename: `store_issues_${stamp}`, landscape: true };
    }

    const html = buildListHtml({
      title: "Store History",
      subtitle: histType ? TYPE_LABELS[histType] : "All movements",
      landscape: true,
      columns: [
        { label: "Date" }, { label: "Product" }, { label: "Type" },
        { label: "Qty change", align: "r" }, { label: "Balance after", align: "r" },
        { label: "Unit cost", align: "r" }, { label: "Value", align: "r" },
        { label: "Note" }, { label: "Confirmed by" }, { label: "Authorised by" }, { label: "By" },
      ],
      rows: visibleHistory.map(m => [
        fmtDateTime(m.created_at), m.product_name, m.movement_type_display,
        m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change,
        num(m.balance_after),
        m.unit_cost != null ? money(m.unit_cost) : "—",
        m.unit_cost != null ? money(m.loss_value) : "—",
        m.note || "—",
        m.confirmed_by_name || "—", m.authorised_by_name || "—", m.created_by_name || "—",
      ]),
    });
    return { html, filename: `store_history_${stamp}`, landscape: true };
  }

const reportEmpty =
  tab === "stock" ? visibleRows.length === 0 :
  tab === "issues" ? visibleIssueRows.length === 0 :
  visibleHistory.length === 0;
  function printReport() {
    printHtml(buildReport().html);
  }

  async function downloadReport() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { html, filename, landscape } = buildReport();
      await downloadHtmlPdf(html, filename, landscape);
    } catch (err) {
      console.error("Download failed:", err);
      setError("Could not create the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
const pageRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);
  const tiles = stats ? [
    { label: "Products in store", value: num(stats.products), icon: "ti-packages", color: "text-primary", bg: "bg-primary-gradient-100" },
    { label: "Units in store", value: num(stats.units_in_store), icon: "ti-box", color: "text-success", bg: "bg-success-gradient-100" },
    { label: "Stock value (cost)", value: money(stats.stock_value), icon: "ti-coin", color: "text-info", bg: "bg-info-gradient-100" },
    { label: "Low stock", value: num(stats.low_stock), icon: "ti-alert-triangle", color: "text-warning", bg: "bg-warning-gradient-100" },
    { label: "Out of stock", value: num(stats.out_of_stock), icon: "ti-box-off", color: "text-danger", bg: "bg-danger-gradient-100" },
  ] : [];

  const panelTitle =
    mode === "issue" ? "Report Issue / Price Adjustment" :
    mode === "receive" ? (receiveKind === "return" ? "Receive Return" : "Receive Stock") :
    mode === "move" ? "Move to Head Office" :
    mode === "status" ? "Manage Status" :
    "Mark Damaged / Expired";

  const submitLabel =
     mode === "issue" ? "Save" :
    mode === "receive" ? (receiveKind === "return" ? "Receive Return" : "Receive Stock") :
    mode === "move" ? "Move Stock" :
    mode === "status" ? "Apply" :
    "Mark";
  
  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Store</h4>
            <p className="text-muted fs-13 mb-0">Receive stock into the store, then move it to the Head Office branch.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm"
              onClick={() => { load(); if (tab === "history") loadHistory(); }} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={printReport} disabled={reportEmpty}>
              <i className="ti ti-printer me-1" />Print
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={downloadReport} disabled={downloading || reportEmpty}>
              {downloading
                ? <span className="spinner-border spinner-border-sm me-1" />
                : <i className="ti ti-file-type-pdf me-1" />}PDF
            </button>
            <button className="btn btn-outline-primary btn-sm" onClick={() => openReceive()}>
              <i className="ti ti-download me-1" />Receive Stock
            </button>
            <button className="btn btn-outline-warning btn-sm" onClick={() => openReceive("return")}>
              <i className="ti ti-arrow-back-up me-1" />Receive Return
            </button>
            <button className="btn btn-outline-danger btn-sm" onClick={openIssue}>
  <i className="ti ti-alert-octagon me-1" />Report Issue
</button>
            <button className="btn btn-primary btn-sm" onClick={() => openMove()} disabled={inStore.length === 0}>
              <i className="ti ti-truck-delivery me-1" />Move to Head Office
            </button>
          </div>
        </div>

        {flash && <div className="alert alert-success fs-13 py-2">{flash}</div>}
        {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

        {/* Tiles */}
        {stats && (
          <div className="row g-3 mb-3">
            {tiles.map(t => (
              <div key={t.label} className="col-6 col-md-4 col-xl">
                <div className="card mb-0 shadow-none border h-100">
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
        )}

        {/* Tabs */}
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button className={`nav-link ${tab === "stock" ? "active" : ""}`} onClick={() => setTab("stock")}>Stock</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === "issues" ? "active" : ""}`} onClick={() => setTab("issues")}>
              Issues{issueRows.length > 0 && <span className="badge bg-danger ms-1 fs-10">{issueRows.length}</span>}
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>History</button>
          </li>
        </ul>

        {/* ================= STOCK TAB ================= */}
        {tab === "stock" && (
          <div className="card shadow-none border">
            <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
                <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
                <input className="form-control border-start-0 ps-1 fs-13" placeholder="Search product or item no…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
              </div>
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" id="lowOnly" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />
                <label className="form-check-label fs-13" htmlFor="lowOnly">Low stock only</label>
              </div>
            </div>

            <div className="card-body p-0">
              {loading && rows.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />Loading store…
                </div>
              ) :visibleRows.length === 0 ? (
  <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
    <i className="ti ti-building-warehouse fs-1 mb-2" />
    <p className="fs-14 mb-2">{search || lowOnly ? "No products match your filters." : "The store is empty."}</p>
    {!search && !lowOnly && (
      <button className="btn btn-sm btn-primary" onClick={() => openReceive()}>Receive your first stock</button>
    )}
  </div>
) : (
                <div className="table-responsive" style={{ opacity: loading ? 0.5 : 1 }}>
                  <table className="table table-hover mb-0 fs-13">
                    <thead className="table-light">
                      <tr>
                        <th>Product</th><th>Item No.</th><th>Category</th><th>Product</th><th>Manufacturer</th>
                        <th className="text-end">In store</th><th className="text-end">Cost price</th>
                        <th className="text-end">Total</th><th className="text-end">Reorder level</th>
                        <th>Status</th><th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map(r => {
                        const out = r.quantity <= 0;
                        const low = !out && r.is_low_stock;
                        return (
                          <tr key={r.id}>
                            <td className="fw-semibold text-dark text-nowrap">{r.product_name}</td>
                            <td className="text-nowrap">{r.item_number}</td>
                            <td className="text-nowrap">{r.category_name || <span className="text-muted">—</span>}</td>
                            <td className="text-nowrap">{r.supplier_name || <span className="text-muted">—</span>}</td>
<td className="text-nowrap">{r.manufacturer || <span className="text-muted">—</span>}</td>
                            <td className="text-end fw-semibold">{num(r.quantity)}</td>
                            <td className="text-end">{money(r.cost_price)}</td>
                            <td className="text-end fw-semibold">{money(r.total_value)}</td>
                            <td className="text-end text-muted">{num(r.reorder_level)}</td>
                            <td>
                              <span className={out ? "badge bg-danger-transparent text-danger"
                                : low ? "badge bg-warning-transparent text-warning"
                                : "badge bg-success-transparent text-success"}>
                                {out ? "Out of stock" : low ? "Low" : "OK"}
                              </span>
                            </td>
                            <td className="text-end text-nowrap">
                              <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openMove(String(r.product))} disabled={out}>
                                <i className="ti ti-truck-delivery me-1" />Move
                              </button>
                              <button className="btn btn-sm btn-icon btn-outline-danger" onClick={() => openWriteOff(r)} disabled={out}
                                title="Mark damaged / expired">
                                <i className="ti ti-trash-x" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {visibleRows.length > 0 && (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between fs-12 text-muted">
              <span>Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleRows.length)}</strong> of <strong>{visibleRows.length}</strong></span>
                {totalPages > 1 && (
                  <ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage(p => p - 1)}><i className="ti ti-chevron-left" /></button>
                    </li>
                    <li className="page-item disabled"><span className="page-link">{page} / {totalPages}</span></li>
                    <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                      <button className="page-link" onClick={() => setPage(p => p + 1)}><i className="ti ti-chevron-right" /></button>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= ISSUES TAB ================= */}
        {tab === "issues" && (
          <>
            <div className="row g-3 mb-3">
              {[
                { l: "Damaged units", v: num(issueTotals.damaged), c: "text-danger" },
                { l: "Expired units", v: num(issueTotals.expired), c: "text-danger" },
                { l: "Returned (to inspect)", v: num(issueTotals.returned), c: "text-info" },
                { l: "Value at cost", v: money(issueTotals.value), c: "text-warning" },
              ].map(t => (
                <div key={t.l} className="col-6 col-md-3">
                  <div className="card mb-0 shadow-none border">
                    <div className="card-body p-3">
                      <p className="fw-medium mb-1 fs-13">{t.l}</p>
                      <h5 className={`mb-0 ${t.c}`}>{t.v}</h5>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card shadow-none border">
              <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                <h6 className="mb-0 fw-semibold fs-14">Damaged, expired and returned goods</h6>
                <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
  <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
  <input className="form-control border-start-0 ps-1 fs-13" placeholder="Search any column…"
    value={issueSearch} onChange={e => setIssueSearch(e.target.value)} />
  {issueSearch && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setIssueSearch("")}><i className="ti ti-x" /></button>}
</div>
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-success btn-sm" onClick={printReport} disabled={reportEmpty}>
                    <i className="ti ti-printer me-1" />Print
                  </button>
                  <button className="btn btn-outline-success btn-sm" onClick={downloadReport} disabled={downloading || reportEmpty}>
                    {downloading
                      ? <span className="spinner-border spinner-border-sm me-1" />
                      : <i className="ti ti-file-type-pdf me-1" />}
                    Download PDF
                  </button>
                </div>
              </div>
              <div className="card-body p-0">
                {visibleIssueRows.length === 0 ? (
                  <div className="text-center text-muted py-5 fs-14">
                    <i className="ti ti-circle-check fs-1 d-block mb-2" />
                    No damaged, expired or returned goods in the store.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 fs-13">
                      <thead className="table-light">
                        <tr>
                          <th>Product</th><th>Item #</th>
                          <th className="text-end">Cost price</th>
                          <th className="text-end">Damaged</th><th className="text-end">Expired</th>
                          <th className="text-end">Returned</th><th className="text-end">Total units</th>
                          <th className="text-end">Value (cost)</th><th className="text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleIssueRows.map(r => (
                          <tr key={r.id}>
                            <td className="fw-semibold text-dark text-nowrap">{r.product_name}</td>
                            <td>{r.item_number}</td>
                            <td className="text-end">{money(r.cost_price)}</td>
                            <td className="text-end text-danger">{num(r.damaged_quantity)}</td>
                            <td className="text-end text-danger">{num(r.expired_quantity)}</td>
                            <td className="text-end text-info">{num(r.returned_quantity)}</td>
                            <td className="text-end fw-semibold">{num(r.issue_units)}</td>
                            <td className="text-end fw-semibold">{money(r.issue_value)}</td>
                            <td className="text-end">
                              <button className="btn btn-sm btn-outline-primary" onClick={() => openStatus(r)}>
                                <i className="ti ti-adjustments me-1" />Manage
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="table-light fw-semibold">
                          <td colSpan={3}>Total</td>
                          <td className="text-end">{num(issueTotals.damaged)}</td>
                          <td className="text-end">{num(issueTotals.expired)}</td>
                          <td className="text-end">{num(issueTotals.returned)}</td>
                          <td className="text-end">{num(issueTotals.damaged + issueTotals.expired + issueTotals.returned)}</td>
                          <td className="text-end">{money(issueTotals.value)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ================= HISTORY TAB ================= */}
        {tab === "history" && (
          <div className="card shadow-none border">
            <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
                <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
                <input className="form-control border-start-0 ps-1 fs-13" placeholder="Search product, note…"
                  value={histSearch} onChange={e => setHistSearch(e.target.value)} />
              </div>
              <select className="form-select form-select-sm fs-13" style={{ width: 200 }} value={histType} onChange={e => setHistType(e.target.value)}>
                <option value="">All movement types</option>
                {Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="card-body p-0">
              {histLoading && visibleHistory.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                  <i className="ti ti-history fs-1 mb-2" />
                  <p className="fs-14 mb-0">{history.length === 0 ? "No store movements yet." : "No movements match your search."}</p>
                </div>
              ) : (
                <div className="table-responsive" style={{ opacity: histLoading ? 0.5 : 1 }}>
                  <table className="table table-hover mb-0 fs-13">
                    <thead className="table-light">
                      <tr>
                        <th>Date</th><th>Product</th><th>Type</th>
                        <th className="text-end">Qty change</th><th className="text-end">Balance after</th>
                        <th className="text-end">Unit cost</th><th className="text-end">Value</th>
                        <th>Note</th>
                        <th>Confirmed by</th><th>Authorised by</th><th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.map(m => (
                        <tr key={m.id}>
                          <td className="text-muted text-nowrap">{fmtDateTime(m.created_at)}</td>
                          <td className="fw-semibold text-dark text-nowrap">{m.product_name}</td>
                          <td><span className={TYPE_CLS[m.movement_type] || "badge bg-secondary-transparent text-secondary"}>{m.movement_type_display}</span></td>
                          <td className={`text-end fw-semibold ${m.quantity_change > 0 ? "text-success" : "text-danger"}`}>
                            {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                          </td>
                          <td className="text-end">{num(m.balance_after)}</td>
                          <td className="text-end">{m.unit_cost != null ? money(m.unit_cost) : "—"}</td>
                          <td className="text-end">{m.unit_cost != null ? money(m.loss_value) : "—"}</td>
                          <td className="text-truncate" style={{ maxWidth: 240 }}>{m.note || <span className="text-muted">—</span>}</td>
                          <td className="text-muted text-nowrap">{m.confirmed_by_name || "—"}</td>
                          <td className="text-muted text-nowrap">{m.authorised_by_name || "—"}</td>
                          <td className="text-muted text-nowrap">{m.created_by_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================= Offcanvas ================= */}
      {mode && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closePanel} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 440 }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">{panelTitle}</h5>
              <button type="button" className="btn-close" onClick={closePanel} />
            </div>

            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              {/* ---- Receive (stock or return) ---- */}
              {/* ---- Return notice (receive-return only) ---- */}
{mode === "receive" && receiveKind === "return" && (
  <div className="alert alert-info fs-12 py-2">
    Returned goods are held for inspection. They are not sellable until you restock them from the Issues tab.
  </div>
)}

{/* ---- Shared product picker (Receive + Report Issue) ---- */}
{(mode === "receive" || mode === "issue") && (
  <div className="mb-3">
    <label className="form-label fs-13 fw-medium">Product</label>
    {selectedProduct ? (
      <div className="border rounded p-2 d-flex align-items-center justify-content-between gap-2">
        <div>
          <div className="fw-semibold fs-13">{selectedProduct.name}</div>
          <div className="text-muted fs-12">{selectedProduct.item_number || "No item number"}</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearProduct}>
          <i className="ti ti-replace me-1" />Change
        </button>
      </div>
    ) : (
      <div className="position-relative">
        <div className="input-group">
          <span className="input-group-text bg-transparent"><i className="ti ti-search text-muted" /></span>
          <input className="form-control" autoComplete="off" autoFocus
            placeholder="Search by product name or item number…"
            value={productQuery} onChange={e => setProductQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && productResults[0]) { e.preventDefault(); pickProduct(productResults[0]); } }} />
          {searchingProducts && <span className="input-group-text bg-transparent"><span className="spinner-border spinner-border-sm" /></span>}
        </div>
        {productQuery.trim() && !searchingProducts && productResults.length === 0 && (
          <div className="text-muted fs-12 mt-1">No products match "{productQuery.trim()}".</div>
        )}
        {productResults.length > 0 && (
          <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 20, maxHeight: 280, overflowY: "auto" }}>
            {productResults.map((p: any) => (
              <button key={p.id} type="button"
                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center fs-13"
                onClick={() => pickProduct(p)}>
              
                 <span>
  <span className="fw-medium">{p.name}</span>
  {p.item_number && <span className="text-muted ms-2">{p.item_number}</span>}
  {p.manufacturer && <span className="text-muted ms-2">· {p.manufacturer}</span>}
</span>
                <span className="text-muted fs-12">{num(availableFor(String(p.id)))} in store</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
)}

{/* ---- Receive: quantity only (product picker is above) ---- */}
{mode === "receive" && (
  <div className="mb-3">
    <label className="form-label fs-13 fw-medium">Quantity</label>
    <input type="number" min={1} className="form-control" placeholder="e.g. 100"
      value={receive.quantity} onChange={e => setReceive(r => ({ ...r, quantity: e.target.value }))} />
    {receive.product && (
      <div className="form-text fs-12">Currently in store: <strong>{availableFor(receive.product)}</strong></div>
    )}
  </div>
)}

              {/* ---- Move ---- */}
              {mode === "move" && (
                <>
                  <p className="text-muted fs-13">Stock is deducted from the store and added to Head Office. If any line fails, nothing is moved.</p>
                  {lines.map((l, i) => {
                    const avail = l.product ? availableFor(l.product) : 0;
                    return (
                      <div key={i} className="border rounded p-2 mb-2">
                        <div className="d-flex gap-2 mb-2">
                          <select className="form-select form-select-sm" value={l.product}
                            onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, product: e.target.value } : x))}>
                            <option value="">Select product…</option>
                            {inStore.map((r: any) => (
                              <option key={r.product} value={r.product}>{r.product_name} — {r.quantity} in store</option>
                            ))}
                          </select>
                          {lines.length > 1 && (
                            <button className="btn btn-sm btn-icon btn-outline-danger" title="Remove line"
                              onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
                              <i className="ti ti-x" />
                            </button>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <input type="number" min={1} max={avail || undefined} className="form-control form-control-sm"
                            style={{ width: 120 }} placeholder="Quantity" value={l.quantity}
                            onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                          {l.product && (
                            <>
                              <span className="text-muted fs-12">of {avail}</span>
                              <button className="btn btn-sm btn-link p-0 fs-12"
                                onClick={() => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity: String(avail) } : x))}>
                                Move all
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn btn-sm btn-outline-secondary mb-3"
                    onClick={() => setLines(ls => [...ls, { product: "", quantity: "" }])}>
                    <i className="ti ti-plus me-1" />Add another product
                  </button>
                </>
              )}
            {mode === "issue" && (
  <>
    <div className="mb-3">
      <label className="form-label fs-13 fw-medium">Type</label>
      <select className="form-select" value={issue.type}
        onChange={e => setIssue(i => ({ ...i, type: e.target.value }))}>
        <option value="damaged">Damaged</option>
        <option value="expired">Expired</option>
        <option value="returned">Returned (hold for inspection)</option>
        <option value="price">Price adjustment</option>
      </select>
    </div>

    {issue.type === "price" ? (
      <div className="mb-3">
        <label className="form-label fs-13 fw-medium">New cost price</label>
        <input type="number" min={0} step="0.01" className="form-control" value={issue.price}
          onChange={e => setIssue(i => ({ ...i, price: e.target.value }))} />
        {selectedProduct && (
          <div className="form-text fs-12">Current: <strong>{money(selectedProduct.cost_price)}</strong></div>
        )}
      </div>
    ) : (
      <div className="mb-3">
        <label className="form-label fs-13 fw-medium">Quantity</label>
        <input type="number" min={1} className="form-control" value={issue.quantity}
          onChange={e => setIssue(i => ({ ...i, quantity: e.target.value }))} />
        {receive.product && (
          <div className="form-text fs-12">Good stock in store: <strong>{availableFor(receive.product)}</strong></div>
        )}
      </div>
    )}
  </>
)}
              {/* ---- Mark damaged / expired ---- */}
              {mode === "writeoff" && writeOff.row && (
                <>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Product</label>
                    <input className="form-control" value={`${writeOff.row.product_name} — ${writeOff.row.quantity} good in store`} disabled />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Mark as</label>
                    <select className="form-select" value={writeOff.reason}
                      onChange={e => setWriteOff((w: any) => ({ ...w, reason: e.target.value }))}>
                      <option value="damaged">Damaged</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Quantity</label>
                    <input type="number" min={1} max={writeOff.row.quantity} className="form-control" placeholder="e.g. 2"
                      value={writeOff.quantity} onChange={e => setWriteOff((w: any) => ({ ...w, quantity: e.target.value }))} />
                  </div>
                </>
              )}

              {/* ---- Manage status (from Issues tab) ---- */}
              {mode === "status" && statusForm.row && (
                <>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Product</label>
                    <input className="form-control" disabled value={statusForm.row.product_name} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Units currently</label>
                    <select className="form-select" value={statusForm.from}
                      onChange={e => setStatusForm((s: any) => ({ ...s, from: e.target.value }))}>
                      {Object.entries(BUCKETS).filter(([, f]) => Number(statusForm.row[f]) > 0).map(([k, f]) => (
                        <option key={k} value={k}>{BUCKET_LABEL[k]} ({statusForm.row[f]})</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Action</label>
                    <select className="form-select" value={statusForm.to}
                      onChange={e => setStatusForm((s: any) => ({ ...s, to: e.target.value }))}>
                      <option value="good">Restock as good stock</option>
                      <option value="disposed">Dispose (remove from store)</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Quantity</label>
                    <input type="number" min={1} className="form-control" value={statusForm.quantity}
                      onChange={e => setStatusForm((s: any) => ({ ...s, quantity: e.target.value }))} />
                  </div>
                </>
              )}

              {/* ---- Confirmed by / Authorised by ---- */}
              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">
                  {mode === "move" ? "Authorised by" : "Confirmed by"}
                </label>
                <select className="form-select"
                  value={mode === "move" ? authorisedBy : confirmedBy}
                  onChange={e => mode === "move"
                    ? setAuthorisedBy(e.target.value)
                    : setConfirmedBy(e.target.value)}>
                  <option value="">Select user…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Note <span className="text-muted fw-normal">(optional)</span></label>
                <textarea className="form-control" rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder={mode === "receive"
                    ? (receiveKind === "return" ? "e.g. Returned by customer, reason…" : "e.g. Delivery from supplier")
                    : "Additional details…"} />
              </div>
            </div>

            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={closePanel} disabled={saving}>Cancel</button>
              <button className={`btn btn-sm ${mode === "writeoff" ? "btn-danger" : "btn-primary"}`} disabled={saving}
                onClick={
                   mode === "issue" ? submitIssue :
                  mode === "receive" ? submitReceive :
                  mode === "move" ? submitMove :
                  mode === "status" ? submitStatus :
                  submitWriteOff
                }>
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {submitLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
