import { useState, useEffect, useCallback } from "react";
import API from "../../services/api";

const CATEGORIES: Record<string, string> = {
  supplier: "Supplier",
  invoice: "Invoice",
  rent: "Rent",
  electricity: "Electricity",
  salaries: "Salaries",
  customs: "Customs",
  county_government: "County Government",
  water: "Water",
  other: "Other Payment",
};

const PAY_STATUS: Record<string, string> = { not_paid: "Not paid", partial: "Partially paid", paid: "Paid" };
const PAY_STATUS_CLS: Record<string, string> = {
  not_paid: "badge bg-danger-transparent text-danger",
  partial: "badge bg-warning-transparent text-warning",
  paid: "badge bg-success-transparent text-success",
};
const METHODS: Record<string, string> = {
  cash: "Cash", mpesa: "M-Pesa", bank_transfer: "Bank Transfer", cheque: "Cheque", card: "Card", other: "Other",
};
// Categories that cover a specific month
const PERIOD_CATEGORIES = new Set(["rent", "electricity", "water", "salaries"]);
// Categories that usually come with an invoice / bill number
const INVOICE_CATEGORIES = new Set(["supplier", "invoice", "customs", "county_government", "electricity", "water"]);

const money = (n: any) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const listOf = (res: any) => res.data?.results || (Array.isArray(res.data) ? res.data : []);

const emptyForm = {
  category: "supplier",employee: "",purchase_invoice: "", supplier: "", payee: "", branch: "", amount: "", payment_date: today(),
  period: "", method: "cash", reference: "", invoice_number: "", description: "",
};

export default function BusinessPayments() {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [employees, setEmployees] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params: any = {};
      if (search.trim()) params.search = search.trim();
      if (category) params.category = category;
      if (status) params.status = status;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const [list, st] = await Promise.all([
        API.get("business-payments/", { params: { ...params, page_size: 1000 } }),
        API.get("business-payments/stats/", { params }),
      ]);
      setRows(listOf(list));
      setStats(st.data);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else setError(err.response?.data?.error || err.response?.data?.detail || "Could not load payments.");
    } finally { setLoading(false); }
  }, [search, category, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, category, status, dateFrom, dateTo]);
  useEffect(() => {
    (async () => {
      try {
        const [s, b, e] = await Promise.all([
          API.get("suppliers/", { params: { is_active: "true", page_size: 500 } }),
          API.get("branches/"),
          API.get("employees/", { params: { status: "active", page_size: 1000 } }),
        ]);
        console.log("Suppliers, branches, employees:", s.data?.results?.length, b.data?.results?.length, e.data?.results?.length);
        setSuppliers(listOf(s)); setBranches(listOf(b)); setEmployees(listOf(e));
      } catch (e) { console.error(e); }
    })();
  }, []);

  function openNew() {
    
    setEditing(null); setForm({ ...emptyForm, payment_date: today() }); setFile(null);
    setFormError(""); setShow(true);
     setBillForm(null);
   
  }
  function openEdit(p: any) {
    setEditing(p);
    setBillForm(null);
    setForm({
      category: p.category, supplier: p.supplier ?? "", payee: p.payee || "", branch: p.branch ?? "",
      purchase_invoice: p.purchase_invoice ?? "",
            employee: employees.find((e: any) => e.full_name === p.payee)?.id ?? "",
      amount: p.amount, payment_date: p.payment_date, period: p.period ? p.period.slice(0, 7) : "",
      method: p.method, reference: p.reference || "", invoice_number: p.invoice_number || "",
      description: p.description || "",
    });
    setFile(null); setFormError(""); setShow(true);
  }

  const isSupplier = form.category === "supplier";
    const linked = form.category === "supplier" || form.category === "invoice";
  const [bills, setBills] = useState<any[]>([]);
  const [billForm, setBillForm] = useState<any>(null);   // null = "new bill" form hidden

  useEffect(() => {
    if (!show || !linked || !form.supplier) { setBills([]); return; }
    (async () => {
      try {
        const res = await API.get("business-payments/open_invoices/", {
          params: { supplier: form.supplier, include: editing?.purchase_invoice || "" },
        });
        setBills(res.data || []);
      } catch { setBills([]); }
    })();
  }, [show, linked, form.supplier, editing]);

  const selectedBill = bills.find(b => String(b.id) === String(form.purchase_invoice));

  async function addBill() {
    if (!(Number(billForm.amount) > 0)) return setFormError("Enter the bill amount.");
    try {
      const res = await API.post(`suppliers/${form.supplier}/add_bill/`, {
        supplier_ref: billForm.ref, amount: billForm.amount, due_date: billForm.due_date || null,
      });
      const b = res.data;
      setBills(list => [...list, {
        id: b.id, invoice_number: b.invoice_number, supplier_ref: b.extra_data?.supplier_ref || "",
        total_amount: b.total_amount, amount_paid: b.amount_paid, balance_due: b.balance_due,
      }]);
      setForm((f: any) => ({ ...f, purchase_invoice: String(b.id), amount: f.amount || String(b.balance_due) }));
      setBillForm(null); setFormError("");
    } catch (err: any) {
      setFormError(err.response?.data?.error || "Could not add this bill.");
    }
  }

  async function save() {
    setFormError("");
        if (isSupplier && !form.supplier) return setFormError("Select the supplier you are paying.");
    if (!isSupplier && !form.supplier && !form.payee.trim()) return setFormError("Enter who was paid.");
        if (form.category === "salaries" && !form.payee.trim()) return setFormError("Select the employee being paid.");
    if (!Number(form.amount) || Number(form.amount) <= 0) return setFormError("Enter an amount greater than zero.");
    if (!form.payment_date) return setFormError("Select the payment date.");

    const fd = new FormData();
    fd.append("category", form.category);
        fd.append("supplier", linked ? String(form.supplier || "") : "");
    fd.append("payee", linked && form.supplier ? "" : form.payee.trim());
    fd.append("purchase_invoice", linked && form.supplier ? String(form.purchase_invoice || "") : "");
    fd.append("branch", String(form.branch || ""));
    fd.append("amount", String(form.amount));
    fd.append("payment_date", form.payment_date);
    fd.append("period", PERIOD_CATEGORIES.has(form.category) && form.period ? `${form.period}-01` : "");
    fd.append("method", form.method);
    fd.append("reference", form.reference);
    fd.append("invoice_number", form.invoice_number);
    fd.append("description", form.description);
    if (file) fd.append("attachment", file);

    setSaving(true);
    try {
       const cfg = { headers: { "Content-Type": "multipart/form-data" } };
      if (editing) await API.patch(`business-payments/${editing.id}/`, fd,cfg);
      else await API.post("business-payments/", fd,cfg);
      setShow(false); load();
    } catch (err: any) {
      const d = err.response?.data;
      const first = d && typeof d === "object" ? Object.values(d)[0] : null;
      setFormError(d?.error || d?.detail || (Array.isArray(first) ? String(first[0]) : first ? String(first) : "Could not save this payment."));
    } finally { setSaving(false); }
  }

  async function cancelPayment(p: any) {
    const reason = window.prompt(`Why are you cancelling this ${CATEGORIES[p.category]} payment of ${money(p.amount)}?`);
    if (reason === null) return;
    if (!reason.trim()) return alert("A reason is required.");
    try {
      await API.post(`business-payments/${p.id}/cancel/`, { reason });
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || "Could not cancel this payment.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const filtersOn = !!(category || status || dateFrom || dateTo || search);

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Payments</h4>
            <p className="text-muted fs-13 mb-0">Suppliers, invoices, rent, utilities, salaries, customs and county payments.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              <i className="ti ti-plus me-1" />New Payment
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

        {/* Tiles */}
        {stats && (
          <div className="row g-3 mb-3">
            <div className="col-6 col-md-4 col-xl-2">
              <div className="card mb-0 shadow-none border h-100"><div className="card-body p-3">
                <p className="fw-medium mb-1 fs-12 text-muted">Total paid</p>
                <h6 className="mb-0 text-danger">{money(stats.total)}</h6>
                <small className="text-muted">{stats.count} payment{stats.count !== 1 ? "s" : ""}</small>
              </div></div>
            </div>
            {stats.by_category.slice(0, 5).map((c: any) => (
              <div key={c.category} className="col-6 col-md-4 col-xl-2">
                <div className="card mb-0 shadow-none border h-100"><div className="card-body p-3">
                  <p className="fw-medium mb-1 fs-12 text-muted">{c.label}</p>
                  <h6 className="mb-0">{money(c.total)}</h6>
                  <small className="text-muted">{c.count} payment{c.count !== 1 ? "s" : ""}</small>
                </div></div>
              </div>
            ))}
          </div>
        )}

        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input className="form-control border-start-0 ps-1 fs-13" placeholder="Search payee, ref, invoice…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 130 }} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
              {filtersOn && (
                <button className="btn btn-sm btn-outline-danger"
                  onClick={() => { setSearch(""); setCategory(""); setStatus(""); setDateFrom(""); setDateTo(""); }}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading && rows.length === 0 ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading payments…
              </div>
            ) : rows.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-cash-off fs-1 mb-2" />
                <p className="fs-14 mb-0">{filtersOn ? "No payments match your filters." : "No payments recorded yet."}</p>
              </div>
            ) : (
              <div className="table-responsive" style={{ opacity: loading ? 0.5 : 1 }}>
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th><th>Category</th><th>Paid to</th><th>Invoice / Ref</th>
                      <th>Period</th><th>Method</th><th className="text-end">Amount</th>
                      <th>Status</th><th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(p => {
                      const cancelled = p.status === "cancelled";
                      return (
                        <tr key={p.id} className={cancelled ? "text-muted" : ""}>
                          <td className="text-nowrap">{fmtDate(p.payment_date)}</td>
                          <td><span className="badge bg-primary-transparent text-primary">{p.category_display}</span></td>
                          <td className="text-nowrap">
                            <div className="fw-semibold">{p.supplier_name || p.payee}</div>
                            {p.description && <small className="text-muted">{p.description}</small>}
                            {p.purchase_invoice_number && (
  <div>
    <small className="text-muted me-1">Bill {p.purchase_invoice_number}</small>
    <span className={PAY_STATUS_CLS[p.invoice_payment_status]}>{PAY_STATUS[p.invoice_payment_status]}</span>
  </div>
)}
                          </td>
                          <td className="text-nowrap">
                            {p.invoice_number || "—"}
                            {p.reference && <div><small className="text-muted">{p.reference}</small></div>}
                          </td>
                          <td className="text-nowrap">
                            {p.period ? new Date(p.period + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td className="text-nowrap">{p.method_display}</td>
                          <td className={`text-end fw-semibold text-nowrap ${cancelled ? "text-decoration-line-through" : ""}`}>{money(p.amount)}</td>
                          <td>
                            <span className={`badge ${cancelled ? "bg-danger-transparent text-danger" : "bg-success-transparent text-success"}`}
                              title={p.cancel_reason || undefined}>{p.status_display}</span>
                          </td>
                          <td className="text-end text-nowrap">
                            {p.attachment_url && (
                              <a className="btn btn-sm btn-icon btn-outline-light me-1" href={p.attachment_url} target="_blank" rel="noreferrer" title="View attachment">
                                <i className="ti ti-paperclip" />
                              </a>
                            )}
                            {!cancelled && (
                              <>
                                <button className="btn btn-sm btn-icon btn-outline-light me-1" onClick={() => openEdit(p)} title="Edit">
                                  <i className="ti ti-edit" />
                                </button>
                                <button className="btn btn-sm btn-icon btn-outline-danger" onClick={() => cancelPayment(p)} title="Cancel">
                                  <i className="ti ti-ban" />
                                </button>
                              </>
                            )}
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
      </div>

      {/* ============ New / Edit offcanvas ============ */}
      {show && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={() => setShow(false)} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 420 }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">{editing ? "Edit Payment" : "New Payment"}</h5>
              <button type="button" className="btn-close" onClick={() => setShow(false)} />
            </div>
            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

             <div className="mb-3">
  <label className="form-label fs-13 fw-medium">Payment for</label>
  <select className="form-select" value={form.category}
    onChange={e => {
      const next = e.target.value;
      setForm((f: any) => {
        const switchingSalaries = next === "salaries" || f.category === "salaries";
        return {
          ...f,
          category: next,
          // clear the payee when moving to or from Salaries so a typed name
          // doesn't carry over into the employee dropdown (and vice versa)
          ...(switchingSalaries ? { payee: "", employee: "" } : {}),
        };
      });
    }}>
    {Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select>
</div>

            {linked && (
  <div className="mb-3">
    <label className="form-label fs-13 fw-medium">Supplier{!isSupplier && <span className="text-muted fw-normal"> (optional)</span>}</label>
    <select className="form-select" value={form.supplier}
      onChange={e => setForm((f: any) => ({ ...f, supplier: e.target.value, purchase_invoice: "" }))}>
      <option value="">{isSupplier ? "Select supplier…" : "Not a supplier — enter a name"}</option>
      {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  </div>
)}

{linked && form.supplier && (
  <div className="mb-3">
    <label className="form-label fs-13 fw-medium">Pay against bill</label>
    <select className="form-select" value={form.purchase_invoice}
      onChange={e => {
        const b = bills.find(x => String(x.id) === e.target.value);
        setForm((f: any) => ({ ...f, purchase_invoice: e.target.value, amount: b && !f.amount ? String(b.balance_due) : f.amount }));
      }}>
      <option value="">On account (no specific bill)</option>
      {bills.map(b => (
        <option key={b.id} value={b.id}>
          {b.invoice_number}{b.supplier_ref ? ` / ${b.supplier_ref}` : ""} — owing {money(b.balance_due)}
        </option>
      ))}
    </select>
    {selectedBill && (() => {
      const left = Number(selectedBill.balance_due) - (editing?.purchase_invoice === selectedBill.id ? -Number(editing.amount) : 0) - Number(form.amount || 0);
      return (
        <div className="form-text fs-12">
          Bill {money(selectedBill.total_amount)}, paid so far {money(selectedBill.amount_paid)}.
          After this payment: <strong>{left <= 0 ? "Paid in full" : `${money(left)} remaining (partially paid)`}</strong>
        </div>
      );
    })()}
    {billForm === null ? (
      <button type="button" className="btn btn-sm btn-link p-0 fs-12" onClick={() => setBillForm({ ref: "", amount: "", due_date: "" })}>
        + Record a new bill from this supplier
      </button>
    ) : (
      <div className="border rounded p-2 mt-2">
        <input className="form-control form-control-sm mb-2" placeholder="Supplier's invoice number"
          value={billForm.ref} onChange={e => setBillForm((b: any) => ({ ...b, ref: e.target.value }))} />
        <div className="d-flex gap-2 mb-2">
          <input type="number" min={0} step="0.01" className="form-control form-control-sm" placeholder="Bill amount"
            value={billForm.amount} onChange={e => setBillForm((b: any) => ({ ...b, amount: e.target.value }))} />
          <input type="date" className="form-control form-control-sm" title="Due date"
            value={billForm.due_date} onChange={e => setBillForm((b: any) => ({ ...b, due_date: e.target.value }))} />
        </div>
        <button type="button" className="btn btn-sm btn-primary me-2" onClick={addBill}>Add bill</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setBillForm(null)}>Cancel</button>
      </div>
    )}
  </div>
)}

{!(linked && form.supplier) && (
  form.category === "salaries" ? (
    <div className="mb-3">
      <label className="form-label fs-13 fw-medium">Employee</label>
      <select className="form-select"
        value={form.employee || (form.payee ? "current" : "")}
        onChange={e => {
          const emp = employees.find((x: any) => String(x.id) === e.target.value);
          if (!emp) return setForm((f: any) => ({ ...f, employee: "", payee: "" }));
          setForm((f: any) => ({
            ...f,
            employee: emp.id,
            payee: emp.full_name,
            amount: f.amount || (emp.basic_salary ? String(emp.basic_salary) : ""),
            branch: f.branch || emp.branch || "",
          }));
        }}>
        <option value="">Select employee…</option>
        {form.payee && !form.employee && <option value="current">{form.payee}</option>}
        {employees.map((e: any) => (
          <option key={e.id} value={e.id}>
            {e.full_name} ({e.employee_number}){e.position ? ` — ${e.position}` : ""}
          </option>
        ))}
      </select>
      {employees.find((e: any) => e.id === form.employee)?.basic_salary && (
        <div className="form-text fs-12">
          Basic salary on file: <strong>{money(employees.find((e: any) => e.id === form.employee).basic_salary)}</strong>
        </div>
      )}
    </div>
  ) : (
    <div className="mb-3">
      <label className="form-label fs-13 fw-medium">Paid to</label>
      <input className="form-control" value={form.payee}
        placeholder={
          form.category === "rent" ? "Landlord / agent"
          : form.category === "electricity" ? "e.g. Kenya Power"
          : form.category === "water" ? "Water company"
          : form.category === "customs" ? "e.g. KRA Customs"
          : form.category === "county_government" ? "County government"
          : "Name of payee"}
        onChange={e => setForm((f: any) => ({ ...f, payee: e.target.value }))} />
    </div>
  )
)}
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Amount (KES)</label>
                  <input type="number" min={0} step="0.01" className="form-control" value={form.amount}
                    onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Payment date</label>
                  <input type="date" max={today()} className="form-control" value={form.payment_date}
                    onChange={e => setForm((f: any) => ({ ...f, payment_date: e.target.value }))} />
                </div>
              </div>

              {PERIOD_CATEGORIES.has(form.category) && (
                <div className="mb-3">
                  <label className="form-label fs-13 fw-medium">For month</label>
                  <input type="month" className="form-control" value={form.period}
                    onChange={e => setForm((f: any) => ({ ...f, period: e.target.value }))} />
                </div>
              )}

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Method</label>
                  <select className="form-select" value={form.method}
                    onChange={e => setForm((f: any) => ({ ...f, method: e.target.value }))}>
                    {Object.entries(METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Reference</label>
                  <input className="form-control" value={form.reference} placeholder="M-Pesa / bank ref"
                    onChange={e => setForm((f: any) => ({ ...f, reference: e.target.value }))} />
                </div>
              </div>

              {INVOICE_CATEGORIES.has(form.category) && (
                <div className="mb-3">
                  <label className="form-label fs-13 fw-medium">Invoice / bill number</label>
                  <input className="form-control" value={form.invoice_number}
                    onChange={e => setForm((f: any) => ({ ...f, invoice_number: e.target.value }))} />
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Branch <span className="text-muted fw-normal">(optional)</span></label>
                <select className="form-select" value={form.branch}
                  onChange={e => setForm((f: any) => ({ ...f, branch: e.target.value }))}>
                  <option value="">All / not branch-specific</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Description</label>
                <textarea className="form-control" rows={2} value={form.description}
                  onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Receipt / attachment <span className="text-muted fw-normal">(optional)</span></label>
                <input type="file" className="form-control" accept="image/*,.pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShow(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {editing ? "Save Changes" : "Record Payment"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}