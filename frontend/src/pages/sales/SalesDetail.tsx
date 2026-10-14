import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import API from "../../services/api";
import { all_routes } from "../../routes/all_routes";

const route = all_routes;

const PAYMENT_METHODS = ["cash", "card", "mpesa", "bank_transfer", "other"] as const;
const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", mpesa: "M-Pesa", bank_transfer: "Bank Transfer", other: "Other",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function money(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n == null || isNaN(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CLS: Record<string, string> = {
  pending:   "badge bg-warning-transparent text-warning",
  completed: "badge bg-success-transparent text-success",
  paid:      "badge bg-success-transparent text-success",
  cancelled: "badge bg-danger-transparent text-danger",
  refunded:  "badge bg-secondary-transparent text-secondary",
};

interface Props {
  saleId: string | number | null;   // null = closed
  onClose: () => void;
  onChanged?: () => void;           // called after a payment is recorded (refresh the list)
}

export default function SaleDetailOffcanvas({ saleId, onClose, onChanged }: Props) {
  const [sale, setSale]       = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payMethod, setPayMethod]         = useState<typeof PAYMENT_METHODS[number]>("cash");
  const [payAmount, setPayAmount]         = useState("");
  const [payReference, setPayReference]   = useState("");
  const [payReceivedBy, setPayReceivedBy] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [payError, setPayError]           = useState("");

  const open = saleId != null;

  const load = useCallback((showSpinner = true) => {
    if (saleId == null) return;
    if (showSpinner) setLoading(true);
    setError("");
    API.get(`sales/${saleId}/`)
      .then(res => {
        const raw = res.data?.data ?? res.data;
        if (raw && raw.id != null) setSale(raw);
        else setError(res.data?.message || "Failed to load sale");
      })
      .catch(() => setError("Failed to load sale details"))
      .finally(() => setLoading(false));
  }, [saleId]);

  // Load whenever a different sale is opened; reset local state
  useEffect(() => {
    if (saleId == null) return;
    setSale(null);
    setShowPaymentForm(false);
    setPayError("");
    load();
  }, [saleId, load]);

  // Close on Escape + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  async function submitPayment() {
    setPayError("");
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { setPayError("Enter a valid payment amount."); return; }
    setSavingPayment(true);
    try {
      await API.post(`sales/${sale.id}/add_payment/`, {
  method: payMethod,
  amount: amt,
  reference: payReference,
});
      setShowPaymentForm(false);
      setPayAmount(""); setPayReference(""); setPayReceivedBy(""); setPayMethod("cash");
      load(false);
      onChanged?.();
    } catch (err: any) {
      setPayError(err.response?.data?.message || "Failed to record payment.");
    } finally {
      setSavingPayment(false);
    }
  }

  if (!open) return null;

  const s = sale;
  const items: any[]    = Array.isArray(s?.items) ? s.items : [];
  const payments: any[] = Array.isArray(s?.payments) ? s.payments : [];
  const balance = parseFloat(s?.balance_due) || 0;
  const showProfit = s?.profit !== undefined;

  return (
    <>
      <div className="offcanvas-backdrop fade show" onClick={onClose} />
      <div
        className="offcanvas offcanvas-end show"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-offcanvas-title"
        style={{ visibility: "visible", width: "min(760px, 100vw)" }}
      >
        {/* Header */}
        <div className="offcanvas-header border-bottom">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <h5 className="offcanvas-title mb-0" id="sale-offcanvas-title">
              {s?.order_number ?? "Sale"}
            </h5>
            {s && (
              <span className={STATUS_CLS[s.status] || "badge bg-secondary-transparent text-secondary"} style={{ textTransform: "capitalize" }}>
                {s.status}
              </span>
            )}
           
          </div>
          <div className="d-flex align-items-center gap-2">
            
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
        </div>

        {/* Body */}
        <div className="offcanvas-body p-0">
          {loading && !s ? (
            <div className="d-flex align-items-center justify-content-center py-5 text-muted">
              <span className="spinner-border spinner-border-sm me-2" />Loading sale…
            </div>
          ) : error ? (
            <div className="p-3">
              <div className="alert alert-danger fs-13 mb-2"><i className="ti ti-circle-x me-2" />{error}</div>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => load()}>
                <i className="ti ti-refresh me-1" />Try again
              </button>
            </div>
          ) : s ? (
            <div className="p-3">

              <div className="text-muted fs-12 mb-3">
                <i className="ti ti-clock me-1" />Created {fmtDate(s.created_at)}
                {s.cashier_name && <span className="ms-2">by <strong>{s.cashier_name}</strong></span>}
              </div>

              {/* Summary tiles */}
              <div className="row g-2 mb-3">
                {[
                  { label: "Total",   value: money(s.total_amount), cls: "" },
                  { label: "Paid",    value: money(s.amount_paid),  cls: "text-success" },
                  { label: "Balance", value: money(balance),        cls: balance > 0 ? "text-danger" : "text-success" },
                    ...(showProfit ? [{ label: "Profit", value: money(s.profit), cls: parseFloat(s.profit) < 0 ? "text-danger" : "text-success" }] : []),

                ].map(t => (
  <div key={t.label} className={showProfit ? "col-3" : "col-4"}>
                    <div className="border rounded p-2">
                      <p className="text-muted fs-12 mb-1">{t.label}</p>
                      <h6 className={`mb-0 fw-semibold ${t.cls}`}>{t.value}</h6>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order info */}
              <div className="card shadow-none border mb-3">
                <div className="card-header py-2 border-bottom d-flex align-items-center gap-2">
                  <i className="ti ti-file-text text-primary" />
                  <h6 className="mb-0 fw-semibold fs-14">Order Info</h6>
                </div>
                <div className="card-body py-3">
                  <div className="row">
                    <div className="col-sm-4 mb-2">
                      <p className="text-muted fs-12 mb-1">Customer</p>
                      <p className="fw-medium fs-13 mb-0">{s.customer_name || "Walk-in"}</p>
                    </div>
                    <div className="col-sm-4 mb-2">
                      <p className="text-muted fs-12 mb-1">Cashier</p>
                      <p className="fw-medium fs-13 mb-0">{s.cashier_name || "—"}</p>
                    </div>
                    <div className="col-sm-4 mb-2">
                      <p className="text-muted fs-12 mb-1">Order number</p>
                      <p className="fw-medium fs-13 mb-0">{s.order_number}</p>
                    </div>
                                        <div className="col-sm-4 mb-2">
                      <p className="text-muted fs-12 mb-1">Sale type</p>
                      <p className="fw-medium fs-13 mb-0">{s.sale_type || "Retail"}</p>
                    </div>
                    {s.notes && (
                      <div className="col-12">
                        <p className="text-muted fs-12 mb-1">Notes</p>
                        <p className="fs-13 mb-0" style={{ whiteSpace: "pre-wrap" }}>{s.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="card shadow-none border mb-3">
                <div className="card-header py-2 border-bottom d-flex align-items-center gap-2">
                  <i className="ti ti-shopping-cart text-primary" />
                  <h6 className="mb-0 fw-semibold fs-14">Items</h6>
                  <span className="badge bg-primary-transparent text-primary fs-11 ms-auto">{items.length}</span>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-sm mb-0 fs-13">
                      <thead className="table-light">
                        <tr>
                          <th className="ps-3">Product</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Tax</th>
                          <th>Discount</th>
                          {showProfit && <th>Profit</th>}
                          <th className="text-end pe-3">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(it => (
                          <tr key={it.id}>
                            <td className="ps-3">
                              <div className="fw-medium">{it.product_detail?.name ?? `#${it.product}`}</div>
                              {it.product_detail?.sku && <div className="text-muted fs-12">{it.product_detail.sku}</div>}
                            </td>
                            <td>{it.quantity}</td>
                            <td>{money(it.unit_price)}</td>
                            <td className="text-muted">{it.tax_rate}%</td>
                            <td className="text-muted">{parseFloat(it.discount_amount) > 0 ? money(it.discount_amount) : "—"}</td>
                            <td className="text-end pe-3 fw-semibold">{money(it.line_total)}</td>
                            
                            {showProfit && <td className="text-muted">{money(it.profit)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="card shadow-none border mb-3">
                <div className="card-header py-2 border-bottom">
                  <h6 className="mb-0 fw-semibold fs-14"><i className="ti ti-receipt me-2 text-primary" />Totals</h6>
                </div>
                <div className="card-body py-3">
                  <div className="d-flex justify-content-between fs-13 mb-2">
                    <span className="text-muted">Subtotal</span><span>{money(s.subtotal)}</span>
                  </div>
                  <div className="d-flex justify-content-between fs-13 mb-2">
                    <span className="text-muted">Discount</span><span className="text-danger">-{money(s.discount_amount)}</span>
                  </div>
                  <div className="d-flex justify-content-between fs-13 mb-2">
                    <span className="text-muted">Tax</span><span>{money(s.tax_amount)}</span>
                  </div>
                  <hr className="my-2" />
                  <div className="d-flex justify-content-between fs-15 fw-semibold mb-2">
                    <span>Total</span><span>{money(s.total_amount)}</span>
                  </div>
                  <div className="d-flex justify-content-between fs-13 mb-2">
                    <span className="text-muted">Amount paid</span><span className="text-success">{money(s.amount_paid)}</span>
                  </div>
                  <div className="d-flex justify-content-between fs-13">
                    <span className="text-muted">Balance due</span>
                    <span className={balance > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>{money(balance)}</span>
                  </div>
     {showProfit && (
  <>
    <hr className="my-2" />
    <div className="d-flex justify-content-between fs-13">
      <span className="text-muted">Profit</span>
      <span className={parseFloat(s.profit) < 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>
        {money(s.profit)}
      </span>
    </div>
  </>
)}
                </div>
              </div>

              {/* Payments */}
              <div className="card shadow-none border mb-0">
                <div className="card-header py-2 border-bottom d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <i className="ti ti-credit-card text-primary" />
                    <h6 className="mb-0 fw-semibold fs-14">Payments</h6>
                    <span className="badge bg-primary-transparent text-primary fs-11">{payments.length}</span>
                  </div>
                  {balance > 0 && (
                    <button className="btn btn-sm btn-primary" onClick={() => setShowPaymentForm(v => !v)}>
                      <i className="ti ti-plus me-1" />Record payment
                    </button>
                  )}
                </div>

                {showPaymentForm && (
                  <div className="card-body border-bottom bg-light py-3">
                    {payError && <div className="alert alert-danger fs-12 py-2">{payError}</div>}
                    <div className="row g-2">
                      <div className="col-sm-6">
                        <label className="form-label fs-12 mb-1">Method</label>
                        <select className="form-select form-select-sm fs-13" value={payMethod} onChange={e => setPayMethod(e.target.value as any)}>
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                        </select>
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label fs-12 mb-1">Amount</label>
                        <input type="number" min={0} step="0.01" className="form-control form-control-sm fs-13"
                          value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={money(balance)} />
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label fs-12 mb-1">Reference</label>
                        <input type="text" className="form-control form-control-sm fs-13" value={payReference} onChange={e => setPayReference(e.target.value)} />
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label fs-12 mb-1">Received by</label>
                        <input type="text" className="form-control form-control-sm fs-13" value={payReceivedBy} onChange={e => setPayReceivedBy(e.target.value)} />
                      </div>
                      <div className="col-12 d-flex gap-2 justify-content-end">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowPaymentForm(false)}>Cancel</button>
                        <button className="btn btn-sm btn-primary" disabled={savingPayment} onClick={submitPayment}>
                          {savingPayment ? <span className="spinner-border spinner-border-sm" /> : "Save payment"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card-body p-0">
                  {payments.length === 0 ? (
                    <div className="text-center text-muted py-4 fs-13">
                      <i className="ti ti-credit-card-off fs-2 d-block mb-2" />No payments recorded yet
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm mb-0 fs-13">
                        <thead className="table-light">
                          <tr>
                            <th className="ps-3">Method</th>
                            <th>Amount</th>
                            <th>Reference</th>
                            <th>Received By</th>
                            <th className="pe-3">Paid At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map(p => (
                            <tr key={p.id}>
                              <td className="ps-3">
                                <span className="badge bg-info-transparent text-info">{p.method_display || METHOD_LABELS[p.method] || p.method}</span>
                              </td>
                              <td className="fw-semibold text-success">{money(p.amount)}</td>
                              <td className="text-muted">{p.reference || "—"}</td>
                              <td className="text-muted">{p.received_by ?? "—"}</td>
                              <td className="text-muted pe-3 text-nowrap">{fmtDate(p.paid_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : null}
        </div>
        
      </div>
    </>
  );
}
