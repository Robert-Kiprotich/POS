import React, { useState, useEffect, useCallback } from "react";
import API from "../../services/api";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

interface Branch {
  id: number | string;
  name: string;
  code: string;
  location: string;
  phone: string;
  is_active: boolean;
  created_at: string;
}

interface BranchStockRow {
  id: number | string;
  branch: number | string;
  branch_name: string;
  product: number | string;
  product_detail: { id: number | string; name: string; sku: string; item_number: string };
  stock_quantity: number;
  reorder_level: number;
  is_low_stock: boolean;
}
const isHeadOffice = (b: { name: string }) => b.name.trim().toLowerCase() === "head office";
export default function BranchesList() {
  const [branches, setBranches]   = useState<Branch[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const [mode, setMode]             = useState<"add" | "edit">("add");
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", code: "", location: "", phone: "", is_active: true });

  // Stock panel for a selected branch
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [stockRows, setStockRows]       = useState<BranchStockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [products, setProducts]         = useState<any[]>([]);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty]             = useState(0);
  const [addReorder, setAddReorder]     = useState(5);
   const [hqStock, setHqStock]           = useState<Record<string, number>>({});

  const loadBranches = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await API.get("branches/");
      setBranches(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error("Error loading branches:", err);
      } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  const loadStockForBranch = useCallback(async (branch: Branch, silent = false) => {
    setActiveBranch(branch);
    if (!silent) setStockLoading(true);
    try {
      const hqBranch = branches.find(isHeadOffice);
      const [stockRes, prodRes, hqRes] = await Promise.all([
        API.get(`branch-stocks/?branch=${branch.id}`),
        API.get("products/"),
        hqBranch ? API.get(`branch-stocks/?branch=${hqBranch.id}`) : Promise.resolve(null),
      ]);
      setStockRows(stockRes.data?.results || stockRes.data?.data || (Array.isArray(stockRes.data) ? stockRes.data : []));
      setProducts(prodRes.data?.results || prodRes.data?.data || (Array.isArray(prodRes.data) ? prodRes.data : []));

      const hqRows: BranchStockRow[] = hqRes
        ? (hqRes.data?.results || hqRes.data?.data || (Array.isArray(hqRes.data) ? hqRes.data : []))
        : [];
      const map: Record<string, number> = {};
      hqRows.forEach(r => { map[String(r.product_detail?.id ?? r.product)] = r.stock_quantity; });
      setHqStock(map);
    } catch (err) {
      console.error("Error loading branch stock:", err);
        } finally {
      if (!silent) setStockLoading(false);
    }
  }, [branches]);

  // Refresh the branch list and the open branch's stock in the background
  useAutoRefresh(() => {
    loadBranches(true);
    if (activeBranch) loadStockForBranch(activeBranch, true);
  }, 30000);

  function handleAddBranch() {
    setMode("add");
    setEditingBranch(null);
    setError("");
    setForm({ name: "", code: "", location: "", phone: "", is_active: true });
  }

  function handleEditBranch(branch: Branch) {
    setMode("edit");
    setEditingBranch(branch);
    setError("");
    setForm({
      name: branch.name, code: branch.code, location: branch.location || "",
      phone: branch.phone || "", is_active: branch.is_active,
    });
  }

  async function handleSaveBranch(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (mode === "edit" && editingBranch) {
        await API.put(`branches/${editingBranch.id}/`, form);
      } else {
        await API.post("branches/", form);
      }
      await loadBranches();
      const btn = document.getElementById("branch-offcanvas-close");
      if (btn) btn.click();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.message || "Failed to save branch.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBranch(branch: Branch) {
    if (!window.confirm(`Delete branch "${branch.name}"? This does not delete its sales history but will unlink future stock tracking.`)) return;
    try {
      await API.delete(`branches/${branch.id}/`);
      setBranches(prev => prev.filter(b => b.id !== branch.id));
      if (activeBranch?.id === branch.id) setActiveBranch(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete branch.");
    }
  }

  async function handleAdjustStock(row: BranchStockRow, delta: number) {
    try {
      const res = await API.post(`branch-stocks/${row.id}/adjust_stock/`, {
        quantity_change: delta,
        movement_type: "adjustment",
        note: "Manual adjustment from Branches page",
      });
      setStockRows(prev => prev.map(r => r.id === row.id ? { ...r, stock_quantity: res.data.stock_quantity } : r));
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to adjust stock.");
    }
  }

   async function handleAddProductStock(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBranch || !addProductId) return;

    const toHeadOffice = isHeadOffice(activeBranch);
    const key = String(addProductId);

    // Instant client-side check (the server re-checks anyway)
    if (!toHeadOffice) {
      const available = hqStock[key] ?? 0;
      if (addQty <= 0) {
        alert("Enter a quantity greater than 0 to transfer.");
        return;
      }
      if (addQty > available) {
        alert(`Not enough stock at Head Office. Available: ${available}, requested: ${addQty}.`);
        return;
      }
    }

    try {
      const res = toHeadOffice
        ? await API.post("branch-stocks/", {
            branch: activeBranch.id,
            product: addProductId,
            stock_quantity: addQty,
            reorder_level: addReorder,
          })
        : await API.post("branch-stocks/transfer_from_head_office/", {
            branch: activeBranch.id,
            product: addProductId,
            quantity: addQty,
            reorder_level: addReorder,
          });

      setStockRows(prev => [...prev.filter(r => r.id !== res.data.id), res.data]);
      if (!toHeadOffice) {
        setHqStock(prev => ({ ...prev, [key]: (prev[key] ?? 0) - addQty }));
      }
      setAddProductId(""); setAddQty(0); setAddReorder(5);
    } catch (err: any) {
      alert(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        "Failed to add product to this branch."
      );
    }
  }

  const stockedProductIds = new Set(stockRows.map(r => r.product_detail?.id ?? r.product));
   const activeIsHQ = !!activeBranch && isHeadOffice(activeBranch);
  const availableToAdd = products.filter(
    p => !stockedProductIds.has(p.id) && (activeIsHQ || (hqStock[String(p.id)] ?? 0) > 0)
  );
  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Branches</h4>
            <p className="text-muted fs-13 mb-0">Manage agrovet branches and their stock levels.</p>
          </div>
          <button className="btn btn-primary btn-sm" data-bs-toggle="offcanvas" data-bs-target="#branch-offcanvas" onClick={handleAddBranch}>
            <i className="ti ti-plus me-1" />Add Branch
          </button>
        </div>

        <div className="row g-3">
          {/* Branch list */}
          <div className="col-lg-5">
            <div className="card shadow-none border">
              <div className="card-header py-3 border-bottom">
                <h6 className="mb-0 fw-semibold fs-14">All Branches</h6>
              </div>
              <div className="card-body p-0">
                {loading ? (
                  <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                    <span className="spinner-border spinner-border-sm me-2" />Loading…
                  </div>
                ) : branches.length === 0 ? (
                  <div className="text-center text-muted py-5 fs-13">No branches yet. Add your first one.</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {branches.map(b => (
                      <div
                        key={b.id}
                        className={`list-group-item d-flex align-items-center justify-content-between py-3 ${activeBranch?.id === b.id ? "bg-primary-transparent" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => loadStockForBranch(b)}
                      >
                        <div>
                          <div className="fw-semibold fs-13">
                            {b.name}{" "}
                            <span className="badge bg-light text-dark fs-10 ms-1">{b.code}</span>
                            {!b.is_active && <span className="badge bg-secondary-transparent text-secondary fs-10 ms-1">Inactive</span>}
                          </div>
                          <div className="text-muted fs-12">{b.location || "No location set"}{b.phone ? ` · ${b.phone}` : ""}</div>
                        </div>
                        <div className="d-flex gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn-sm btn-outline-primary py-1 px-2 fs-11"
                            data-bs-toggle="offcanvas" data-bs-target="#branch-offcanvas"
                            onClick={() => handleEditBranch(b)}
                          >
                            <i className="ti ti-edit" />
                          </button>
                          <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={() => handleDeleteBranch(b)}>
                            <i className="ti ti-trash" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stock panel for selected branch */}
          <div className="col-lg-7">
            <div className="card shadow-none border">
              <div className="card-header py-3 border-bottom">
                <h6 className="mb-0 fw-semibold fs-14">
                  {activeBranch ? `Stock at ${activeBranch.name}` : "Select a branch to view stock"}
                </h6>
              </div>
              <div className="card-body">
                {!activeBranch ? (
                  <div className="text-center text-muted py-5 fs-13">
                    <i className="ti ti-building-store fs-1 d-block mb-2" />
                    Click a branch on the left to manage its stock.
                  </div>
                ) : stockLoading ? (
                  <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                    <span className="spinner-border spinner-border-sm me-2" />Loading stock…
                  </div>
                ) : (
                  <>
                    {/* Add product to this branch */}
                                                         {activeIsHQ ? (
                      <div className="alert alert-info fs-12 py-2 mb-3">
                        <i className="ti ti-info-circle me-1" />
                        Products appear here automatically when they are added. Use the + / − buttons to
                        adjust Head Office stock.
                      </div>
                    ) : (
                      <>
                        <form className="row g-2 align-items-end mb-1" onSubmit={handleAddProductStock}>
                          <div className="col-sm-5">
                            <label className="form-label fs-12 mb-1">Transfer product from Head Office</label>
                            <select className="form-select form-select-sm fs-13" value={addProductId} onChange={e => setAddProductId(e.target.value)} required>
                              <option value="">Select product…</option>
                              {availableToAdd.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.item_number || p.sku}) – HQ: {hqStock[String(p.id)] ?? 0}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-sm-3">
                            <label className="form-label fs-12 mb-1">Qty to transfer</label>
                            <input
                              type="number"
                              min={1}
                              max={addProductId ? (hqStock[String(addProductId)] ?? 0) : undefined}
                              className="form-control form-control-sm fs-13"
                              value={addQty}
                              onChange={e => setAddQty(Number(e.target.value))}
                            />
                          </div>
                          <div className="col-sm-3">
                            <label className="form-label fs-12 mb-1">Reorder Level</label>
                            <input type="number" min={0} className="form-control form-control-sm fs-13" value={addReorder} onChange={e => setAddReorder(Number(e.target.value))} />
                          </div>
                          <div className="col-sm-1">
                            <button type="submit" className="btn btn-sm btn-primary w-100" disabled={!addProductId}>
                              <i className="ti ti-plus" />
                            </button>
                          </div>
                        </form>
                        
                      </>
                    )}
                    <div className="fs-11 text-muted mb-3 pb-3 border-bottom">
                      {activeIsHQ
                        ? "Stock added here is new stock received at Head Office."
                        : addProductId
                          ? `Available at Head Office: ${hqStock[String(addProductId)] ?? 0}. Transferred stock is deducted from Head Office.`
                          : "Only products with stock at Head Office are listed. Transferred stock is deducted from Head Office."}
                    </div>

                    {stockRows.length === 0 ? (
                      <div className="text-center text-muted py-4 fs-13">No products stocked at this branch yet.</div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm mb-0 fs-13">
                          <thead className="table-light">
                            <tr>
                              <th>Product</th>
                              <th>Item #</th>
                              <th style={{ width: 130 }}>Qty</th>
                              <th style={{ width: 90 }}>Reorder</th>
                              <th style={{ width: 90 }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stockRows.map(r => (
                              <tr key={r.id}>
                                <td className="fw-medium">{r.product_detail?.name}</td>
                                <td className="text-muted">{r.product_detail?.item_number}</td>
                                <td>
                                  {activeIsHQ ? (
                                    <div className="d-flex align-items-center gap-1">
                                      <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => handleAdjustStock(r, -1)}>−</button>
                                      <span className="mx-1">{r.stock_quantity}</span>
                                      <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => handleAdjustStock(r, 1)}>+</button>
                                    </div>
                                  ) : (
                                    <span>{r.stock_quantity}</span>
                                  )}
                                </td>
                                <td className="text-muted">{r.reorder_level}</td>
                                <td>
                                  {r.is_low_stock
                                    ? <span className="badge bg-danger-transparent text-danger fs-10">Low</span>
                                    : <span className="badge bg-success-transparent text-success fs-10">OK</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branch add/edit offcanvas */}
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="branch-offcanvas" aria-labelledby="branchOffcanvasLabel" style={{ width: "360px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-15 fw-semibold" id="branchOffcanvasLabel">
            {mode === "edit" ? "Edit Branch" : "Add Branch"}
          </h5>
          <button id="branch-offcanvas-close" type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close" />
        </div>
        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}
          <form id="branch-form" onSubmit={handleSaveBranch} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label fs-13 fw-medium mb-1">Branch Name <span className="text-danger">*</span></label>
              <input type="text" className="form-control fs-13" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="form-label fs-13 fw-medium mb-1">Branch Code <span className="text-danger">*</span></label>
              <input type="text" className="form-control fs-13" required placeholder="e.g. NRB01" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="form-label fs-13 fw-medium mb-1">Location</label>
              <input type="text" className="form-control fs-13" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="form-label fs-13 fw-medium mb-1">Phone</label>
              <input type="text" className="form-control fs-13" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-check form-switch pt-1">
              <input className="form-check-input" type="checkbox" role="switch" id="branch_is_active"
                checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <label className="form-check-label fs-13 ms-1" htmlFor="branch_is_active">Active Status</label>
            </div>
          </form>
        </div>
        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">Cancel</button>
          <button type="submit" form="branch-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
            {saving && <span className="spinner-border spinner-border-sm me-1" role="status" />}
            {mode === "edit" ? "Update Branch" : "Save Branch"}
          </button>
        </div>
      </div>
    </div>
  );
}