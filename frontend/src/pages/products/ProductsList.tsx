import React, { useState, useEffect, useCallback, useRef,useMemo } from "react";
import * as XLSX from "xlsx";
import { Link } from "react-router";
import API from "../../services/api";
import { all_routes } from "../../routes/all_routes";
import { showSuccess, showError, showWarning, showConfirm } from "../../components/alerts/Alerts";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useBranchAccess } from "../../hooks/useBranchAccess";

const route = all_routes;

function fmtDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n == null || isNaN(n)) return "";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── All available columns ─────────────────────────────────────────────────────
export const ALL_COLUMNS = [
  // Identifiers
  { key: "name",              label: "Product Name",   group: "Identifiers" },
  { key: "item_number",       label: "Item Number",    group: "Identifiers" },
  // Classification
  { key: "category",          label: "Category",       group: "Classification" },
  { key: "description",       label: "Description",    group: "Classification" },
  { key: "manufacturer",      label: "Manufacturer",   group: "Identifiers" },   // ← add
{ key: "pack_size",         label: "Pack Size",      group: "Identifiers" },
  // Pricing
  { key: "cost_price",        label: "Cost Price",     group: "Pricing" },
  { key: "retail_price",      label: "Retail Price",   group: "Pricing" },
  { key: "wholesale_price",   label: "Wholesale Price",group: "Pricing" },
  { key: "margin",            label: "Margin",         group: "Pricing" },
  { key: "tax_rate",          label: "Tax Rate (%)",   group: "Pricing" },
  // Inventory (aggregated across branches — see Branch Stock page for per-branch detail)
  { key: "total_stock",       label: "Total Stock (all branches)", group: "Inventory" },
  { key: "expiry_date",       label: "Expiry Date",    group: "Inventory" },
  // Status
  { key: "is_active",         label: "Active",         group: "Status" },
  // Media
  { key: "image_url",         label: "Image",          group: "Media" },
  // Timestamps
  { key: "created_at",        label: "Date Created",   group: "Timestamps" },
  { key: "updated_at",        label: "Last Updated",   group: "Timestamps" },
] as const;

type ColKey = typeof ALL_COLUMNS[number]["key"];

const DEFAULT_VISIBLE: ColKey[] = [
  "name", "item_number", "category","manufacturer", "pack_size", "retail_price", "total_stock", "is_active",
];

const BOOL_KEYS = new Set<ColKey>(["is_active"]);
const DATE_KEYS = new Set<ColKey>(["created_at", "updated_at", "expiry_date"]);
const MONEY_KEYS = new Set<ColKey>(["cost_price", "retail_price", "wholesale_price", "margin"]);
const IMAGE_KEYS = new Set<ColKey>(["image_url"]);

function cellValue(row: any, key: ColKey): string {
  const v = row[key];
  if (BOOL_KEYS.has(key)) return v ? "Yes" : "No";
  if (DATE_KEYS.has(key)) return fmtDate(v);
  if (MONEY_KEYS.has(key)) return fmtMoney(v);
  if (IMAGE_KEYS.has(key)) return v ? String(v) : "";
  return v == null ? "" : String(v);
}

function exportCSV(rows: any[], cols: ColKey[]) {
  const headers = cols.map(k => ALL_COLUMNS.find(c => c.key === k)!.label);
  const lines = [
    headers.join(","),
    ...rows.map(r => cols.map(k => `"${cellValue(r, k).replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `products_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[], cols: ColKey[]) {
  const headers = cols.map(k => ALL_COLUMNS.find(c => c.key === k)!.label);
  const data = [headers, ...rows.map(r => cols.map(k => cellValue(r, k)))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, `products_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const GROUPS = Array.from(new Set(ALL_COLUMNS.map(c => c.group)));

export interface CategoryOption {
  id: number | string;
  name: string;
}

export interface ProductForm {
  name: string;
  item_number: string;
  category: string | number;
  description: string;
  manufacturer: string;   // ← add
  pack_size: string;      // ← add
  cost_price: string;
  retail_price: string;
  wholesale_price: string;
  tax_rate: string;
  expiry_date: string; // "" or "YYYY-MM-DD"
  is_active: boolean;
  initial_quantity: string;
  reorder_level: string;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductsList() {
  const [products, setProducts]             = useState<any[]>([]);
  const [filtered, setFiltered]             = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<CategoryOption[]>([]);
  const [loading, setLoading]               = useState(true);
  const [deletingId, setDeletingId]         = useState<number | string | null>(null);

  // Filters & Search
  const [search, setSearch]                 = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [stockFilter, setStockFilter]       = useState("all");
  const [priceFrom, setPriceFrom]           = useState("");
  const [priceTo, setPriceTo]               = useState("");
  const [showFilters, setShowFilters]       = useState(false);

  // Columns & Pagination
  const [visibleCols, setVisibleCols]     = useState<ColKey[]>(DEFAULT_VISIBLE);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Offcanvas & Form State
  const [mode, setMode]                       = useState<"add" | "edit" | "view">("add");
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState("");
    const [branchPrices, setBranchPrices] = useState<any[]>([]);
  const [loadingBP, setLoadingBP]       = useState(false);
    const { isHO, userBranchId, loading: loadingAccess } = useBranchAccess();
    const [showMfrList, setShowMfrList]         = useState(false);   // ← add

  const [form, setForm] = useState<ProductForm>({
  name: "",
  item_number: "",
  category: "",
  description: "",
  manufacturer: "",       // ← add
  pack_size: "",          // ← add
  cost_price: "0",
  retail_price: "0",
  wholesale_price: "0",
  tax_rate: "16",
  expiry_date: "",
  is_active: true,
  initial_quantity: "0",
  reorder_level: "5",
});
  const manufacturerOptions = useMemo(
    () => Array.from(new Set(products.map(p => (p.manufacturer || "").trim()).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const mfrSuggestions = useMemo(() => {
    const q = form.manufacturer.trim().toLowerCase();
    if (!q) return [];
    const starts   = manufacturerOptions.filter(m => m.toLowerCase().startsWith(q));
    const contains = manufacturerOptions.filter(
      m => !m.toLowerCase().startsWith(q) && m.toLowerCase().includes(q)
    );
    return [...starts, ...contains]
      .filter(m => m.toLowerCase() !== q)
      .slice(0, 6);
  }, [form.manufacturer, manufacturerOptions]);

  const packSizeOptions = useMemo(() => {
    const defaults = ["50g", "100g", "250g", "500g", "1kg", "5kg", "10kg", "25kg",
                      "50ml", "100ml", "250ml", "500ml", "1L", "5L"];
    const used = products.map(p => (p.pack_size || "").trim()).filter(Boolean);
    return Array.from(new Set([...defaults, ...used]));
  }, [products]);
  /** Normalise a raw API product object into the flat shape expected */
  function normalizeProduct(p: any): any {
    const catName = (c: any) => {
      if (!c) return "";
      if (typeof c === "string" || typeof c === "number") return c;
      return c.name ?? c.category_name ?? String(c);
    };
    return {
      id:                 p.id,
      name:               p.name               ?? "",
      item_number:        p.item_number        ?? "",
      category:           p.category_name ?? catName(p.category),
      category_id:        p.category?.id ?? (typeof p.category === "number" ? p.category : ""),
      description:        p.description        ?? "",
       manufacturer:       p.manufacturer       ?? "",   // ← add
  pack_size:          p.pack_size          ?? "",
      cost_price:         p.cost_price         ?? "0",
      retail_price:       p.retail_price       ?? "0",
      wholesale_price:    p.wholesale_price    ?? "0",
      margin:             (parseFloat(p.retail_price) - parseFloat(p.cost_price)) || 0,
      tax_rate:           p.tax_rate           ?? "0",
      expiry_date:        p.expiry_date        ?? "",
      total_stock:        p.total_stock        ?? 0,
      image_url:          p.image_url          ?? "",
      is_active:          p.is_active          ?? true,
      created_at:         p.created_at         ?? "",
      updated_at:         p.updated_at         ?? "",
    };
  }

  // Fetch Categories from API
  const fetchCategories = useCallback(async () => {
    try {
      const res = await API.get("categories/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      const formatted = raw.map((c: any) => ({
        id: c.id,
        name: c.name || String(c),
      }));
      setCategoriesList(formatted);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }, []);

const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await fetchCategories();
      const res = await API.get("products/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
            let rows = raw.map(normalizeProduct);
      if (!isHO && userBranchId) {
        const bs = await API.get("branch-stocks/", { params: { branch: userBranchId, page_size: 5000 } });
        const bsRows: any[] = bs.data?.results || (Array.isArray(bs.data) ? bs.data : []);
        const qty = new Map<number, number>(bsRows.map(r => [r.product, r.stock_quantity]));
        rows = rows.map(p => ({ ...p, total_stock: qty.get(p.id) ?? 0 }));
      }
      setProducts(rows);
    } catch (err: any) {
      if (err.response?.status === 401) {
        console.error("Unauthorized - Please log in");
        window.location.href = "/login";
      } else {
        console.error("Error loading products:", err);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchCategories,isHO, userBranchId]);

    useEffect(() => { if (!loadingAccess) load(); }, [load, loadingAccess]);

  useAutoRefresh(() => load(true), 30000);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node))
        setShowColPicker(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter, stockFilter, priceFrom, priceTo]);

  useEffect(() => {
    let list = products;
    if (categoryFilter !== "all") {
      list = list.filter(p =>
        String(p.category) === String(categoryFilter) ||
        String(p.category_id) === String(categoryFilter)
      );
    }
    if (statusFilter   !== "all") list = list.filter(p => (statusFilter === "active") === p.is_active);
    if (stockFilter === "out") list = list.filter(p => p.total_stock === 0);
    if (stockFilter === "in")  list = list.filter(p => p.total_stock > 0);
    if (priceFrom) list = list.filter(p => parseFloat(p.retail_price) >= parseFloat(priceFrom));
    if (priceTo)   list = list.filter(p => parseFloat(p.retail_price) <= parseFloat(priceTo));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.name        || "").toLowerCase().includes(q) ||
        (p.item_number || "").toLowerCase().includes(q) ||
        (p.category    || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, categoryFilter, statusFilter, stockFilter, priceFrom, priceTo, products]);

  const activeFilterCount = [
    categoryFilter !== "all", statusFilter !== "all", stockFilter !== "all", !!priceFrom, !!priceTo,
  ].filter(Boolean).length;

  function resetFilters() {
    setCategoryFilter("all"); setStatusFilter("all"); setStockFilter("all");
    setPriceFrom(""); setPriceTo(""); setSearch("");
  }

  function toggleCol(key: ColKey) {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function toggleGroup(group: string, on: boolean) {
    const groupKeys = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
    setVisibleCols(prev => {
      const without = prev.filter(k => !groupKeys.includes(k));
      return on ? [...without, ...groupKeys] : without;
    });
  }

  const orderedCols = ALL_COLUMNS.map(c => c.key).filter(k => visibleCols.includes(k));

  // ── Offcanvas Handlers ──────────────────────────────────────────────────────
const handleAdd = () => {
  setMode("add");
  setSelectedProduct(null);
  setError("");
  setForm({
    name: "",
    item_number: "",
    category: categoriesList[0]?.id ?? "",
    description: "",
    manufacturer: "",     // ← add
    pack_size: "",        // ← add
    cost_price: "0",
    retail_price: "0",
    wholesale_price: "0",
    tax_rate: "16",
    expiry_date: "",
    is_active: true,
    initial_quantity: "0",
    reorder_level: "5",
  });
};

const handleEdit = (product: any) => {
  setMode("edit");
  setSelectedProduct(product);
  setError("");
  setForm({
    name: product.name ?? "",
    item_number: product.item_number ?? "",
    category: product.category_id || product.category || "",
    description: product.description ?? "",
    manufacturer: product.manufacturer ?? "",   // ← add
    pack_size: product.pack_size ?? "",         // ← add
    cost_price: String(product.cost_price ?? "0"),
    retail_price: String(product.retail_price ?? "0"),
    wholesale_price: String(product.wholesale_price ?? "0"),
    tax_rate: String(product.tax_rate ?? "0"),
    expiry_date: product.expiry_date ? product.expiry_date.slice(0, 10) : "",
    is_active: product.is_active ?? true,
    initial_quantity: "0",
    reorder_level: "5",
  });
};

    const handleView = async (product: any) => {
    setMode("view");
    setSelectedProduct(product);
    setBranchPrices([]);
    setLoadingBP(true);
    try {
      const res = await API.get("branch-stocks/", { params: { product: product.id, page_size: 200 } });
      setBranchPrices(res.data?.results || (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error("Error loading branch prices:", err);
    } finally {
      setLoadingBP(false);
    }
  };

   const handleDelete = async (product: any) => {
    const confirmed = await showConfirm(
      `You are about to delete "${product.name}". This cannot be undone.`,
      "Delete this product?",
      "Yes, delete it",
      "Cancel"
    );
    if (!confirmed) return;

    setDeletingId(product.id);
    try {
      await API.delete(`products/${product.id}/`);
      setProducts(prev => prev.filter(p => p.id !== product.id));
      // showConfirm already shows its own "Deleted!" success toast
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.response?.data?.message || "Failed to delete product.";
      showError(msg, "Delete Failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!form.name.trim()) {
      showWarning("Product name is required.", "Missing Information");
      setSaving(false);
      return;
    }
    if (!form.item_number.trim()) {
      showWarning("Item number is required.", "Missing Information");
      setSaving(false);
      return;
    }
    if (!form.category) {
      showWarning("Please select a category.", "Missing Information");
      setSaving(false);
      return;
    }
     if (mode === "add") {
      const qty = Number(form.initial_quantity);
      if (form.initial_quantity === "" || !Number.isInteger(qty) || qty < 0) {
        showWarning("Initial quantity must be a whole number, 0 or more.", "Invalid Quantity");
        setSaving(false);
        return;
      }
    }
    try {
           const { initial_quantity, reorder_level, ...productFields } = form;
      const payload = { ...productFields, expiry_date: productFields.expiry_date || null };

      if (mode === "edit" && selectedProduct) {
        await API.put(`products/${selectedProduct.id}/`, payload);
        showSuccess(`"${form.name}" was updated successfully.`, "Product Updated");
      } else {
        const qty = parseInt(initial_quantity, 10) || 0;
        const reorder = parseInt(reorder_level, 10);
        await API.post("products/", {
          ...payload,
          initial_quantity: qty,
          reorder_level: Number.isNaN(reorder) ? 5 : reorder,
        });
        showSuccess(`"${form.name}" was added to Head Office with ${qty} in stock.`, "Product Added");
      }
       await load(true);
      const btnClose = document.getElementById("product-offcanvas-close");
      if (btnClose) btnClose.click();
    } catch (err: any) {
      const data = err.response?.data;
      // Surface field-level validation errors (DRF returns {field: [messages]})
      let msg = data?.detail || data?.message;
      if (!msg && data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const firstMsg = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        msg = firstField ? `${firstField}: ${firstMsg}` : undefined;
      }
      msg = msg || "Failed to save product.";
      setError(msg);
      showError(msg, "Save Failed");
    } finally {
      setSaving(false);
    }
  };

  function renderCell(row: any, key: ColKey) {
    if (key === "name") return (
      <td key={key} className="ps-3 fw-semibold text-primary text-nowrap">
        <Link to={`${route.productDetail ?? "/products"}/${row.id}`}>{row.name}</Link>
      </td>
    );
    if (key === "image_url") return (
      <td key={key}>
        {row.image_url
          ? <img src={row.image_url} alt={row.name} width={36} height={36} style={{ objectFit: "cover", borderRadius: 6 }} />
          : <span className="text-muted fs-11">—</span>}
      </td>
    );
    if (key === "is_active") return (
      <td key={key}>
        {row.is_active
          ? <span className="badge bg-success-transparent text-success">Active</span>
          : <span className="badge bg-secondary-transparent text-secondary">Inactive</span>}
      </td>
    );
    if (key === "total_stock") return (
      <td key={key} className="text-nowrap">
        {row.total_stock === 0
          ? <span className="badge bg-danger-transparent text-danger">Out of stock</span>
          : row.total_stock}
        {" "}
        <Link to={route.branches ?? "/branches"} className="fs-11 ms-1">breakdown</Link>
      </td>
    );
    if (key === "expiry_date") {
      if (!row.expiry_date) return <td key={key} className="text-muted fs-11">—</td>;
      const days = (new Date(row.expiry_date).getTime() - Date.now()) / 86400000;
      const cls = days < 0 ? "text-danger fw-semibold" : days <= 30 ? "text-warning fw-semibold" : "text-muted";
      return <td key={key} className={`text-nowrap ${cls}`}>{fmtDate(row.expiry_date)}</td>;
    }
    if (MONEY_KEYS.has(key)) return (
      <td key={key} className="text-nowrap">{fmtMoney(row[key])}</td>
    );
    if (key === "tax_rate") return (
      <td key={key} className="text-nowrap">{row.tax_rate}%</td>
    );
    if (BOOL_KEYS.has(key)) return (
      <td key={key}>
        {row[key]
          ? <span className="badge bg-success-transparent text-success">Yes</span>
          : <span className="text-muted fs-11">No</span>}
      </td>
    );
    if (DATE_KEYS.has(key)) return (
      <td key={key} className="text-muted text-nowrap">{fmtDate(row[key])}</td>
    );
    const val = row[key];
    return (
      <td key={key} className="text-truncate" style={{ maxWidth: 220 }}>
        {val || <span className="text-muted">—</span>}
      </td>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Products</h4>
            <p className="text-muted fs-13 mb-0">
              Catalog shared across all branches. Stock levels are managed per branch on the
               <Link to={route.branches ?? "/branches"}>Branches</Link>
               page.
            </p>
          </div>
            <div className="d-flex gap-2 flex-wrap">
           <button className="btn btn-outline-secondary btn-sm" onClick={() => load()} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filtered, orderedCols)} disabled={!filtered.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportExcel(filtered, orderedCols)} disabled={!filtered.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            <button
              className="btn btn-primary btn-sm"
              data-bs-toggle="offcanvas"
              data-bs-target="#product-offcanvas"
              onClick={handleAdd}
            >
              <i className="ti ti-plus me-1" />Add Product
            </button>
          </div>
        </div>

        {/* Stats tiles */}
        {!loading && products.length > 0 && (() => {
          const tiles = [
            { label: "Total Products", value: products.length,                                   icon: "ti-package",        bg: "bg-primary-gradient-100", color: "text-primary"  },
            { label: "Active",         value: products.filter(p => p.is_active).length,               icon: "ti-circle-check",   bg: "bg-success-gradient-100", color: "text-success"  },
            { label: "Out of Stock",   value: products.filter(p => p.total_stock === 0).length,       icon: "ti-x",              bg: "bg-danger-gradient-100",  color: "text-danger"   },
            { label: "Categories",     value: categoriesList.length,                                  icon: "ti-category",       bg: "bg-info-gradient-100",    color: "text-info"     },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(s => (
                <div key={s.label} className="col-6 col-sm-4 col-lg-3">
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

        <div className="card shadow-none border">
          {/* Toolbar */}
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 280 }}>
              <span className="input-group-text bg-transparent border-end-0">
                <i className="ti ti-search text-muted" />
              </span>
              <input
                type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search name, item number, category…"
                value={search} onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>

            <div className="d-flex gap-2 align-items-center flex-wrap">
              <button
                className={`btn btn-sm ${showFilters ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setShowFilters(v => !v)}
              >
                <i className="ti ti-filter me-1" />Filters
                {activeFilterCount > 0 && <span className="badge bg-danger ms-1 fs-10">{activeFilterCount}</span>}
              </button>
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger" onClick={resetFilters}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}

              {/* Column picker */}
              <div className="position-relative" ref={colPickerRef}>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowColPicker(v => !v)}>
                  <i className="ti ti-columns me-1" />Columns
                  <span className="badge bg-primary ms-1 fs-10">{visibleCols.length}</span>
                </button>
                {showColPicker && (
                  <div className="card shadow-lg border-0 position-absolute end-0 mt-2 p-0"
                    style={{ zIndex: 1050, width: 380, maxHeight: "65vh", overflowY: "auto", borderRadius: "8px" }}>
                    <div className="p-3 border-bottom d-flex justify-content-between align-items-center"
                      style={{ background: "linear-gradient(135deg, #E41F07 0%, #FFA201 100%)" }}>
                      <span className="fs-12 fw-semibold text-white text-uppercase">Show / Hide Columns</span>
                      <div className="d-flex gap-2">
                        <button className="btn btn-xs btn-link fs-11 py-0 text-white" onClick={() => setVisibleCols(ALL_COLUMNS.map(c => c.key))}>All</button>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
                        <button className="btn btn-xs btn-link fs-11 py-0 text-white" onClick={() => setVisibleCols(["name"])}>Reset</button>
                      </div>
                    </div>
                    {GROUPS.map((group, idx) => {
                      const groupCols = ALL_COLUMNS.filter(c => c.group === group);
                      const allOn = groupCols.every(c => visibleCols.includes(c.key));
                      return (
                        <div key={group} style={{ borderBottom: idx < GROUPS.length - 1 ? "1px solid #eee" : "none" }}>
                          <div className="px-3 py-2 d-flex align-items-center justify-content-between" style={{ background: "#f8f9fa" }}>
                            <span className="fs-12 fw-semibold text-uppercase text-muted" style={{ color: "#666" }}>{group}</span>
                            <div className="form-check form-switch mb-0">
                              <input className="form-check-input" type="checkbox" checked={allOn}
                                onChange={e => toggleGroup(group, e.target.checked)} />
                            </div>
                          </div>
                          <div className="px-3 py-2">
                            {groupCols.map(col => (
                              <div key={col.key} className="form-check mb-2">
                                <input className="form-check-input" type="checkbox"
                                  id={`col-${col.key}`} checked={visibleCols.includes(col.key)}
                                  onChange={() => toggleCol(col.key)} />
                                <label className="form-check-label fs-13" htmlFor={`col-${col.key}`} style={{ cursor: "pointer" }}>
                                  {col.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="p-3 border-top fs-12 text-muted" style={{ background: "#f8f9fa" }}>
                      <strong>{visibleCols.length}</strong> of <strong>{ALL_COLUMNS.length}</strong> columns visible
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="card-header border-bottom py-3 bg-light">
              <div className="row g-2">
                <div className="col-sm-6 col-md-3 col-lg-3">
                  <label className="form-label fs-12 mb-1">Category</label>
                  <select className="form-select form-select-sm fs-13" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="all">All categories</option>
                    {categoriesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-sm-6 col-md-3 col-lg-2">
                  <label className="form-label fs-12 mb-1">Status</label>
                  <select className="form-select form-select-sm fs-13" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="col-sm-6 col-md-3 col-lg-2">
                  <label className="form-label fs-12 mb-1">Stock</label>
                  <select className="form-select form-select-sm fs-13" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="in">In stock</option>
                    <option value="out">Out of stock</option>
                  </select>
                </div>
                <div className="col-sm-6 col-md-3 col-lg-2">
                  <label className="form-label fs-12 mb-1">Price from</label>
                  <input type="number" className="form-control form-control-sm fs-13" value={priceFrom} onChange={e => setPriceFrom(e.target.value)} />
                </div>
                <div className="col-sm-6 col-md-3 col-lg-2">
                  <label className="form-label fs-12 mb-1">Price to</label>
                  <input type="number" className="form-control form-control-sm fs-13" value={priceTo} onChange={e => setPriceTo(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading products…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-package-off fs-1 mb-2" />
                <p className="fs-14 mb-0">{products.length === 0 ? "No products found." : "No results match your filters."}</p>
                {activeFilterCount > 0 && <button className="btn btn-sm btn-link mt-2" onClick={resetFilters}>Clear filters</button>}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {orderedCols.map(key => (
                        <th key={key} className={key === "name" ? "ps-3 text-nowrap" : "text-nowrap"}>
                          {ALL_COLUMNS.find(c => c.key === key)!.label}
                        </th>
                      ))}
                      <th className="text-end pe-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(p => (
                      <tr key={p.id}>
                        {orderedCols.map(key => renderCell(p, key))}
                        <td className="text-end pe-3">
                          <div className="d-inline-flex gap-1">
                            <button
                              className="btn btn-sm btn-outline-info py-1 px-2 fs-11"
                              data-bs-toggle="offcanvas"
                              data-bs-target="#product-offcanvas"
                              onClick={() => handleView(p)}
                            >
                              <i className="ti ti-eye me-1" />View
                            </button>
                            <button
                              className="btn btn-sm btn-outline-primary py-1 px-2 fs-11"
                              data-bs-toggle="offcanvas"
                              data-bs-target="#product-offcanvas"
                              onClick={() => handleEdit(p)}
                            >
                              <i className="ti ti-edit me-1" />Edit
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger py-1 px-2 fs-11"
                              onClick={() => handleDelete(p)}
                              disabled={deletingId === p.id}
                            >
                              {deletingId === p.id ? (
                                <span className="spinner-border spinner-border-sm" role="status" />
                              ) : (
                                <>
                                  <i className="ti ti-trash me-1" />Delete
                                </>
                              )}
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

          {!loading && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
            const end   = Math.min(page * pageSize, filtered.length);
            const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
            const visible = pages.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <div className="d-flex align-items-center gap-2">
                  <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> product{filtered.length !== 1 ? "s" : ""}</span>
                  <select className="form-select form-select-sm fs-12 w-auto" value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                </div>
                <div className="d-flex align-items-center gap-1 flex-wrap">
                  {filtered.length > 0 && (
                    <>
                      <button className="btn btn-sm btn-outline-secondary py-0 px-2 fs-11" onClick={() => exportCSV(filtered, orderedCols)}>
                        <i className="ti ti-download me-1" />CSV
                      </button>
                      <button className="btn btn-sm btn-outline-secondary py-0 px-2 fs-11" onClick={() => exportExcel(filtered, orderedCols)}>
                        <i className="ti ti-download me-1" />Excel
                      </button>
                    </>
                  )}
                  {totalPages > 1 && (
                    <nav className="ms-2">
                      <ul className="pagination pagination-sm mb-0">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p - 1)}><i className="ti ti-chevron-left" /></button>
                        </li>
                        {visible.map((p, i, arr) => (
                          <React.Fragment key={p}>
                            {i > 0 && arr[i - 1] !== p - 1 && <li key={`gap-${p}`} className="page-item disabled"><span className="page-link">…</span></li>}
                            <li className={`page-item ${p === page ? "active" : ""}`}>
                              <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                            </li>
                          </React.Fragment>
                        ))}
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

      {/* REUSABLE PRODUCT OFFCANVAS */}
      <div
        className="offcanvas offcanvas-end"
        tabIndex={-1}
        id="product-offcanvas"
        aria-labelledby="productOffcanvasLabel"
        style={{ width: "380px" }}
      >
        {/* HEADER */}
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-15 fw-semibold" id="productOffcanvasLabel">
            {mode === "add" && "Add New Product"}
            {mode === "edit" && "Edit Product"}
            {mode === "view" && "Product Details"}
          </h5>
          <button
            id="product-offcanvas-close"
            type="button"
            className="btn-close btn-close-white"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          />
        </div>

        {/* BODY */}
        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

          {mode === "view" && selectedProduct ? (
            /* VIEW MODE */
            <div className="d-flex flex-column gap-3 fs-13">
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">PRODUCT NAME</label>
                <span className="fw-semibold text-dark fs-14">{selectedProduct.name}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">ITEM NUMBER</label>
                <span>{selectedProduct.item_number || "—"}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">CATEGORY</label>
                <span>{selectedProduct.category || "—"}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">DESCRIPTION</label>
                <span>{selectedProduct.description || <em className="text-muted">No description</em>}</span>
              </div>

              <div>
  <label className="text-muted fs-12 fw-medium d-block mb-1">PRODUCT NAME</label>
  <span className="fw-semibold text-dark fs-14">{selectedProduct.name}</span>
</div>
<div>
  <label className="text-muted fs-12 fw-medium d-block mb-1">ITEM NUMBER</label>
  <span>{selectedProduct.item_number || "—"}</span>
</div>

{/* ↓ paste here */}
<div>
  <label className="text-muted fs-12 fw-medium d-block mb-1">MANUFACTURER</label>
  <span>{selectedProduct.manufacturer || "—"}</span>
</div>
<div>
  <label className="text-muted fs-12 fw-medium d-block mb-1">PACK SIZE</label>
  <span>{selectedProduct.pack_size || "—"}</span>
</div>
{/* ↑ paste here */}

<div>
  <label className="text-muted fs-12 fw-medium d-block mb-1">CATEGORY</label>
  <span>{selectedProduct.category || "—"}</span>
</div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">RETAIL PRICE</label>
                <span className="fw-semibold text-success">{fmtMoney(selectedProduct.retail_price)}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">WHOLESALE PRICE</label>
                <span>{fmtMoney(selectedProduct.wholesale_price)}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">COST PRICE</label>
                <span>{fmtMoney(selectedProduct.cost_price)}</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">TAX RATE</label>
                <span>{selectedProduct.tax_rate}%</span>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">EXPIRY DATE</label>
                <span>{selectedProduct.expiry_date ? fmtDate(selectedProduct.expiry_date) : <em className="text-muted">No expiry</em>}</span>
              </div>
                            <div>
                <label className="text-muted fs-12 fw-medium d-block mb-2">STOCK &amp; PRICES BY BRANCH</label>
                {loadingBP ? (
                  <span className="spinner-border spinner-border-sm" />
                ) : branchPrices.length === 0 ? (
                  <em className="text-muted">Not stocked at any branch.</em>
                ) : (
                  <table className="table table-sm fs-12 mb-1">
                    <thead className="table-light">
                      <tr><th>Branch</th><th className="text-end">Qty</th><th className="text-end">Retail</th><th className="text-end">Wholesale</th></tr>
                    </thead>
                    <tbody>
                      {branchPrices.map((bs: any) => (
                        <tr key={bs.id}>
                          <td>{bs.branch_name}</td>
                          <td className="text-end">{bs.stock_quantity}</td>
                          <td className="text-end">
                            {fmtMoney(bs.effective_retail_price)}
                            {bs.retail_price != null && <span className="badge bg-primary-transparent text-primary ms-1">custom</span>}
                          </td>
                          <td className="text-end">
                            {fmtMoney(bs.effective_wholesale_price)}
                            {bs.wholesale_price != null && <span className="badge bg-primary-transparent text-primary ms-1">custom</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="fs-12">Total: <strong>{selectedProduct.total_stock}</strong></div>
              </div>
              <div>
                <label className="text-muted fs-12 fw-medium d-block mb-1">STATUS</label>
                {selectedProduct.is_active ? (
                  <span className="badge bg-success-transparent text-success">Active</span>
                ) : (
                  <span className="badge bg-secondary-transparent text-secondary">Inactive</span>
                )}
              </div>
            </div>
          ) : (
            /* ADD / EDIT MODE */
            <form id="product-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
              <div>
                <label htmlFor="p-name" className="form-label fs-13 fw-medium mb-1">
                  Product Name <span className="text-danger">*</span>
                </label>
                <input
                  id="p-name"
                  type="text"
                  className="form-control fs-13"
                  required
                  placeholder="Enter product name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="p-item-number" className="form-label fs-13 fw-medium mb-1">
                  Item Number <span className="text-danger">*</span>
                </label>
                <input
                  id="p-item-number"
                  type="text"
                  className="form-control fs-13"
                  required
                  placeholder="Unique item number used for search/checkout"
                  value={form.item_number}
                  onChange={(e) => setForm({ ...form, item_number: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="p-category" className="form-label fs-13 fw-medium mb-1">
                  Category <span className="text-danger">*</span>
                </label>
                <select
                  id="p-category"
                  className="form-select fs-13"
                  required
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Select Category</option>
                  {categoriesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
                                {/* ← end of Category <div> above */}

              <div className="row g-2">
                <div className="col-6">
                  <label htmlFor="p-manufacturer" className="form-label fs-13 fw-medium mb-1">Manufacturer</label>
                  <div className="position-relative">
                    <input
                      id="p-manufacturer"
                      type="text"
                      autoComplete="off"
                      className="form-control fs-13"
                      placeholder="Start typing…"
                      value={form.manufacturer}
                      onChange={(e) => {
                        setForm({ ...form, manufacturer: e.target.value });
                        setShowMfrList(true);
                      }}
                      onFocus={() => setShowMfrList(true)}
                      onBlur={() => {
                        setShowMfrList(false);
                        const typed = form.manufacturer.trim();
                        const match = manufacturerOptions.find(m => m.toLowerCase() === typed.toLowerCase());
                        if (match && match !== form.manufacturer) setForm(f => ({ ...f, manufacturer: match }));
                      }}
                    />
                    {showMfrList && mfrSuggestions.length > 0 && (
                      <ul
                        className="list-group position-absolute w-100 shadow-sm"
                        style={{ zIndex: 1060, top: "100%", maxHeight: 200, overflowY: "auto" }}
                      >
                        {mfrSuggestions.map(m => (
                          <li
                            key={m}
                            className="list-group-item list-group-item-action fs-13 py-2"
                            style={{ cursor: "pointer" }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm({ ...form, manufacturer: m });
                              setShowMfrList(false);
                            }}
                          >
                            {m}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="col-6">
                  <label htmlFor="p-pack-size" className="form-label fs-13 fw-medium mb-1">Pack Size</label>
                  <input
                    id="p-pack-size"
                    type="text"
                    list="pack-size-options"
                    autoComplete="off"
                    className="form-control fs-13"
                    placeholder="e.g. 250ml"
                    value={form.pack_size}
                    onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
                  />
                  <datalist id="pack-size-options">
                    {packSizeOptions.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>

              {/* ↓ Description <div> starts here */}
              <div>
                <label htmlFor="p-desc" className="form-label fs-13 fw-medium mb-1">Description</label>
                <textarea
                  id="p-desc"
                  className="form-control fs-13"
                  rows={3}
                  placeholder="Enter product description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <label htmlFor="p-cost" className="form-label fs-13 fw-medium mb-1">Cost Price</label>
                  <input
                    id="p-cost"
                    type="number"
                    step="0.01"
                    className="form-control fs-13"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  />
                </div>
                <div className="col-6">
<label htmlFor="p-retail" className="form-label fs-13 fw-medium mb-1">Default Retail Price</label>
                  <input
                    id="p-retail"
                    type="number"
                    step="0.01"
                    className="form-control fs-13"
                    value={form.retail_price}
                    onChange={(e) => setForm({ ...form, retail_price: e.target.value })}
                  />
                </div>
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <label htmlFor="p-wholesale" className="form-label fs-13 fw-medium mb-1">Default Wholesale Price</label>
                  <input
                    id="p-wholesale"
                    type="number"
                    step="0.01"
                    className="form-control fs-13"
                    value={form.wholesale_price}
                    onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })}
                  />
                </div>

                <div className="col-6">
                  <label htmlFor="p-tax" className="form-label fs-13 fw-medium mb-1">Tax Rate (%)</label>
                  <input
                    id="p-tax"
                    type="number"
                    step="0.01"
                    className="form-control fs-13"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                  />
                </div>
                              <div className="fs-11 text-muted mt-n2">
                Default prices, used at any branch without its own price. Set branch-specific prices under
                Store → Record Movement → Stock Adjustment or Moved to Branch.
              </div>
              </div>

              <div>
                <label htmlFor="p-expiry" className="form-label fs-13 fw-medium mb-1">Expiry Date</label>
                <input
                  id="p-expiry"
                  type="date"
                  className="form-control fs-13"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
                <div className="fs-11 text-muted mt-1">Leave blank for non-perishable items.</div>
              </div>

                           {mode === "add" ? (
                <>
                  <div className="row g-2">
                    <div className="col-6">
                      <label htmlFor="p-qty" className="form-label fs-13 fw-medium mb-1">Initial Quantity</label>
                      <input
                        id="p-qty"
                        type="number"
                        min={0}
                        step={1}
                        className="form-control fs-13"
                        value={form.initial_quantity}
                        onChange={(e) => setForm({ ...form, initial_quantity: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <label htmlFor="p-reorder" className="form-label fs-13 fw-medium mb-1">Reorder Level</label>
                      <input
                        id="p-reorder"
                        type="number"
                        min={0}
                        step={1}
                        className="form-control fs-13"
                        value={form.reorder_level}
                        onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="alert alert-info fs-12 py-2 mb-0">
                    <i className="ti ti-info-circle me-1" />
                    This stock is added to <strong>Head Office</strong>. To stock it at other branches,
                    use the <Link to={route.branches ?? "/branches"}>Branches</Link> page.
                  </div>
                </>
              ) : (
                <div className="alert alert-info fs-12 py-2 mb-0">
                  <i className="ti ti-info-circle me-1" />
                  Stock isn't edited here. Adjust quantities per branch on the{" "}
                  <Link to={route.branches ?? "/branches"}>Branches</Link> page.
                </div>
              )}

              <div className="form-check form-switch pt-1">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="product_is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <label className="form-check-label fs-13 ms-1" htmlFor="product_is_active">
                  Active Status
                </label>
              </div>
            </form>
          )}
        </div>

        {/* FOOTER */}
        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="product-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" role="status" />}
              {mode === "edit" ? "Update Product" : "Save Product"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
