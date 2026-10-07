import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";

function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function money(n: number) {
  if (isNaN(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const MOVEMENT_CLS: Record<string, string> = {
  restock:    "badge bg-success-transparent text-success",
  sale:       "badge bg-danger-transparent text-danger",
  adjustment: "badge bg-warning-transparent text-warning",
  return:     "badge bg-info-transparent text-info",
  damaged:    "badge bg-danger-transparent text-danger",
  expired:    "badge bg-danger-transparent text-danger",
  transfer:   "badge bg-primary-transparent text-primary",
};

const MOVEMENT_LABELS: Record<string, string> = {
  restock: "Restock",
  sale: "Sale",
  adjustment: "Stock Adjustment",
  return: "Returned",
  damaged: "Damaged",
  expired: "Expired",
  transfer: "Move to Branch",
};

// Movement types selectable from the "Record Movement" offcanvas.
// "sale" is excluded — sales are recorded automatically by the checkout flow.
const RECORDABLE_TYPES = ["damaged", "expired", "return", "adjustment", "restock", "transfer"];
// Which fields each movement type shows in the offcanvas.
const TYPE_FIELDS: Record<string, {
  toBranch?: boolean; direction?: boolean; fee?: boolean; hint: string;
}> = {
  restock:    { hint: "Add new stock to a branch." },
  damaged:    { hint: "Removes damaged units from the branch's stock." },
  expired:    { hint: "Removes expired units from the branch's stock." },
  return:     { hint: "Adds returned units back to the branch's stock." },
  adjustment: { direction: true, hint: "Correct the stock count for a branch." },
  transfer:   { toBranch: true, fee: true, hint: "Move stock between branches at the same price. A per-unit movement fee is charged to Head Office." },
};
const COLUMNS = [
  { key: "product_name",     label: "Product" },
  { key: "movement_type",    label: "Type" },
  { key: "quantity_change",  label: "Qty Change" },
  { key: "branch_name",      label: "Branch" },
  { key: "destination_branch_name", label: "Moved To" },
  { key: "note",             label: "Note" },
  { key: "created_by",       label: "By (User ID)" },
  { key: "created_at",       label: "Date" },
  { key: "destination_branch_name", label: "Moved To" },
  { key: "total_fee",        label: "Movement Fee" },
] as const;

function exportCSV(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const lines = [
    headers.join(","),
    ...rows.map(r => COLUMNS.map(c => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `store_movements_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const data = [headers, ...rows.map(r => COLUMNS.map(c => String(r[c.key] ?? "")))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Store Movements");
  XLSX.writeFile(wb, `store_movements_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function StoreList() {
  const [movements, setMovements] = useState<any[]>([]);
  const [filtered, setFiltered]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  const [products, setProducts]   = useState<any[]>([]);
  const [branches, setBranches]   = useState<any[]>([]);

  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all"); // all | in | out
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── Record Movement offcanvas ──────────────────────────────────────────
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pricesTouched, setPricesTouched] = useState(false);
  

    const emptyForm = {
    movement_type: "damaged",
    product: "",
    branch: "",
    to_branch: "",
    quantity: "",
    direction: "increase",
    movement_fee: "",
    note: "",
  };
  const [form, setForm] = useState(emptyForm);
  
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("stock-movements/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setMovements(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading store movements:", err);
    } finally { setLoading(false); }
  }, []);

  const loadFormData = useCallback(async () => {
    try {
      const [productsRes, branchesRes] = await Promise.all([
        API.get("products/", { params: { page_size: 500 } }),
        API.get("branches/"),
      ]);
      setProducts(productsRes.data?.results || productsRes.data?.data || (Array.isArray(productsRes.data) ? productsRes.data : []));
      setBranches(branchesRes.data?.results || branchesRes.data?.data || (Array.isArray(branchesRes.data) ? branchesRes.data : []));
    } catch (err) {
      console.error("Error loading products/branches:", err);
    }
  }, []);

  useEffect(() => { load(); loadFormData(); }, [load, loadFormData]);
  useEffect(() => { setPage(1); }, [search, typeFilter, directionFilter, dateFrom, dateTo]);

  const types = Array.from(new Set(movements.map(m => m.movement_type))).filter(Boolean).sort();

  useEffect(() => {
    let list = movements;
    if (typeFilter !== "all") list = list.filter(m => m.movement_type === typeFilter);
    if (directionFilter === "in")  list = list.filter(m => (m.quantity_change || 0) > 0);
    if (directionFilter === "out") list = list.filter(m => (m.quantity_change || 0) < 0);
    if (dateFrom) list = list.filter(m => m.created_at >= dateFrom);
    if (dateTo)   list = list.filter(m => m.created_at <= dateTo + "T23:59:59");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        (m.product_name || "").toLowerCase().includes(q) ||
        (m.note || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, typeFilter, directionFilter, dateFrom, dateTo, movements]);

  const activeFilterCount = [
    typeFilter !== "all", directionFilter !== "all", !!dateFrom, !!dateTo,
  ].filter(Boolean).length;

  function resetFilters() {
    setTypeFilter("all"); setDirectionFilter("all"); setDateFrom(""); setDateTo(""); setSearch("");
  }


  
  function openOffcanvas() {
  setForm(emptyForm);
  
  setFormError("");
  setShowOffcanvas(true);
}



  function closeOffcanvas() {
    setShowOffcanvas(false);
  }

  const cfg = TYPE_FIELDS[form.movement_type];
  const isTransfer = form.movement_type === "transfer";
  const isAdjustment = form.movement_type === "adjustment";
  const selectedProduct = products.find((p: any) => String(p.id) === String(form.product));
  const costPrice = Number(selectedProduct?.cost_price || 0);
  const retailPrice = Number(selectedProduct?.retail_price || 0);
  const qtyNum = Number(form.quantity || 0);
  const feeNum = Number(form.movement_fee || 0);
 
    const REDUCING_TYPES = new Set(["damaged", "expired"]);
  const ADDING_TYPES = new Set(["restock", "return"]);

  async function handleSubmit() {
    setFormError("");

    if (!form.product) return setFormError("Please select a product.");
    if (!form.branch) return setFormError(isTransfer ? "Please select the source branch." : "Please select a branch.");
    if (isTransfer && !form.to_branch) return setFormError("Please select the destination branch.");
    if (isTransfer && form.branch === form.to_branch) return setFormError("Source and destination branches must be different.");
     if (isTransfer && Number(form.movement_fee || 0) < 0)
      return setFormError("Movement fee cannot be negative.");

    const qty = Number(form.quantity || 0);
    if (!qty || qty <= 0) return setFormError("Please enter a quantity greater than zero.");
   if (isTransfer && Number(form.movement_fee || 0) < 0)
 return setFormError("Movement fee cannot be negative.");
    setSaving(true);
    try {
      if (isTransfer) {
        await API.post("stock-movements/transfer/", {
          product: form.product,
          from_branch: form.branch,
          to_branch: form.to_branch,
          quantity: qty,
         
          movement_fee: form.movement_fee || null,
          note: form.note,
        });
      } else if (isAdjustment) {
        await API.post("stock-movements/adjust/", {
          product: form.product,
          branch: form.branch,
          quantity_change: form.direction === "decrease" ? -qty : qty,
          
          note: form.note,
        });
      } else {
        let signedQty = qty;
        if (REDUCING_TYPES.has(form.movement_type)) signedQty = -Math.abs(qty);
        if (ADDING_TYPES.has(form.movement_type)) signedQty = Math.abs(qty);

        await API.post("stock-movements/", {
          product: form.product,
          branch: form.branch,
          movement_type: form.movement_type,
          quantity_change: signedQty,
          note: form.note,
        });
      }

      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      console.error("Error recording movement:", err);
      const data = err.response?.data;
      const msg = data?.error || data?.branch?.[0] || data?.quantity_change?.[0] || "Could not record this movement. Please try again.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Store</h4>
            <p className="text-muted fs-13 mb-0">Damaged, expired, returned, adjusted, and branch-to-branch stock movements.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filtered)} disabled={!filtered.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportExcel(filtered)} disabled={!filtered.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            <button className="btn btn-primary btn-sm" onClick={openOffcanvas}>
              <i className="ti ti-plus me-1" />Manage Stock
            </button>
          </div>
        </div>

        {!loading && movements.length > 0 && (() => {
          const totalIn  = movements.filter(m => (m.quantity_change || 0) > 0).reduce((s, m) => s + m.quantity_change, 0);
          const totalOut = movements.filter(m => (m.quantity_change || 0) < 0).reduce((s, m) => s + Math.abs(m.quantity_change), 0);
          const tiles = [
            { label: "Total Movements", value: movements.length,                                              icon: "ti-arrows-exchange", bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Damaged",         value: movements.filter(m => m.movement_type === "damaged").length,   icon: "ti-alert-triangle",  bg: "bg-danger-gradient-100",  color: "text-danger" },
            { label: "Expired",         value: movements.filter(m => m.movement_type === "expired").length,   icon: "ti-calendar-x",      bg: "bg-danger-gradient-100",  color: "text-danger" },
            { label: "Returned",        value: movements.filter(m => m.movement_type === "return").length,    icon: "ti-corner-up-left",  bg: "bg-info-gradient-100",    color: "text-info" },
            { label: "Transfers",       value: movements.filter(m => m.movement_type === "transfer").length,  icon: "ti-transfer",        bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Net Change",      value: totalIn - totalOut,                                             icon: "ti-scale",           bg: "bg-warning-gradient-100", color: "text-warning" },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(s => (
                <div key={s.label} className="col-6 col-sm-4 col-lg-2" style={{ flex: "1 1 0" }}>
                  <div className="card mb-0 shadow-none border">
                    <div className="card-body p-3 position-relative">
                      <p className="fw-medium mb-1 fs-13">{s.label}</p>
                      <h4 className={`mb-0 ${s.color}`}>{s.value}</h4>
                      <div className={`avatar avatar-rounded avatar-sm ${s.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                        <i className={`ti ${s.icon} fs-5 ${s.color}`} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13" placeholder="Search product, note…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 160 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                {types.map(t => <option key={t} value={t}>{MOVEMENT_LABELS[t] || t}</option>)}
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 130 }} value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
                <option value="all">In &amp; out</option>
                <option value="in">Stock in</option>
                <option value="out">Stock out</option>
              </select>
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger" onClick={resetFilters}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading movements…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-arrows-exchange fs-1 mb-2" />
                <p className="fs-14 mb-0">{movements.length === 0 ? "No store movements found." : "No results match your filters."}</p>
                {activeFilterCount > 0 && <button className="btn btn-sm btn-link mt-2" onClick={resetFilters}>Clear filters</button>}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {COLUMNS.map(c => <th key={c.key} className="text-nowrap">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(m => (
                      <tr key={m.id}>
                        <td className="fw-semibold text-dark text-nowrap">{m.product_name}</td>
                        <td>
                          <span className={MOVEMENT_CLS[m.movement_type] || "badge bg-secondary-transparent text-secondary"}>
                            {MOVEMENT_LABELS[m.movement_type] || m.movement_type || "—"}
                          </span>
                        </td>
                        <td className={`fw-semibold text-nowrap ${m.quantity_change > 0 ? "text-success" : m.quantity_change < 0 ? "text-danger" : "text-muted"}`}>
                          {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                        </td>
                        <td className="text-nowrap">{m.branch_name || <span className="text-muted">—</span>}</td>
                        <td className="text-nowrap">{m.destination_branch_name || <span className="text-muted">—</span>}</td>
                        <td className="text-truncate" style={{ maxWidth: 220 }}>{m.note || <span className="text-muted">—</span>}</td>
                        <td className="text-muted text-nowrap">{m.created_by_name ?? "—"}</td>
                        <td className="text-muted text-nowrap">{fmtDate(m.created_at)}</td>
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
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> movement{filtered.length !== 1 ? "s" : ""}</span>
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

      {/* ================= Record Movement Offcanvas ================= */}
      {showOffcanvas && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeOffcanvas} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 420 }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">Record Movement</h5>
              <button type="button" className="btn-close" onClick={closeOffcanvas} />
            </div>
                       <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              <select
  className="form-select"
  value={form.movement_type}
  onChange={e => {
   
    setForm(f => ({
      ...f,
      movement_type: e.target.value,
      to_branch: "",
      direction: "increase",
      
    }));
  }}
>
  {RECORDABLE_TYPES.map(t => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
</select>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Product</label>
                <select
  className="form-select"
  value={form.product}
  onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
>
  <option value="">Select product…</option>
  {products.map((p: any) => (
    <option key={p.id} value={p.id}>{p.name}{p.item_number ? ` (${p.item_number})` : ""}</option>
  ))}
</select>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">{isTransfer ? "From Branch" : "Branch"}</label>
                <select className="form-select" value={form.branch}
                  onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>
                  <option value="">Select branch…</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>

              {cfg.toBranch && (
                <div className="mb-3">
                  <label className="form-label fs-13 fw-medium">To Branch</label>
                  <select className="form-select" value={form.to_branch}
                    onChange={e => setForm(f => ({ ...f, to_branch: e.target.value }))}>
                    <option value="">Select destination branch…</option>
                    {branches.filter((b: any) => String(b.id) !== String(form.branch)).map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {cfg.direction && (
                <div className="mb-3">
                  <label className="form-label fs-13 fw-medium">Stock Change</label>
                  <select className="form-select" value={form.direction}
                    onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                    <option value="increase">Increase stock (+)</option>
                    <option value="decrease">Decrease stock (−)</option>
                  </select>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Quantity</label>
+ <input type="number" min={1} className="form-control"
    value={form.quantity}
    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
    placeholder="e.g. 5" />
              </div>
              {cfg.fee && (
                <div className="mb-3">
                  {selectedProduct ? (
                    <div className="border rounded p-2 mb-2 fs-12 bg-light">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">Buying price (per unit)</span>
                        <strong>{costPrice > 0 ? money(costPrice) : "Not set"}</strong>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-muted"> Retail price</span>
                        <span>{money(retailPrice)}</span>
                      </div>
                     
                      {costPrice <= 0 && (
                        <div className="text-warning mt-1">
                          No buying price is saved for this product. Set it on the Products page.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="form-text fs-12 mb-2">Select a product to see its buying price.</div>
                  )}

                  <label className="form-label fs-13 fw-medium">Movement Fee (per unit)</label>
                  <input type="number" min={0} step="0.01" className="form-control"
                    value={form.movement_fee}
                    onChange={e => setForm(f => ({ ...f, movement_fee: e.target.value }))}
                    placeholder="e.g. 10" />
                  <div className="form-text fs-12">
                    Total fee: <strong>{money(feeNum * qtyNum)}</strong> (credited to Head Office)
              
                  </div>
                </div>
              )}

 

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Note</label>
                <textarea className="form-control" rows={3} value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder={isTransfer ? "Reason for the transfer…" : "Additional details…"} />
              </div>
            </div>
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={closeOffcanvas} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {isTransfer ? "Move Stock" : "Record Movement"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}