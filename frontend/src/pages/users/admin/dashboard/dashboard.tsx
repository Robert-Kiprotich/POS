import { Link } from "react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import API from "../../../../services/api";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { setRangeType, setCustomDateRange } from "../../../../core/redux/dateFilterSlice";

function pctBadge(pct: number) {
  return pct >= 0
    ? <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-success border-0">+{pct}%</span>
    : <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-danger border-0">{pct}%</span>;
}

function currency(value: number | undefined | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value);
}

// ── Helpers for date-range computation ──────────────────────────────────────
const iso = (d: Date) => d.toISOString().slice(0, 10);

function computeRange(rangeType: string, customFrom?: string, customTo?: string) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (rangeType) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'week': {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { from: iso(start), to: iso(today) };
    }
    case 'month': {
      const start = new Date(year, month, 1);
      return { from: iso(start), to: iso(today) };
    }
    case 'year': {
      const start = new Date(year, 0, 1);
      return { from: iso(start), to: iso(today) };
    }
    case 'custom':
      return { from: customFrom || iso(today), to: customTo || iso(today) };
    case 'all':
    default:
      return { from: undefined, to: undefined };
  }
}

// What noun to show on tiles — "Today's" only when the range is today.
function rangeNoun(rangeType: string) {
  switch (rangeType) {
    case 'today':  return "Today's";
    case 'week':   return "This Week's";
    case 'month':  return "This Month's";
    case 'year':   return "This Year's";
    case 'custom': return "Period";
    case 'all':    return "Total";
    default:       return "";
  }
}

const MainDashboard = () => {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const dispatch = useDispatch();
  const { dateFrom, dateTo, rangeType } = useSelector((state: any) => state.dateFilter);

  // ── Custom date picker state ──────────────────────────────────────────────
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customFrom, setCustomFrom] = useState(dateFrom);
  const [customTo, setCustomTo]     = useState(dateTo);
  const datePickerRef = useRef<HTMLDivElement>(null);

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
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker]);

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) return;
    dispatch(setCustomDateRange({ dateFrom: customFrom, dateTo: customTo }));
    setShowDatePicker(false);
  };

  // Fetch dashboard metrics + current user
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { range: rangeType };

      // Compute the actual date bounds for the current rangeType.
      // The backend expects date_from / date_to to filter correctly.
      const { from, to } = computeRange(rangeType, dateFrom, dateTo);
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;

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
    } catch (e) {
      console.error("Error fetching dashboard or user data:", e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, rangeType]);

  useEffect(() => {
    load();
  }, [load]);

  const d = data;

  const compareLabel: Record<string, string> = {
    today:   'vs yesterday',
    week:    'vs previous week',
    month:   'vs previous month',
    year:    'vs previous year',
    custom:  'vs prior period',
    all:     '',
  };
  const pctLabel = compareLabel[rangeType] ?? 'vs prior period';

  // Show the range being viewed under the header (subtle, helpful).
  const { from: viewFrom, to: viewTo } = computeRange(rangeType, dateFrom, dateTo);
  const rangeCaption =
    rangeType === 'all'
      ? 'All time'
      : viewFrom && viewTo
        ? `${viewFrom} → ${viewTo}`
        : '';

  // Tiles use this so labels match the period they represent.
  const noun = rangeNoun(rangeType);

  // Payment method breakdown %widths for progress bar
  const paymentTotal = d?.payment_breakdown?.reduce((s: number, p: any) => s + p.amount, 0) || 1;
  const paymentColors = ["bg-success", "bg-secondary", "bg-purple", "bg-danger", "bg-info", "bg-warning"];

  return (
    <>
      <div className="page-wrapper">
        <div className="content pb-0">

          {/* Page Header */}
          <div className="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
            <div>
              <h4 className="mb-0">Admin/ Dashboard</h4>
              {rangeCaption && (
                <p className="text-muted fs-12 mb-0 mt-1">
                  <i className="ti ti-calendar me-1" />{rangeCaption}
                </p>
              )}
            </div>
            <div className="gap-2 d-flex align-items-center flex-wrap">
              {/* Date Range Buttons */}
              <div className="d-flex gap-1 align-items-center">
                {([
                  { key: 'today', label: 'Today' },
                  { key: 'week',  label: 'Week'  },
                  { key: 'month', label: 'Month' },
                  { key: 'year',  label: 'Year'  },
                  { key: 'all',   label: 'All'   },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${rangeType === key ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => dispatch(setRangeType(key))}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Custom date range picker */}
              <div className="position-relative" ref={datePickerRef}>
                <button
                  type="button"
                  className={`btn btn-sm d-flex align-items-center gap-2 ${rangeType === 'custom' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setShowDatePicker(p => !p)}
                  title="Set custom date range"
                >
                  <i className="ti ti-calendar" />
                  <span className="fs-12">
                    {rangeType === 'all'
                      ? 'All Time'
                      : rangeType === 'custom'
                        ? `${dateFrom} to ${dateTo}`
                        : 'Custom'}
                  </span>
                </button>

                {showDatePicker && (
                  <div
                    className="position-absolute bg-white border rounded shadow-lg p-3"
                    style={{ top: '110%', right: 0, zIndex: 1050, minWidth: 280 }}
                  >
                    <p className="fw-semibold fs-13 mb-2">Custom Date Range</p>
                    <div className="mb-2">
                      <label className="form-label fs-12 mb-1 text-muted">From</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={e => setCustomFrom(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fs-12 mb-1 text-muted">To</label>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={customTo}
                        min={customFrom || undefined}
                        onChange={e => setCustomTo(e.target.value)}
                      />
                    </div>
                    {customFrom && customTo && customFrom > customTo && (
                      <p className="text-danger fs-12 mb-2">
                        <i className="ti ti-alert-circle me-1" />"From" must be before "To"
                      </p>
                    )}
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-primary flex-fill"
                        onClick={applyCustomRange}
                        disabled={!customFrom || !customTo || customFrom > customTo}
                      >
                        Apply
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setShowDatePicker(false)}
                      >
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

          {/* ── Row 0: KPI Tiles ──────────────────────────────────────────── */}
          <div className="row g-3 mb-4">
            {/* Sales */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #E41F07" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">{noun} Sales</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "1.6rem" }}>
                    {loading ? "—" : currency(d?.sales?.total)}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {!loading && pctBadge(d?.sales?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{pctLabel}</p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#FFE7E1", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-currency-dollar fs-4" style={{ color: "#E41F07" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Orders */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #FFA201" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">{noun} Orders</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "2rem" }}>
                    {loading ? "—" : d?.orders?.total}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {!loading && pctBadge(d?.orders?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{pctLabel}</p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#FFF4E6", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-receipt fs-4" style={{ color: "#FFA201" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Profit */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #10B981" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">{noun} Profit</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "1.6rem" }}>
                    {loading ? "—" : currency(d?.profit?.total)}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {!loading && pctBadge(d?.profit?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{pctLabel}</p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#D1FAE5", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-trending-up fs-4" style={{ color: "#10B981" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Items Sold */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #0092E4" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">Items Sold</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "2rem" }}>
                    {loading ? "—" : d?.items_sold?.total}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {!loading && pctBadge(d?.items_sold?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{pctLabel}</p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#E0F2FE", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-package fs-4" style={{ color: "#0092E4" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3 mb-4">
            {/* Low Stock Items */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #DC2626" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">Low Stock Items</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "2rem" }}>
                    {loading ? "—" : d?.low_stock?.total}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="badge rounded-pill badge-soft-danger border-0">Below minimum</span>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#FEE2E2", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-alert-triangle fs-4" style={{ color: "#DC2626" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Customers */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #8B5CF6" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">Total Customers</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "2rem" }}>
                    {loading ? "—" : d?.customers?.total}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {!loading && pctBadge(d?.customers?.change_pct ?? 0)}
                    <p className="text-muted mb-0 fs-13">{pctLabel}</p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#EDE9FE", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-users fs-4" style={{ color: "#8B5CF6" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Outstanding Payments */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #F59E0B" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">Outstanding Payments</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "1.6rem" }}>
                    {loading ? "—" : currency(d?.outstanding_payments?.total)}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <p className="text-muted mb-0 fs-13">
                      {loading ? "" : `${d?.outstanding_payments?.count ?? 0} unpaid/credit sales`}
                    </p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#FEF3C7", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-file-invoice fs-4" style={{ color: "#F59E0B" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cash in Till */}
            <div className="col-xl-3 col-sm-6 d-flex">
              <div className="card flex-fill border-0 shadow-sm" style={{ borderTop: "3px solid #10B981" }}>
                <div className="card-body position-relative">
                  <p className="fw-medium mb-1 text-muted">Cash in Till</p>
                  <h4 className="mb-3 text-dark" style={{ fontSize: "1.6rem" }}>
                    {loading ? "—" : currency(d?.cash_in_till?.total)}
                  </h4>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <p className="text-muted mb-0 fs-13">
                      {loading ? "" : `As of ${d?.cash_in_till?.as_of ?? "now"}`}
                    </p>
                  </div>
                  <div className="custom-card-icon">
                    <div className="avatar avatar-rounded avatar-lg" style={{ background: "#D1FAE5", position: "absolute", top: 0, insetInlineEnd: 0 }}>
                      <i className="ti ti-cash fs-4" style={{ color: "#10B981" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 1: Charts (Sales trend + Payment methods) ────────────── */}
          {!loading && d && (
            <div className="row g-3 mb-4">
              {/* Bar Chart - Sales by day */}
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
                            type: "bar",
                            height: 300,
                            toolbar: { show: false },
                            animations: { enabled: true, speed: 800, animateGradually: { enabled: true, delay: 150 }, dynamicAnimation: { enabled: true, speed: 150 } }
                          },
                          colors: ["#E41F07"],
                          plotOptions: {
                            bar: { columnWidth: "55%", borderRadius: 6, dataLabels: { position: "top" } }
                          },
                          dataLabels: {
                            enabled: true,
                            offsetY: -20,
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
                        series={[
                          {
                            name: "Sales",
                            data: (d?.sales_trend || []).map((p: any) => p.amount)
                          }
                        ]}
                        type="bar"
                        height={300}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Pie Chart - Payment methods */}
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
                            type: "donut",
                            height: 300,
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

          {/* ── Row 2: Top Selling Products + Low Stock List + Payments Overview ── */}
          <div className="row">
            {/* Top Selling Products */}
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

            {/* Low Stock Items List */}
            <div className="col-xxl-4 col-xl-6 d-flex flex-column">
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

            {/* Payments Overview */}
            <div className="col-xxl-4 col-xl-6 d-flex">
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
          </div>

        </div>

        {/* Footer */}
        <footer className="footer d-block d-md-flex justify-content-between text-md-start text-center">
          <p className="mb-md-0 mb-1">
            Copyright © <Link to="#" className="link-primary text-decoration-underline">Holla v2</Link>
          </p>
          <div className="d-flex align-items-center gap-2 footer-links justify-content-center justify-content-md-end">
            <Link to="#">About</Link>
            <Link to="#">Terms</Link>
            <Link to="#">Contact Us</Link>
          </div>
        </footer>
      </div>
    </>
  );
};

export default MainDashboard;