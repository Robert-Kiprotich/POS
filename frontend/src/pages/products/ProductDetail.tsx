import { useState, useEffect } from "react";
import { Link, useParams } from "react-router";
import API from "../../services/api";
import { all_routes } from "../../routes/all_routes";

const route = all_routes;

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({ label, value }: { label: string; value: any }) {
  const display = value === true ? "Yes" : value === false ? "No" : value;
  if (!display && display !== 0) return null;
  return (
    <div className="col-md-4 col-sm-6 mb-3">
      <p className="text-muted fs-11 mb-1 text-uppercase fw-semibold" style={{ letterSpacing: "0.5px" }}>{label}</p>
      <p className="fw-medium fs-13 mb-0 text-dark">{String(display)}</p>
    </div>
  );
}

function SectionCard({ title, icon, children, badge }: { title: string; icon: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="card shadow-none border mb-3">
      <div className="card-header py-3 border-bottom d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <i className={`${icon} fs-5 text-primary`} />
          <h6 className="mb-0 fw-semibold fs-14">{title}</h6>
        </div>
        {badge && <span className="badge bg-primary-transparent text-primary fs-11">{badge}</span>}
      </div>
      <div className="card-body py-3">
        <div className="row">{children}</div>
      </div>
    </div>
  );
}

/** Normalise a raw API product object (category may be null, a string, or an object). */
function normalizeProduct(p: any) {
  const catName = (c: any) => {
    if (!c) return "";
    if (typeof c === "string") return c;
    return c.name ?? c.category_name ?? String(c);
  };
  const cost    = parseFloat(p.cost_price)    || 0;
  const selling = parseFloat(p.selling_price) || 0;
  return {
    ...p,
    category:  catName(p.category),
    margin:    selling - cost,
    margin_pct: cost > 0 ? ((selling - cost) / cost) * 100 : null,
  };
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    API.get(`products/${id}/`)
      .then(res => {
        // Handle both a plain object response and a wrapped { status, data/product } response
        const raw = res.data?.status && res.data.status !== "success"
          ? null
          : (res.data?.data ?? res.data?.product ?? res.data);
        if (raw && raw.id != null) setProduct(normalizeProduct(raw));
        else setError(res.data?.message || "Failed to load product");
      })
      .catch(() => setError("Failed to load product details"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="page-wrapper">
      <div className="content d-flex align-items-center justify-content-center py-5">
        <span className="spinner-border text-primary me-2" />Loading product…
      </div>
    </div>
  );

  if (error) return (
    <div className="page-wrapper">
      <div className="content">
        <div className="alert alert-danger fs-13"><i className="ti ti-circle-x me-2" />{error}</div>
        <Link to={route.productsList ?? "/products"} className="btn btn-outline-secondary btn-sm">
          <i className="ti ti-arrow-left me-1" />Back to Products
        </Link>
      </div>
    </div>
  );

  const p = product;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Breadcrumb + header */}
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Link to={route.productsList ?? "/products"} className="text-muted fs-13 text-decoration-none d-flex align-items-center gap-1">
              <i className="ti ti-arrow-left" />Products
            </Link>
            <i className="ti ti-chevron-right text-muted fs-11" />
            <span className="fw-semibold fs-14">{p.name}</span>
            {p.is_active
              ? <span className="badge bg-success-transparent text-success">Active</span>
              : <span className="badge bg-secondary-transparent text-secondary">Inactive</span>}
            {p.is_low_stock && <span className="badge bg-danger-transparent text-danger">Low Stock</span>}
            {p.stock_quantity === 0 && <span className="badge bg-danger">Out of Stock</span>}
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted fs-12">
              <i className="ti ti-clock me-1" />Updated {fmtDate(p.updated_at)}
            </span>
            <Link to={`${route.editProduct ?? "/products/edit"}/${p.id}`} className="btn btn-primary btn-sm">
              <i className="ti ti-edit me-1" />Edit
            </Link>
          </div>
        </div>

        <div className="row g-3">

          {/* ── Left: main product info ─────────────────────────────── */}
          <div className="col-xl-8">

            {/* Product Record */}
            <SectionCard title="Product Details" icon="ti ti-package">
              <Field label="Product Name" value={p.name} />
              <Field label="SKU"          value={p.sku} />
              <Field label="Barcode"      value={p.barcode} />
              <Field label="Category"     value={p.category} />
              <Field label="Status"       value={p.is_active ? "Active" : "Inactive"} />
              <Field label="Date Created" value={fmtDate(p.created_at)} />
            </SectionCard>

            {/* Pricing */}
            <SectionCard title="Pricing" icon="ti ti-currency-dollar">
              <Field label="Cost Price"    value={fmtMoney(p.cost_price)} />
              <Field label="Selling Price" value={fmtMoney(p.selling_price)} />
              <Field label="Tax Rate"      value={p.tax_rate != null ? `${p.tax_rate}%` : null} />
              <Field label="Margin"        value={fmtMoney(p.margin)} />
              <Field label="Margin %"      value={p.margin_pct != null ? `${p.margin_pct.toFixed(1)}%` : null} />
            </SectionCard>

            {/* Inventory */}
            <SectionCard title="Inventory" icon="ti ti-building-warehouse">
              <Field label="Stock Quantity" value={p.stock_quantity} />
              <Field label="Reorder Level"  value={p.reorder_level} />
              <Field label="Low Stock"      value={p.is_low_stock ? "Yes" : "No"} />
            </SectionCard>

            {/* Description */}
            {p.description && (
              <div className="card shadow-none border mb-3">
                <div className="card-header py-3 border-bottom d-flex align-items-center gap-2">
                  <i className="ti ti-notes fs-5 text-primary" />
                  <h6 className="mb-0 fw-semibold fs-14">Description</h6>
                </div>
                <div className="card-body">
                  <p className="fs-13 mb-0" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{p.description}</p>
                </div>
              </div>
            )}

          </div>

          {/* ── Right: images ────────────────────────────────────── */}
          <div className="col-xl-4">

            <div className="card shadow-none border mb-3">
              <div className="card-header py-3 border-bottom d-flex align-items-center gap-2">
                <i className="ti ti-photo fs-5 text-primary" />
                <h6 className="mb-0 fw-semibold fs-14">Product Image</h6>
              </div>
              <div className="card-body d-flex align-items-center justify-content-center py-4">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="img-fluid rounded" style={{ maxHeight: 240, objectFit: "cover" }} />
                  : <div className="text-center text-muted py-3 fs-13"><i className="ti ti-photo-off fs-3 d-block mb-2" />No image</div>}
              </div>
            </div>

            <div className="card shadow-none border mb-3">
              <div className="card-header py-3 border-bottom d-flex align-items-center gap-2">
                <i className="ti ti-barcode fs-5 text-primary" />
                <h6 className="mb-0 fw-semibold fs-14">Barcode</h6>
              </div>
              <div className="card-body d-flex flex-column align-items-center justify-content-center py-4">
                {p.barcode_image_url
                  ? <img src={p.barcode_image_url} alt="barcode" className="img-fluid mb-2" style={{ maxHeight: 100 }} />
                  : <div className="text-center text-muted py-2 fs-13"><i className="ti ti-barcode-off fs-3 d-block mb-2" />No barcode image</div>}
                <span className="fs-13 fw-medium text-dark">{p.barcode || "—"}</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
