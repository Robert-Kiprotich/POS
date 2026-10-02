import { Link } from "react-router";
import Footer from "../../components/footer/footer";
import PageHeader from "../../components/page-header/pageHeader";
import { useState, useEffect, useCallback } from "react";
import { all_routes } from "../../routes/all_routes";
import SearchInput from "../../components/dataTable/dataTableSearch";
import Datatable from "../../components/dataTable";
import PredefinedDatePicker from "../../components/common-dateRangePicker/PredefinedDatePicker";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import API from "../../services/api";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  closed:      "bg-success",
  open:        "bg-info",
  "in progress":"bg-warning",
  pending:     "bg-warning",
  escalated:   "bg-danger",
};

const QaReports = () => {
  const [searchText, setSearchText]     = useState("");
  const [reportData, setReportData]     = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filledStars, setFilledStars]   = useState<Record<string, boolean>>({});

  const handleSearch = (value: string) => setSearchText(value);
  const handleClick  = (key: string)   => setFilledStars(p => ({ ...p, [key]: !p[key] }));

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    try {
      const params: any = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await API.get("qa-reports/", { params });
      if (res.data?.status === "success") setReportData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    load(`${year}-01-01`, `${year}-12-31`);
  };

  // Bar chart — cases per month
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
    colors: ["#E41F07"],
    yaxis: { labels: { offsetX: -13 } },
  };

  // Donut — cases by status
  const statuses = (reportData?.statuses ?? []).slice(0, 6);
  const donutOptions: ApexOptions = {
    chart: { type: "donut", height: 350 },
    colors: ["#00918E", "#0092E4", "#E41F07", "#FFA201", "#4A00E5", "#8B5CF6"],
    labels: statuses.map((s: any) => s.name),
    plotOptions: { pie: { startAngle: -90, endAngle: 270, donut: { size: "65%" } } },
    dataLabels: { enabled: false },
    legend: { position: "bottom", formatter: (val, opts) => `${val} - ${opts.w.globals.series[opts.seriesIndex]}` },
  };
  const donutSeries = statuses.map((s: any) => s.count);

  const filtered = (reportData?.results ?? []).filter((r: any) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return r.case_number?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q) || r.counsellor?.toLowerCase().includes(q) || r.status?.toLowerCase().includes(q) || r.reporter_name?.toLowerCase().includes(q);
  });

  const columns = [
    {
      title: "",
      dataIndex: "id",
      render: (_: any, record: any) => (
        <div className={`set-star rating-select ${filledStars[record.id] ? "filled" : ""}`} onClick={() => handleClick(String(record.id))}>
          <i className="ti ti-star-filled fs-16" />
        </div>
      ),
      sorter: (a: any, b: any) => a.id - b.id,
    },
    {
      title: "Case #",
      dataIndex: "case_number",
      render: (text: string) => <Link to="#" className="title-name fw-semibold text-primary">{text}</Link>,
      sorter: (a: any, b: any) => a.case_number.localeCompare(b.case_number),
    },
    { title: "Category", dataIndex: "category", sorter: (a: any, b: any) => a.category.localeCompare(b.category) },
    {
      title: "Counsellor",
      dataIndex: "counsellor",
      render: (text: string) => (
        <h6 className="d-flex align-items-center fs-14 fw-medium mb-0">
          <span className="avatar avatar-xs avatar-rounded me-2 bg-soft-primary text-primary fw-bold">
            {(text || "?")[0].toUpperCase()}
          </span>
          {text}
        </h6>
      ),
      sorter: (a: any, b: any) => (a.counsellor || "").localeCompare(b.counsellor || ""),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (text: string) => (
        <span className={`badge badge-pill badge-status ${STATUS_BADGE[(text || "").toLowerCase()] || "bg-secondary"}`}>{text}</span>
      ),
      sorter: (a: any, b: any) => a.status.localeCompare(b.status),
    },
    { title: "Priority", dataIndex: "priority", sorter: (a: any, b: any) => (a.priority || "").localeCompare(b.priority || "") },
    {
      title: "GBV",
      dataIndex: "is_gbv",
      render: (v: boolean) => v
        ? <span className="badge bg-danger-transparent text-danger">Yes</span>
        : <span className="text-muted fs-12">No</span>,
      sorter: (a: any, b: any) => Number(a.is_gbv) - Number(b.is_gbv),
    },
    {
      title: "Date",
      dataIndex: "created_on",
      render: (text: string) => fmtDate(text),
      sorter: (a: any, b: any) => new Date(a.created_on || 0).getTime() - new Date(b.created_on || 0).getTime(),
    },
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <>
      <div className="page-wrapper">
        <div className="content pb-0">
          <PageHeader title="Quality Analysis Report" badgeCount={reportData?.summary?.total ?? 0} showModuleTile={false} showExport={false} />

          {/* Summary tiles */}
          {reportData && (
            <div className="row mb-3">
              {[
                { label: "Total Cases",   value: reportData.summary.total,     color: "primary" },
                { label: "Closed",        value: reportData.summary.closed,    color: "success" },
                { label: "Escalated",     value: reportData.summary.escalated, color: "danger"  },
                { label: "GBV Cases",     value: reportData.summary.gbv,       color: "warning" },
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

          {/* Counsellor performance table */}
          {reportData?.agents?.length > 0 && (
            <div className="card shadow mb-3">
              <div className="card-header"><h6 className="mb-0">Counsellor Performance</h6></div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 fs-13">
                    <thead className="table-light">
                      <tr>
                        <th className="ps-3">Counsellor</th>
                        <th>Total Cases</th>
                        <th>Closed</th>
                        <th>Open</th>
                        <th>GBV</th>
                        <th>Resolution Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.agents.map((a: any) => (
                        <tr key={a.username}>
                          <td className="ps-3 fw-medium">{a.name}</td>
                          <td>{a.total}</td>
                          <td><span className="badge bg-success-transparent text-success">{a.closed}</span></td>
                          <td><span className="badge bg-info-transparent text-info">{a.open}</span></td>
                          <td>{a.gbv > 0 ? <span className="badge bg-danger-transparent text-danger">{a.gbv}</span> : <span className="text-muted">0</span>}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div className="progress flex-fill" style={{ height: 6 }}>
                                <div className="progress-bar bg-success" role="progressbar" style={{ width: `${a.resolution_rate}%` }} />
                              </div>
                              <span className="fs-12 text-muted">{a.resolution_rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
                  <div id="deals-report">
                    {loading ? <div className="d-flex justify-content-center align-items-center" style={{ height: 310 }}><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                      : <Chart options={barOptions} series={barSeries} type="bar" height={310} />}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-5 d-flex">
              <div className="card shadow flex-fill">
                <div className="card-header d-flex justify-content-between align-items-center flex-wrap row-gap-2">
                  <h6 className="mb-0">Cases By Status</h6>
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

          <div className="card border-0 rounded-0">
            <div className="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <div className="input-icon input-icon-start position-relative">
                <span className="input-icon-addon text-dark"><i className="ti ti-search" /></span>
                <SearchInput value={searchText} onChange={handleSearch} />
              </div>
              <Link to="#" className="btn btn-primary" data-bs-toggle="modal" data-bs-target="#download_report">
                <i className="ti ti-file-download me-1" />Download Report
              </Link>
            </div>
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="d-flex align-items-center gap-2 flex-wrap">
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
                              <Link to="#" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="true" aria-controls="collapseTwo">Status</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse show" id="collapseTwo" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul className="mb-0">
                                  {(reportData?.statuses ?? []).map((s: any) => (
                                    <li key={s.name} className="mb-1"><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />{s.name} ({s.count})</label></li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link to="#" className="collapsed" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">Counsellor</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse" id="collapseThree" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul className="mb-0">
                                  {(reportData?.agents ?? []).map((a: any) => (
                                    <li key={a.username} className="mb-1"><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />{a.name} ({a.total})</label></li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link to="#" className="collapsed" data-bs-toggle="collapse" data-bs-target="#owner" aria-expanded="false" aria-controls="owner">GBV</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse" id="owner" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul>
                                  <li><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />GBV Cases</label></li>
                                  <li><label className="dropdown-item px-2 d-flex align-items-center"><input className="form-check-input m-0 me-1" type="checkbox" />Non-GBV</label></li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2 mt-3">
                          <Link to="#" className="btn btn-outline-light w-100">Reset</Link>
                          <Link to={all_routes.qaReports} className="btn btn-primary w-100">Filter</Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  <PredefinedDatePicker />
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
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
                  <div className="dropdown">
                    <Link to="#" className="btn bg-soft-indigo px-2 border-0" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                      <i className="ti ti-columns-3 me-2" />Manage Columns
                    </Link>
                    <div className="dropdown-menu dropdown-menu-md dropdown-md p-3">
                      <ul>
                        {["Case #", "Category", "Counsellor", "Status", "Priority", "GBV", "Date"].map(col => (
                          <li key={col} className="gap-1 d-flex align-items-center mb-2">
                            <i className="ti ti-columns me-1" />
                            <div className="form-check form-switch w-100 ps-0">
                              <label className="form-check-label d-flex align-items-center gap-2 w-100">
                                <span>{col}</span>
                                <input className="form-check-input switchCheckDefault ms-auto" type="checkbox" role="switch" defaultChecked />
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="d-flex justify-content-center align-items-center py-5 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />Loading...
                </div>
              ) : (
                <div className="custom-table">
                  <Datatable columns={columns} dataSource={filtered} Selection={true} searchText={searchText} />
                </div>
              )}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};

export default QaReports;
