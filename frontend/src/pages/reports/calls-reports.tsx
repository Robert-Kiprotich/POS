import { Link } from "react-router";
import PredefinedDatePicker from "../../components/common-dateRangePicker/PredefinedDatePicker";
import Footer from "../../components/footer/footer";
import { all_routes } from "../../routes/all_routes";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/page-header/pageHeader";
import SearchInput from "../../components/dataTable/dataTableSearch";
import Datatable from "../../components/dataTable";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import API from "../../services/api";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDuration(secs: number) {
  if (!secs) return "0s";
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const DISP_BADGE: Record<string, string> = {
  "ANSWERED":  "bg-success",
  "NO ANSWER": "bg-warning",
  "FAILED":    "bg-danger",
  "BUSY":      "bg-info",
};

const CallsReports = () => {
  const [searchText, setSearchText]   = useState("");
  const [reportData, setReportData]   = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filledStars, setFilledStars] = useState<Record<string, boolean>>({});

  const handleSearch = (value: string) => setSearchText(value);
  const handleClick  = (key: string)  => setFilledStars(p => ({ ...p, [key]: !p[key] }));

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    try {
      const params: any = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await API.get("calls-reports/", { params });
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
    name: "Calls",
    data: reportData
      ? reportData.monthly_trend.labels.map((l: string, i: number) => ({ x: l, y: reportData.monthly_trend.data[i] }))
      : [{ x: "No data", y: 0 }],
  }];
  const barOptions: ApexOptions = {
    chart: { type: "bar", height: 310, toolbar: { show: false } },
    grid: { borderColor: "#E8E8E8", strokeDashArray: 4, padding: { right: -20 } },
    plotOptions: { bar: { columnWidth: "30%", borderRadiusApplication: "around" as "around" } },
    colors: ["#00918E"],
    yaxis: { labels: { offsetX: -13 } },
  };

  const donutDisps = (reportData?.dispositions ?? []).slice(0, 5);
  const donutOptions: ApexOptions = {
    chart: { type: "donut", height: 350 },
    colors: ["#00918E", "#E41F07", "#FFA201", "#0092E4", "#4A00E5"],
    labels: donutDisps.map((d: any) => d.name),
    plotOptions: { pie: { startAngle: -90, endAngle: 270, donut: { size: "65%" } } },
    dataLabels: { enabled: false },
    legend: { position: "bottom", formatter: (val, opts) => `${val} - ${opts.w.globals.series[opts.seriesIndex]}` },
  };
  const donutSeries = donutDisps.map((d: any) => d.count);

  const filtered = (reportData?.results ?? []).filter((r: any) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return r.caller?.toLowerCase().includes(q) || r.destination?.toLowerCase().includes(q) || r.disposition?.toLowerCase().includes(q) || r.queue?.toLowerCase().includes(q);
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
      title: "Caller",
      dataIndex: "caller",
      render: (text: string) => (
        <h6 className="d-flex align-items-center fs-14 fw-medium mb-0">
          <span className="avatar avatar-xs avatar-rounded me-2 bg-soft-primary text-primary fw-bold">
            <i className="ti ti-phone fs-12" />
          </span>
          <span className="d-flex flex-column">{text}</span>
        </h6>
      ),
      sorter: (a: any, b: any) => (a.caller || "").localeCompare(b.caller || ""),
    },
    { title: "Destination", dataIndex: "destination", sorter: (a: any, b: any) => (a.destination || "").localeCompare(b.destination || "") },
    { title: "Queue", dataIndex: "queue", sorter: (a: any, b: any) => (a.queue || "").localeCompare(b.queue || "") },
    {
      title: "Duration",
      dataIndex: "duration",
      render: (v: number) => fmtDuration(v),
      sorter: (a: any, b: any) => a.duration - b.duration,
    },
    {
      title: "Disposition",
      dataIndex: "disposition",
      render: (text: string) => (
        <span className={`badge badge-pill badge-status ${DISP_BADGE[text] || "bg-secondary"}`}>{text}</span>
      ),
      sorter: (a: any, b: any) => (a.disposition || "").localeCompare(b.disposition || ""),
    },
    {
      title: "Date",
      dataIndex: "call_date",
      render: (text: string) => fmtDate(text),
      sorter: (a: any, b: any) => new Date(a.call_date || 0).getTime() - new Date(b.call_date || 0).getTime(),
    },
    {
      title: "Recording",
      dataIndex: "recording",
      render: (v: boolean) => v
        ? <span className="badge bg-success-transparent text-success"><i className="ti ti-circle-check me-1" />Yes</span>
        : <span className="text-muted fs-12">—</span>,
      sorter: (a: any, b: any) => Number(a.recording) - Number(b.recording),
    },
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <>
      <div className="page-wrapper">
        <div className="content pb-0">
          <PageHeader title="Calls Reports" badgeCount={reportData?.summary?.total ?? 0} showModuleTile={false} showExport={true} />

          {/* Summary tiles */}
          {reportData && (
            <div className="row mb-3">
              {[
                { label: "Total Calls",    value: reportData.summary.total,    color: "primary" },
                { label: "Answered",       value: reportData.summary.answered, color: "success" },
                { label: "Missed",         value: reportData.summary.missed,   color: "warning" },
                { label: "Avg Duration",   value: fmtDuration(reportData.summary.avg_duration), color: "info" },
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
                  <h6 className="mb-0">Calls By Month</h6>
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
                  <div id="contact-report">
                    {loading ? <div className="d-flex justify-content-center align-items-center" style={{ height: 310 }}><span className="spinner-border spinner-border-sm me-2" />Loading...</div>
                      : <Chart options={barOptions} series={barSeries} type="bar" height={310} />}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-5 d-flex">
              <div className="card shadow flex-fill">
                <div className="card-header d-flex justify-content-between align-items-center flex-wrap row-gap-2">
                  <h6 className="mb-0">Calls By Disposition</h6>
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
                        : <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ height: 350 }}><i className="ti ti-phone-off fs-1 mb-2" /><p className="fs-13">No call data available</p></div>}
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
                              <Link to="#" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="true" aria-controls="collapseTwo">Disposition</Link>
                            </div>
                            <div className="filter-set-contents accordion-collapse collapse show" id="collapseTwo" data-bs-parent="#accordionExample">
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul className="mb-0">
                                  {(reportData?.dispositions ?? []).map((d: any) => (
                                    <li key={d.name} className="mb-1">
                                      <label className="dropdown-item px-2 d-flex align-items-center">
                                        <input className="form-check-input m-0 me-1" type="checkbox" />{d.name} ({d.count})
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2 mt-3">
                          <Link to="#" className="btn btn-outline-light w-100">Reset</Link>
                          <Link to={all_routes.callsReports} className="btn btn-primary w-100">Filter</Link>
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
                        {["Caller", "Destination", "Queue", "Duration", "Disposition", "Date", "Recording"].map(col => (
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
                  <span className="spinner-border spinner-border-sm me-2" />Loading calls...
                </div>
              ) : (
                <div className="custom-table">
                  <Datatable columns={columns} dataSource={filtered} Selection={true} searchText={searchText} />
                </div>
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

export default CallsReports;
