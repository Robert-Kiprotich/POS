import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";
import { useNavigate, useLocation } from "react-router";

const TERMS: Record<string, string> = {
  cash: "Cash on delivery",
  net_7: "Net 7 days",
  net_14: "Next 14 days",
  net_30: "Next 30 days",
  net_60: "Next 60 days",
};

const emptyForm = {
  name: "",
  contact_person: "",
  head_office_contact: "",
  phone: "",
  alt_phone: "",
  email: "",
  address: "",
  location: "",
  kra_pin: "",
  payment_method: "",
  account_name: "",
  bank_name: "",
  bank_account: "",
  mpesa_paybill: "",
  mpesa_account: "",
  payment_terms: "cash",
  notes: "",
  is_active: true,
};

const money = (n: any) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAY_STATUS: Record<string, string> = { not_paid: "Not paid", partial: "Partially paid", paid: "Paid" };
const PAY_STATUS_CLS: Record<string, string> = {
  not_paid: "badge bg-danger-transparent text-danger",
  partial: "badge bg-warning-transparent text-warning",
  paid: "badge bg-success-transparent text-success",
};

// ── Column config: one list drives the table header, the table cells and the exports ──
type Col = {
  key: string;
  label: string;
  end?: boolean;                   // right-align (numbers)
  table?: boolean;                 // show in the table (default true)
  exp?: boolean;                   // include in CSV / Excel (default true)
  render?: (s: any) => ReactNode;  // custom table cell
};

const dash = <span className="text-muted">—</span>;

const COLUMNS: Col[] = [
  {
    key: "name", label: "Supplier",
    render: s => (
      <>
        <div className="fw-semibold text-dark">{s.name}</div>
        {s.payment_method === "bank" && s.bank_name && (
          <div className="text-muted fs-12">{s.bank_name} · {s.bank_account}</div>
        )}
        {s.payment_method === "mpesa" && s.mpesa_paybill && (
          <div className="text-muted fs-12">Paybill {s.mpesa_paybill} · Acc {s.mpesa_account}</div>
        )}
      </>
    ),
  },
  { key: "contact_person", label: "Contact Person" },
  { key: "head_office_contact", label: "Head Office Contact", table: false },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "location", label: "Location", table: false },
  { key: "kra_pin", label: "KRA PIN" },
  { key: "payment_method_display", label: "Payment Method", table: false },
  { key: "account_name", label: "Account Name", table: false },
  { key: "bank_name", label: "Bank", table: false },
  { key: "bank_account", label: "Account No.", table: false },
  { key: "mpesa_paybill", label: "Paybill", table: false },
  { key: "mpesa_account", label: "M-Pesa Account", table: false },
  { key: "total_billed", label: "Billed", end: true, render: s => money(s.total_billed) },
  { key: "total_paid", label: "Paid", end: true, render: s => money(s.total_paid) },
  {
    key: "balance", label: "Balance", end: true,
    render: s => <span className={`fw-semibold ${s.balance > 0 ? "text-danger" : ""}`}>{money(s.balance)}</span>,
  },
  {
    key: "payment_status", label: "Payment", exp: false,
    render: s => s.payment_status
      ? <span className={PAY_STATUS_CLS[s.payment_status]}>{PAY_STATUS[s.payment_status]}</span>
      : dash,
  },
  {
    key: "payment_terms_display", label: "Terms",
    render: s => (
      <span className={`badge ${s.payment_terms === "cash" ? "bg-success-transparent text-success" : "bg-warning-transparent text-warning"}`}>
        {s.payment_terms_display || TERMS[s.payment_terms] || s.payment_terms}
      </span>
    ),
  },
  {
    key: "is_active", label: "Status",
    render: s => (
      <span className={`badge ${s.is_active ? "bg-success-transparent text-success" : "bg-secondary-transparent text-secondary"}`}>
        {s.is_active ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const TABLE_COLS = COLUMNS.filter(c => c.table !== false);
const EXPORT_COLS = COLUMNS.filter(c => c.exp !== false);

function cell(r: any, key: string) {
  if (key === "is_active") return r.is_active ? "Active" : "Inactive";
  return String(r[key] ?? "");
}

function exportCSV(rows: any[]) {
  const lines = [
    EXPORT_COLS.map(c => c.label).join(","),
    ...rows.map(r => EXPORT_COLS.map(c => `"${cell(r, c.key).replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const data = [EXPORT_COLS.map(c => c.label), ...rows.map(r => EXPORT_COLS.map(c => cell(r, c.key)))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
  XLSX.writeFile(wb, `suppliers_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Turn a DRF error payload ({field: ["msg"]} or {error: "msg"}) into one readable string.
function errorMessage(err: any) {
  const data = err.response?.data;
  if (!data) return "Could not save the supplier. Please try again.";
  if (typeof data === "string") return data;
  if (data.error || data.detail) return data.error || data.detail;
  const first = Object.entries(data)[0] as [string, any];
  if (first) return `${first[0]}: ${Array.isArray(first[1]) ? first[1][0] : first[1]}`;
  return "Could not save the supplier. Please try again.";
}

export default function SupplierList() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo as string | undefined;
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive
  const [termsFilter, setTermsFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Offcanvas (create / edit)
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("suppliers/", { params: { page_size: 500 } });
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setSuppliers(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading suppliers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, termsFilter]);

  // Arriving from "Register this supplier" on the Supplies page
  useEffect(() => {
    const st = location.state as any;
    if (st?.registerSupplier) {
      setEditingId(null);
      setForm({ ...emptyForm, name: st.name || "" });
      setFormError("");
      setShowOffcanvas(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let list = suppliers;
    if (statusFilter === "active") list = list.filter(s => s.is_active);
    if (statusFilter === "inactive") list = list.filter(s => !s.is_active);
    if (termsFilter !== "all") list = list.filter(s => s.payment_terms === termsFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.contact_person || "").toLowerCase().includes(q) ||
        (s.head_office_contact || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.kra_pin || "").toLowerCase().includes(q) ||
        (s.bank_name || "").toLowerCase().includes(q) ||
        (s.address || "").toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, statusFilter, termsFilter, suppliers]);

  const activeFilterCount = [statusFilter !== "all", termsFilter !== "all"].filter(Boolean).length;

  function resetFilters() {
    setStatusFilter("all"); setTermsFilter("all"); setSearch("");
  }

  // ── Create / edit ───────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowOffcanvas(true);
  }

  function openEdit(s: any) {
    setEditingId(s.id);
    setForm({
      name: s.name || "",
      contact_person: s.contact_person || "",
      head_office_contact: s.head_office_contact || "",
      phone: s.phone || "",
      alt_phone: s.alt_phone || "",
      email: s.email || "",
      address: s.address || "",
      location: s.location || "",
      kra_pin: s.kra_pin || "",
      payment_method: s.payment_method || "",
      account_name: s.account_name || "",
      bank_name: s.bank_name || "",
      bank_account: s.bank_account || "",
      mpesa_paybill: s.mpesa_paybill || "",
      mpesa_account: s.mpesa_account || "",
      payment_terms: s.payment_terms || "cash",
      notes: s.notes || "",
      is_active: !!s.is_active,
    });
    setFormError("");
    setShowOffcanvas(true);
  }

  function closeOffcanvas() {
    if (!saving) setShowOffcanvas(false);
  }

  async function handleSubmit() {
    setFormError("");
    if (!form.name.trim()) return setFormError("Supplier name is required.");
    if (!form.phone.trim() && !form.email.trim())
      return setFormError("Enter at least a phone number or an email so you can reach this supplier.");
    if (form.payment_method === "bank" && (!form.bank_name.trim() || !form.bank_account.trim()))
      return setFormError("Enter the bank name and account number.");
    if (form.payment_method === "mpesa" && (!form.mpesa_paybill.trim() || !form.mpesa_account.trim()))
      return setFormError("Enter the M-Pesa paybill and account number.");

    setSaving(true);
    try {
      const res = editingId
        ? await API.put(`suppliers/${editingId}/`, form)
        : await API.post("suppliers/", form);
      setShowOffcanvas(false);

      if (!editingId && returnTo) {
        navigate(returnTo, { state: { newSupplierId: res.data.id } });
        return;
      }
      load();
    } catch (err: any) {
      console.error("Error saving supplier:", err);
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────
  async function toggleStatus(s: any) {
    try {
      const res = await API.post(`suppliers/${s.id}/toggle_status/`);
      setSuppliers(list => list.map(x => (x.id === s.id ? res.data : x)));
    } catch (err) {
      console.error("Error toggling supplier status:", err);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await API.delete(`suppliers/${deleteTarget.id}/`);
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      setDeleteError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const set = (field: string) => (e: any) => setForm((f: any) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Suppliers</h4>
            <p className="text-muted fs-13 mb-0">The companies and people you buy stock from.</p>
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
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <i className="ti ti-plus me-1" />Add Supplier
            </button>
          </div>
        </div>

        {/* Stat tiles */}
        {!loading && suppliers.length > 0 && (() => {
          const tiles = [
            { label: "Total Suppliers", value: suppliers.length, icon: "ti-truck-delivery", bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Active", value: suppliers.filter(s => s.is_active).length, icon: "ti-circle-check", bg: "bg-success-gradient-100", color: "text-success" },
            { label: "Inactive", value: suppliers.filter(s => !s.is_active).length, icon: "ti-circle-off", bg: "bg-danger-gradient-100", color: "text-danger" },
            { label: "On Credit Terms", value: suppliers.filter(s => s.payment_terms !== "cash").length, icon: "ti-calendar-due", bg: "bg-warning-gradient-100", color: "text-warning" },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(t => (
                <div key={t.label} className="col-6 col-lg-3">
                  <div className="card mb-0 shadow-none border">
                    <div className="card-body p-3 position-relative">
                      <p className="fw-medium mb-1 fs-13">{t.label}</p>
                      <h4 className={`mb-0 ${t.color}`}>{t.value}</h4>
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
            <div className="input-group input-group-flat" style={{ maxWidth: 280 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13" placeholder="Search name, contact, phone…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }} value={termsFilter} onChange={e => setTermsFilter(e.target.value)}>
                <option value="all">All payment terms</option>
                {Object.entries(TERMS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
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
                <span className="spinner-border spinner-border-sm me-2" />Loading suppliers…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-truck-delivery fs-1 mb-2" />
                <p className="fs-14 mb-0">{suppliers.length === 0 ? "No suppliers yet. Add your first one to get started." : "No suppliers match your filters."}</p>
                {suppliers.length === 0
                  ? <button className="btn btn-sm btn-primary mt-3" onClick={openCreate}><i className="ti ti-plus me-1" />Add Supplier</button>
                  : activeFilterCount > 0 && <button className="btn btn-sm btn-link mt-2" onClick={resetFilters}>Clear filters</button>}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {TABLE_COLS.map(c => (
                        <th key={c.key} className={`text-nowrap ${c.end ? "text-end" : ""}`}>{c.label}</th>
                      ))}
                      <th className="text-end text-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(s => (
                      <tr key={s.id}>
                        {TABLE_COLS.map(c => (
                          <td key={c.key} className={`text-nowrap ${c.end ? "text-end" : ""}`}>
                            {c.render ? c.render(s) : (s[c.key] || dash)}
                          </td>
                        ))}
                        <td className="text-end text-nowrap">
                          <button className="btn btn-sm btn-icon btn-outline-secondary me-1" title="Edit" onClick={() => openEdit(s)}>
                            <i className="ti ti-edit" />
                          </button>
                          <button className="btn btn-sm btn-icon btn-outline-warning me-1"
                            title={s.is_active ? "Mark inactive" : "Mark active"} onClick={() => toggleStatus(s)}>
                            <i className={`ti ${s.is_active ? "ti-player-pause" : "ti-player-play"}`} />
                          </button>
                          <button className="btn btn-sm btn-icon btn-outline-danger" title="Delete"
                            onClick={() => { setDeleteError(""); setDeleteTarget(s); }}>
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
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> supplier{filtered.length !== 1 ? "s" : ""}</span>
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

      {/* ================= Add / Edit Offcanvas ================= */}
      {showOffcanvas && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeOffcanvas} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 440 }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">{editingId ? "Edit Supplier" : "Add Supplier"}</h5>
              <button type="button" className="btn-close" onClick={closeOffcanvas} />
            </div>
            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}
              {returnTo && !editingId && (
                <div className="alert alert-info fs-12 py-2">
                  <i className="ti ti-info-circle me-1" />
                  After saving, you'll go back to Record Supply with this supplier selected.
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Supplier name <span className="text-danger">*</span></label>
                <input className="form-control" value={form.name} onChange={set("name")} placeholder="e.g. Cooper Kenya Ltd" />
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Contact person</label>
                <input className="form-control" value={form.contact_person} onChange={set("contact_person")} />
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Head office contact</label>
                <input className="form-control" value={form.head_office_contact} onChange={set("head_office_contact")}
                  placeholder="Head office phone / person" />
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Phone</label>
                  <input className="form-control" value={form.phone} onChange={set("phone")} placeholder="07…" />
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Alternative phone</label>
                  <input className="form-control" value={form.alt_phone} onChange={set("alt_phone")} />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Email</label>
                <input type="email" className="form-control" value={form.email} onChange={set("email")} />
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Address</label>
                  <input className="form-control" value={form.address} onChange={set("address")} />
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Location</label>
                  <input className="form-control" value={form.location} onChange={set("location")}
                    placeholder="Town / area" />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">KRA PIN</label>
                  <input className="form-control" value={form.kra_pin} onChange={set("kra_pin")} />
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Payment terms</label>
                  <select className="form-select" value={form.payment_terms} onChange={set("payment_terms")}>
                    {Object.entries(TERMS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Payment method</label>
                <select className="form-select" value={form.payment_method} onChange={set("payment_method")}>
                  <option value="">— Not set —</option>
                  <option value="bank">Bank</option>
                  <option value="mpesa">M-Pesa</option>
                </select>
              </div>

              {form.payment_method === "bank" && (
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fs-13 fw-medium">Bank name <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.bank_name} onChange={set("bank_name")} />
                  </div>
                  <div className="col-6">
                    <label className="form-label fs-13 fw-medium">Account number <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.bank_account} onChange={set("bank_account")} />
                  </div>
                  <div className="col-12">
                    <label className="form-label fs-13 fw-medium">Account name</label>
                    <input className="form-control" value={form.account_name} onChange={set("account_name")} />
                  </div>
                </div>
              )}

              {form.payment_method === "mpesa" && (
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fs-13 fw-medium">Paybill number <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.mpesa_paybill} onChange={set("mpesa_paybill")} />
                  </div>
                  <div className="col-6">
                    <label className="form-label fs-13 fw-medium">Account number <span className="text-danger">*</span></label>
                    <input className="form-control" value={form.mpesa_account} onChange={set("mpesa_account")} />
                  </div>
                  <div className="col-12">
                    <label className="form-label fs-13 fw-medium">Account name</label>
                    <input className="form-control" value={form.account_name} onChange={set("account_name")} />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Notes</label>
                <textarea className="form-control" rows={3} value={form.notes} onChange={set("notes")}
                  placeholder="Delivery days, minimum order, anything worth remembering…" />
              </div>

              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" id="supplierActive" checked={form.is_active}
                  onChange={e => setForm((f: any) => ({ ...f, is_active: e.target.checked }))} />
                <label className="form-check-label fs-13" htmlFor="supplierActive">Active supplier</label>
              </div>
            </div>
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={closeOffcanvas} disabled={saving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {editingId ? "Save changes" : "Add supplier"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================= Delete confirmation ================= */}
      {deleteTarget && (
        <>
          <div className="modal-backdrop fade show" />
          <div className="modal fade show d-block" tabIndex={-1} onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header border-bottom">
                  <h5 className="modal-title fw-semibold">Delete supplier</h5>
                  <button type="button" className="btn-close" onClick={() => setDeleteTarget(null)} disabled={deleting} />
                </div>
                <div className="modal-body">
                  {deleteError && <div className="alert alert-danger fs-13 py-2">{deleteError}</div>}
                  <p className="mb-0 fs-14">
                    Delete <strong>{deleteTarget.name}</strong>? This can't be undone. If you only want to stop using
                    them, mark the supplier inactive instead.
                  </p>
                </div>
                <div className="modal-footer border-top">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
                  <button className="btn btn-danger btn-sm" onClick={confirmDelete} disabled={deleting}>
                    {deleting ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-trash me-1" />}
                    Delete supplier
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
