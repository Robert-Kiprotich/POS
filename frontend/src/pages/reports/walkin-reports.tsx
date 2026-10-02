import { Link } from "react-router";
import Footer from "../../components/footer/footer";
import PageHeader from "../../components/page-header/pageHeader";
import PredefinedDatePicker from "../../components/common-dateRangePicker/PredefinedDatePicker";
import { all_routes } from "../../routes/all_routes";
import { useState, useEffect, useCallback } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import API from "../../services/api";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR: Record<string, string> = {
  open:         "border-info",
  "in progress":"border-warning",
  pending:      "border-warning",
  closed:       "border-success",
  escalated:    "border-danger",
};
const STATUS_BADGE: Record<string, string> = {
  open:         "badge-soft-info",
  "in progress":"badge-soft-warning",
  pending:      "badge-soft-warning",
  closed:       "badge-soft-success",
  escalated:    "badge-soft-danger",
};
const PRIORITY_BADGE: Record<string, string> = {
  urgent: "badge-soft-danger",
  high:   "badge-soft-danger",
  medium: "badge-soft-warning",
  low:    "badge-soft-success",
};

function groupByDate(rows: any[]) {
  const groups: Record<string, any[]> = {};
  for (const r of rows) {
    const label = r.created_on ? new Date(r.created_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown";
    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  }
  return Object.entries(groups);
}

const WalkinReports = () => {
  const [searchText, setSearchText]     = useState("");
  const [reportData, setReportData]     = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    try {
      const params: any = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await API.get("walkin-reports/", { params });
      if (res.data?.status === "success") setReportData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    load(`${year}-01-01`, `${year}-12-31`);
  };

  const barSeries = [{
    name: "Cases",
    data: reportData
      ? reportData.monthly_trend.labels.map((l: string, i: number) => ({ x: l, y: reportData.monthly_trend.data[i] }))
      : [{ x: "No data", y: 0 }],
  }];
  const barOptions: ApexOptions = {
    chart: { type: "bar", height: 310, toolbar: { show: false } },
    grid: { borderColor: "#E8E8E8", strokeDashArray: 4, padding: { right: -20 } },
    plotOptions: { bar: { columnWidth: "30%", borderRadiusApplication: "around" as "around" } },
    colors: ["#FFA201"],
    yaxis: { labels: { offsetX: -13 } },
  };

  const cats = (reportData?.categories ?? []).slice(0, 6);
  const donutOptions: ApexOptions = {
    chart: { type: "donut", height: 350 },
    colors: ["#0092E4", "#4A00E5", "#E41F07", "#FFA201", "#00918E", "#8B5CF6"],
    labels: cats.map((c: any) => c.name),
    plotOptions: { pie: { startAngle: -90, endAngle: 270, donut: { size: "65%" } } },
    dataLabels: { enabled: false },
    legend: { position: "bottom", formatter: (val, opts) => `${val} - ${opts.w.globals.series[opts.seriesIndex]}` },
  };
  const donutSeries = cats.map((c: any) => c.count);

  const filtered = (reportData?.results ?? []).filter((r: any) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return r.case_number?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q) || r.reporter_name?.toLowerCase().includes(q) || r.reporter_phone?.includes(q) || r.status?.toLowerCase().includes(q);
  });

  const grouped = groupByDate(filtered);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <>
      <div className="page-wrapper">
        <div className="content pb-0">
          <PageHeader title="Walk-in Reports" badgeCount={reportData?.summary?.total ?? 0} showModuleTile={false} showExport={false} />

          {/* Summary tiles */}
          {reportData && (
            <div className="row mb-3">
              {[
                { label: "Total Cases",  value: reportData.summary.total,  color: "primary" },
                { label: "Open",         value: reportData.summary.open,   color: "info"    },
                { label: "Closed",       value: reportData.summary.closed, color: "success" },
                { label: "GBV Cases",    value: reportData.summary.gbv,    color: "danger"  },
              ].map(t => (
                <div key={t.label} className="col-6 col-md-3 d-flex">
                  <div className="card shadow flex-fill text-center py-3">
                    <h3 className={`fw-bold text-${t.color} mb-1`}>{t.value}</h3>
                    <p className="text-muted fs-13 mb-0">{t.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="row">
            <div className="col-md-7 d-flex">
              <div className="card shadow flex-fill">
                <div className="card-header d-flex justify-content-between align-items-center flex-wrap row-gap-2">
                  <h6 className="mb-0">Cases By Month</h6>
                  <div className="dropdown">
                    <Link className="dropdown-toggle btn btn-outline-light shadow" data-bs-toggle="dropdown" to="#">
                      <i className="ti ti-calendar me-1" />{selectedYear}
                    </Link>
                    <div className="dropdown-menu dropdown-menu-end">
                      {yearOptions.map(y => <Link key={y} to="#" className="dropdown-item" onClick={() => handleYearChange(y)}>{y}</Link>)}
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div id="task-year">
                    {loading ? <div className="d-flex justify-content-center align-items-center" style={{ height: 310 }}><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                      : <Chart options={barOptions} series={barSeries} type="bar" height={310} />}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-5 d-flex">
              <div className="card shadow flex-fill">
                <div className="card-header d-flex justify-content-between align-items-center flex-wrap row-gap-2">
                  <h6 className="mb-0">Cases By Category</h6>
                  <div className="dropdown">
                    <Link className="dropdown-toggle btn btn-outline-light shadow" data-bs-toggle="dropdown" to="#">
                      <i className="ti ti-calendar me-1" />{selectedYear}
                    </Link>
                    <div className="dropdown-menu dropdown-menu-end">
                      {yearOptions.map(y => <Link key={y} to="#" className="dropdown-item" onClick={() => handleYearChange(y)}>{y}</Link>)}
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div id="leads-analysis">
                    {loading ? <div className="d-flex justify-content-center align-items-center" style={{ height: 350 }}><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                      : donutSeries.length > 0
                        ? <Chart options={donutOptions} series={donutSeries} type="donut" height={350} />
                        : <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ height: 350 }}><i className="ti ti-chart-donut fs-1 mb-2" /><p className="fs-13">No data</p></div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* card start */}
          <div className="card border-0 rounded-0">
            <div className="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <div className="input-icon input-icon-start position-relative">
                <span className="input-icon-addon text-dark"><i className="ti ti-search" /></span>
                <input type="text" className="form-control" placeholder="Search" value={searchText} onChange={e => setSearchText(e.target.value)} />
              </div>
              <Link to="#" className="btn btn-primary" data-bs-toggle="modal" data-bs-target="#download_report">
                <i className="ti ti-file-download me-1" />Download Report
              </Link>
            </div>
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <div className="dropdown">
                    <Link className="dropdown-toggle btn btn-outline-light shadow" data-bs-toggle="dropdown" to="#">All Cases</Link>
                    <div className="dropdown-menu dropdown-menu-end">
                      <Link to="#" className="dropdown-item">All Cases</Link>
                      <Link to="#" className="dropdown-item">GBV Cases</Link>
                      <Link to="#" className="dropdown-item">Closed</Link>
                    </div>
                  </div>
                  <div className="dropdown">
                    <Link to="#" className="btn btn-outline-light shadow px-2" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                      <i className="ti ti-filter me-2" />Filter<i className="ti ti-chevron-down ms-2" />
                    </Link>
                    <div className="filter-dropdown-menu dropdown-menu dropdown-menu-lg p-0">
                      <div className="filter-header d-flex align-items-center justify-content-between border-bottom">
                        <h6 className="mb-0"><i className="ti ti-filter me-1" />Filter</h6>
                        <button type="button" className="btn-close close-filter-btn" data-bs-dismiss="dropdown-menu" aria-label="Close" />
                      </div>
                      <div className="filter-set-view p-3">
                        <div className="accordion" id="accordionExample">
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link to="#" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="true" aria-controls="collapseTwo">Category</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse show" id="collapseTwo" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul className="mb-0">
                                  {(reportData?.categories ?? []).map((c: any) => (
                                    <li key={c.name} className="mb-1"><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />{c.name} ({c.count})</label></li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link to="#" className="collapsed" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">Priority</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse" id="collapseThree" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul>
                                  {["Urgent", "High", "Medium", "Low"].map(p => (
                                    <li key={p}><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />{p}</label></li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link to="#" className="collapsed" data-bs-toggle="collapse" data-bs-target="#Status" aria-expanded="false" aria-controls="Status">Status</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse" id="Status" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul>
                                  {["Open", "In Progress", "Closed", "Escalated"].map(s => (
                                    <li key={s}><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />{s}</label></li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2 mt-3">
                          <Link to="#" className="btn btn-outline-light w-100">Reset</Link>
                          <Link to={all_routes.walkinReports} className="btn btn-primary w-100">Filter</Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  <PredefinedDatePicker />
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <div className="form-check form-check-md">
                    <input className="form-check-input" type="checkbox" id="select-all" />
                    <label className="form-check-label" htmlFor="select-all">Mark all as read</label>
                  </div>
                  <div className="dropdown">
                    <Link to="#" className="dropdown-toggle btn btn-outline-light px-2 shadow" data-bs-toggle="dropdown">
                      <i className="ti ti-sort-ascending-2 me-2" />Sort By
                    </Link>
                    <div className="dropdown-menu">
                      <ul>
                        <li><Link to="#" className="dropdown-item">Newest</Link></li>
                        <li><Link to="#" className="dropdown-item">Oldest</Link></li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Case list grouped by date — mirrors the original task-wrap structure */}
              {loading ? (
                <div className="d-flex justify-content-center align-items-center py-5 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />Loading cases...
                </div>
              ) : filtered.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                  <i className="ti ti-folder-off fs-1 mb-2" /><p className="fs-14">No cases found.</p>
                </div>
              ) : (
                grouped.map(([dateLabel, rows], gi) => (
                  <div key={dateLabel} className={`task-wrap ${gi < grouped.length - 1 ? "border-bottom mb-3" : ""}`}>
                    <Link to="#" className="d-flex align-items-center justify-content-between mb-3" data-bs-toggle="collapse" data-bs-target={`#walkin_${gi}`}>
                      <h6 className="fs-16 mb-0">
                        {dateLabel}
                        <span className="badge badge-avatar text-dark bg-soft-dark rounded-circle ms-2 fw-medium">{rows.length}</span>
                      </h6>
                      <i className="ti ti-chevron-up arrow-rotate" />
                    </Link>
                    <div className="collapse show" id={`walkin_${gi}`}>
                      {rows.map((r: any) => {
                        const statusKey = (r.status || "").toLowerCase();
                        const priorityKey = (r.priority || "").toLowerCase();
                        return (
                          <div key={r.id} className="card rounded-start-0 mb-3">
                            <div className={`card-body border-start border-3 ${STATUS_COLOR[statusKey] || "border-secondary"}`}>
                              <div className="d-flex align-items-center justify-content-between flex-wrap row-gap-3">
                                <div className="d-flex align-items-center flex-wrap row-gap-2">
                                  <span className="me-3"><i className="ti ti-grip-vertical" /></span>
                                  <div className="form-check form-check-md me-3"><input className="form-check-input" type="checkbox" /></div>
                                  <div className="set-star rating-select me-3"><i className="ti ti-star-filled fs-16" /></div>
                                  <h6 className="fw-semibold mb-0 fs-14 me-3">{r.case_number} — {r.reporter_name}</h6>
                                  <span className={`badge ${PRIORITY_BADGE[priorityKey] || "badge-soft-secondary"} border-0 me-2`}>
                                    <i className="ti ti-alert-triangle me-1" />{r.category}
                                  </span>
                                  <span className={`badge ${STATUS_BADGE[statusKey] || "badge-soft-secondary"}`}>{r.status}</span>
                                  {r.is_gbv && <span className="badge badge-soft-danger ms-1">GBV</span>}
                                </div>
                                <div className="d-flex align-items-center flex-wrap row-gap-2">
                                  <div className="me-2"><span className={`badge ${PRIORITY_BADGE[priorityKey] || "badge-soft-secondary"}`}>{r.priority}</span></div>
                                  <div className="me-2"><i className="ti ti-user me-1" /><span className="fs-12 text-muted">{r.reporter_phone}</span></div>
                                  <div className="me-2"><i className="ti ti-calendar-exclamation me-1" />{fmtDate(r.created_on)}</div>
                                  <div className="me-2 text-muted fs-12">{r.created_by}</div>
                                </div>
                              </div>
                              {r.narrative && <p className="text-muted fs-12 mt-2 mb-0">{r.narrative}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {/* card end */}
        </div>
        <Footer />
      </div>
    </>
  );
};

export default WalkinReports;
