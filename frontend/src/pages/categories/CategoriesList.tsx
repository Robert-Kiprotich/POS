import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";
import { useNavigate, useLocation } from "react-router";

function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const COLUMNS = [
  { key: "name",          label: "Name" },
  { key: "description",   label: "Description" },
  { key: "product_count", label: "# Products" },
  { key: "is_active",     label: "Active" },
  { key: "created_at",    label: "Date Created" },
] as const;

type Mode = "add" | "edit" | "view";

interface CategoryForm {
  name: string;
  description: string;
  is_active: boolean;
}

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  is_active: true,
};

function exportCSV(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const lines = [
    headers.join(","),
    ...rows.map(r => COLUMNS.map(c => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `categories_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const data = [headers, ...rows.map(r => COLUMNS.map(c => String(r[c.key] ?? "")))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Categories");
  XLSX.writeFile(wb, `categories_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function CategoriesList() {
  const [categories, setCategories] = useState<any[]>([]);
  const [filtered, setFiltered]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Offcanvas state
  const [mode, setMode]                 = useState<Mode>("add");
  const [selectedCategory, setSelected] = useState<any | null>(null);
  const [form, setForm]                 = useState<CategoryForm>(emptyForm);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [returnTo, setReturnTo] = useState<string | undefined>((location.state as any)?.returnTo);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("categories/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setCategories(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading categories:", err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  useEffect(() => {
    let list = categories;
    if (statusFilter !== "all") list = list.filter(c => (statusFilter === "active") === c.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, statusFilter, categories]);

  // Open Offcanvas Handlers
  const handleOpenAdd = () => {
     setReturnTo(undefined);
    setMode("add");
    setSelected(null);
    setForm(emptyForm);
    setError("");
    openOffcanvas();
  };

  const handleOpenEdit = (item: any) => {
    setMode("edit");
    setSelected(item);
    setForm({
      name: item.name || "",
      description: item.description || "",
      is_active: item.is_active ?? true,
    });
    setError("");
    openOffcanvas();
  };

  const handleOpenView = (item: any) => {
    setMode("view");
    setSelected(item);
    openOffcanvas();
  };

  const openOffcanvas = () => {
    const el = document.getElementById("category-offcanvas");
    if (el) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap?.Offcanvas) {
        const instance = bootstrap.Offcanvas.getOrCreateInstance(el);
        instance.show();
      }
    }
  };

  const closeOffcanvas = () => {
    const el = document.getElementById("category-offcanvas");
    if (el) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap?.Offcanvas) {
        const instance = bootstrap.Offcanvas.getInstance(el);
        instance?.hide();
      }
    }
  };
useEffect(() => {
    const st = location.state as any;
    if (!st?.registerCategory) return;
    setMode("add");
    setSelected(null);
    setError("");
    setForm({ ...emptyForm, name: st.name || "" });
    setTimeout(openOffcanvas, 0);
  }, []); 
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Category name is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
           if (mode === "edit" && selectedCategory) {
        await API.patch(`categories/${selectedCategory.id}/`, form);
      } else {
        const res = await API.post("categories/", form);

        if (returnTo) {
          const el = document.getElementById("category-offcanvas");
          const goBack = () => navigate(returnTo, { state: { newCategoryId: res.data.id } });
          if (el) {
            el.addEventListener("hidden.bs.offcanvas", goBack, { once: true });
            closeOffcanvas();
          } else {
            goBack();
          }
          return;
        }
      }
      closeOffcanvas();
      load();
    } catch (err: any) {
      console.error("Failed to save category:", err);
      setError(err.response?.data?.message || "Failed to save category.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return;
    try {
      await API.delete(`categories/${id}/`);
      load();
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  const activeFilterCount = [statusFilter !== "all"].filter(Boolean).length;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Top Action Bar */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Categories</h4>
            <p className="text-muted fs-13 mb-0">Product categories used across your catalog.</p>
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
            <button className="btn btn-primary btn-sm" onClick={handleOpenAdd}>
              <i className="ti ti-plus me-1" />Add Category
            </button>
          </div>
        </div>

        {/* Dashboard Tiles */}
        {!loading && categories.length > 0 && (() => {
          const tiles = [
            { label: "Total Categories", value: categories.length,                                        icon: "ti-category",     bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Active",           value: categories.filter(c => c.is_active).length,                icon: "ti-circle-check", bg: "bg-success-gradient-100", color: "text-success" },
            { label: "Inactive",         value: categories.filter(c => !c.is_active).length,                icon: "ti-circle-x",     bg: "bg-secondary-gradient-100",color: "text-secondary" },
            { label: "Products Covered", value: categories.reduce((s, c) => s + (c.product_count || 0), 0), icon: "ti-package",      bg: "bg-info-gradient-100",    color: "text-info" },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(s => (
                <div key={s.label} className="col-6 col-sm-3">
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

        {/* Category Table */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13" placeholder="Search name, description…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger" onClick={() => setStatusFilter("all")}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading categories…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-category fs-1 mb-2" />
                <p className="fs-14 mb-0">{categories.length === 0 ? "No categories found." : "No results match your filters."}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {COLUMNS.map(c => <th key={c.key} className="text-nowrap">{c.label}</th>)}
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(c => (
                      <tr key={c.id}>
                        <td className="fw-semibold text-dark">{c.name}</td>
                        <td className="text-truncate" style={{ maxWidth: 280 }}>{c.description || <span className="text-muted">—</span>}</td>
                        <td>{c.product_count ?? 0}</td>
                        <td>
                          {c.is_active
                            ? <span className="badge bg-success-transparent text-success">Active</span>
                            : <span className="badge bg-secondary-transparent text-secondary">Inactive</span>}
                        </td>
                        <td className="text-muted text-nowrap">{fmtDate(c.created_at)}</td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            <button className="btn btn-sm btn-icon btn-light" title="View" onClick={() => handleOpenView(c)}>
                              <i className="ti ti-eye text-muted" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Edit" onClick={() => handleOpenEdit(c)}>
                              <i className="ti ti-edit text-primary" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Delete" onClick={() => handleDelete(c.id)}>
                              <i className="ti ti-trash text-danger" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = (page - 1) * pageSize + 1;
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> categor{filtered.length !== 1 ? "ies" : "y"}</span>
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

      {/* --- SINGLE OFFCANVAS FOR ADD / EDIT / VIEW --- */}
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="category-offcanvas" style={{ width: "450px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-16 fw-semibold">
            {mode === "add" && "Add New Category"}
            {mode === "edit" && "Edit Category"}
            {mode === "view" && "Category Details"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}
                    {returnTo && mode === "add" && (
            <div className="alert alert-info fs-12 py-2">
              <i className="ti ti-info-circle me-1" />
              After saving, you'll go back to Products with this category selected.
            </div>
          )}
          {mode === "view" && selectedCategory ? (
            <div className="d-flex flex-column gap-3 fs-13">
              <div>
                <label className="text-muted fs-12 fw-medium d-block">NAME</label>
                <span className="fw-semibold text-dark fs-14">{selectedCategory.name}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block">DESCRIPTION</label>
                <span>{selectedCategory.description || "—"}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block">TOTAL PRODUCTS</label>
                <span className="badge bg-info-transparent text-info">{selectedCategory.product_count ?? 0} Products</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block">STATUS</label>
                {selectedCategory.is_active ? (
                  <span className="badge bg-success-transparent text-success">Active</span>
                ) : (
                  <span className="badge bg-secondary-transparent text-secondary">Inactive</span>
                )}
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block">CREATED AT</label>
                <span>{fmtDate(selectedCategory.created_at)}</span>
              </div>
            </div>
          ) : (
            <form id="category-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label fs-13 fw-medium">
                  Category Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control fs-13"
                  placeholder="Enter name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label fs-13 fw-medium">Description</label>
                <textarea
                  className="form-control fs-13"
                  rows={3}
                  placeholder="Enter category description..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="is_active_switch"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                />
                <label className="form-check-label fs-13" htmlFor="is_active_switch">
                  Active Status
                </label>
              </div>
            </form>
          )}
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="category-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
              {mode === "edit" ? "Update Category" : "Save Category"}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}