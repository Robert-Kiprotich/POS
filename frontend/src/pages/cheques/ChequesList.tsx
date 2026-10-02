import { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../services/api";
import { showSuccess, showError, showWarning, showConfirm } from "../../components/alerts/Alerts";

// ── Config ───────────────────────────────────────────────────────────────────
const STATUS_CLS: Record<string, string> = {
  received: "badge bg-info-transparent text-info",
  deposited: "badge bg-warning-transparent text-warning",
  cleared: "badge bg-success-transparent text-success",
  bounced: "badge bg-danger-transparent text-danger",
  cancelled: "badge bg-secondary-transparent text-secondary",
};
const STATUS_LABEL: Record<string, string> = {
  received: "In Hand",
  deposited: "Deposited",
  cleared: "Cleared",
  bounced: "Bounced",
  cancelled: "Cancelled",
};

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

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function extractError(err: any, fallback: string) {
  const data = err.response?.data;
  if (!data || typeof data === "string") return fallback;
  if (data.detail || data.error) return data.detail || data.error;
  const field = Object.keys(data)[0];
  if (!field) return fallback;
  const msg = Array.isArray(data[field]) ? data[field][0] : data[field];
  return field === "non_field_errors" ? msg : `${field}: ${msg}`;
}

const emptyForm: Record<string, string> = {
  cheque_number: "",
  drawer_name: "",
  drawer_bank: "",
  amount: "",
  cheque_date: "",
  received_on: "",
  customer: "",
  sale: "",
  notes: "",
};

type Mode = "add" | "edit" | "view" | "deposit" | "clear" | "bounce";

// ── Component ────────────────────────────────────────────────────────────────
export default function ChequesList() {
  const [records, setRecords] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Offcanvas
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [depositForm, setDepositForm] = useState({ deposit_bank: "", deposit_account: "", deposit_slip_no: "", deposited_on: localToday() });
  const [clearForm, setClearForm] = useState({ cleared_on: localToday() });
  const [bounceForm, setBounceForm] = useState({ reason: "", bounced_on: localToday() });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
const [imagePreview, setImagePreview] = useState("");
const [removeImage, setRemoveImage] = useState(false);


function resetImage(existing = "") {
  setImageFile(null);
  setImagePreview(existing);
  setRemoveImage(false);
}

function onImagePick(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setFormError("Please choose an image file.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setFormError("The photo must be smaller than 5 MB.");
    return;
  }
  setFormError("");
  setImageFile(file);
  setRemoveImage(false);
  setImagePreview(URL.createObjectURL(file));
}

function onImageRemove() {
  setImageFile(null);
  setImagePreview("");
  setRemoveImage(true);
}
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page_size: 1000 };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await API.get("cheque-deposits/", { params });
      setRecords(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading cheques:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await API.get("customers/", { params: { page_size: 1000 } });
      setCustomers(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error("Error loading customers:", err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Load sales with an unpaid balance for the selected customer
  useEffect(() => {
    if (!showOffcanvas || !(mode === "add" || mode === "edit") || !form.customer) {
      setCustomerSales([]);
      return;
    }
    let cancelled = false;
    API.get("sales/", { params: { customer: form.customer, page_size: 200 } })
      .then(res => {
        if (cancelled) return;
        const rows = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
        setCustomerSales(rows.filter((s: any) => s.status !== "cancelled" && num(s.balance_due) > 0));
      })
      .catch(() => { if (!cancelled) setCustomerSales([]); });
    return () => { cancelled = true; };
  }, [form.customer, mode, showOffcanvas]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.cheque_number || "").toLowerCase().includes(q) ||
        (r.drawer_name || "").toLowerCase().includes(q) ||
        (r.drawer_bank || "").toLowerCase().includes(q) ||
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.deposit_slip_no || "").toLowerCase().includes(q)
      );
    });
  }, [records, search, statusFilter]);

  const sumBy = (status: string) => records.filter(r => r.status === status).reduce((s, r) => s + num(r.amount), 0);
  const countBy = (status: string) => records.filter(r => r.status === status).length;
  const postDated = records.filter(r => r.is_post_dated).length;

  // ── Offcanvas handlers ─────────────────────────────────────────────────────
  function openAdd() {
    setMode("add"); setSelected(null); setFormError("");
    setForm({ ...emptyForm, received_on: localToday() });
    setShowOffcanvas(true);
      resetImage();                                   // ← add

  }
  function openEdit(r: any) {
    setMode("edit"); setSelected(r); setFormError("");
      resetImage(r.cheque_image || "");               // ← add

    setForm({
      cheque_number: r.cheque_number ?? "",
      drawer_name: r.drawer_name ?? "",
      drawer_bank: r.drawer_bank ?? "",
      amount: String(r.amount ?? ""),
      cheque_date: r.cheque_date ?? "",
      received_on: r.received_on ?? "",
      customer: r.customer ? String(r.customer) : "",
      sale: r.sale ? String(r.sale) : "",
      notes: r.notes ?? "",
    });
    setShowOffcanvas(true);

  }
  function openView(r: any) { setMode("view"); setSelected(r); setFormError(""); setShowOffcanvas(true); }
  function openDeposit(r: any) {
    setMode("deposit"); setSelected(r); setFormError("");
    setDepositForm({ deposit_bank: "", deposit_account: "", deposit_slip_no: "", deposited_on: localToday() });
    setShowOffcanvas(true);
  }
  function openClear(r: any) {
    setMode("clear"); setSelected(r); setFormError("");
    setClearForm({ cleared_on: localToday() });
    setShowOffcanvas(true);
  }
  function openBounce(r: any) {
    setMode("bounce"); setSelected(r); setFormError("");
    setBounceForm({ reason: "", bounced_on: localToday() });
    setShowOffcanvas(true);
  }
  function closeOffcanvas() { setShowOffcanvas(false); }

  function onCustomerChange(id: string) {
    setForm(f => ({ ...f, customer: id, sale: "" }));
  }
  function onSaleChange(id: string) {
    const sale = customerSales.find(s => String(s.id) === id);
    setForm(f => ({
      ...f,
      sale: id,
      // Suggest the outstanding balance as the cheque amount when nothing is entered yet
      amount: sale && !f.amount ? String(sale.balance_due) : f.amount,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!form.cheque_number.trim()) return setFormError("Enter the cheque number.");
    if (!form.drawer_name.trim()) return setFormError("Enter the name of the person or company who wrote the cheque.");
    if (!form.drawer_bank.trim()) return setFormError("Enter the bank the cheque is drawn on.");
    if (num(form.amount) <= 0) return setFormError("Enter a valid amount greater than zero.");
    if (!form.cheque_date) return setFormError("Enter the date written on the cheque.");

    const selectedSale = customerSales.find(s => String(s.id) === form.sale);
    if (selectedSale && num(form.amount) > num(selectedSale.balance_due)) {
      const ok = await showConfirm(
        `The cheque amount (${fmtMoney(form.amount)}) is more than the balance due on ${selectedSale.order_number} (${fmtMoney(selectedSale.balance_due)}). Continue anyway?`,
        "Amount exceeds balance", "Yes, continue", "Go back"
      );
      if (!ok) return;
    }

   const fd = new FormData();
fd.append("cheque_number", form.cheque_number.trim());
fd.append("drawer_name", form.drawer_name.trim());
fd.append("drawer_bank", form.drawer_bank.trim());
fd.append("amount", form.amount);
fd.append("cheque_date", form.cheque_date);
fd.append("customer", form.customer);   // empty string = no customer
fd.append("sale", form.sale);           // empty string = no sale
fd.append("notes", form.notes);
if (form.received_on) fd.append("received_on", form.received_on);
if (imageFile) fd.append("cheque_image", imageFile);
else if (removeImage) fd.append("cheque_image", "");   // clears the existing photo

const config = { headers: { "Content-Type": "multipart/form-data" } };
    setSaving(true);
    try {
      if (mode === "edit" && selected) {
        await API.patch(`cheque-deposits/${selected.id}/`, fd, config);

        showSuccess("Cheque details updated.", "Cheque Updated");
      } else {
       await API.post("cheque-deposits/", fd, config);
        showSuccess("Cheque recorded.", "Cheque Added");
      }
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not save this cheque. Please try again.");
      setFormError(msg);
      showError(msg, "Save Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setFormError("");
    if (!depositForm.deposit_bank.trim()) return setFormError("Enter the bank the cheque is being deposited to.");
    if (!depositForm.deposited_on) return setFormError("Choose the deposit date.");
    if (depositForm.deposited_on < selected.cheque_date) {
      return setFormError(`This cheque is dated ${fmtDate(selected.cheque_date)}. It can't be deposited before that date.`);
    }
    if (!depositForm.deposit_slip_no.trim()) {
      const ok = await showConfirm(
        "No deposit slip number was entered. Continue without one?",
        "Missing slip number", "Yes, continue", "Go back"
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      await API.post(`cheque-deposits/${selected.id}/deposit/`, depositForm);
      showSuccess(`Cheque ${selected.cheque_number} was marked as deposited.`, "Cheque Deposited");
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not mark this cheque as deposited.");
      setFormError(msg);
      showError(msg, "Deposit Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setFormError("");
    if (!clearForm.cleared_on) return setFormError("Choose the date the cheque cleared.");
    if (selected.deposited_on && clearForm.cleared_on < selected.deposited_on) {
      return setFormError("The clearance date can't be before the deposit date.");
    }

    setSaving(true);
    try {
      await API.post(`cheque-deposits/${selected.id}/clear/`, clearForm);
      showSuccess(
        selected.sale_order_number
          ? `Cheque cleared. A payment was recorded on ${selected.sale_order_number}.`
          : `Cheque ${selected.cheque_number} was marked as cleared.`,
        "Cheque Cleared"
      );
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not mark this cheque as cleared.");
      setFormError(msg);
      showError(msg, "Clearance Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleBounce(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setFormError("");
    if (!bounceForm.reason.trim()) return setFormError("Enter the reason the cheque bounced.");
    if (!bounceForm.bounced_on) return setFormError("Choose the date the cheque bounced.");

    const ok = await showConfirm(
      `Mark cheque ${selected.cheque_number} from "${selected.drawer_name}" as bounced?`,
      "Mark as bounced?", "Yes, it bounced", "Go back"
    );
    if (!ok) return;

    setSaving(true);
    try {
      await API.post(`cheque-deposits/${selected.id}/bounce/`, bounceForm);
      showWarning(`Cheque ${selected.cheque_number} was marked as bounced.`, "Cheque Bounced");
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not mark this cheque as bounced.");
      setFormError(msg);
      showError(msg, "Update Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(r: any) {
    const ok = await showConfirm(
      `Cancel cheque ${r.cheque_number} from "${r.drawer_name}"?` +
        (r.status === "deposited" ? "\n\nIt has already been deposited. Cancelling only voids the record here." : ""),
      "Cancel this cheque?", "Yes, cancel it", "Keep it"
    );
    if (!ok) return;
    const reason = window.prompt("Reason for cancelling (optional):");
    if (reason === null) return;

    setBusyId(r.id);
    try {
      await API.post(`cheque-deposits/${r.id}/cancel/`, { reason });
      showSuccess("The cheque was cancelled.", "Cheque Cancelled");
      if (selected?.id === r.id) setShowOffcanvas(false);
      load();
    } catch (err: any) {
      showError(extractError(err, "Could not cancel this cheque."), "Cancel Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(r: any) {
    const ok = await showConfirm(
      `Delete cheque ${r.cheque_number} from "${r.drawer_name}"? This cannot be undone.`,
      "Delete this cheque?", "Yes, delete it", "Cancel"
    );
    if (!ok) return;
    setBusyId(r.id);
    try {
      await API.delete(`cheque-deposits/${r.id}/`);
      setRecords(prev => prev.filter(x => x.id !== r.id));
      if (selected?.id === r.id) setShowOffcanvas(false);
    } catch (err: any) {
      showError(extractError(err, "Could not delete this cheque."), "Delete Failed");
    } finally {
      setBusyId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const tiles = [
    { label: `In hand (${countBy("received")})`, value: fmtMoney(sumBy("received")), color: "text-info" },
    { label: `Deposited (${countBy("deposited")})`, value: fmtMoney(sumBy("deposited")), color: "text-warning" },
    { label: `Cleared (${countBy("cleared")})`, value: fmtMoney(sumBy("cleared")), color: "text-success" },
    { label: `Bounced (${countBy("bounced")})`, value: fmtMoney(sumBy("bounced")), color: "text-danger" },
    { label: "Post-dated", value: postDated, color: "text-primary" },
  ];

  const detailRow = (label: string, value: any) => (
    <tr><td className="text-muted">{label}</td><td className="text-end">{value || "—"}</td></tr>
  );

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Cheques</h4>
            <p className="text-muted fs-13 mb-0">Track cheques from receipt to deposit and clearance.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <input
              type="date" className="form-control form-control-sm fs-13" style={{ width: 150 }}
              value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}
              title="Received from"
            />
            <input
              type="date" className="form-control form-control-sm fs-13" style={{ width: 150 }}
              value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
              title="Received to"
            />
            <button className="btn btn-outline-secondary btn-sm" onClick={() => load()} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <i className="ti ti-plus me-1" />Add cheque
            </button>
          </div>
        </div>

        {/* Stats */}
        {!loading && records.length > 0 && (
          <div className="row g-3 mb-4">
            {tiles.map(s => (
              <div key={s.label} className="col-6 col-md-4 col-xl">
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
            <div className="input-group input-group-flat" style={{ maxWidth: 300 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input
                type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search cheque no., drawer, bank, customer…"
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
              <option value="received">In hand</option>
              <option value="deposited">Deposited</option>
              <option value="cleared">Cleared</option>
              <option value="bounced">Bounced</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading cheques…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-writing-sign fs-1 mb-2" />
                <p className="fs-14 mb-2">
                  {records.length === 0 ? "No cheques recorded yet." : "No results match your filters."}
                </p>
                {records.length === 0 && (
                  <button className="btn btn-sm btn-outline-primary" onClick={openAdd}>Record the first cheque</button>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Cheque</th>
                      <th>Drawer</th>
                      <th>Customer / Sale</th>
                      <th>Cheque date</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                      <th>Deposited</th>
                      <th className="text-end pe-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const busy = busyId === r.id;
                      return (
                        <tr key={r.id} className={r.status === "cancelled" ? "text-muted" : ""}>
                          <td className="ps-3 text-nowrap">
                            <div className="fw-semibold text-dark">{r.cheque_number}</div>
                            <div className="fs-11 text-muted">Received {fmtDate(r.received_on)}</div>
                          </td>
                          <td className="text-nowrap">
                            <div>{r.drawer_name}</div>
                            <div className="fs-11 text-muted">{r.drawer_bank}</div>
                          </td>
                          <td className="text-nowrap">
                            <div>{r.customer_name || "—"}</div>
                            {r.sale_order_number && <div className="fs-11 text-muted">{r.sale_order_number}</div>}
                          </td>
                          <td className="text-nowrap">
                            {fmtDate(r.cheque_date)}
                            {r.is_post_dated && <span className="badge bg-primary-transparent text-primary ms-1">Post-dated</span>}
                            {r.is_stale && <span className="badge bg-danger-transparent text-danger ms-1">Stale</span>}
                          </td>
                          <td className="text-end text-nowrap fw-semibold">{fmtMoney(r.amount)}</td>
                          <td><span className={STATUS_CLS[r.status]}>{STATUS_LABEL[r.status] || r.status}</span></td>
                          <td className="text-nowrap text-muted">
                            <div>{fmtDate(r.deposited_on)}</div>
                            {r.deposit_slip_no && <div className="fs-11">Slip {r.deposit_slip_no}</div>}
                          </td>
                          <td className="text-end pe-3">
                            <div className="d-inline-flex gap-1">
                              <button className="btn btn-sm btn-outline-info py-1 px-2 fs-11" onClick={() => openView(r)}>
                                <i className="ti ti-eye me-1" />View
                              </button>

                              {r.status === "received" && (
                                <>
                                  <button className="btn btn-sm btn-outline-primary py-1 px-2 fs-11" onClick={() => openEdit(r)}>
                                    <i className="ti ti-edit me-1" />Edit
                                  </button>
                                  <button
                                    className="btn btn-sm btn-success py-1 px-2 fs-11" onClick={() => openDeposit(r)}
                                    disabled={r.is_post_dated}
                                    title={r.is_post_dated ? `Can be deposited from ${fmtDate(r.cheque_date)}` : ""}
                                  >
                                    <i className="ti ti-building-bank me-1" />Deposit
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={() => handleDelete(r)} disabled={busy}>
                                    {busy ? <span className="spinner-border spinner-border-sm" /> : <i className="ti ti-trash" />}
                                  </button>
                                </>
                              )}

                              {r.status === "deposited" && (
                                <>
                                  <button className="btn btn-sm btn-success py-1 px-2 fs-11" onClick={() => openClear(r)}>
                                    <i className="ti ti-check me-1" />Cleared
                                  </button>
                                  <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={() => openBounce(r)}>
                                    <i className="ti ti-alert-triangle me-1" />Bounced
                                  </button>
                                  <button className="btn btn-sm btn-outline-secondary py-1 px-2 fs-11" onClick={() => handleCancel(r)} disabled={busy}>
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
                      <td className="ps-3" colSpan={4}>Total (excluding cancelled and bounced)</td>
                      <td className="text-end">
                        {fmtMoney(filtered.filter(r => r.status !== "cancelled" && r.status !== "bounced").reduce((s, r) => s + num(r.amount), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ Offcanvas: add / edit / view / deposit / clear / bounce ============ */}
      {showOffcanvas && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeOffcanvas} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 460 }} tabIndex={-1}>
            <div className="offcanvas-header bg-primary text-white py-3">
              <h5 className="offcanvas-title text-white fs-15 fw-semibold">
                {mode === "add" && "Add Cheque"}
                {mode === "edit" && "Edit Cheque"}
                {mode === "view" && "Cheque Details"}
                {mode === "deposit" && "Deposit Cheque"}
                {mode === "clear" && "Mark as Cleared"}
                {mode === "bounce" && "Mark as Bounced"}
              </h5>
              <button type="button" className="btn-close btn-close-white" onClick={closeOffcanvas} />
            </div>

            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              {/* Summary card for the action modes */}
              {(mode === "deposit" || mode === "clear" || mode === "bounce") && selected && (
                <div className="border rounded p-3 mb-3">
                  <div className="fw-semibold text-dark">Cheque {selected.cheque_number}</div>
                  <div className="text-muted fs-12">{selected.drawer_name} · {selected.drawer_bank}</div>
                  <div className="fs-4 fw-bold text-primary mt-1">{fmtMoney(selected.amount)}</div>
                  {selected.sale_order_number && (
                    <div className="fs-12 text-muted mt-1">Sale {selected.sale_order_number}</div>
                  )}
                </div>
              )}

              {/* ---------- VIEW ---------- */}
              {mode === "view" && selected && (
                <div className="d-flex flex-column gap-3 fs-13">
                  <div>
                    <div className="fw-semibold text-dark fs-15">Cheque {selected.cheque_number}</div>
                    <div className="text-muted">{selected.drawer_name} · {selected.drawer_bank}</div>
                    <div className="mt-1">
                      <span className={STATUS_CLS[selected.status]}>{STATUS_LABEL[selected.status]}</span>
                      {selected.is_post_dated && <span className="badge bg-primary-transparent text-primary ms-1">Post-dated</span>}
                      {selected.is_stale && <span className="badge bg-danger-transparent text-danger ms-1">Stale</span>}
                    </div>
                  </div>

                  <div className="fs-4 fw-bold text-primary">{fmtMoney(selected.amount)}</div>

                  <table className="table table-sm mb-0">
                    <tbody>
                      <tr className="table-light"><th colSpan={2}>Cheque</th></tr>
                      {detailRow("Cheque date", fmtDate(selected.cheque_date))}
                      {detailRow("Received on", fmtDate(selected.received_on))}
                      {detailRow("Customer", selected.customer_name)}
                      {detailRow("Sale", selected.sale_order_number)}
                      {detailRow("Branch", selected.branch_name)}
                      {detailRow("Recorded by", selected.created_by_name)}

                      {(selected.status !== "received" && selected.status !== "cancelled") && (
                        <>
                          <tr className="table-light"><th colSpan={2}>Deposit</th></tr>
                          {detailRow("Deposited to", selected.deposit_bank)}
                          {detailRow("Account", selected.deposit_account)}
                          {detailRow("Slip no.", selected.deposit_slip_no)}
                          {detailRow("Deposited on", fmtDate(selected.deposited_on))}
                          {detailRow("Deposited by", selected.deposited_by_name)}
                        </>
                      )}
                      {selected.status === "cleared" && (
                        <>
                          <tr className="table-light"><th colSpan={2}>Clearance</th></tr>
                          {detailRow("Cleared on", fmtDate(selected.cleared_on))}
                        </>
                      )}
                      {selected.status === "bounced" && (
                        <>
                          <tr className="table-light"><th colSpan={2}>Bounced</th></tr>
                          {detailRow("Bounced on", fmtDate(selected.bounced_on))}
                          {detailRow("Reason", selected.bounce_reason)}
                        </>
                      )}
                    </tbody>
                  </table>
                      <div>
  <label className="form-label fs-13 fw-medium mb-1">Cheque photo</label>
  {imagePreview ? (
    <div className="border rounded p-2 d-flex align-items-center gap-2">
      <img
        src={imagePreview} alt="Cheque"
        style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 4 }}
      />
      <div className="flex-grow-1 fs-12 text-muted text-truncate">
        {imageFile ? imageFile.name : "Current photo"}
      </div>
      <button type="button" className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={onImageRemove}>
        <i className="ti ti-trash" />
      </button>
    </div>
  ) : (
    <input
      type="file" accept="image/*" capture="environment"
      className="form-control fs-13" onChange={onImagePick}
    />
  )}
  <div className="fs-11 text-muted mt-1">Optional. JPG or PNG, up to 5 MB.</div>
</div>
<div>
  <label className="form-label fs-13 fw-medium mb-1">Cheque photo</label>
  {imagePreview ? (
    <div className="border rounded p-2 d-flex align-items-center gap-2">
      <img
        src={imagePreview} alt="Cheque"
        style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 4 }}
      />
      <div className="flex-grow-1 fs-12 text-muted text-truncate">
        {imageFile ? imageFile.name : "Current photo"}
      </div>
      <button type="button" className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={onImageRemove}>
        <i className="ti ti-trash" />
      </button>
    </div>
  ) : (
    <input
      type="file" accept="image/*" capture="environment"
      className="form-control fs-13" onChange={onImagePick}
    />
  )}
  <div className="fs-11 text-muted mt-1">Optional. JPG or PNG, up to 5 MB.</div>
</div>
                  {selected.notes && (
                    <div>
                      <label className="text-muted fs-12 fw-medium d-block mb-1">NOTES</label>
                      <span style={{ whiteSpace: "pre-line" }}>{selected.notes}</span>
                    </div>
                  )}
                </div>
              )}


    
              {/* ---------- DEPOSIT ---------- */}
              {mode === "deposit" && selected && (
                <form id="deposit-form" onSubmit={handleDeposit} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Deposit bank <span className="text-danger">*</span></label>
                    <input
                      type="text" className="form-control fs-13" placeholder="Bank the cheque is deposited to"
                      value={depositForm.deposit_bank}
                      onChange={e => setDepositForm(f => ({ ...f, deposit_bank: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Account number</label>
                    <input
                      type="text" className="form-control fs-13"
                      value={depositForm.deposit_account}
                      onChange={e => setDepositForm(f => ({ ...f, deposit_account: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Deposit slip no.</label>
                    <input
                      type="text" className="form-control fs-13"
                      value={depositForm.deposit_slip_no}
                      onChange={e => setDepositForm(f => ({ ...f, deposit_slip_no: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Deposited on <span className="text-danger">*</span></label>
                    <input
                      type="date" className="form-control fs-13" value={depositForm.deposited_on}
                      min={selected.cheque_date} max={localToday()}
                      onChange={e => setDepositForm(f => ({ ...f, deposited_on: e.target.value }))}
                    />
                  </div>
                  <div className="alert alert-warning fs-12 py-2 mb-0">
                    <i className="ti ti-lock me-1" />
                    Once deposited, this cheque can no longer be edited or deleted.
                  </div>
                </form>
              )}

              {/* ---------- CLEAR ---------- */}
              {mode === "clear" && selected && (
                <form id="clear-form" onSubmit={handleClear} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Cleared on <span className="text-danger">*</span></label>
                    <input
                      type="date" className="form-control fs-13" value={clearForm.cleared_on}
                      min={selected.deposited_on || undefined} max={localToday()}
                      onChange={e => setClearForm({ cleared_on: e.target.value })}
                    />
                  </div>
                  {selected.sale_order_number ? (
                    <div className="alert alert-info fs-12 py-2 mb-0">
                      <i className="ti ti-info-circle me-1" />
                      A {fmtMoney(selected.amount)} cheque payment will be recorded on sale {selected.sale_order_number}.
                    </div>
                  ) : (
                    <div className="alert alert-secondary fs-12 py-2 mb-0">
                      This cheque isn't linked to a sale, so no payment will be recorded.
                    </div>
                  )}
                </form>
              )}

              {/* ---------- BOUNCE ---------- */}
              {mode === "bounce" && selected && (
                <form id="bounce-form" onSubmit={handleBounce} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Reason <span className="text-danger">*</span></label>
                    <input
                      type="text" className="form-control fs-13" placeholder="e.g. Insufficient funds, signature mismatch"
                      value={bounceForm.reason}
                      onChange={e => setBounceForm(f => ({ ...f, reason: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Bounced on <span className="text-danger">*</span></label>
                    <input
                      type="date" className="form-control fs-13" value={bounceForm.bounced_on}
                      min={selected.deposited_on || undefined} max={localToday()}
                      onChange={e => setBounceForm(f => ({ ...f, bounced_on: e.target.value }))}
                    />
                  </div>
                  <div className="alert alert-warning fs-12 py-2 mb-0">
                    <i className="ti ti-alert-triangle me-1" />
                    No payment is recorded for a bounced cheque. Follow up with the customer for a replacement.
                  </div>
                </form>
              )}

              {/* ---------- ADD / EDIT ---------- */}
              {(mode === "add" || mode === "edit") && (
                <form id="cheque-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label fs-13 fw-medium mb-1">Cheque number <span className="text-danger">*</span></label>
                      <input
                        type="text" className="form-control fs-13" value={form.cheque_number}
                        onChange={e => setForm(f => ({ ...f, cheque_number: e.target.value }))}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label fs-13 fw-medium mb-1">Amount <span className="text-danger">*</span></label>
                      <input
                        type="number" min={0} step="0.01" className="form-control fs-13" value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label fs-13 fw-medium mb-1">Drawer name <span className="text-danger">*</span></label>
                      <input
                        type="text" className="form-control fs-13" placeholder="Who wrote the cheque"
                        value={form.drawer_name}
                        onChange={e => setForm(f => ({ ...f, drawer_name: e.target.value }))}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label fs-13 fw-medium mb-1">Drawer bank <span className="text-danger">*</span></label>
                      <input
                        type="text" className="form-control fs-13" placeholder="Bank it's drawn on"
                        value={form.drawer_bank}
                        onChange={e => setForm(f => ({ ...f, drawer_bank: e.target.value }))}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label fs-13 fw-medium mb-1">Cheque date <span className="text-danger">*</span></label>
                      <input
                        type="date" className="form-control fs-13" value={form.cheque_date}
                        onChange={e => setForm(f => ({ ...f, cheque_date: e.target.value }))}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label fs-13 fw-medium mb-1">Received on</label>
                      <input
                        type="date" className="form-control fs-13" value={form.received_on} max={localToday()}
                        onChange={e => setForm(f => ({ ...f, received_on: e.target.value }))}
                      />
                    </div>
                  </div>

                  {form.cheque_date && form.cheque_date > localToday() && (
                    <div className="alert alert-info fs-12 py-2 mb-0">
                      <i className="ti ti-calendar-time me-1" />
                      Post-dated cheque. It can be deposited from {fmtDate(form.cheque_date)}.
                    </div>
                  )}

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Customer</label>
                    <select
                      className="form-select fs-13" value={form.customer}
                      onChange={e => onCustomerChange(e.target.value)}
                    >
                      <option value="">No customer</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Sale being paid</label>
                    <select
                      className="form-select fs-13" value={form.sale} disabled={!form.customer}
                      onChange={e => onSaleChange(e.target.value)}
                    >
                      <option value="">{form.customer ? "Not linked to a sale" : "Select a customer first"}</option>
                      {customerSales.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.order_number} · balance {fmtMoney(s.balance_due)}
                        </option>
                      ))}
                    </select>
                    <div className="fs-11 text-muted mt-1">
                      When the cheque clears, a payment is recorded on the linked sale.
                    </div>
                  </div>


                       <div>
                    <label className="form-label fs-13 fw-medium mb-1">Cheque photo</label>
                    {imagePreview ? (
                      <div className="border rounded p-2 d-flex align-items-center gap-2">
                        <img
                          src={imagePreview} alt="Cheque"
                          style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 4 }}
                        />
                        <div className="flex-grow-1 fs-12 text-muted text-truncate">
                          {imageFile ? imageFile.name : "Current photo"}
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={onImageRemove}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file" accept="image/*" capture="environment"
                        className="form-control fs-13" onChange={onImagePick}
                      />
                    )}
                    <div className="fs-11 text-muted mt-1">Optional. JPG or PNG, up to 5 MB.</div>
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

              {mode === "view" && selected && selected.status === "received" && (
                <>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(selected)}>
                    <i className="ti ti-edit me-1" />Edit
                  </button>
                  <button className="btn btn-sm btn-success" onClick={() => openDeposit(selected)} disabled={selected.is_post_dated}>
                    <i className="ti ti-building-bank me-1" />Deposit
                  </button>
                </>
              )}
              {mode === "view" && selected && selected.status === "deposited" && (
                <>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => openBounce(selected)}>
                    <i className="ti ti-alert-triangle me-1" />Bounced
                  </button>
                  <button className="btn btn-sm btn-success" onClick={() => openClear(selected)}>
                    <i className="ti ti-check me-1" />Cleared
                  </button>
                </>
              )}

              {(mode === "add" || mode === "edit") && (
                <button type="submit" form="cheque-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  {mode === "edit" ? "Update cheque" : "Save cheque"}
                </button>
              )}
              {mode === "deposit" && (
                <button type="submit" form="deposit-form" className="btn btn-sm btn-success px-3" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  Confirm deposit
                </button>
              )}
              {mode === "clear" && (
                <button type="submit" form="clear-form" className="btn btn-sm btn-success px-3" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  Confirm cleared
                </button>
              )}
              {mode === "bounce" && (
                <button type="submit" form="bounce-form" className="btn btn-sm btn-danger px-3" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  Confirm bounced
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
