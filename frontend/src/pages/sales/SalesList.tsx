import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Link } from "react-router";
import API from "../../services/api";
import { all_routes } from "../../routes/all_routes";
import SaleDetailOffcanvas from "./SalesDetail";
import { useBranchAccess } from "../../hooks/useBranchAccess";


const route = all_routes;

function fmtDate(iso: string) {
  if (!iso) return "";
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

const COLUMNS = [
  { key: "order_number",  label: "Order #" },
  { key: "customer_name", label: "Customer" },
  { key: "cashier_name",  label: "Cashier" },
    { key: "branch_name",   label: "Branch" },
  { key: "status",        label: "Status" },
   { key: "sale_type",     label: "Sale Type" },
  { key: "total_amount",  label: "Total" },
  { key: "amount_paid",   label: "Paid" },
  { key: "balance_due",   label: "Balance" },
  { key: "profit",        label: "Profit" },
  { key: "created_at",    label: "Date" },
] as const;

function exportCSV(rows: any[], cols: readonly { key: string; label: string }[]) {
  const headers = cols.map(c => c.label);
  const lines = [
    headers.join(","),
    ...rows.map(r => cols.map(c => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[], cols: readonly { key: string; label: string }[]) {
  const headers = cols.map(c => c.label);
  const data = [headers, ...rows.map(r => cols.map(c => String(r[c.key] ?? "")))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales");
  XLSX.writeFile(wb, `sales_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function SalesList() {
  const [sales, setSales]       = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openId, setOpenId] = useState<string | number | null>(null);
    const { isHO, branches } = useBranchAccess();
  const [branchFilter, setBranchFilter] = useState("");
  const [byBranch, setByBranch] = useState<any[]>([]);
  const showProfit = sales.some(s => s.profit !== undefined);
const visibleColumns = COLUMNS.filter(c => c.key !== "profit" || showProfit);

    const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page_size: 1000 };
      if (branchFilter) params.branch = branchFilter;
      const res = await API.get("sales/", { params });
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setSales(raw);

      if (isHO && !branchFilter) {
        const bb = await API.get("sales/by_branch/", {
          params: { date_from: dateFrom || undefined, date_to: dateTo || undefined },
        });
        setByBranch(bb.data?.branches || []);
      } else {
        setByBranch([]);
      }
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading sales:", err);
    } finally { setLoading(false); }
  }, [branchFilter, isHO, dateFrom, dateTo]);
const totalProfit = sales
  .filter(x => x.status !== "cancelled")
  .reduce((s, x) => s + (parseFloat(x.profit) || 0), 0);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

  const statuses = Array.from(new Set(sales.map(s => s.status))).filter(Boolean).sort();

  useEffect(() => {
    let list = sales;
    if (statusFilter !== "all") list = list.filter(s => s.status === statusFilter);
    if (dateFrom) list = list.filter(s => s.created_at >= dateFrom);
    if (dateTo)   list = list.filter(s => s.created_at <= dateTo + "T23:59:59");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.order_number  || "").toLowerCase().includes(q) ||
        (s.customer_name || "").toLowerCase().includes(q) ||
        (s.cashier_name  || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, statusFilter, dateFrom, dateTo, sales]);

  const activeFilterCount = [statusFilter !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;

  function resetFilters() {
    setStatusFilter("all"); setDateFrom(""); setDateTo(""); setSearch("");
  }

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Sales</h4>
            <p className="text-muted fs-13 mb-0">All orders rung up at the till.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filtered,visibleColumns)} disabled={!filtered.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportExcel(filtered,visi)} disabled={!filtered.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
           
          </div>
        </div>

        {!loading && sales.length > 0 && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const totalRevenue = sales.reduce((s, x) => s + (parseFloat(x.total_amount) || 0), 0);
          const totalOutstanding = sales.reduce((s, x) => s + (parseFloat(x.balance_due) || 0), 0);
          const tiles = [
            { label: "Total Sales",   value: sales.length,                                                                  icon: "ti-receipt",       bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Today",         value: sales.filter(s => (s.created_at || "").startsWith(today)).length,             icon: "ti-calendar",      bg: "bg-info-gradient-100",    color: "text-info" },
            { label: "Total Revenue", value: money(totalRevenue),                                                           icon: "ti-cash",          bg: "bg-success-gradient-100", color: "text-success" },
            { label: "Outstanding",   value: money(totalOutstanding),                                                       icon: "ti-alert-triangle",bg: "bg-danger-gradient-100",  color: "text-danger" },
            { label: "Total Profit",  value: money(totalProfit),                                                            icon: "ti-bar-chart",     bg: "bg-secondary-gradient-100", color: "text-secondary" },
          ].filter(t => t.label !== "Total Profit" || showProfit);
          return (
            <div className="row g-3 mb-4">
              {tiles.map(s => (
                <div key={s.label} className="col-6 col-sm-4 col-lg-2" style={{ flex: "1 1 0" }}>
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
          {isHO && !branchFilter && byBranch.length > 0 && (
          <div className="row g-3 mb-4">
            {byBranch.map(b => (
              <div key={b.branch} className="col-6 col-md-4 col-xl-3">
                <div className="card mb-0 shadow-none border h-100" style={{ cursor: "pointer" }}
                  onClick={() => setBranchFilter(String(b.branch))}>
                  <div className="card-body p-3">
                    <p className="fw-medium mb-1 fs-13">{b.branch_name}</p>
                    <h5 className="mb-0 text-success">{money(b.total_revenue)}</h5>
                    <small className="text-muted">
                      {b.sales_count} sale{b.sales_count !== 1 ? "s" : ""} · owing {money(b.outstanding)}
                    </small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13" placeholder="Search order #, customer, cashier…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>

                          {isHO && (
                <select className="form-select form-select-sm fs-13" style={{ width: 160 }}
                  value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
                  <option value="">All branches</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {statuses.map(s => <option key={s} value={s} className="text-capitalize">{s}</option>)}
              </select>
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="date" className="form-control form-control-sm fs-13" style={{ width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
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
                <span className="spinner-border spinner-border-sm me-2" />Loading sales…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-receipt-off fs-1 mb-2" />
                <p className="fs-14 mb-0">{sales.length === 0 ? "No sales found." : "No results match your filters."}</p>
                {activeFilterCount > 0 && <button className="btn btn-sm btn-link mt-2" onClick={resetFilters}>Clear filters</button>}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
{visibleColumns.map(c => <th key={c.key} className="text-nowrap">{c.label}</th>)}                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(s => (
                      <tr key={s.id}>
                        <td className="ps-3 fw-semibold text-primary text-nowrap">
  <button className="btn btn-link p-0 fw-semibold fs-13" onClick={() => setOpenId(s.id)}>{s.order_number}</button>
</td>
                        <td className="text-nowrap">{s.customer_name || <span className="text-muted">Walk-in</span>}</td>
                        <td className="text-nowrap">{s.cashier_name || <span className="text-muted">—</span>}</td>
                                                <td className="text-nowrap">{s.branch_name || <span className="text-muted">—</span>}</td>
                        <td>
                          <span className={STATUS_CLS[s.status] || "badge bg-secondary-transparent text-secondary"} style={{ textTransform: "capitalize" }}>
                            {s.status || "—"}
                          </span>
                        </td>
                        <td>
                          <span className={
                            s.sale_type === "Credit"    ? "badge bg-danger-transparent text-danger" :
                            s.sale_type === "Wholesale" ? "badge bg-info-transparent text-info" :
                                                          "badge bg-primary-transparent text-primary"
                          }>
                            {s.sale_type || "Retail"}
                          </span>
                        </td>
                        <td className="fw-semibold text-nowrap">{money(s.total_amount)}</td>
                        <td className="text-nowrap text-success">{money(s.amount_paid)}</td>
                        <td className={`text-nowrap fw-semibold ${parseFloat(s.balance_due) > 0 ? "text-danger" : "text-muted"}`}>{money(s.balance_due)}</td>
                       
                        
{showProfit && (
  <td className={`text-nowrap fw-semibold ${parseFloat(s.profit) < 0 ? "text-danger" : "text-success"}`}>{money(s.profit)}</td>
)}
 <td className="text-muted text-nowrap">{fmtDate(s.created_at)}</td>
                        <td>
                        <button className="btn btn-sm btn-outline-primary py-1 px-2 fs-11" onClick={() => setOpenId(s.id)}>
  <i className="ti ti-eye me-1" />View
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
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> sale{filtered.length !== 1 ? "s" : ""}</span>
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
      <SaleDetailOffcanvas saleId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}
