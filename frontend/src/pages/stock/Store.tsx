import { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../services/api";

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

const TYPE_LABELS: Record<string, string> = {
  received: "Received into Store",
  to_head_office: "Moved to Head Office",
  adjustment: "Adjustment",
  damaged: "Damaged",
  expired: "Expired",
};
const TYPE_CLS: Record<string, string> = {
  received: "badge bg-success-transparent text-success",
  to_head_office: "badge bg-primary-transparent text-primary",
  adjustment: "badge bg-warning-transparent text-warning",
  damaged: "badge bg-danger-transparent text-danger",
  expired: "badge bg-danger-transparent text-danger",
};

type Line = { product: string; quantity: string };
type Mode = null | "receive" | "move" | "writeoff";

export default function Store() {
  const [tab, setTab] = useState<"stock" | "history">("stock");

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
  const [lines, setLines] = useState<Line[]>([{ product: "", quantity: "" }]);
  const [writeOff, setWriteOff] = useState<any>({ row: null, quantity: "", reason: "damaged" });
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params: any = { page_size: 1000 };
      if (search.trim()) params.search = search.trim();
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
  }, [search, lowOnly]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const params: any = { page_size: 500 };
      if (histType) params.movement_type = histType;
      if (histSearch.trim()) params.search = histSearch.trim();
      const res = await API.get("store-movements/", { params });
      setHistory(listOf(res));
    } catch (err: any) {
      setError(errMsg(err, "Could not load store history."));
    } finally { setHistLoading(false); }
  }, [histType, histSearch]);

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

  // Products that have stock in the store (for the Move form)
  const inStore = useMemo(() => rows.filter(r => r.quantity > 0), [rows]);
  const availableFor = (productId: string) =>
    rows.find(r => String(r.product) === String(productId))?.quantity ?? 0;

  function closePanel() { setMode(null); }

  function openReceive() {
    setReceive({ product: "", quantity: "" }); setNote(""); setFormError(""); setMode("receive");
  }
  function openMove(productId?: string) {
    setLines([{ product: productId ? String(productId) : "", quantity: "" }]);
    setNote(""); setFormError(""); setMode("move");
  }
  function openWriteOff(row: any) {
    setWriteOff({ row, quantity: "", reason: "damaged" }); setNote(""); setFormError(""); setMode("writeoff");
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
    setSaving(true);
    try {
      await API.post("store/receive/", { product: receive.product, quantity: qty, note });
      done("Stock received into the store.");
    } catch (err: any) { setFormError(errMsg(err, "Could not receive this stock.")); }
    finally { setSaving(false); }
  }

  async function submitMove() {
    setFormError("");
    const filled = lines.filter(l => l.product || l.quantity);
    if (filled.length === 0) return setFormError("Add at least one product.");
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
      });
      done(`Moved ${res.data.lines} product${res.data.lines !== 1 ? "s" : ""} to ${res.data.moved_to}.`);
    } catch (err: any) { setFormError(errMsg(err, "Could not move this stock.")); }
    finally { setSaving(false); }
  }

  async function submitWriteOff() {
    setFormError("");
    const qty = Number(writeOff.quantity);
    if (!qty || qty <= 0 || !Number.isInteger(qty)) return setFormError("Enter a whole quantity greater than zero.");
    if (qty > writeOff.row.quantity) return setFormError(`Only ${writeOff.row.quantity} in the store.`);
    setSaving(true);
    try {
      await API.post(`store/${writeOff.row.id}/write_off/`, { quantity: qty, reason: writeOff.reason, note });
      done("Stock written off.");
    } catch (err: any) { setFormError(errMsg(err, "Could not write off this stock.")); }
    finally { setSaving(false); }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const tiles = stats ? [
    { label: "Products in store", value: num(stats.products), icon: "ti-packages", color: "text-primary", bg: "bg-primary-gradient-100" },
    { label: "Units in store", value: num(stats.units_in_store), icon: "ti-box", color: "text-success", bg: "bg-success-gradient-100" },
    { label: "Stock value (cost)", value: money(stats.stock_value), icon: "ti-coin", color: "text-info", bg: "bg-info-gradient-100" },
    { label: "Low stock", value: num(stats.low_stock), icon: "ti-alert-triangle", color: "text-warning", bg: "bg-warning-gradient-100" },
    { label: "Out of stock", value: num(stats.out_of_stock), icon: "ti-box-off", color: "text-danger", bg: "bg-danger-gradient-100" },
  ] : [];

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Store</h4>
            <p className="text-muted fs-13 mb-0">Receive stock into the store, then move it to the Head Office branch.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { load(); if (tab === "history") loadHistory(); }} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-primary btn-sm" onClick={openReceive}>
              <i className="ti ti-download me-1" />Receive Stock
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
              <div key={t.label} className="col-6 col-md-4 col-xl" >
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
              ) : rows.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                  <i className="ti ti-building-warehouse fs-1 mb-2" />
                  <p className="fs-14 mb-2">{search || lowOnly ? "No products match your filters." : "The store is empty."}</p>
                  {!search && !lowOnly && (
                    <button className="btn btn-sm btn-primary" onClick={openReceive}>Receive your first stock</button>
                  )}
                </div>
              ) : (
                <div className="table-responsive" style={{ opacity: loading ? 0.5 : 1 }}>
                  <table className="table table-hover mb-0 fs-13">
                    <thead className="table-light">
                      <tr>
                        <th>Product</th><th>Item #</th><th>Category</th>
                        <th className="text-end">In store</th><th className="text-end">Reorder level</th>
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
                            <td className="text-end fw-semibold">{num(r.quantity)}</td>
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
                              <button className="btn btn-sm btn-icon btn-outline-danger" onClick={() => openWriteOff(r)} disabled={out} title="Write off damaged / expired">
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

            {rows.length > 0 && (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between fs-12 text-muted">
                <span>Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)}</strong> of <strong>{rows.length}</strong></span>
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
              {histLoading && history.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                  <i className="ti ti-history fs-1 mb-2" />
                  <p className="fs-14 mb-0">No store movements yet.</p>
                </div>
              ) : (
                <div className="table-responsive" style={{ opacity: histLoading ? 0.5 : 1 }}>
                  <table className="table table-hover mb-0 fs-13">
                    <thead className="table-light">
                      <tr>
                        <th>Date</th><th>Product</th><th>Type</th>
                        <th className="text-end">Qty change</th><th className="text-end">Balance after</th>
                        <th>Note</th><th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(m => (
                        <tr key={m.id}>
                          <td className="text-muted text-nowrap">{fmtDateTime(m.created_at)}</td>
                          <td className="fw-semibold text-dark text-nowrap">{m.product_name}</td>
                          <td><span className={TYPE_CLS[m.movement_type] || "badge bg-secondary-transparent text-secondary"}>{m.movement_type_display}</span></td>
                          <td className={`text-end fw-semibold ${m.quantity_change > 0 ? "text-success" : "text-danger"}`}>
                            {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                          </td>
                          <td className="text-end">{num(m.balance_after)}</td>
                          <td className="text-truncate" style={{ maxWidth: 240 }}>{m.note || <span className="text-muted">—</span>}</td>
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
              <h5 className="offcanvas-title fw-semibold">
                {mode === "receive" ? "Receive Stock" : mode === "move" ? "Move to Head Office" : "Write Off Stock"}
              </h5>
              <button type="button" className="btn-close" onClick={closePanel} />
            </div>

            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              {/* ---- Receive ---- */}
              {mode === "receive" && (
                <>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Product</label>
                    <select className="form-select" value={receive.product}
                      onChange={e => setReceive(r => ({ ...r, product: e.target.value }))}>
                      <option value="">Select product…</option>
                      {products.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}{p.item_number ? ` (${p.item_number})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Quantity</label>
                    <input type="number" min={1} className="form-control" placeholder="e.g. 100"
                      value={receive.quantity} onChange={e => setReceive(r => ({ ...r, quantity: e.target.value }))} />
                    {receive.product && (
                      <div className="form-text fs-12">Currently in store: <strong>{availableFor(receive.product)}</strong></div>
                    )}
                  </div>
                </>
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

              {/* ---- Write off ---- */}
              {mode === "writeoff" && writeOff.row && (
                <>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Product</label>
                    <input className="form-control" value={`${writeOff.row.product_name} — ${writeOff.row.quantity} in store`} disabled />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fs-13 fw-medium">Reason</label>
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

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Note <span className="text-muted fw-normal">(optional)</span></label>
                <textarea className="form-control" rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder={mode === "receive" ? "e.g. Delivery from supplier" : "Additional details…"} />
              </div>
            </div>

            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={closePanel} disabled={saving}>Cancel</button>
              <button className={`btn btn-sm ${mode === "writeoff" ? "btn-danger" : "btn-primary"}`} disabled={saving}
                onClick={mode === "receive" ? submitReceive : mode === "move" ? submitMove : submitWriteOff}>
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {mode === "receive" ? "Receive Stock" : mode === "move" ? "Move Stock" : "Write Off"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
