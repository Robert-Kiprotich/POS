import { useState, useEffect } from "react";
import API from "../../services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  customer?: any | null;
}

type Mode = "create" | "view" | "edit";
type SaleTypeFilter = "all" | "credit" | "retail" | "wholesale";

const EMPTY = {
  name: "",
  business_name: "",
  phone: "",
  alt_phone: "",
  email: "",
  address: "",
  loyalty_points: "0",
};

function fmtDate(iso: string) {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(value: any) {
  const amount = Number(value ?? 0);

  return amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toForm(c: any) {
  return {
    name: c?.name ?? "",
    business_name: c?.business_name ?? "",
    phone: c?.phone ?? "",
    alt_phone: c?.alt_phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    loyalty_points: String(c?.loyalty_points ?? 0),
  };
}

export default function CustomerFormOffcanvas({
  open,
  onClose,
  onSaved,
  customer,
}: Props) {
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>("create");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [filterType, setFilterType] = useState<SaleTypeFilter>("all");

  const selectedSale = customer?.selectedSale ?? null;
  const initialSaleType = String(selectedSale?.sale_type ?? "").toLowerCase();

  // Slide in / out
  useEffect(() => {
    if (open) {
      setMounted(true);

      let id2 = 0;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setVisible(true));
      });

      return () => {
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
      };
    } else {
      setVisible(false);

      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Set filter based on the selected row's sale_type when opened
  useEffect(() => {
    if (open) {
      setMode(customer ? "view" : "create");
      setForm(customer ? toForm(customer) : EMPTY);
      setError("");
      setFieldErrors({});

      if (initialSaleType === "credit" || initialSaleType === "retail" || initialSaleType === "wholesale") {
        setFilterType(initialSaleType as SaleTypeFilter);
      } else {
        setFilterType("all");
      }
    }
  }, [open, customer]);

  // Close on Escape + lock body scroll
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function cancelEdit() {
    if (customer) {
      setForm(toForm(customer));
      setError("");
      setFieldErrors({});
      setMode("view");
    } else {
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (!form.name.trim()) {
      setFieldErrors({ name: "Name is required." });
      return;
    }

    const payload = {
      name: form.name.trim(),
      business_name: form.business_name.trim(),
      phone: form.phone.trim(),
      alt_phone: form.alt_phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      loyalty_points: Math.max(0, parseInt(form.loyalty_points, 10) || 0),
    };

    setSaving(true);

    try {
      if (mode === "edit" && customer?.id != null) {
        await API.patch(`customers/${customer.id}/`, payload);
      } else {
        await API.post("customers/", payload);
      }

      onSaved?.();
      onClose();
    } catch (err: any) {
      const data = err.response?.data;
      if (data && typeof data === "object" && !data.message && !data.detail) {
        const fe: Record<string, string> = {};
        Object.keys(data).forEach((k) => {
          fe[k] = Array.isArray(data[k]) ? data[k][0] : String(data[k]);
        });
        setFieldErrors(fe);
      } else {
        setError(data?.message || data?.detail || "Failed to save customer.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const fieldErr = (f: string) =>
    fieldErrors[f] ? <div className="text-danger fs-12 mt-1">{fieldErrors[f]}</div> : null;

  const title = mode === "create" ? "Add Customer" : mode === "edit" ? "Edit Customer" : "Customer Details";
  const icon = mode === "create" ? "ti-user-plus" : mode === "edit" ? "ti-edit" : "ti-user";

  // Filter sales list based on selected filterType
  const salesList = Array.isArray(customer?.sales) ? customer.sales : [];
  const filteredSales = salesList.filter((item: any) => {
    if (filterType === "all") return true;
    return String(item?.sale_type ?? "").toLowerCase() === filterType;
  });

  return (
    <>
      <div className={`offcanvas-backdrop fade ${visible ? "show" : ""}`} onClick={onClose} />

      <div
        className={`offcanvas offcanvas-end ${visible ? "show" : ""}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-offcanvas-title"
        style={{
          visibility: "visible",
          width: "min(520px, 100vw)",
          transform: visible ? "none" : "translateX(100%)",
          transition: "transform 0.3s ease-in-out",
        }}
      >
        <div className="offcanvas-header border-bottom">
          <h5 className="offcanvas-title mb-0" id="customer-offcanvas-title">
            <i className={`ti ${icon} me-2 text-primary`} />
            {title}
          </h5>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>

        {/* VIEW MODE */}
        {mode === "view" && customer ? (
          <div className="d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
            <div className="offcanvas-body" style={{ overflowY: "auto" }}>
              
              {/* Customer Header */}
              <div className="d-flex align-items-center gap-3 mb-4">
                <div
                  className="avatar avatar-lg avatar-rounded bg-primary-transparent text-primary d-flex align-items-center justify-content-center fw-semibold fs-4"
                  style={{ width: 56, height: 56 }}
                >
                  {(customer.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-grow-1">
                  <h5 className="mb-1 fw-semibold">{customer.name}</h5>
                  <span className="badge bg-warning-transparent text-warning">
                    <i className="ti ti-star me-1" />
                    {customer.loyalty_points ?? 0} points
                  </span>
                </div>
              </div>

              {/* SALES HISTORY & FILTERING */}
              <div className="mb-4">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h6 className="fw-semibold mb-0">
                    <i className="ti ti-receipt me-2 text-primary" />
                    Sales History ({filteredSales.length})
                  </h6>
                </div>

                {/* Filter Controls */}
                <div className="d-flex gap-1 mb-3 flex-wrap">
                  {(["all", "credit", "retail", "wholesale"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`btn btn-xs px-2 py-1 fs-11 text-capitalize rounded-pill ${
                        filterType === type ? "btn-primary" : "btn-outline-light text-dark border"
                      }`}
                      onClick={() => setFilterType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {/* Sales Cards Container */}
                {filteredSales.length > 0 ? (
                  <div className="d-flex flex-column gap-3" style={{ maxHeight: "350px", overflowY: "auto" }}>
                    {filteredSales.map((item: any, idx: number) => {
                      const itemType = String(item?.sale_type ?? "").toLowerCase();
                      const isCredit = itemType === "credit";
                      const isSelected = selectedSale && (selectedSale.id ? selectedSale.id === item.id : selectedSale.order_number === item.order_number);

                      return (
                        <div
                          key={item.id || idx}
                          className={`card border mb-0 ${
                            isSelected ? "border-primary bg-primary-transparent" : ""
                          }`}
                        >
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="fw-semibold fs-13">
                                {item.order_number || `Sale #${idx + 1}`}
                              </span>
                              <span
                                className={`badge ${
                                  isCredit
                                    ? "bg-danger-transparent text-danger"
                                    : itemType === "debit"
                                    ? "bg-success-transparent text-success"
                                    : "bg-secondary-transparent text-secondary"
                                }`}
                              >
                                {item.sale_type || "Sale"}
                              </span>
                            </div>

                            <div className="d-flex justify-content-between fs-12 text-muted mb-1">
                              <span>Date: {item.created_at ? fmtDate(item.created_at) : "—"}</span>
                              <span className="text-capitalize">Status: {item.status || "Completed"}</span>
                            </div>

                            {/* EXTRA CREDIT FIELDS */}
                            {isCredit && (
                              <div className="bg-light p-2 rounded my-2 fs-12">
                                <div className="d-flex justify-content-between text-muted">
                                  <span>Subtotal:</span>
                                  <span>KSh {fmtMoney(item.subtotal)}</span>
                                </div>
                                <div className="d-flex justify-content-between text-muted">
                                  <span>Tax:</span>
                                  <span>KSh {fmtMoney(item.tax_amount)}</span>
                                </div>
                                {Number(item.discount_amount) > 0 && (
                                  <div className="d-flex justify-content-between text-danger">
                                    <span>Discount:</span>
                                    <span>- KSh {fmtMoney(item.discount_amount)}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="d-flex justify-content-between fs-13 border-top pt-2 mt-2">
                              <span>Total Amount:</span>
                              <span className="fw-bold">KSh {fmtMoney(item.total_amount)}</span>
                            </div>

                            <div className="d-flex justify-content-between fs-12 text-muted mt-1">
                              <span>Paid / Balance:</span>
                              <span>
                                KSh {fmtMoney(item.amount_paid)} /{" "}
                                <strong className={Number(item.balance_due || 0) > 0 ? "text-danger" : "text-success"}>
                                  KSh {fmtMoney(item.balance_due)}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="alert alert-secondary py-2 fs-13 text-center mb-0">
                    No {filterType} sales found for this customer.
                  </div>
                )}
              </div>

              {/* CUSTOMER INFORMATION */}
              <h6 className="fw-semibold mb-2">
                <i className="ti ti-user me-2 text-primary" />
                Customer Information
              </h6>

              {[
                { label: "Phone", value: customer.phone, icon: "ti-phone" },
                { label: "Email", value: customer.email, icon: "ti-mail" },
                { label: "Address", value: customer.address, icon: "ti-map-pin" },
                {
                  label: "Date added",
                  value: customer.created_at ? fmtDate(customer.created_at) : "",
                  icon: "ti-calendar",
                },
              ].map((row) => (
                <div key={row.label} className="d-flex align-items-start gap-3 py-3 border-bottom">
                  <i className={`ti ${row.icon} text-muted fs-5`} />
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="text-muted fs-12 mb-1">{row.label}</div>
                    <div className="fw-medium fs-13" style={{ wordBreak: "break-word" }}>
                      {row.value || <span className="text-muted">—</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="offcanvas-footer border-top p-3 d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setMode("edit")}>
                <i className="ti ti-edit me-1" />
                Edit Customer
              </button>
            </div>
          </div>
        ) : (
          /* CREATE / EDIT MODE */
          <form onSubmit={handleSubmit} className="d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
            <div className="offcanvas-body">
              {error && (
                <div className="alert alert-danger fs-13 py-2">
                  <i className="ti ti-alert-circle me-2" />
                  {error}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fs-13 mb-1">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control ${fieldErrors.name ? "is-invalid" : ""}`}
                  maxLength={150}
                  autoFocus
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Full name"
                />
                {fieldErr("name")}
              </div>
              <div className="mb-3">
  <label className="form-label fs-13 fw-medium">Business Name <span className="text-muted fw-normal">(optional)</span></label>
  <input className="form-control" value={form.business_name}
    onChange={e => setForm({ ...form, business_name: e.target.value })} />
</div>
              <div className="mb-3">
                <label className="form-label fs-13 mb-1">Phone</label>
                <input
                  type="tel"
                  className={`form-control ${fieldErrors.phone ? "is-invalid" : ""}`}
                  maxLength={32}
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="e.g. 0722 000 000"
                />
                {fieldErr("phone")}
              </div>
<div className="mb-3">
  <label className="form-label fs-13 fw-medium">Alternative Phone <span className="text-muted fw-normal">(optional)</span></label>
  <input className="form-control" value={form.alt_phone}
    onChange={e => setForm({ ...form, alt_phone: e.target.value })} />
</div>
              <div className="mb-3">
                <label className="form-label fs-13 mb-1">Email</label>
                <input
                  type="email"
                  className={`form-control ${fieldErrors.email ? "is-invalid" : ""}`}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="name@example.com"
                />
                {fieldErr("email")}
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 mb-1">Address</label>
                <input
                  type="text"
                  className={`form-control ${fieldErrors.address ? "is-invalid" : ""}`}
                  maxLength={255}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="Town / area"
                />
                {fieldErr("address")}
              </div>

              <div className="mb-3">
                <label className="form-label fs-13 mb-1">Loyalty points</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={`form-control ${fieldErrors.loyalty_points ? "is-invalid" : ""}`}
                  value={form.loyalty_points}
                  onChange={(e) => set("loyalty_points", e.target.value)}
                />
                {mode === "create" && (
                  <div className="text-muted fs-12 mt-1">Leave at 0 for a new customer.</div>
                )}
                {fieldErr("loyalty_points")}
              </div>
            </div>

            <div className="offcanvas-footer border-top p-3 d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? (
                  <span className="spinner-border spinner-border-sm me-2" />
                ) : (
                  <i className="ti ti-check me-1" />
                )}
                {mode === "edit" ? "Save Changes" : "Save Customer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}