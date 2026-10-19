import { Link } from "react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import API from "../../../../services/api";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { setRangeType, setCustomDateRange } from "../../../../core/redux/dateFilterSlice";
import { useBranchAccess } from "../../../../hooks/useBranchAccess";

function pctBadge(pct: number) {
  return pct >= 0
    ? <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-success border-0">+{pct}%</span>
    : <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-danger border-0">{pct}%</span>;
}

function currency(value: number | undefined | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function computeRange(rangeType: string, customFrom?: string, customTo?: string) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (rangeType) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "week": {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { from: iso(start), to: iso(today) };
    }
    case "month":
      return { from: iso(new Date(year, month, 1)), to: iso(today) };
    case "year":
      return { from: iso(new Date(year, 0, 1)), to: iso(today) };
    case "custom":
      return { from: customFrom || iso(today), to: customTo || iso(today) };
    case "all":
    default:
      return { from: undefined, to: undefined };
  }
}

function rangeNoun(rangeType: string) {
  switch (rangeType) {
    case "today":  return "Today's";
    case "week":   return "This Week's";
    case "month":  return "This Month's";
    case "year":   return "This Year's";
    case "custom": return "Period";
    case "all":    return "Total";
    default:       return "";
  }
}
const MIX: Record<string, string> = {
  "#E41F07": "#FFA201",  // red    -> orange
  "#0092E4": "#8B5CF6",  // blue   -> purple
  "#8B5CF6": "#FF6B9D",  // purple -> pink
  "#10B981": "#0092E4",  // green  -> blue
  "#F59E0B": "#E41F07",  // amber  -> red
  "#DC2626": "#F59E0B",  // red    -> amber
  "#0EA5E9": "#10B981",  // sky    -> green
};
/* ───────── STEP 1: KpiTile component ───────── */
function KpiTile({ col, label, value, color, bg, icon, footer }: {
  col: string; label: string; value: ReactNode;
  color: string; bg: string; icon: string; footer?: ReactNode;
}) {
  return (
    <div className={col}>
      <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: `3px solid ${color}` }}>
        <div className="card-body position-relative">
          <p className="fw-medium mb-1 text-muted">{label}</p>
                    <h4
            className="mb-3 fw-bold"
            style={{
              fontSize: "1.6rem",
              backgroundImage: `linear-gradient(90deg, ${color}, ${MIX[color] ?? "#8B5CF6"})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              display: "inline-block",
            }}
          >
            {value}
          </h4>
          <div className="d-flex align-items-center gap-2 flex-wrap">{footer}</div>
          <div className="custom-card-icon">
            <div className="avatar avatar-rounded avatar-lg"
                 style={{ background: bg, position: "absolute", top: 0, insetInlineEnd: 0 }}>
              <i className={`ti ${icon} fs-4`} style={{ color }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MainDashboard = () => {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const dispatch = useDispatch();
  const { dateFrom, dateTo, rangeType } = useSelector((state: any) => state.dateFilter);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customFrom, setCustomFrom] = useState(dateFrom);
  const [customTo, setCustomTo]     = useState(dateTo);
  const datePickerRef = useRef<HTMLDivElement>(null);
    const { isHO, branches, userBranchId, loading: loadingAccess } = useBranchAccess();
  const [branchFilter, setBranchFilter] = useState("");   // "" = all branches (Head Office only)
  const [loadError, setLoadError] = useState("");
    const [branchPerf, setBranchPerf] = useState<any[]>([]);

  useEffect(() => {
    setCustomFrom(dateFrom);
    setCustomTo(dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDatePicker]);

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) return;
    dispatch(setCustomDateRange({ dateFrom: customFrom, dateTo: customTo }));
    setShowDatePicker(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params: any = { range: rangeType };
      const { from, to } = computeRange(rangeType, dateFrom, dateTo);
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      if (isHO && branchFilter) params.branch = branchFilter;

      const [dashboardRes, userRes] = await Promise.all([
        API.get("admin-dashboard/", { params }),
        API.get("users/me/"),
      ]);

      let combinedData: any = {};
      if (dashboardRes.data?.status === "success") {
        combinedData = dashboardRes.data;
      }
      combinedData.user = userRes.data;
      setData(combinedData);
            if (isHO && !branchFilter) {
        try {
          const bp = await API.get("sales/by_branch/", {
            params: { date_from: params.date_from, date_to: params.date_to },
          });
          setBranchPerf(bp.data?.branches || []);
        } catch {
          setBranchPerf([]);   // don't break the whole dashboard if this fails
        }
      } else {
        setBranchPerf([]);
      }
    } catch (e: any) {
      console.error("Error fetching dashboard or user data:", e);
      if (e.response?.status === 403) {
        setLoadError(e.response?.data?.detail || "Your account isn't assigned to a branch. Ask an administrator to assign one.");
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, rangeType, branchFilter, isHO]);

  // wait until we know who the user is, so a branch user never fires an unscoped request
  useEffect(() => { if (!loadingAccess) load(); }, [load, loadingAccess]);
  

  const d = data;

  const compareLabel: Record<string, string> = {
    today: "vs yesterday",
    week: "vs previous week",
    month: "vs previous month",
    year: "vs previous year",
    custom: "vs prior period",
    all: "",
  };
  const pctLabel = compareLabel[rangeType] ?? "vs prior period";

  const { from: viewFrom, to: viewTo } = computeRange(rangeType, dateFrom, dateTo);
  const rangeCaption =
    rangeType === "all" ? "All time" : viewFrom && viewTo ? `${viewFrom} → ${viewTo}` : "";

  const noun = rangeNoun(rangeType);
  const activeBranchName = isHO
    ? (branchFilter ? branches.find((b: any) => String(b.id) === branchFilter)?.name : "All branches")
    : branches.find((b: any) => b.id === userBranchId)?.name;
      const BRANCH_COLORS = ["#E41F07", "#FFA201", "#10B981", "#0092E4", "#8B5CF6", "#FF6B9D"];
  // Include branches with no sales (by_branch only returns branches that have sales)
  const perfRows = branches
    .map((b: any) => {
      const r = branchPerf.find((x: any) => x.branch === b.id);
      return {
        id: b.id,
        name: b.name,
        revenue: Number(r?.total_revenue || 0),
        count: r?.sales_count || 0,
        outstanding: Number(r?.outstanding || 0),
      };
    })
    .sort((a: any, b: any) => b.revenue - a.revenue);
  const perfTotal = perfRows.reduce((s: number, r: any) => s + r.revenue, 0);
  const perfMax = Math.max(...perfRows.map((r: any) => r.revenue), 1);
  /* ───────── STEP 2: role flags (replaces the old roleName useState/useEffect) ───────── */
  const view       = d?.view as "full" | "stock" | "sales" | undefined;
  const showSales  = view === "full" || view === "sales";
  const showStock  = view === "full" || view === "stock";
  const showProfit = view === "full";
  const roleName   = d?.user?.role?.role_name || d?.user?.role_detail?.role_name || "";
  const kpiCol     = showProfit ? "col-xl-3 col-sm-6 d-flex" : "col-xl-4 col-sm-6 d-flex";

  const trendFooter = (pct?: number) => (
    <>
      {!loading && pctBadge(pct ?? 0)}
      <p className="text-muted mb-0 fs-13">{pctLabel}</p>
    </>
  );

  const paymentTotal = d?.payment_breakdown?.reduce((s: number, p: any) => s + p.amount, 0) || 1;
  const paymentColors = ["bg-success", "bg-secondary", "bg-purple", "bg-danger", "bg-info", "bg-warning"];

  return (
    <>
      <div className="page-wrapper">
        <div className="content pb-0">

          {/* Page Header */}
          <div className="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
    <h4 className="mb-0 text-truncate">{roleName ? `${roleName} Dashboard` : "Dashboard"}</h4>
    {(rangeCaption || activeBranchName) && (
      <p className="text-muted fs-12 mb-0 mt-1 text-truncate">
                  {activeBranchName && <><i className="ti ti-building-store me-1" />{activeBranchName}{rangeCaption ? " · " : ""}</>}
                  {rangeCaption && <><i className="ti ti-calendar me-1" />{rangeCaption}</>}
                </p>
              )}
            </div>
         <div className="gap-2 d-flex align-items-center flex-wrap ms-auto">
  {isHO && (
    <select
      className="form-select form-select-sm"
      style={{ width: 170, flexShrink: 0 }}
                  value={branchFilter}
                  onChange={e => setBranchFilter(e.target.value)}
                >
                  <option value="">All branches</option>
                  {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <div className="d-flex gap-1 align-items-center">
                {([
                  { key: "today", label: "Today" },
                  { key: "week",  label: "Week"  },
                  { key: "month", label: "Month" },
                  { key: "year",  label: "Year"  },
                  { key: "all",   label: "All"   },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${rangeType === key ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => dispatch(setRangeType(key))}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="position-relative" ref={datePickerRef}>
                <button
                  type="button"
                 className={`btn btn-sm d-flex align-items-center justify-content-center gap-2 ${rangeType === "custom" ? "btn-primary" : "btn-outline-secondary"}`}
style={{ width: 200 }}
onClick={() => setShowDatePicker(p => !p)}
title="Set custom date range"
                >
                  <i className="ti ti-calendar" />
                  <span className="fs-12">
                    {rangeType === "all" ? "All Time" : rangeType === "custom" ? `${dateFrom} to ${dateTo}` : "Custom"}
                  </span>
                </button>

                {showDatePicker && (
                  <div className="position-absolute bg-white border rounded shadow-lg p-3"
                       style={{ top: "110%", right: 0, zIndex: 1050, minWidth: 280 }}>
                    <p className="fw-semibold fs-13 mb-2">Custom Date Range</p>
                    <div className="mb-2">
                      <label className="form-label fs-12 mb-1 text-muted">From</label>
                      <input type="date" className="form-control form-control-sm"
                        value={customFrom} max={customTo || undefined}
                        onChange={e => setCustomFrom(e.target.value)} />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fs-12 mb-1 text-muted">To</label>
                      <input type="date" className="form-control form-control-sm"
                        value={customTo} min={customFrom || undefined}
                        onChange={e => setCustomTo(e.target.value)} />
                    </div>
                    {customFrom && customTo && customFrom > customTo && (
                      <p className="text-danger fs-12 mb-2">
                        <i className="ti ti-alert-circle me-1" />"From" must be before "To"
                      </p>
                    )}
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-primary flex-fill" onClick={applyCustomRange}
                        disabled={!customFrom || !customTo || customFrom > customTo}>
                        Apply
                      </button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowDatePicker(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <Link to="#" className="btn btn-icon btn-outline-light shadow" onClick={load}>
                <i className="ti ti-refresh" />
              </Link>
              <Link to="#" className="btn btn-icon btn-outline-light shadow">
                <i className="ti ti-download" />
              </Link>
              <Link to="#" className="btn btn-icon btn-outline-light shadow" id="collapse-header">
                <i className="ti ti-transition-top" />
              </Link>
            </div>
          </div>
                          {loadError && (
            <div className="alert alert-warning fs-13 py-2 mb-3">
              <i className="ti ti-alert-triangle me-1" />{loadError}
            </div>
          )}
          {/* ───────── STEP 3: loading placeholder ───────── */}
          {loading && !d && (
            <div className="text-muted fs-13 py-5 text-center">
              <span className="spinner-border spinner-border-sm me-2" />Loading dashboard…
            </div>
          )}

          {/* ───────── STEP 4: KPI tiles ───────── */}
                    {showSales && (
            <>
              {/* Sales */}
              <div className="row g-3 mb-4">
                <KpiTile col="col-xl-3 col-sm-6 d-flex" label={`${noun} Sales`} color="#E41F07" bg="#FFE7E1" icon="ti-currency-dollar"
                  value={loading ? "—" : currency(d?.sales?.total)} footer={trendFooter(d?.sales?.change_pct)} />

                {/* <KpiTile col="col-xl-3 col-sm-6 d-flex" label={`${noun} Orders`} color="#FFA201" bg="#FFF4E6" icon="ti-receipt"
                  value={loading ? "—" : d?.orders?.total} footer={trendFooter(d?.orders?.change_pct)} /> */}

                <KpiTile col="col-xl-3 col-sm-6 d-flex" label={`${noun} Retail Sales`} color="#0092E4" bg="#E0F2FE" icon="ti-shopping-cart"
                  value={loading ? "—" : currency(d?.retail_sales?.total ?? 0)}
                  footer={<>
                    {!loading && pctBadge(d?.retail_sales?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{loading ? "" : `${d?.retail_sales?.count ?? 0} sale(s) · ${pctLabel}`}</p>
                  </>} />

                <KpiTile col="col-xl-3 col-sm-6 d-flex" label={`${noun} Wholesale Sales`} color="#8B5CF6" bg="#EDE9FE" icon="ti-building-warehouse"
                  value={loading ? "—" : currency(d?.wholesale_sales?.total ?? 0)}
                  footer={<>
                    {!loading && pctBadge(d?.wholesale_sales?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{loading ? "" : `${d?.wholesale_sales?.count ?? 0} sale(s) · ${pctLabel}`}</p>
                  </>} />
                                  {showProfit && (
                  <KpiTile col="col-xl-3 col-sm-6 d-flex" label={`${noun} Net Profit`} color="#10B981" bg="#D1FAE5" icon="ti-trending-up"
                    value={loading ? "—" : currency(d?.profit?.total)}
                    footer={
                      <div className="w-100">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          {trendFooter(d?.profit?.change_pct)}
                        </div>
                        {!loading && (
                          <div className="fs-12 text-muted mt-2 border-top pt-2">
                            <div className="d-flex justify-content-between">
                              <span>Gross profit</span><span>{currency(d?.profit?.gross)}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Petty cash</span><span className="text-danger">−{currency(d?.profit?.petty_cash)}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Business expenses</span><span className="text-danger">−{currency(d?.profit?.business_expenses)}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Salaries</span><span className="text-danger">−{currency(d?.profit?.salaries)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    } />
                )}
              </div>
                    
              {/* Credit sales */}
              <div className="row g-3 mb-4">
                <KpiTile col="col-xl-6 col-sm-6 d-flex" label={`${noun} Credit Sales · Pending`}
                  color="#F59E0B" bg="#FEF3C7" icon="ti-clock-dollar"
                  value={loading ? "—" : currency(d?.credit_sales?.pending?.total ?? 0)}
                  footer={<p className="text-muted mb-0 fs-13">
                    {loading ? "" : `${d?.credit_sales?.pending?.count ?? 0} credit sale(s) awaiting payment`}</p>} />
                <KpiTile col="col-xl-6 col-sm-6 d-flex" label={`${noun} Credit Sales · Completed`}
                  color="#10B981" bg="#D1FAE5" icon="ti-circle-check"
                  value={loading ? "—" : currency(d?.credit_sales?.completed?.total ?? 0)}
                  footer={<p className="text-muted mb-0 fs-13">
                    {loading ? "" : `${d?.credit_sales?.completed?.count ?? 0} credit sale(s) completed`}</p>} />
              </div>

              {/* Everything else */}
              <div className="row g-3 mb-4">
                {/* {showProfit && (
                  <KpiTile col="col-xl-4 col-sm-6 d-flex" label={`${noun} Net Profit`} color="#10B981" bg="#D1FAE5" icon="ti-trending-up"
                    value={loading ? "—" : currency(d?.profit?.total)}
                    footer={
                      <div className="w-100">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          {trendFooter(d?.profit?.change_pct)}
                        </div>
                        {!loading && (
                          <div className="fs-12 text-muted mt-2 border-top pt-2">
                            <div className="d-flex justify-content-between">
                              <span>Gross profit</span><span>{currency(d?.profit?.gross)}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Petty cash</span><span className="text-danger">−{currency(d?.profit?.petty_cash)}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Business expenses</span><span className="text-danger">−{currency(d?.profit?.business_expenses)}</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span>Salaries</span><span className="text-danger">−{currency(d?.profit?.salaries)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    } />
                )} */}

                <KpiTile col="col-xl-4 col-sm-6 d-flex" label="Items Sold" color="#0092E4" bg="#E0F2FE" icon="ti-package"
                  value={loading ? "—" : d?.items_sold?.total} footer={trendFooter(d?.items_sold?.change_pct)} />

                <KpiTile col="col-xl-4 col-sm-6 d-flex" label="Total Customers" color="#8B5CF6" bg="#EDE9FE" icon="ti-users"
                  value={loading ? "—" : d?.customers?.total} footer={trendFooter(d?.customers?.change_pct)} />

                <KpiTile col="col-xl-4 col-sm-6 d-flex" label="Outstanding Payments" color="#F59E0B" bg="#FEF3C7" icon="ti-file-invoice"
                  value={loading ? "—" : currency(d?.outstanding_payments?.total)}
                  footer={<p className="text-muted mb-0 fs-13">
                    {loading ? "" : `${d?.outstanding_payments?.count ?? 0} unpaid/credit sales`}</p>} />

                <KpiTile col="col-xl-4 col-sm-6 d-flex" label="Cash in Till" color="#10B981" bg="#D1FAE5" icon="ti-cash"
                  value={loading ? "—" : currency(d?.cash_in_till?.total)}
                  footer={<p className="text-muted mb-0 fs-13">
                    {loading ? "" : `As of ${d?.cash_in_till?.as_of ?? "now"}`}</p>} />
              </div>
            </>
          )}

          {showStock && (
            <div className="row g-3 mb-4">
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Total Products" color="#0092E4" bg="#E0F2FE" icon="ti-packages"
                value={loading ? "—" : d?.stock?.total_products ?? 0} />
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Units on Hand" color="#10B981" bg="#D1FAE5" icon="ti-box"
                value={loading ? "—" : d?.stock?.units_on_hand ?? 0} />
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Stock Value (cost)" color="#8B5CF6" bg="#EDE9FE" icon="ti-coin"
                value={loading ? "—" : currency(d?.stock?.stock_value)} />
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Low Stock Items" color="#DC2626" bg="#FEE2E2" icon="ti-alert-triangle"
                value={loading ? "—" : d?.low_stock?.total ?? 0}
                footer={<span className="badge rounded-pill badge-soft-danger border-0">Below minimum</span>} />
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Out of Stock" color="#DC2626" bg="#FEE2E2" icon="ti-box-off"
                value={loading ? "—" : d?.stock?.out_of_stock ?? 0} />
                
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Expiring (90 days)" color="#F59E0B" bg="#FEF3C7" icon="ti-hourglass"
                value={loading ? "—" : d?.stock?.expiring_soon ?? 0} />
              <KpiTile col="col-xl-3 col-sm-6 d-flex" label="Expired" color="#DC2626" bg="#FEE2E2" icon="ti-calendar-x"
                value={loading ? "—" : d?.stock?.expired ?? 0} />
              {isHO && (
                <KpiTile col="col-xl-3 col-sm-6 d-flex" label={`${noun} Movement Fees`} color="#0EA5E9" bg="#E0F2FE" icon="ti-truck-delivery"
                  value={loading ? "—" : currency(d?.stock?.movement_fees)}
                  footer={<p className="text-muted mb-0 fs-13">
                    {loading ? "" : `${d?.stock?.recent_movements?.length ?? 0} branch transfers`}</p>} />
              )}

         </div>
          )}

          {/* ───────── STEP 5: charts (note showSales added) ───────── */}
          {showSales && !loading && d && (
            <div className="row g-3 mb-4">
              <div className="col-lg-6 d-flex">
                <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #E41F07" }}>
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h5 className="mb-0 fw-bold">Sales Trend</h5>
                      <span className="badge bg-light text-dark fs-10">{d?.sales_trend?.length || 0} days</span>
                    </div>
                    {(d?.sales_trend?.length || 0) === 0 ? (
                      <div className="text-muted fs-13 py-5 text-center">
                        <i className="ti ti-chart-bar fs-2 d-block mb-2 opacity-50" />
                        No sales in this period
                      </div>
                    ) : (
                      <Chart
                        options={{
                          chart: {
                            type: "bar", height: 300, toolbar: { show: false },
                            animations: { enabled: true, speed: 800, animateGradually: { enabled: true, delay: 150 }, dynamicAnimation: { enabled: true, speed: 150 } }
                          },
                          colors: ["#E41F07"],
                          plotOptions: { bar: { columnWidth: "55%", borderRadius: 6, dataLabels: { position: "top" } } },
                          dataLabels: {
                            enabled: true, offsetY: -20,
                            formatter: (val: number) => currency(val),
                            style: { fontSize: "11px", fontWeight: 600, colors: ["#E41F07"] }
                          },
                          grid: { borderColor: "#E8E8E8", strokeDashArray: 4, yaxis: { lines: { show: true } } },
                          xaxis: {
                            categories: (d?.sales_trend || []).map((p: any) => p.date),
                            labels: { style: { fontSize: "12px", fontWeight: 600, colors: "#666" } }
                          },
                          yaxis: { labels: { style: { fontSize: "12px", fontWeight: 600 } } },
                          tooltip: { enabled: true, theme: "light", y: { formatter: (val: number) => currency(val) } }
                        } as ApexOptions}
                        series={[{ name: "Sales", data: (d?.sales_trend || []).map((p: any) => p.amount) }]}
                        type="bar"
                        height={300}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="col-lg-6 d-flex">
                <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #0092E4" }}>
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h5 className="mb-0 fw-bold">Payments by Method</h5>
                      <span className="badge bg-light text-dark fs-10">{d?.payment_breakdown?.length || 0} methods</span>
                    </div>
                    {(d?.payment_breakdown?.length || 0) === 0 ? (
                      <div className="text-muted fs-13 py-5 text-center">
                        <i className="ti ti-chart-pie fs-2 d-block mb-2 opacity-50" />
                        No payments in this period
                      </div>
                    ) : (
                      <Chart
                        options={{
                          chart: {
                            type: "donut", height: 300,
                            animations: { enabled: true, speed: 800, animateGradually: { enabled: true, delay: 150 }, dynamicAnimation: { enabled: true, speed: 150 } }
                          },
                          colors: ["#E41F07", "#FFA201", "#0092E4", "#10B981", "#8B5CF6", "#FF6B9D"],
                          labels: (d?.payment_breakdown || []).map((s: any) => s.method),
                          plotOptions: {
                            pie: {
                              donut: {
                                size: "65%",
                                labels: {
                                  show: true,
                                  name: { fontSize: "12px", fontWeight: 600 },
                                  value: { fontSize: "16px", fontWeight: 700, color: "#E41F07", formatter: (val: string) => currency(Number(val)) }
                                }
                              }
                            }
                          },
                          dataLabels: {
                            enabled: true,
                            formatter: (val: number) => `${Math.round(val)}%`,
                            style: { fontSize: "12px", fontWeight: 600 }
                          },
                          legend: { position: "bottom", fontSize: "12px", fontWeight: 600 },
                          tooltip: { enabled: true, theme: "light", y: { formatter: (val: number) => currency(val) } }
                        } as ApexOptions}
                        series={(d?.payment_breakdown || []).map((s: any) => s.amount)}
                        type="donut"
                        height={300}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
   {isHO && !branchFilter && !loading && perfRows.length > 0 && (
            <div className="row g-3 mb-4">
              <div className="col-12 d-flex">
                <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #10B981" }}>
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                      <div>
                        <h5 className="mb-0 fw-bold">Branch Performance</h5>
                        <p className="text-muted fs-12 mb-0 mt-1">
                          Bars are measured against the top branch. Click a branch to open its dashboard.
                        </p>
                      </div>
                      <span className="badge bg-light text-dark fs-11">
                        Total {currency(perfTotal)}
                      </span>
                    </div>

                    {perfTotal === 0 ? (
                      <div className="text-muted fs-13 py-4 text-center">
                        <i className="ti ti-building-store fs-2 d-block mb-2 opacity-50" />
                        No branch sales in this period
                      </div>
                    ) : perfRows.map((r: any, i: number) => {
                      const pctOfTop = Math.round((r.revenue / perfMax) * 100);
                      const share = perfTotal ? ((r.revenue / perfTotal) * 100).toFixed(1) : "0.0";
                      const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
                      return (
                        <div key={r.id} className="mb-3" style={{ cursor: "pointer" }}
                             onClick={() => setBranchFilter(String(r.id))}>
                          <div className="d-flex align-items-center justify-content-between mb-1 flex-wrap gap-1">
                            <span className="fw-semibold fs-13">
                              {i === 0 && r.revenue > 0 && <i className="ti ti-trophy text-warning me-1" />}
                              {r.name}
                            </span>
                            <span className="fs-13">
                              <strong>{currency(r.revenue)}</strong>
                              <span className="text-muted ms-2">
                                {share}% of total · {r.count} sale{r.count !== 1 ? "s" : ""}
                                {r.outstanding > 0 && <> · owing {currency(r.outstanding)}</>}
                              </span>
                            </span>
                          </div>
                          <div className="progress" style={{ height: 14, borderRadius: 999 }}>
                            <div
                              className="progress-bar progress-bar-striped progress-bar-animated"
                              role="progressbar"
                              style={{ width: `${pctOfTop}%`, backgroundColor: color, borderRadius: 999 }}
                              aria-valuenow={pctOfTop}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ───────── STEP 6 + 7: bottom row cards ───────── */}
          <div className="row">
                   
            {/* 1. Top Selling Products — wrapped in showSales */}
            {showSales && (
              <div className="col-xxl-4 col-xl-12 d-flex">
                <div className="card flex-fill">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                      <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                        <span className="line-title d-block me-2" />
                        Top Selling Products
                      </h5>
                      <div className="dropdown">
                        <Link className="dropdown-toggle btn btn-outline-light shadow" data-bs-toggle="dropdown" to="#">This Period</Link>
                        <div className="dropdown-menu dropdown-menu-end">
                          <Link to="#" className="dropdown-item">Today</Link>
                          <Link to="#" className="dropdown-item">This Week</Link>
                          <Link to="#" className="dropdown-item">This Month</Link>
                        </div>
                      </div>
                    </div>

                    {loading ? (
                      <div className="text-muted fs-13"><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                    ) : (d?.top_products ?? []).length === 0 ? (
                      <div className="text-muted fs-13 py-3 text-center">
                        <i className="ti ti-shopping-cart-off fs-3 d-block mb-2 opacity-50" />
                        No product sales in this period.
                      </div>
                    ) : (d?.top_products ?? []).map((p: any) => (
                      <div key={p.name} className="d-flex align-items-sm-center justify-content-between gap-2 flex-sm-row flex-column mb-3">
                        <div className="d-flex align-items-center">
                          <div className="avatar avatar-md border rounded-circle flex-shrink-0 bg-soft-primary d-flex align-items-center justify-content-center">
                            <span className="fw-bold text-primary fs-14">{(p.name[0] || "?").toUpperCase()}</span>
                          </div>
                          <div className="ms-2 flex-fill">
                            <p className="fw-medium text-truncate mb-1 fs-14">{p.name}</p>
                            <p className="fs-13 mb-0">{p.quantity_sold} sold · {currency(p.revenue)}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    <Link className="btn btn-sm btn-light d-flex align-items-center" to="/reports/sales">
                      View All <i className="ti ti-chevron-right ms-1" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Low Stock Items list — wrapped in showStock */}
            {showStock && (
              <div className={`${view === "stock" ? "col-xl-6" : "col-xxl-4 col-xl-6"} d-flex flex-column`}>
                <div className="card flex-fill">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                      <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                        <span className="line-title d-block me-2" />
                        Low Stock Items
                      </h5>
                      <Link to="/inventory" className="btn btn-sm btn-icon btn-outline-light">
                        <i className="ti ti-arrow-right" />
                      </Link>
                    </div>

                    {loading ? (
                      <div className="text-muted fs-13"><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                    ) : (d?.low_stock?.items ?? []).length === 0 ? (
                      <div className="text-muted fs-13 py-3 text-center">
                        <i className="ti ti-check fs-4 d-block mb-1 text-success" />
                        All items are sufficiently stocked.
                      </div>
                    ) : (
                      (d?.low_stock?.items ?? []).map((item: any, i: number, arr: any[]) => (
                        <div key={`${item.name}-${i}`} className={`p-2 d-flex align-items-center justify-content-between ${i < arr.length - 1 ? "border-bottom" : ""}`}>
                          <p className="text-dark d-flex align-items-center mb-0">
                            <i className="ti ti-circle-filled text-danger fs-8 me-1" />{item.name}
                          </p>
                          <p className="text-dark mb-0">{item.quantity} left</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Recent Stock Movements — storekeeper only (new) */}
            {view === "stock" && (
              <div className="col-xl-6 d-flex">
                <div className="card flex-fill">
                  <div className="card-body">
                    <h5 className="mb-3 fs-16 fw-bold d-inline-flex items-center">
                      <span className="line-title d-block me-2" />Recent Stock Movements
                    </h5>
                    {loading ? (
                      <div className="text-muted fs-13"><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                    ) : (d?.stock?.recent_movements ?? []).length === 0 ? (
                      <p className="text-muted fs-13 mb-0">No movements yet.</p>
                    ) : d.stock.recent_movements.map((m: any, i: number, arr: any[]) => (
                      <div key={i} className={`p-2 d-flex justify-content-between ${i < arr.length - 1 ? "border-bottom" : ""}`}>
                        <div>
                          <p className="mb-0 text-dark">{m.product}</p>
                          <small className="text-muted">{m.type} · {m.branch} · {m.date}</small>
                        </div>
                        <span className={m.qty >= 0 ? "text-success fw-semibold" : "text-danger fw-semibold"}>
                          {m.qty > 0 ? `+${m.qty}` : m.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Payments Overview — wrapped in showSales */}
            {showSales && (
              <div className={`${view === "sales" ? "col-xxl-8" : "col-xxl-4"} col-xl-6 d-flex`}>
                <div className="card flex-fill">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                      <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                        <span className="line-title d-block me-2" />
                        Payments Overview
                      </h5>
                      <Link to="/reports/payments" className="btn btn-sm btn-icon btn-outline-light">
                        <i className="ti ti-arrow-right" />
                      </Link>
                    </div>

                    {!loading && d && (
                      <>
                        <div className="progress-stacked progress-md bg-white gap-1 mb-3">
                          {(d.payment_breakdown ?? []).slice(0, 4).map((p: any, i: number) => (
                            <div
                              key={p.method}
                              className={`progress-bar ${paymentColors[i]} rounded overflow-hidden`}
                              role="progressbar"
                              style={{ width: `${Math.round((p.amount / paymentTotal) * 100)}%` }}
                            />
                          ))}
                        </div>

                        <div className="mb-4">
                          <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
                            <h4 className="mb-0">{currency(d.sales?.total)}</h4>
                            {pctBadge(d.sales?.change_pct ?? 0)}
                            <p className="mb-0">{pctLabel}</p>
                          </div>
                          {(d.payment_breakdown ?? []).length === 0 ? (
                            <p className="text-muted fs-13 mb-0">No payments recorded in this period.</p>
                          ) : (d.payment_breakdown ?? []).map((item: any, i: number, arr: any[]) => (
                            <div key={item.method} className={`p-2 d-flex align-items-center justify-content-between ${i < arr.length - 1 ? "border-bottom" : ""}`}>
                              <p className="text-dark d-flex align-items-center mb-0">
                                <i className={`ti ti-circle-filled ${paymentColors[i]?.replace("bg-", "text-") ?? "text-muted"} fs-8 me-1`} />{item.method}
                              </p>
                              <p className="text-dark mb-0">{currency(item.amount)}</p>
                            </div>
                          ))}
                        </div>

                        <div className="p-3 border rounded bg-light d-flex align-items-center justify-content-between">
                          <div>
                            <p className="mb-1">Outstanding</p>
                            <h4 className="mb-0">{currency(d.outstanding_payments?.total)}</h4>
                          </div>
                          <div>
                            <p className="mb-1">Cash in Till</p>
                            <h4 className="mb-0">{currency(d.cash_in_till?.total)}</h4>
                          </div>
                        </div>
                      </>
                    )}
                    {loading && <div className="text-muted fs-13 py-3"><span className="spinner-border spinner-border-sm me-2" />Loading...</div>}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <footer className="footer d-block d-md-flex justify-content-between text-md-start text-center">
          <p className="mb-md-0 mb-1">
            Copyright © <Link to="#" className="link-primary text-decoration-underline">Super POS</Link>
          </p>
          
        </footer>
      </div>
    </>
  );
};

export default MainDashboard;