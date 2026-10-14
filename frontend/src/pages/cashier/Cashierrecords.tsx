import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";
import { useBranchAccess } from "../../hooks/useBranchAccess";

const CATEGORIES: Record<string, string> = {
  transport: "Transport",
  meals: "Meals & Refreshments",
  cleaning: "Cleaning Supplies",
  stationery: "Stationery & Packaging",
  utilities: "Airtime / Utilities",
  repairs: "Repairs & Maintenance",
  other: "Other",
};

const EXPENSE_STATUS_CLS: Record<string, string> = {
  pending: "badge bg-warning-transparent text-warning",
  approved: "badge bg-success-transparent text-success",
  rejected: "badge bg-danger-transparent text-danger",
};

const SALE_STATUS_CLS: Record<string, string> = {
  completed: "badge bg-success-transparent text-success",
  pending: "badge bg-warning-transparent text-warning",
  cancelled: "badge bg-danger-transparent text-danger",
  refunded: "badge bg-info-transparent text-info",
};

const money = (n: any) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDateTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

function presetRange(preset: string): [string, string] {
  const now = new Date();
  if (preset === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
    return [iso(start), iso(now)];
  }
  if (preset === "month") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
  return [iso(now), iso(now)];
}

// Normalise a DRF error payload to one readable line.
function errorMessage(err: any, fallback = "Something went wrong. Please try again.") {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  const pick = (v: any) => (Array.isArray(v) ? v[0] : v);
  if (data.error || data.detail) return String(pick(data.error || data.detail));
  const first = Object.entries(data)[0] as [string, any];
  return first ? `${first[0]}: ${pick(first[1])}` : fallback;
}

function download(rows: any[][], name: string, kind: "csv" | "xlsx") {
  if (kind === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Records");
    XLSX.writeFile(wb, `${name}_${iso(new Date())}.xlsx`);
    return;
  }
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${name}_${iso(new Date())}.csv`;
  a.click();
}

const emptyForm = {
  category: "transport",
  description: "",
  amount: "",
  expense_date: iso(new Date()),
  receipt_number: "",
  branch: "",
};
const emptyDeposit = {
  amount: "",
  deposit_date: iso(new Date()),
  deposited_by: "",
  branch: "",
};

export default function CashierRecords() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);

  const [tab, setTab] = useState<"sales" | "expenses" | "deposits">("sales");
  const [preset, setPreset] = useState("today");
  const [[dateFrom, dateTo], setRange] = useState<[string, string]>(presetRange("today"));
  const [cashier, setCashier] = useState("");
  const [search, setSearch] = useState("");
  const [expenseStatus, setExpenseStatus] = useState("all");
  const { branches: accessBranches, isHO, userBranchId } = useBranchAccess();

  // Deposits
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<number | "">("");
  const [users, setUsers] = useState<any[]>([]);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [editingDepositId, setEditingDepositId] = useState<number | null>(null);
  const [depositForm, setDepositForm] = useState<any>(emptyDeposit);
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositError, setDepositError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Expense form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete / reject dialogs
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [actionError, setActionError] = useState("");

  const isAdmin = !!data?.is_admin;
  const canPickBranch = isHO || isAdmin; // sees all branches; everyone else is locked to their own

  const loadDeposits = useCallback(async () => {
    setDepositsLoading(true);
    try {
      const params: any = { date_from: dateFrom, date_to: dateTo, page_size: 1000 };
      const b = canPickBranch ? branchFilter : userBranchId;
      if (b) params.branch = b;
      const res = await API.get("deposits/", { params });
      setDeposits(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error("Error loading deposits:", err);
    } finally {
      setDepositsLoading(false);
    }
  }, [dateFrom, dateTo, branchFilter, canPickBranch, userBranchId]);

  useEffect(() => { loadDeposits(); }, [loadDeposits]);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("users/");
        setUsers(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
      } catch (err) { console.error("Error loading users:", err); }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { date_from: dateFrom, date_to: dateTo };
      if (cashier) params.cashier = cashier;
      const res = await API.get("cashier-records/", { params });
      setData(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading cashier records:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, cashier]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, search, expenseStatus, dateFrom, dateTo, cashier, branchFilter]);
  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("branches/");
        setBranches(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
      } catch (err) { console.error("Error loading branches:", err); }
    })();
  }, []);

  function applyPreset(p: string) {
    setPreset(p);
    setRange(presetRange(p));
  }

  // ── Filtered rows ───────────────────────────────────────────────────────
  const sales: any[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.sales || []).filter((s: any) =>
      !q ||
      (s.order_number || "").toLowerCase().includes(q) ||
      (s.customer_name || "").toLowerCase().includes(q) ||
      (s.cashier_name || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const expenses: any[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.expenses || []).filter((e: any) =>
      (expenseStatus === "all" || e.status === expenseStatus) &&
      (!q ||
        (e.description || "").toLowerCase().includes(q) ||
        (e.receipt_number || "").toLowerCase().includes(q) ||
        (e.cashier_name || "").toLowerCase().includes(q))
    );
  }, [data, search, expenseStatus]);

  const depositRows: any[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deposits.filter((d: any) =>
      !q ||
      (d.deposited_by_name || "").toLowerCase().includes(q) ||
      (d.branch_name || "").toLowerCase().includes(q)
    );
  }, [deposits, search]);

  const busy = tab === "deposits" ? depositsLoading : loading;
  const rows: any[] = tab === "sales" ? sales : tab === "expenses" ? expenses : depositRows;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  // ── Export ──────────────────────────────────────────────────────────────
  function exportRows(kind: "csv" | "xlsx") {
    if (tab === "sales") {
      download([
        ["Order #", "Date", "Customer", "Cashier", "Branch", "Type", "Status", "Total", "Paid", "Balance", "Paid via"],
        ...sales.map(s => [s.order_number, fmtDateTime(s.created_at), s.customer_name, s.cashier_name, s.branch_name,
          s.sale_type, s.status, s.total_amount, s.amount_paid, s.balance_due, (s.methods || []).join(", ")]),
      ], "cashier_sales", kind);
    } else if (tab === "expenses") {
      download([
        ["Date", "Cashier", "Category", "Description", "Receipt #", "Amount", "Status", "Review note"],
        ...expenses.map(e => [fmtDate(e.expense_date), e.cashier_name, e.category_display, e.description,
          e.receipt_number, e.amount, e.status_display, e.review_note]),
      ], "petty_cash", kind);
    } else {
      download([
        ["Date", "Branch", "Deposited by", "Amount"],
        ...depositRows.map(d => [fmtDate(d.deposit_date), d.branch_name, d.deposited_by_name, d.amount]),
      ], "deposits", kind);
    }
  }

  // ── Deposit create / edit ───────────────────────────────────────────────
  const depositorOptions = users.filter(
    u => !depositForm.branch || String(u.branch) === String(depositForm.branch)
  );
  const userLabel = (u: any) => `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username;

  function openDepositCreate() {
    setEditingDepositId(null);
    setDepositForm({
      ...emptyDeposit,
      deposit_date: iso(new Date()),
      branch: canPickBranch ? (branchFilter ? String(branchFilter) : "") : String(userBranchId ?? ""),
    });
    setDepositError("");
    setShowDepositForm(true);
  }

  function openDepositEdit(d: any) {
    setEditingDepositId(d.id);
    setDepositForm({
      amount: String(d.amount ?? ""),
      deposit_date: d.deposit_date,
      deposited_by: d.deposited_by ? String(d.deposited_by) : "",
      branch: d.branch ? String(d.branch) : "",
    });
    setDepositError("");
    setShowDepositForm(true);
  }

  async function handleDepositSubmit() {
    setDepositError("");
    if (!depositForm.branch) return setDepositError("Select the branch this deposit belongs to.");
    if (!depositForm.deposited_by) return setDepositError("Select who made the deposit.");
    if (!depositForm.amount || Number(depositForm.amount) <= 0) return setDepositError("Enter an amount greater than zero.");
    if (!depositForm.deposit_date) return setDepositError("Choose the deposit date.");
    if (depositForm.deposit_date > iso(new Date())) return setDepositError("Deposit date cannot be in the future.");

    const body = {
      branch: Number(depositForm.branch),
      deposited_by: Number(depositForm.deposited_by),
      amount: depositForm.amount,
      deposit_date: depositForm.deposit_date,
    };

    setDepositSaving(true);
    try {
      if (editingDepositId) await API.patch(`deposits/${editingDepositId}/`, body);
      else await API.post("deposits/", body);
      setShowDepositForm(false);
      loadDeposits();
    } catch (err: any) {
      console.error("Error saving deposit:", err);
      setDepositError(errorMessage(err, "Could not save this deposit. Please try again."));
    } finally {
      setDepositSaving(false);
    }
  }

  // ── Expense create / edit ───────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, expense_date: iso(new Date()) });
    setReceiptFile(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(e: any) {
    setEditingId(e.id);
    setForm({
      category: e.category,
      description: e.description || "",
      amount: String(e.amount ?? ""),
      expense_date: e.expense_date,
      receipt_number: e.receipt_number || "",
      branch: e.branch ? String(e.branch) : "",
    });
    setReceiptFile(null);
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    if (!saving) setShowForm(false);
  }

  async function handleSubmit() {
    setFormError("");
    if (!form.description.trim()) return setFormError("Describe what the money was spent on.");
    if (!form.amount || Number(form.amount) <= 0) return setFormError("Enter an amount greater than zero.");
    if (!form.expense_date) return setFormError("Choose the expense date.");
    if (form.expense_date > iso(new Date())) return setFormError("Expense date cannot be in the future.");

    const body = new FormData();
    body.append("category", form.category);
    body.append("description", form.description.trim());
    body.append("amount", form.amount);
    body.append("expense_date", form.expense_date);
    body.append("receipt_number", form.receipt_number);
    if (form.branch) body.append("branch", form.branch);
    if (receiptFile) body.append("receipt_image", receiptFile);

    setSaving(true);
    try {
       const multipart = { headers: { "Content-Type": "multipart/form-data" } };
      if (editingId) await API.patch(`petty-cash/${editingId}/`, body,multipart);
      else await API.post("petty-cash/", body,multipart);
      setShowForm(false);
      load();
    } catch (err: any) {
      console.error("Error saving expense:", err);
      setFormError(errorMessage(err, "Could not save this expense. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  // ── Approve / reject / delete ───────────────────────────────────────────
  async function approve(e: any) {
    setActionError("");
    try {
      await API.post(`petty-cash/${e.id}/approve/`);
      load();
    } catch (err: any) {
      setActionError(errorMessage(err));
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) return setDialogError("Enter a reason so the cashier knows why.");
    setDialogBusy(true); setDialogError("");
    try {
      await API.post(`petty-cash/${rejectTarget.id}/reject/`, { reason: rejectReason.trim() });
      setRejectTarget(null); setRejectReason("");
      load();
    } catch (err: any) {
      setDialogError(errorMessage(err));
    } finally {
      setDialogBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const isDeposit = deleteTarget._kind === "deposit";
    setDialogBusy(true); setDialogError("");
    try {
      await API.delete(isDeposit ? `deposits/${deleteTarget.id}/` : `petty-cash/${deleteTarget.id}/`);
      setDeleteTarget(null);
      if (isDeposit) loadDeposits(); else load();
    } catch (err: any) {
      setDialogError(errorMessage(err));
    } finally {
      setDialogBusy(false);
    }
  }

  const canEdit = (e: any) => e.status === "pending";
  const canDelete = (e: any) => e.status === "pending" || (isAdmin && e.status === "rejected");

  const set = (field: string) => (e: any) => setForm((f: any) => ({ ...f, [field]: e.target.value }));
  const summary = data?.summary;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Cashier Records</h4>
            <p className="text-muted fs-13 mb-0">
              {isAdmin ? "Sales and petty cash for every cashier." : "Your sales and petty cash expenses."}
            </p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { load(); loadDeposits(); }} disabled={loading || depositsLoading}>
              <i className={`ti ti-refresh me-1 ${loading || depositsLoading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportRows("csv")} disabled={!rows.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportRows("xlsx")} disabled={!rows.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            {tab === "deposits" ? (
              <button className="btn btn-primary btn-sm" onClick={openDepositCreate}>
                <i className="ti ti-plus me-1" />Record Deposit
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={openCreate}>
                <i className="ti ti-plus me-1" />Record Expense
              </button>
            )}
          </div>
        </div>

        {/* Period + cashier filters */}
        <div className="d-flex gap-2 align-items-center flex-wrap mb-3">
          <div className="btn-group btn-group-sm">
            {[["today", "Today"], ["week", "This week"], ["month", "This month"]].map(([k, l]) => (
              <button key={k} className={`btn ${preset === k ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => applyPreset(k)}>{l}</button>
            ))}
          </div>
          <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateFrom} max={dateTo}
            onChange={e => { setPreset("custom"); setRange([e.target.value, dateTo]); }} />
          <span className="text-muted fs-13">to</span>
          <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateTo} min={dateFrom}
            onChange={e => { setPreset("custom"); setRange([dateFrom, e.target.value]); }} />
          {isAdmin && (
            <select className="form-select form-select-sm fs-13" style={{ width: 190 }} value={cashier} onChange={e => setCashier(e.target.value)}>
              <option value="">All cashiers</option>
              {(data?.cashiers ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{`${c.firstname} ${c.lastname}`.trim() || c.username}</option>
              ))}
            </select>
          )}

          {tab === "deposits" && (
            canPickBranch ? (
              <select className="form-select form-select-sm fs-13" style={{ width: 190 }}
                value={branchFilter} onChange={e => setBranchFilter(e.target.value ? Number(e.target.value) : "")}>
                <option value="">All branches</option>
                {accessBranches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : (
              <span className="badge bg-primary-transparent text-primary fs-12">
                {accessBranches.find((b: any) => b.id === userBranchId)?.name || "Your branch"}
              </span>
            )
          )}
        </div>

        {/* Summary tiles */}
        {summary && (
          <div className="row g-3 mb-3">
            {[
              { label: "Total Sales", value: money(summary.sales_total), sub: `${summary.sales_count} sale${summary.sales_count !== 1 ? "s" : ""}`, icon: "ti-receipt", bg: "bg-primary-gradient-100", color: "text-primary" },
              { label: "Amount Received", value: money(summary.amount_received), sub: `${money(summary.outstanding)} outstanding`, icon: "ti-cash", bg: "bg-success-gradient-100", color: "text-success" },
              { label: "Cash Collected", value: money(summary.cash_collected), sub: "Cash payments only", icon: "ti-coin", bg: "bg-info-gradient-100", color: "text-info" },
              { label: "Petty Cash Spent", value: money(summary.petty_cash_total), sub: `${money(summary.petty_cash_pending)} pending approval`, icon: "ti-wallet", bg: "bg-danger-gradient-100", color: "text-danger" },
              { label: "Expected Cash", value: money(summary.expected_cash), sub: "Cash collected − petty cash", icon: "ti-scale", bg: "bg-warning-gradient-100", color: "text-warning" },
            ].map(t => (
              <div key={t.label} className="col-6 col-lg" style={{ flex: "1 1 0" }}>
                <div className="card mb-0 shadow-none border h-100">
                  <div className="card-body p-3 position-relative">
                    <p className="fw-medium mb-1 fs-13">{t.label}</p>
                    <h5 className={`mb-1 ${t.color}`}>{t.value}</h5>
                    <p className="text-muted fs-12 mb-0">{t.sub}</p>
                    <div className={`avatar avatar-rounded avatar-sm ${t.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                      <i className={`ti ${t.icon} fs-5 ${t.color}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {summary && (data?.payment_breakdown?.length ?? 0) > 0 && (
          <div className="d-flex gap-2 flex-wrap mb-3 fs-13">
            <span className="text-muted align-self-center">Received by method:</span>
            {data.payment_breakdown.map((m: any) => (
              <span key={m.key} className="badge bg-light text-dark border fw-medium">{m.method}: {money(m.amount)}</span>
            ))}
          </div>
        )}

        {actionError && <div className="alert alert-danger fs-13 py-2">{actionError}</div>}

        {/* Table card */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <ul className="nav nav-pills gap-1">
              <li className="nav-item">
                <button className={`nav-link btn-sm py-1 ${tab === "deposits" ? "active" : ""}`} onClick={() => setTab("deposits")}>
                  <i className="ti ti-building-bank me-1" />Deposits <span className="ms-1 opacity-75">({deposits.length})</span>
                </button>
              </li>
              <li className="nav-item">
                <button className={`nav-link btn-sm py-1 ${tab === "sales" ? "active" : ""}`} onClick={() => setTab("sales")}>
                  <i className="ti ti-receipt me-1" />Sales <span className="ms-1 opacity-75">({data?.sales?.length ?? 0})</span>
                </button>
              </li>
              <li className="nav-item">
                <button className={`nav-link btn-sm py-1 ${tab === "expenses" ? "active" : ""}`} onClick={() => setTab("expenses")}>
                  <i className="ti ti-wallet me-1" />Petty Cash <span className="ms-1 opacity-75">({data?.expenses?.length ?? 0})</span>
                </button>
              </li>
            </ul>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              {tab === "expenses" && (
                <select className="form-select form-select-sm fs-13" style={{ width: 140 }} value={expenseStatus} onChange={e => setExpenseStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              )}
              <div className="input-group input-group-flat" style={{ maxWidth: 240 }}>
                <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
                <input type="text" className="form-control border-start-0 ps-1 fs-13"
                  placeholder={tab === "sales" ? "Search order, customer…" : tab === "expenses" ? "Search description, receipt…" : "Search depositor, branch…"}
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
              </div>
            </div>
          </div>

          <div className="card-body p-0">
            {busy ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading records…
              </div>
            ) : rows.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className={`ti ${tab === "sales" ? "ti-receipt" : tab === "expenses" ? "ti-wallet" : "ti-building-bank"} fs-1 mb-2`} />
                <p className="fs-14 mb-0">
                  {tab === "sales" ? "No sales in this period."
                    : tab === "expenses" ? "No petty cash expenses in this period."
                    : "No deposits in this period."}
                </p>
                {tab === "deposits" && !search && (
                  <button className="btn btn-sm btn-primary mt-3" onClick={openDepositCreate}>
                    <i className="ti ti-plus me-1" />Record Deposit
                  </button>
                )}
              </div>
            ) : tab === "sales" ? (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th>Order #</th><th>Date</th><th>Customer</th>{isAdmin && <th>Cashier</th>}
                      <th>Type</th><th>Status</th><th className="text-end">Total</th>
                      <th className="text-end">Paid</th><th className="text-end">Balance</th><th>Paid via</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((s: any) => (
                      <tr key={s.id}>
                        <td className="fw-semibold text-dark text-nowrap">{s.order_number}</td>
                        <td className="text-muted text-nowrap">{fmtDateTime(s.created_at)}</td>
                        <td className="text-nowrap">{s.customer_name}</td>
                        {isAdmin && <td className="text-nowrap">{s.cashier_name}</td>}
                        <td className="text-nowrap">{s.sale_type}</td>
                        <td><span className={SALE_STATUS_CLS[s.status] || "badge bg-secondary-transparent text-secondary"}>{s.status}</span></td>
                        <td className="text-end fw-semibold text-nowrap">{money(s.total_amount)}</td>
                        <td className="text-end text-success text-nowrap">{money(s.amount_paid)}</td>
                        <td className={`text-end text-nowrap ${Number(s.balance_due) > 0 ? "text-danger fw-semibold" : "text-muted"}`}>{money(s.balance_due)}</td>
                        <td className="text-nowrap">{s.methods?.length ? s.methods.join(", ") : <span className="text-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === "expenses" ? (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>{isAdmin && <th>Cashier</th>}<th>Category</th><th>Description</th>
                      <th>Receipt</th><th className="text-end">Amount</th><th>Status</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((e: any) => (
                      <tr key={e.id}>
                        <td className="text-nowrap">{fmtDate(e.expense_date)}</td>
                        {isAdmin && <td className="text-nowrap">{e.cashier_name}</td>}
                        <td className="text-nowrap">{e.category_display}</td>
                        <td style={{ maxWidth: 260 }}>
                          <div className="text-truncate">{e.description}</div>
                          {e.status === "rejected" && e.review_note &&
                            <div className="text-danger fs-12">Rejected: {e.review_note}</div>}
                        </td>
                        <td className="text-nowrap">
                          {e.receipt_number || <span className="text-muted">—</span>}
                          {e.receipt_image && (
                            <a href={e.receipt_image} target="_blank" rel="noreferrer" className="ms-2" title="View receipt photo">
                              <i className="ti ti-photo" />
                            </a>
                          )}
                        </td>
                        <td className="text-end fw-semibold text-nowrap">{money(e.amount)}</td>
                        <td><span className={EXPENSE_STATUS_CLS[e.status]}>{e.status_display}</span></td>
                        <td className="text-end text-nowrap">
                          {isAdmin && e.status !== "approved" && (
                            <button className="btn btn-sm btn-icon btn-outline-success me-1" title="Approve" onClick={() => approve(e)}>
                              <i className="ti ti-check" />
                            </button>
                          )}
                          {isAdmin && e.status !== "rejected" && (
                            <button className="btn btn-sm btn-icon btn-outline-warning me-1" title="Reject"
                              onClick={() => { setDialogError(""); setRejectReason(""); setRejectTarget(e); }}>
                              <i className="ti ti-x" />
                            </button>
                          )}
                          {canEdit(e) && (
                            <button className="btn btn-sm btn-icon btn-outline-secondary me-1" title="Edit" onClick={() => openEdit(e)}>
                              <i className="ti ti-edit" />
                            </button>
                          )}
                          {canDelete(e) && (
                            <button className="btn btn-sm btn-icon btn-outline-danger" title="Delete"
                              onClick={() => { setDialogError(""); setDeleteTarget(e); }}>
                              <i className="ti ti-trash" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>
                      {canPickBranch && <th>Branch</th>}
                      <th>Deposited by</th>
                      <th className="text-end">Amount</th>
                      {isAdmin && <th className="text-end">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((d: any) => (
                      <tr key={d.id}>
                        <td className="text-nowrap">{fmtDate(d.deposit_date)}</td>
                        {canPickBranch && <td className="text-nowrap">{d.branch_name}</td>}
                        <td className="text-nowrap">{d.deposited_by_name}</td>
                        <td className="text-end fw-semibold text-nowrap">{money(d.amount)}</td>
                        {isAdmin && (
                          <td className="text-end text-nowrap">
                            <button className="btn btn-sm btn-icon btn-outline-secondary me-1" title="Edit" onClick={() => openDepositEdit(d)}>
                              <i className="ti ti-edit" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-outline-danger" title="Delete"
                              onClick={() => { setDialogError(""); setDeleteTarget({ ...d, _kind: "deposit" }); }}>
                              <i className="ti ti-trash" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!busy && rows.length > 0 && (
            <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
              <span>
                Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)}</strong> of <strong>{rows.length}</strong>
                {(tab === "expenses" || tab === "deposits") && <> · Total <strong>{money(rows.reduce((s, e) => s + Number(e.amount), 0))}</strong></>}
              </span>
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
          )}
        </div>
      </div>

      {/* ================= Add / Edit expense offcanvas ================= */}
      {showForm && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeForm} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 420 }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">{editingId ? "Edit Petty Cash" : "Add Petty Cash"}</h5>
              <button type="button" className="btn-close" onClick={closeForm} />
            </div>
            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Category</label>
                <select className="form-select" value={form.category} onChange={set("category")}>
                  {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">What was it for? <span className="text-danger">*</span></label>
                <input className="form-control" value={form.description} onChange={set("description")}
                  placeholder="e.g. Boda to deliver order SO-260903" />
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Amount (KES) <span className="text-danger">*</span></label>
                  <input type="number" min={0} step="0.01" className="form-control" value={form.amount} onChange={set("amount")} />
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Date</label>
                  <input type="date" className="form-control" max={iso(new Date())} value={form.expense_date} onChange={set("expense_date")} />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Branch</label>
                <select className="form-select" value={form.branch} onChange={set("branch")}>
                  <option value="">Not specified</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Receipt number</label>
                <input className="form-control" value={form.receipt_number} onChange={set("receipt_number")} />
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Receipt photo</label>
                <input type="file" accept="image/*" className="form-control"
                  onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                <div className="form-text fs-12">
                  {editingId ? "Leave empty to keep the current photo." : "Optional, but helps the admin approve it faster."}
                </div>
              </div>
            </div>
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={closeForm} disabled={saving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {editingId ? "Save changes" : "Add expense"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================= Deposit offcanvas ================= */}
      {showDepositForm && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={() => !depositSaving && setShowDepositForm(false)} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 420 }} tabIndex={-1}>
            <div className="offcanvas-header border-bottom">
              <h5 className="offcanvas-title fw-semibold">{editingDepositId ? "Edit Deposit" : "Record Deposit"}</h5>
              <button type="button" className="btn-close" onClick={() => !depositSaving && setShowDepositForm(false)} />
            </div>
            <div className="offcanvas-body">
              {depositError && <div className="alert alert-danger fs-13 py-2">{depositError}</div>}

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Branch <span className="text-danger">*</span></label>
                <select className="form-select" value={depositForm.branch} disabled={!canPickBranch}
                  onChange={e => setDepositForm((f: any) => ({ ...f, branch: e.target.value, deposited_by: "" }))}>
                  <option value="">Select branch…</option>
                  {accessBranches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 fw-medium">Deposited by <span className="text-danger">*</span></label>
                <select className="form-select" value={depositForm.deposited_by}
                  onChange={e => setDepositForm((f: any) => ({ ...f, deposited_by: e.target.value }))}>
                  <option value="">Select person…</option>
                  {depositorOptions.map((u: any) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                </select>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Amount (KES) <span className="text-danger">*</span></label>
                  <input type="number" min={0} step="0.01" className="form-control" value={depositForm.amount}
                    onChange={e => setDepositForm((f: any) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="col-6">
                  <label className="form-label fs-13 fw-medium">Date</label>
                  <input type="date" className="form-control" max={iso(new Date())} value={depositForm.deposit_date}
                    onChange={e => setDepositForm((f: any) => ({ ...f, deposit_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowDepositForm(false)} disabled={depositSaving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleDepositSubmit} disabled={depositSaving}>
                {depositSaving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
                {editingDepositId ? "Save changes" : "Record deposit"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================= Delete dialog ================= */}
      {deleteTarget && (
        <>
          <div className="modal-backdrop fade show" />
          <div className="modal fade show d-block" tabIndex={-1} onClick={() => !dialogBusy && setDeleteTarget(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header border-bottom">
                  <h5 className="modal-title fw-semibold">{deleteTarget._kind === "deposit" ? "Delete deposit" : "Delete expense"}</h5>
                  <button type="button" className="btn-close" onClick={() => setDeleteTarget(null)} disabled={dialogBusy} />
                </div>
                <div className="modal-body">
                  {dialogError && <div className="alert alert-danger fs-13 py-2">{dialogError}</div>}
                  <p className="mb-0 fs-14">
                    {deleteTarget._kind === "deposit" ? (
                      <>Delete deposit of <strong>{money(deleteTarget.amount)}</strong> by {deleteTarget.deposited_by_name} on {fmtDate(deleteTarget.deposit_date)}? This can't be undone.</>
                    ) : (
                      <>Delete <strong>{money(deleteTarget.amount)}</strong> ({deleteTarget.description})? This can't be undone.</>
                    )}
                  </p>
                </div>
                <div className="modal-footer border-top">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteTarget(null)} disabled={dialogBusy}>Cancel</button>
                  <button className="btn btn-danger btn-sm" onClick={confirmDelete} disabled={dialogBusy}>
                    {dialogBusy ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-trash me-1" />}
                    {deleteTarget._kind === "deposit" ? "Delete deposit" : "Delete expense"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= Reject dialog ================= */}
      {rejectTarget && (
        <>
          <div className="modal-backdrop fade show" />
          <div className="modal fade show d-block" tabIndex={-1} onClick={() => !dialogBusy && setRejectTarget(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header border-bottom">
                  <h5 className="modal-title fw-semibold">Reject expense</h5>
                  <button type="button" className="btn-close" onClick={() => setRejectTarget(null)} disabled={dialogBusy} />
                </div>
                <div className="modal-body">
                  {dialogError && <div className="alert alert-danger fs-13 py-2">{dialogError}</div>}
                  <p className="fs-14">
                    Reject <strong>{money(rejectTarget.amount)}</strong> ({rejectTarget.description})? It will stop counting against the cashier's till.
                  </p>
                  <label className="form-label fs-13 fw-medium">Reason</label>
                  <textarea className="form-control" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="e.g. No receipt provided" />
                </div>
                <div className="modal-footer border-top">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setRejectTarget(null)} disabled={dialogBusy}>Cancel</button>
                  <button className="btn btn-warning btn-sm" onClick={confirmReject} disabled={dialogBusy}>
                    {dialogBusy ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-x me-1" />}Reject expense
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
