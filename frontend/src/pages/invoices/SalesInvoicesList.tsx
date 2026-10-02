import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 });
}

const STATUSES = [
  { value: "draft",     label: "Draft" },
  { value: "issued",    label: "Issued" },
  { value: "partial",   label: "Partially Paid" },
  { value: "paid",      label: "Paid" },
  { value: "overdue",   label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];
const INVOICE_TYPES = [
  { value: "supply",   label: "Supply Invoice" },
  { value: "credit",   label: "Credit Invoice" },
  { value: "purchase", label: "Purchase Invoice" },
];

type ExtraField = { key: string; label: string; type?: "text" | "date" | "number" | "textarea"; required?: boolean };
type TypeConfig = {
  saleField: "hidden" | "optional" | "required";
  partyTitle: string;
  detailsTitle: string;
  extra: ExtraField[];
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  supply: {
    saleField: "optional", partyTitle: "Billed To", detailsTitle: "Supply Details",
    extra: [
      { key: "delivery_note_no",  label: "Delivery Note #" },
      { key: "delivery_date",     label: "Delivery Date", type: "date" },
      { key: "delivery_location", label: "Delivery Location" },
    ],
  },
  credit: {
    saleField: "required", partyTitle: "Billed To", detailsTitle: "Credit Details",
    extra: [{ key: "credit_period_days", label: "Credit Period (days)", type: "number" }],
  },
  purchase: {
    saleField: "hidden", partyTitle: "Supplier", detailsTitle: "Purchase Details",
    extra: [
      { key: "supplier_invoice_no", label: "Supplier Invoice #", required: true },
      { key: "po_number",           label: "PO Number" },
    ],
  },
};
const COLUMNS = [
    { key: "invoice_number", label: "Invoice #" },
  { key: "invoice_type_display", label: "Type" },
  { key: "issue_date",     label: "Issued" },
  { key: "due_date",       label: "Due" },
  { key: "billed_to_name", label: "Billed To" },
  { key: "total_amount",   label: "Total" },
  { key: "balance_due",    label: "Balance" },
  { key: "status",         label: "Status" },
] as const;

type Mode = "add" | "edit" | "view";

interface InvForm {
  invoice_type: string;
  sale: string;
  issue_date: string;
  due_date: string;
  billed_to_name: string;
  billed_to_phone: string;
  billed_to_email: string;
  billed_to_address: string;
    subtotal: string;              // add these four
    discount_amount: string;
tax_amount:string;
amount_paid:string;
  notes: string;
  terms: string;
  extra: Record<string, string>;
}

const emptyForm: InvForm = {
  invoice_type: "supply",
  sale: "",
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  billed_to_name: "",
  billed_to_phone: "",
  billed_to_email: "",
  billed_to_address: "",
  subtotal: "0", 
  discount_amount: "0", 
  tax_amount: "0",
   amount_paid: "0",

  notes: "",
  terms: "",
    extra: {},

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
  a.download = `sales_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const data = [headers, ...rows.map(r => COLUMNS.map(c => String(r[c.key] ?? "")))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SalesInvoices");
  XLSX.writeFile(wb, `sales_invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    draft:     "bg-secondary-transparent text-secondary",
    issued:    "bg-info-transparent text-info",
    partial:   "bg-warning-transparent text-warning",
    paid:      "bg-success-transparent text-success",
    overdue:   "bg-danger-transparent text-danger",
    cancelled: "bg-dark-transparent text-dark",
  };
  return map[s] || "bg-secondary-transparent text-secondary";
};

export default function SalesInvoicesList() {
  const [items, setItems]       = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sales, setSales]       = useState<any[]>([]);

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [mode, setMode]         = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm]         = useState<InvForm>(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("sales-invoices/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setItems(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading invoices:", err);
    } finally { setLoading(false); }
  }, []);

  const loadSales = useCallback(async () => {
    try {
      const res = await API.get("sales/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setSales(raw);
    } catch (err) {
      console.error("Error loading sales for picker:", err);
    }
  }, []);

  useEffect(() => { load(); loadSales(); }, [load, loadSales]);
  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter]);  

  useEffect(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") list = list.filter(r => r.invoice_type === typeFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.invoice_number || "").toLowerCase().includes(q) ||
        (r.billed_to_name || "").toLowerCase().includes(q) ||
        (r.billed_to_phone || "").toLowerCase().includes(q) ||
        (r.sale_order_number || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, statusFilter,typeFilter, items]);

  const openOffcanvas = () => {
    const el = document.getElementById("invoice-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getOrCreateInstance(el)?.show();
  };
  const closeOffcanvas = () => {
    const el = document.getElementById("invoice-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getInstance(el)?.hide();
  };

  const handleOpenAdd = () => {
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
       invoice_type: item.invoice_type || "supply",
      sale: String(item.sale ?? ""),
      issue_date: item.issue_date || "",
      due_date: item.due_date || "",
      billed_to_name: item.billed_to_name || "",
      billed_to_phone: item.billed_to_phone || "",
      billed_to_email: item.billed_to_email || "",
      billed_to_address: item.billed_to_address || "",
      notes: item.notes || "",
      terms: item.terms || "",
      subtotal: String(item.subtotal ?? "0"),
discount_amount: String(item.discount_amount ?? "0"),
tax_amount: String(item.tax_amount ?? "0"),
amount_paid: String(item.amount_paid ?? "0"),
extra: item.extra_data || {},
    });
    setError("");
    openOffcanvas();
  };

  const handleOpenView = (item: any) => {
    setMode("view");
    setSelected(item);
    openOffcanvas();
  };

  const handleSave = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!form.issue_date) { setError("Issue date is required."); return; }

  const cfgNow = TYPE_CONFIG[form.invoice_type] ?? TYPE_CONFIG.supply;
  if (cfgNow.saleField === "required" && !form.sale) { setError("Please select a sale."); return; }
  const missing = cfgNow.extra.find(f => f.required && !form.extra[f.key]?.trim());
  if (missing) { setError(`${missing.label} is required.`); return; }

  setSaving(true);
  setError("");

  const { extra, ...rest } = form;
  const payload: any = { ...rest };
  if (payload.due_date === "") payload.due_date = null;
  payload.sale = payload.sale ? Number(payload.sale) : null;
  payload.extra_data = Object.fromEntries(cfgNow.extra.map(f => [f.key, extra[f.key] ?? ""]));

  if (payload.sale) {
    delete payload.subtotal;
    delete payload.discount_amount;
    delete payload.tax_amount;
    delete payload.amount_paid;
  }

  try {
    if (mode === "edit" && selected) {
      const { sale, ...editable } = payload;
      await API.patch(`sales-invoices/${selected.id}/`, editable);
    } else {
      await API.post("sales-invoices/", payload);
    }
    closeOffcanvas();
    load();
  } catch (err: any) {
    const data = err.response?.data;
    const msg =
      typeof data === "string" ? data
      : data?.message
      || (data && Object.values(data).flat().join(" "))
      || "Failed to save invoice.";
    setError(msg);
  } finally { setSaving(false); }
};

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this invoice?")) return;
    try { await API.delete(`sales-invoices/${id}/`); load(); }
    catch (err) { console.error("Delete failed:", err); }
  };

  const handleMarkIssued = async (id: number) => {
    try { await API.post(`sales-invoices/${id}/mark_issued/`, {}); load(); }
    catch (err: any) { alert(err.response?.data?.error || "Failed to mark issued."); }
  };

  const handleMarkPaid = async (id: number) => {
    if (!window.confirm("Mark this invoice as fully paid?")) return;
    try { await API.post(`sales-invoices/${id}/mark_paid/`, {}); load(); }
    catch (err: any) { alert(err.response?.data?.error || "Failed to mark paid."); }
  };

const activeFilterCount = [statusFilter !== "all", typeFilter !== "all"].filter(Boolean).length;
const cfg = TYPE_CONFIG[form.invoice_type] ?? TYPE_CONFIG.supply;
  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Action Bar */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Sales Invoices</h4>
            <p className="text-muted fs-13 mb-0">Issue, track and settle invoices for your sales.</p>
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
              <i className="ti ti-plus me-1" />New Invoice
            </button>
          </div>
        </div>

        {/* Tiles */}
        {!loading && items.length > 0 && (() => {
          const totalBilled = items.reduce((s, r) => s + Number(r.total_amount || 0), 0);
          const totalOutstanding = items.reduce((s, r) => s + Number(r.balance_due || 0), 0);
          const tiles = [
            { label: "Total Invoices", value: items.length,                                       icon: "ti-file-invoice",   bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Paid",           value: items.filter(r => r.status === "paid").length,       icon: "ti-circle-check",   bg: "bg-success-gradient-100", color: "text-success" },
            { label: "Overdue",        value: items.filter(r => r.status === "overdue").length,    icon: "ti-alert-circle",   bg: "bg-danger-gradient-100",  color: "text-danger" },
            { label: "Outstanding",    value: fmtMoney(totalOutstanding),                          icon: "ti-cash",           bg: "bg-warning-gradient-100", color: "text-warning" },
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

        {/* Table */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 300 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search invoice #, buyer, order #…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }}
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); }}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading invoices…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-file-invoice fs-1 mb-2" />
                <p className="fs-14 mb-0">{items.length === 0 ? "No invoices found." : "No results match your filters."}</p>
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
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(r => (
                      <tr key={r.id}>
                         <td>
                          <span className={
                            r.invoice_type === "credit"   ? "badge bg-danger-transparent text-danger" :
                            r.invoice_type === "purchase" ? "badge bg-info-transparent text-info" :
                                                            "badge bg-primary-transparent text-primary"
                          }>
                            {r.invoice_type_display || "Supply Invoice"}
                          </span>
                        </td>
                        <td className="fw-semibold text-dark text-nowrap">{r.invoice_number}</td>
                        <td className="text-muted text-nowrap">{fmtDate(r.issue_date)}</td>
                        <td className="text-muted text-nowrap">{r.due_date ? fmtDate(r.due_date) : "—"}</td>
                        <td>{r.billed_to_name || r.customer_name || <span className="text-muted">—</span>}</td>
                        <td className="fw-semibold">{fmtMoney(r.total_amount)}</td>
                        <td className={Number(r.balance_due) > 0 ? "text-danger fw-semibold" : "text-muted"}>
                          {fmtMoney(r.balance_due)}
                        </td>
                        <td>
                          <span className={`badge ${statusBadge(r.status)}`}>
                            {r.status_display || r.status}
                          </span>
                        </td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            {r.status === "draft" && (
                              <button className="btn btn-sm btn-icon btn-light" title="Issue" onClick={() => handleMarkIssued(r.id)}>
                                <i className="ti ti-send text-info" />
                              </button>
                            )}
                            {r.status !== "paid" && r.status !== "cancelled" && (
                              <button className="btn btn-sm btn-icon btn-light" title="Mark Paid" onClick={() => handleMarkPaid(r.id)}>
                                <i className="ti ti-circle-check text-success" />
                              </button>
                            )}
                            <button className="btn btn-sm btn-icon btn-light" title="View" onClick={() => handleOpenView(r)}>
                              <i className="ti ti-eye text-muted" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Edit" onClick={() => handleOpenEdit(r)}>
                              <i className="ti ti-edit text-primary" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Delete" onClick={() => handleDelete(r.id)}>
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

          {!loading && filtered.length > 0 && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = (page - 1) * pageSize + 1;
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> invoices</span>
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

      {/* Offcanvas */}
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="invoice-offcanvas" style={{ width: "500px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-16 fw-semibold">
            {mode === "add" && "New Sales Invoice"}
            {mode === "edit" && "Edit Invoice"}
            {mode === "view" && "Invoice Details"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

          {mode === "view" && selected ? (
            <InvoiceView item={selected} fmtDate={fmtDate} fmtMoney={fmtMoney} statusBadge={statusBadge} />
          ) : (
            <form id="invoice-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
              <SectionTitle icon="ti-file-invoice" title="Invoice Information" />
              <div className="row g-2">

                <Field className="col-md-12" label="Invoice Type *">
  <select className="form-select fs-13" required
    value={form.invoice_type}
    onChange={e => {
      const t = e.target.value;
      setForm({
        ...form,
        invoice_type: t,
        extra: {},
        sale: TYPE_CONFIG[t].saleField === "hidden" ? "" : form.sale,
      });
    }}>
    {INVOICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
  </select>
</Field>
                <Field className="col-md-12" label="Sale *">
                  <select className="form-select fs-13" disabled={mode === "edit"}
                    value={form.sale}
                    onChange={e => setForm({ ...form, sale: e.target.value })}>
                    <option value="">— Select a sale —</option>
                    {sales.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.order_number} · {s.customer_name || "Walk-in"} · {fmtMoney(s.total_amount)}
                      </option>
                    ))}
                  </select>
                  {mode === "edit" && (
                    <small className="text-muted fs-12">Sale cannot be changed after the invoice is created.</small>
                  )}
                </Field>

                <Field className="col-md-6" label="Issue Date *">
                  <input type="date" className="form-control fs-13" required
                    value={form.issue_date}
                    onChange={e => setForm({ ...form, issue_date: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Due Date">
                  <input type="date" className="form-control fs-13"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-user" title={cfg.partyTitle} />
              <div className="row g-2">
                <Field className="col-md-6" label="Name">
                  <input type="text" className="form-control fs-13"
                    value={form.billed_to_name}
                    onChange={e => setForm({ ...form, billed_to_name: e.target.value })} />
                </Field>
                {cfg.extra.length > 0 && (
  <>
    <SectionTitle icon="ti-list-details" title={cfg.detailsTitle} />
    <div className="row g-2">
      {cfg.extra.map(f => (
        <Field key={f.key}
          className={f.type === "textarea" ? "col-md-12" : "col-md-6"}
          label={f.label + (f.required ? " *" : "")}>
          {f.type === "textarea" ? (
            <textarea rows={2} className="form-control fs-13"
              value={form.extra[f.key] ?? ""}
              onChange={e => setForm({ ...form, extra: { ...form.extra, [f.key]: e.target.value } })} />
          ) : (
            <input type={f.type || "text"} className="form-control fs-13"
              value={form.extra[f.key] ?? ""}
              onChange={e => setForm({ ...form, extra: { ...form.extra, [f.key]: e.target.value } })} />
          )}
        </Field>
      ))}
    </div>
  </>
)}
{(cfg.saleField === "hidden" || !form.sale) && (
  <>
    <SectionTitle icon="ti-cash" title="Amounts" />
    <div className="row g-2">
      {([
        ["subtotal", "Subtotal"], ["discount_amount", "Discount"],
        ["tax_amount", "Tax"], ["amount_paid", "Amount paid"],
      ] as const).map(([k, label]) => (
        <Field key={k} className="col-md-6" label={label}>
          <input type="number" min={0} step="0.01" className="form-control fs-13"
            value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
        </Field>
      ))}
    </div>
    <div className="text-muted fs-12">Total = subtotal − discount + tax. Balance = total − amount paid.</div>
  </>
)}
                <Field className="col-md-6" label="Phone">
                  <input type="text" className="form-control fs-13"
                    value={form.billed_to_phone}
                    onChange={e => setForm({ ...form, billed_to_phone: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Email">
                  <input type="email" className="form-control fs-13"
                    value={form.billed_to_email}
                    onChange={e => setForm({ ...form, billed_to_email: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Address">
                  <input type="text" className="form-control fs-13"
                    value={form.billed_to_address}
                    onChange={e => setForm({ ...form, billed_to_address: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-notes" title="Notes & Terms" />
              <Field label="Notes">
                <textarea rows={2} className="form-control fs-13"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <Field label="Terms">
                <textarea rows={2} className="form-control fs-13"
                  placeholder="Payment terms, bank details, etc."
                  value={form.terms}
                  onChange={e => setForm({ ...form, terms: e.target.value })} />
              </Field>
            </form>
          )}
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="invoice-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
              {mode === "edit" ? "Update Invoice" : "Create Invoice"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="d-flex align-items-center gap-2 mt-1 pb-1 border-bottom">
      <i className={`ti ${icon} text-primary fs-15`} />
      <span className="fw-semibold fs-13 text-dark">{title}</span>
    </div>
  );
}
function Field({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="form-label fs-12 fw-medium text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
function ViewRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <label className="text-muted fs-12 fw-medium d-block">{label}</label>
      <span className="text-dark fs-13">{value || <span className="text-muted">—</span>}</span>
    </div>
  );
}
function InvoiceView({
  item, fmtDate, fmtMoney, statusBadge,
}: { item: any; fmtDate: (s?: string) => string; fmtMoney: (v: any) => string; statusBadge: (s: string) => string }) {
  return (
    <div className="d-flex flex-column gap-3 fs-13">
      <SectionTitle icon="ti-file-invoice" title="Invoice Information" />
      <div className="row g-3">
                <div className="col-12"><ViewRow label="INVOICE TYPE" value={item.invoice_type_display} /></div>
        <div className="col-6"><ViewRow label="INVOICE #" value={item.invoice_number} /></div>
        <div className="col-6">
          <ViewRow label="STATUS" value={<span className={`badge ${statusBadge(item.status)}`}>{item.status_display || item.status}</span>} />
        </div>
        <div className="col-6"><ViewRow label="ISSUE DATE" value={fmtDate(item.issue_date)} /></div>
        <div className="col-6"><ViewRow label="DUE DATE" value={item.due_date ? fmtDate(item.due_date) : ""} /></div>
        <div className="col-6"><ViewRow label="SALE ORDER #" value={item.sale_order_number} /></div>
        <div className="col-6"><ViewRow label="BRANCH" value={item.branch_name} /></div>
          {TYPE_CONFIG[item.invoice_type]?.extra.length > 0 && (
        <>
          <SectionTitle icon="ti-list-details" title={TYPE_CONFIG[item.invoice_type].detailsTitle} />
          <div className="row g-3">
            {TYPE_CONFIG[item.invoice_type].extra.map(f => (
              <div key={f.key} className="col-6">
                <ViewRow label={f.label.toUpperCase()}
                  value={f.type === "date" ? fmtDate(item.extra_data?.[f.key]) : item.extra_data?.[f.key]} />
              </div>
            ))}
          </div>
        </>
      )}

      </div>

      <SectionTitle icon="ti-user" title="Billed To" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="NAME" value={item.billed_to_name} /></div>
        <div className="col-6"><ViewRow label="PHONE" value={item.billed_to_phone} /></div>
        <div className="col-6"><ViewRow label="EMAIL" value={item.billed_to_email} /></div>
        <div className="col-12"><ViewRow label="ADDRESS" value={item.billed_to_address} /></div>
      </div>

      <SectionTitle icon="ti-cash" title="Amounts" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="SUBTOTAL" value={fmtMoney(item.subtotal)} /></div>
        <div className="col-6"><ViewRow label="DISCOUNT" value={fmtMoney(item.discount_amount)} /></div>
        <div className="col-6"><ViewRow label="TAX" value={fmtMoney(item.tax_amount)} /></div>
        <div className="col-6"><ViewRow label="TOTAL" value={<span className="fw-semibold">{fmtMoney(item.total_amount)}</span>} /></div>
        <div className="col-6"><ViewRow label="PAID" value={fmtMoney(item.amount_paid)} /></div>
        <div className="col-6"><ViewRow label="BALANCE DUE" value={<span className="text-danger fw-semibold">{fmtMoney(item.balance_due)}</span>} /></div>
      </div>

      <SectionTitle icon="ti-notes" title="Notes & Terms" />
      <ViewRow label="NOTES" value={item.notes} />
      <ViewRow label="TERMS" value={item.terms} />
    </div>
  );
}