import { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../services/api";
import { showSuccess, showError, showWarning, showConfirm } from "../../components/alerts/Alerts";

// ── Config ───────────────────────────────────────────────────────────────────
const EARNINGS: [string, string][] = [
  ["basic_salary", "Basic salary"],
  ["allowances", "Allowances"],
  ["overtime", "Overtime"],
  ["bonus", "Bonus"],
];
const DEDUCTIONS: [string, string][] = [
  ["paye", "PAYE"],
  ["nssf", "NSSF"],
  ["health_insurance", "SHIF / NHIF"],
  ["housing_levy", "Housing levy"],
  ["advance_recovery", "Advance recovery"],
  ["other_deductions", "Other deductions"],
];
const MONEY_KEYS = [...EARNINGS, ...DEDUCTIONS].map(([k]) => k);

// Keep in sync with SalaryPayment.Method on the backend
const METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map(m => [m.value, m.label]));

const STATUS_CLS: Record<string, string> = {
  draft: "badge bg-warning-transparent text-warning",
  paid: "badge bg-success-transparent text-success",
  cancelled: "badge bg-secondary-transparent text-secondary",
};
const STATUS_LABEL: Record<string, string> = { draft: "Draft", paid: "Paid", cancelled: "Cancelled" };

// ── Helpers ──────────────────────────────────────────────────────────────────
const num = (v: any) => parseFloat(v) || 0;

function fmtMoney(v: any) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n == null || isNaN(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function localMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function localToday() {
  const d = new Date();
  return `${localMonth()}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function extractError(err: any, fallback: string) {
  const data = err.response?.data;
  if (err.response?.status === 403) return "Only administrators can access salary records.";
  if (!data || typeof data === "string") return fallback;
  if (data.detail || data.error) return data.detail || data.error;
  const field = Object.keys(data)[0];
  const msg = Array.isArray(data[field]) ? data[field][0] : data[field];
  if (!field) return fallback;
  return field === "non_field_errors" ? msg : `${field}: ${msg}`;
}
// Plain confirmation. Unlike showConfirm, it shows no "Deleted!" toast afterwards.
const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function printPayslip(r: any) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) {
    showWarning("Allow pop-ups for this site to print the payslip.", "Pop-up blocked");
    return;
  }
  const rows = (items: [string, string][]) =>
    items
      .filter(([k]) => num(r[k]) > 0 || k === "basic_salary")
      .map(([k, label]) => `<tr><td>${label}</td><td class="r">${fmtMoney(r[k])}</td></tr>`)
      .join("");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslip - ${esc(r.employee_name)} - ${esc(r.period_label)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:32px;font-size:13px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
  .meta{display:flex;justify-content:space-between;gap:24px;margin-top:12px}
  .meta div{line-height:1.7}
  table{width:100%;border-collapse:collapse} td{padding:5px 0} .r{text-align:right}
  .tot td{border-top:1px solid #999;font-weight:bold;padding-top:7px}
  .net{margin-top:22px;padding:12px 14px;border:2px solid #222;display:flex;justify-content:space-between;font-size:16px;font-weight:bold}
  .muted{color:#666} .sig{margin-top:56px;display:flex;justify-content:space-between}
  .sig div{width:44%;border-top:1px solid #222;padding-top:6px}
</style></head><body>
<h1>Payslip</h1>
<div class="muted">${esc(r.period_label)}</div>
<div class="meta">
  <div><strong>${esc(r.employee_name)}</strong><br>${esc(r.employee_number)}<br>${esc(r.position)}${r.branch_name ? "<br>" + esc(r.branch_name) : ""}</div>
  <div style="text-align:right">Status: ${esc(STATUS_LABEL[r.status] || r.status)}<br>
  ${r.status === "paid" ? `Paid on: ${esc(fmtDate(r.paid_on))}<br>Method: ${esc(METHOD_LABEL[r.payment_method] || r.payment_method)}${r.reference ? "<br>Ref: " + esc(r.reference) : ""}` : ""}</div>
</div>
<h2>Earnings</h2>
<table>${rows(EARNINGS)}<tr class="tot"><td>Gross pay</td><td class="r">${fmtMoney(r.gross_pay)}</td></tr></table>
<h2>Deductions</h2>
<table>${rows(DEDUCTIONS) || '<tr><td class="muted">None</td><td></td></tr>'}<tr class="tot"><td>Total deductions</td><td class="r">${fmtMoney(r.total_deductions)}</td></tr></table>
<div class="net"><span>Net pay</span><span>KES ${fmtMoney(r.net_pay)}</span></div>
<div class="sig"><div>Employer signature</div><div>Employee signature</div></div>
<script>window.onload=function(){window.print();}</script>
</body></html>`);
  w.document.close();
}

const emptyForm: Record<string, string> = {
  employee: "",
  basic_salary: "",
  allowances: "0",
  overtime: "0",
  bonus: "0",
  paye: "0",
  nssf: "0",
  health_insurance: "0",
  housing_levy: "0",
  advance_recovery: "0",
  other_deductions: "0",
  notes: "",
};

type Mode = "add" | "edit" | "view" | "pay";

// ── Component ────────────────────────────────────────────────────────────────
export default function SalariesList() {
  const [month, setMonth] = useState(localMonth());
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Offcanvas
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [payForm, setPayForm] = useState({ payment_method: "bank_transfer", reference: "", paid_on: localToday() });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("salary-payments/", { params: { period: month, page_size: 1000 } });
      setRecords(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else if (err.response?.status === 403) showError("Only administrators can access salary records.", "Access Denied");
      else console.error("Error loading salaries:", err);
    } finally {
      setLoading(false);
    }
  }, [month]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await API.get("employees/", { params: { page_size: 1000 } });
      setEmployees(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error("Error loading employees:", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.employee_name || "").toLowerCase().includes(q) ||
        (r.employee_number || "").toLowerCase().includes(q) ||
        (r.reference || "").toLowerCase().includes(q)
      );
    });
  }, [records, search, statusFilter]);

  const live = useMemo(() => records.filter(r => r.status !== "cancelled"), [records]);
  const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + num(r[key]), 0);
  const paidRows = live.filter(r => r.status === "paid");
  const draftRows = live.filter(r => r.status === "draft");

  // Active employees who don't have a live record this month yet
  const availableEmployees = useMemo(() => {
    const taken = new Set(live.map(r => r.employee));
    return employees.filter(e => e.status === "active" && !taken.has(e.id));
  }, [employees, live]);

  const gross = EARNINGS.reduce((s, [k]) => s + num(form[k]), 0);
  const deductions = DEDUCTIONS.reduce((s, [k]) => s + num(form[k]), 0);
  const net = gross - deductions;

  // ── Offcanvas handlers ─────────────────────────────────────────────────────
  function openAdd() {
    setMode("add"); setSelected(null); setForm(emptyForm); setFormError("");
    setShowOffcanvas(true);
  }
  function openEdit(r: any) {
    setMode("edit"); setSelected(r); setFormError("");
    const f: Record<string, string> = { ...emptyForm, employee: String(r.employee), notes: r.notes ?? "" };
    MONEY_KEYS.forEach(k => { f[k] = String(r[k] ?? "0"); });
    setForm(f);
    setShowOffcanvas(true);
  }
  function openView(r: any) {
    setMode("view"); setSelected(r); setFormError("");
    setShowOffcanvas(true);
  }
  function openPay(r: any) {
    setMode("pay"); setSelected(r); setFormError("");
    setPayForm({ payment_method: "bank_transfer", reference: "", paid_on: localToday() });
    setShowOffcanvas(true);
  }
  function closeOffcanvas() { setShowOffcanvas(false); }

  function onEmployeeChange(id: string) {
    const emp = employees.find(e => String(e.id) === id);
    setForm(f => ({
      ...f,
      employee: id,
      basic_salary: emp?.basic_salary != null ? String(emp.basic_salary) : "",
    }));
  }

   async function handleGenerate() {
    const ok = await showConfirm(
      `Generate draft payslips for ${monthLabel(month)}?\n\n` +
        `A draft is created for every active employee with a basic salary. ` +
        `Employees who already have a record that month are skipped.`
    );
    if (!ok) return;

    setGenerating(true);
    try {
      const res = await API.post("salary-payments/generate/", { period: month });
      const { created, skipped } = res.data;
      if (created > 0) {
        showSuccess(
          `${created} draft payslip${created !== 1 ? "s" : ""} created` +
            (skipped?.length ? `, ${skipped.length} skipped.` : "."),
          "Payroll Generated"
        );
      } else {
        showWarning(
          skipped?.length
            ? "Nobody was added: every eligible employee already has a record for this month."
            : "No active employees with a basic salary were found. Set a basic salary on the employee first.",
          "Nothing to Generate"
        );
      }
      load();
    } catch (err: any) {
      showError(extractError(err, "Could not generate payroll."), "Generate Failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (mode === "add" && !form.employee) return setFormError("Please select an employee.");
    if (form.basic_salary === "" || num(form.basic_salary) < 0) return setFormError("Enter a valid basic salary.");
    if (MONEY_KEYS.some(k => num(form[k]) < 0)) return setFormError("Amounts cannot be negative.");
    if (net < 0) return setFormError("Deductions exceed gross pay. Net pay cannot be negative.");

    const payload: Record<string, any> = { period: `${month}-01`, notes: form.notes };
    MONEY_KEYS.forEach(k => { payload[k] = form[k] === "" ? "0" : form[k]; });
    if (mode === "add") payload.employee = Number(form.employee);

    setSaving(true);
    try {
      if (mode === "edit" && selected) {
        await API.patch(`salary-payments/${selected.id}/`, payload);
        showSuccess("Salary record updated.", "Record Updated");
      } else {
        await API.post("salary-payments/", payload);
        showSuccess("Draft payslip created.", "Record Added");
      }
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not save this record. Please try again.");
      setFormError(msg);
      showError(msg, "Save Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setFormError("");
    if (!payForm.paid_on) return setFormError("Choose the payment date.");
    if (payForm.payment_method !== "cash" && !payForm.reference.trim()) {
      const ok = await showConfirm(
        "No payment reference was entered. Continue without one?",
        "Missing reference", "Yes, continue", "Go back"
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      await API.post(`salary-payments/${selected.id}/mark_paid/`, payForm);
      showSuccess(`${selected.employee_name} was marked as paid.`, "Salary Paid");
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not mark this salary as paid.");
      setFormError(msg);
      showError(msg, "Payment Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(r: any) {
    const wasPaid = r.status === "paid";
    const ok = await showConfirm(
      wasPaid
        ? `"${r.employee_name}" was already PAID for ${r.period_label}. Cancelling only voids the record here; it does not reverse the money paid out.`
        : `Cancel the draft payslip for "${r.employee_name}"?`,
      "Cancel this salary record?", "Yes, cancel it", "Keep it"
    );
    if (!ok) return;
    const reason = window.prompt("Reason for cancelling (optional):");
    if (reason === null) return;

    setBusyId(r.id);
    try {
      await API.post(`salary-payments/${r.id}/cancel/`, { reason });
      showSuccess("The salary record was cancelled.", "Record Cancelled");
      if (selected?.id === r.id) setShowOffcanvas(false);
      load();
    } catch (err: any) {
      showError(extractError(err, "Could not cancel this record."), "Cancel Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(r: any) {
    const ok = await showConfirm(
      `Delete the draft payslip for "${r.employee_name}"? This cannot be undone.`,
      "Delete this draft?", "Yes, delete it", "Cancel"
    );
    if (!ok) return;
    setBusyId(r.id);
    try {
      await API.delete(`salary-payments/${r.id}/`);
      setRecords(prev => prev.filter(x => x.id !== r.id));
      if (selected?.id === r.id) setShowOffcanvas(false);
    } catch (err: any) {
      showError(extractError(err, "Could not delete this record."), "Delete Failed");
    } finally {
      setBusyId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const tiles = [
    { label: "On payroll", value: live.length, color: "text-primary", icon: "ti-users" },
    { label: "Gross pay", value: fmtMoney(sum(live, "gross_pay")), color: "text-dark", icon: "ti-cash" },
    { label: "Deductions", value: fmtMoney(sum(live, "total_deductions")), color: "text-danger", icon: "ti-receipt-tax" },
    { label: "Net payable", value: fmtMoney(sum(live, "net_pay")), color: "text-primary", icon: "ti-wallet" },
    { label: `Paid (${paidRows.length})`, value: fmtMoney(sum(paidRows, "net_pay")), color: "text-success", icon: "ti-circle-check" },
    { label: `Pending (${draftRows.length})`, value: fmtMoney(sum(draftRows, "net_pay")), color: "text-warning", icon: "ti-clock" },
  ];

  const moneyInput = (key: string, label: string) => (
    <div className="col-6" key={key}>
      <label className="form-label fs-13 fw-medium mb-1">{label}</label>
      <input
        type="number" min={0} step="0.01" className="form-control fs-13"
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Salaries</h4>
            <p className="text-muted fs-13 mb-0">Monthly payroll for {monthLabel(month)}.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <input
              type="month" className="form-control form-control-sm fs-13" style={{ width: 160 }}
              value={month} max={localMonth()}
              onChange={e => e.target.value && setMonth(e.target.value)}
            />
            <button className="btn btn-outline-secondary btn-sm" onClick={() => load()} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-primary btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating
                ? <span className="spinner-border spinner-border-sm me-1" />
                : <i className="ti ti-wand me-1" />}
              Generate payroll
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <i className="ti ti-plus me-1" />Add salary
            </button>
          </div>
        </div>

        {/* Stats */}
        {!loading && records.length > 0 && (
          <div className="row g-3 mb-4">
            {tiles.map(s => (
              <div key={s.label} className="col-6 col-md-4 col-xl-2">
                <div className="card mb-0 shadow-none border">
                  <div className="card-body p-3">
                    <p className="fw-medium mb-1 fs-13">{s.label}</p>
                    <h5 className={`mb-0 ${s.color}`}>{s.value}</h5>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 280 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input
                type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search name, number, reference…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
            <select
              className="form-select form-select-sm fs-13" style={{ width: 160 }}
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading salaries…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-cash-off fs-1 mb-2" />
                <p className="fs-14 mb-2">
                  {records.length === 0
                    ? `No salary records for ${monthLabel(month)} yet.`
                    : "No results match your filters."}
                </p>
                {records.length === 0 && (
                  <button className="btn btn-sm btn-outline-primary" onClick={handleGenerate} disabled={generating}>
                    Generate payroll for {monthLabel(month)}
                  </button>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Employee</th>
                      <th>Position</th>
                      <th className="text-end">Gross</th>
                      <th className="text-end">Deductions</th>
                      <th className="text-end">Net pay</th>
                      <th>Status</th>
                      <th>Paid on</th>
                      <th className="text-end pe-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const busy = busyId === r.id;
                      const isDraft = r.status === "draft";
                      return (
                        <tr key={r.id} className={r.status === "cancelled" ? "text-muted" : ""}>
                          <td className="ps-3 text-nowrap">
                            <div className="fw-semibold text-dark">{r.employee_name}</div>
                            <div className="fs-11 text-muted">{r.employee_number}{r.branch_name ? ` · ${r.branch_name}` : ""}</div>
                          </td>
                          <td className="text-nowrap">{r.position || "—"}</td>
                          <td className="text-end text-nowrap">{fmtMoney(r.gross_pay)}</td>
                          <td className="text-end text-nowrap">{fmtMoney(r.total_deductions)}</td>
                          <td className="text-end text-nowrap fw-semibold">{fmtMoney(r.net_pay)}</td>
                          <td><span className={STATUS_CLS[r.status]}>{STATUS_LABEL[r.status] || r.status}</span></td>
                          <td className="text-nowrap text-muted">{fmtDate(r.paid_on)}</td>
                          <td className="text-end pe-3">
                            <div className="d-inline-flex gap-1">
                              <button className="btn btn-sm btn-outline-info py-1 px-2 fs-11" onClick={() => openView(r)}>
                                <i className="ti ti-eye me-1" />View
                              </button>
                              {isDraft && (
                                <>
                                  <button className="btn btn-sm btn-outline-primary py-1 px-2 fs-11" onClick={() => openEdit(r)}>
                                    <i className="ti ti-edit me-1" />Edit
                                  </button>
                                  <button className="btn btn-sm btn-success py-1 px-2 fs-11" onClick={() => openPay(r)}>
                                    <i className="ti ti-check me-1" />Pay
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={() => handleDelete(r)} disabled={busy}>
                                    {busy ? <span className="spinner-border spinner-border-sm" /> : <i className="ti ti-trash" />}
                                  </button>
                                </>
                              )}
                              {r.status === "paid" && (
                                <>
                                  <button className="btn btn-sm btn-outline-secondary py-1 px-2 fs-11" onClick={() => printPayslip(r)}>
                                    <i className="ti ti-printer me-1" />Payslip
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={() => handleCancel(r)} disabled={busy}>
                                    {busy ? <span className="spinner-border spinner-border-sm" /> : "Cancel"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="table-light fw-semibold">
                    <tr>
                      <td className="ps-3" colSpan={2}>Total (excluding cancelled)</td>
                      <td className="text-end">{fmtMoney(sum(filtered.filter(r => r.status !== "cancelled"), "gross_pay"))}</td>
                      <td className="text-end">{fmtMoney(sum(filtered.filter(r => r.status !== "cancelled"), "total_deductions"))}</td>
                      <td className="text-end">{fmtMoney(sum(filtered.filter(r => r.status !== "cancelled"), "net_pay"))}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ Offcanvas: add / edit / view / pay ============ */}
      {showOffcanvas && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeOffcanvas} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 460 }} tabIndex={-1}>
            <div className="offcanvas-header bg-primary text-white py-3">
              <h5 className="offcanvas-title text-white fs-15 fw-semibold">
                {mode === "add" && "Add Salary"}
                {mode === "edit" && "Edit Draft Payslip"}
                {mode === "view" && "Payslip Details"}
                {mode === "pay" && "Mark as Paid"}
              </h5>
              <button type="button" className="btn-close btn-close-white" onClick={closeOffcanvas} />
            </div>

            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              {/* ---------- VIEW ---------- */}
              {mode === "view" && selected && (
                <div className="d-flex flex-column gap-3 fs-13">
                  <div>
                    <div className="fw-semibold text-dark fs-15">{selected.employee_name}</div>
                    <div className="text-muted">
                      {selected.employee_number} · {selected.position || "—"}{selected.branch_name ? ` · ${selected.branch_name}` : ""}
                    </div>
                    <div className="mt-1">
                      {selected.period_label}{" "}
                      <span className={STATUS_CLS[selected.status]}>{STATUS_LABEL[selected.status]}</span>
                    </div>
                  </div>

                  <table className="table table-sm mb-0">
                    <tbody>
                      <tr className="table-light"><th colSpan={2}>Earnings</th></tr>
                      {EARNINGS.map(([k, label]) => (
                        <tr key={k}><td>{label}</td><td className="text-end">{fmtMoney(selected[k])}</td></tr>
                      ))}
                      <tr className="fw-semibold"><td>Gross pay</td><td className="text-end">{fmtMoney(selected.gross_pay)}</td></tr>
                      <tr className="table-light"><th colSpan={2}>Deductions</th></tr>
                      {DEDUCTIONS.map(([k, label]) => (
                        <tr key={k}><td>{label}</td><td className="text-end">{fmtMoney(selected[k])}</td></tr>
                      ))}
                      <tr className="fw-semibold"><td>Total deductions</td><td className="text-end">{fmtMoney(selected.total_deductions)}</td></tr>
                      <tr className="table-primary fw-bold fs-14"><td>Net pay</td><td className="text-end">{fmtMoney(selected.net_pay)}</td></tr>
                    </tbody>
                  </table>

                  {selected.status === "paid" && (
                    <div>
                      <label className="text-muted fs-12 fw-medium d-block mb-1">PAYMENT</label>
                      <div>{METHOD_LABEL[selected.payment_method] || selected.payment_method} · {fmtDate(selected.paid_on)}</div>
                      {selected.reference && <div className="text-muted">Ref: {selected.reference}</div>}
                      {selected.paid_by_name && <div className="text-muted">Paid by {selected.paid_by_name}</div>}
                    </div>
                  )}
                  {selected.notes && (
                    <div>
                      <label className="text-muted fs-12 fw-medium d-block mb-1">NOTES</label>
                      <span style={{ whiteSpace: "pre-line" }}>{selected.notes}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ---------- PAY ---------- */}
              {mode === "pay" && selected && (
                <form id="pay-form" onSubmit={handleMarkPaid} className="d-flex flex-column gap-3">
                  <div className="border rounded p-3">
                    <div className="fw-semibold text-dark">{selected.employee_name}</div>
                    <div className="text-muted fs-12">{selected.period_label}</div>
                    <div className="fs-4 fw-bold text-primary mt-1">{fmtMoney(selected.net_pay)}</div>
                    {(selected.bank_name || selected.bank_account) && (
                      <div className="fs-12 text-muted mt-1">
                        {selected.bank_name} {selected.bank_account}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Payment method <span className="text-danger">*</span></label>
                    <select
                      className="form-select fs-13" value={payForm.payment_method}
                      onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                    >
                      {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Reference</label>
                    <input
                      type="text" className="form-control fs-13" placeholder="M-Pesa code, bank reference, cheque number"
                      value={payForm.reference}
                      onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Paid on <span className="text-danger">*</span></label>
                    <input
                      type="date" className="form-control fs-13" value={payForm.paid_on} max={localToday()}
                      onChange={e => setPayForm(f => ({ ...f, paid_on: e.target.value }))}
                    />
                  </div>
                  <div className="alert alert-warning fs-12 py-2 mb-0">
                    <i className="ti ti-lock me-1" />
                    Once paid, this record is locked and can no longer be edited or deleted.
                  </div>
                </form>
              )}

              {/* ---------- ADD / EDIT ---------- */}
              {(mode === "add" || mode === "edit") && (
                <form id="salary-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Employee <span className="text-danger">*</span></label>
                    {mode === "edit" && selected ? (
                      <input className="form-control fs-13" disabled value={`${selected.employee_name} (${selected.employee_number})`} />
                    ) : (
                      <>
                        <select
                          className="form-select fs-13" value={form.employee}
                          onChange={e => onEmployeeChange(e.target.value)}
                        >
                          <option value="">Select employee…</option>
                          {availableEmployees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.full_name || `${emp.first_name} ${emp.last_name}`} ({emp.employee_number})
                            </option>
                          ))}
                        </select>
                        <div className="fs-11 text-muted mt-1">
                          Showing active employees without a salary record for {monthLabel(month)}.
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <div className="fs-12 fw-semibold text-uppercase text-muted mb-2">Earnings</div>
                    <div className="row g-2">{EARNINGS.map(([k, label]) => moneyInput(k, label))}</div>
                  </div>

                  <div>
                    <div className="fs-12 fw-semibold text-uppercase text-muted mb-1">Deductions</div>
                    <div className="fs-11 text-muted mb-2">Enter the amounts for this month. They are not calculated automatically.</div>
                    <div className="row g-2">{DEDUCTIONS.map(([k, label]) => moneyInput(k, label))}</div>
                  </div>

                  <div className={`border rounded p-3 ${net < 0 ? "border-danger" : ""}`}>
                    <div className="d-flex justify-content-between fs-13"><span>Gross pay</span><span>{fmtMoney(gross)}</span></div>
                    <div className="d-flex justify-content-between fs-13"><span>Total deductions</span><span>{fmtMoney(deductions)}</span></div>
                    <div className={`d-flex justify-content-between fw-bold fs-15 mt-1 ${net < 0 ? "text-danger" : "text-primary"}`}>
                      <span>Net pay</span><span>{fmtMoney(net)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Notes</label>
                    <textarea
                      className="form-control fs-13" rows={2} placeholder="Optional"
                      value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </form>
              )}
            </div>

            {/* ---------- Footer ---------- */}
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2 flex-wrap">
              <button type="button" className="btn btn-sm btn-light border" onClick={closeOffcanvas} disabled={saving}>
                {mode === "view" ? "Close" : "Cancel"}
              </button>

              {mode === "view" && selected && (
                <>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => printPayslip(selected)}>
                    <i className="ti ti-printer me-1" />Print payslip
                  </button>
                  {selected.status === "draft" && (
                    <>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(selected)}>
                        <i className="ti ti-edit me-1" />Edit
                      </button>
                      <button className="btn btn-sm btn-success" onClick={() => openPay(selected)}>
                        <i className="ti ti-check me-1" />Pay
                      </button>
                    </>
                  )}
                </>
              )}

              {(mode === "add" || mode === "edit") && (
                <button type="submit" form="salary-form" className="btn btn-sm btn-primary px-3" disabled={saving || net < 0}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  {mode === "edit" ? "Update draft" : "Save draft"}
                </button>
              )}

              {mode === "pay" && (
                <button type="submit" form="pay-form" className="btn btn-sm btn-success px-3" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  Confirm payment
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
