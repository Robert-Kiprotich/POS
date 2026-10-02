import { Link } from "react-router";
import Footer from "../../components/footer/footer";
import PageHeader from "../../components/page-header/pageHeader";
import ImageWithBasePath from "../../components/imageWithBasePath";
import SearchInput from "../../components/dataTable/dataTableSearch";
import PredefinedDatePicker from "../../components/common-dateRangePicker/PredefinedDatePicker";
import { useState, useEffect, useCallback } from "react";
import { all_routes } from "../../routes/all_routes";
import Datatable from "../../components/dataTable";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import API from "../../services/api";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<string, string> = {
  closed:      "bg-success",
  open:        "bg-info",
  "in progress": "bg-warning",
  pending:     "bg-warning",
  escalated:   "bg-danger",
};

function statusBadge(status: string) {
  const key = (status || "").toLowerCase();
  return STATUS_BADGE[key] || "bg-secondary";
}

// ── types ────────────────────────────────────────────────────────────────────

interface CaseRow {
  id: number;
  case_number: string;
  category: string;
  subcategory: string;
  status: string;
  priority: string;
  is_gbv: boolean;
  reporter_name: string;
  reporter_phone: string;
  created_by: string;
  created_on: string | null;
}

interface Summary {
  total: number;
  open: number;
  closed: number;
  gbv: number;
}

interface MonthlyTrend {
  labels: string[];
  data: number[];
}

interface CategoryItem {
  name: string;
  count: number;
}

interface ReportData {
  summary: Summary;
  monthly_trend: MonthlyTrend;
  categories: CategoryItem[];
  statuses: CategoryItem[];
  results: CaseRow[];
}

// ── component ─────────────────────────────────────────────────────────────────

const CaseReports = () => {
  const [searchText, setSearchText]   = useState<string>("");
  const [reportData, setReportData]   = useState<ReportData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [dateFrom, setDateFrom]       = useState<string>("");
  const [dateTo, setDateTo]           = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [filledStars, setFilledStars] = useState<{ [key: string]: boolean }>({});

  const handleSearch = (value: string) => setSearchText(value);

  const handleClick = (key: string) => {
    setFilledStars((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await API.get("case-reports/", { params });
      if (res.data?.status === "success") {
        setReportData(res.data);
      }
    } catch (e) {
      console.error("Case reports fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── filter by year (bar chart) ─────────────────────────────────────────────

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    const from = `${year}-01-01`;
    const to   = `${year}-12-31`;
    setDateFrom(from);
    setDateTo(to);
    load(from, to);
  };

  // ── chart data ─────────────────────────────────────────────────────────────

  const barSeries = [
    {
      name: "Cases",
      data: reportData
        ? reportData.monthly_trend.labels.map((label, i) => ({
            x: label,
            y: reportData.monthly_trend.data[i],
          }))
        : [{ x: "No data", y: 0 }],
    },
  ];

  const barOptions: ApexOptions = {
    chart: { type: "bar", height: 310, toolbar: { show: false } },
    grid: {
      borderColor: "#E8E8E8",
      strokeDashArray: 4,
      padding: { right: -20 },
    },
    plotOptions: {
      bar: {
        columnWidth: "30%",
        borderRadiusApplication: "around" as "around",
      },
    },
    colors: ["#00918E"],
    yaxis: { labels: { offsetX: -13 } },
  };

  const donutCategories = reportData?.categories.slice(0, 6) ?? [];
  const donutColors = ["#0092E4", "#4A00E5", "#E41F07", "#FFA201", "#00918E", "#8B5CF6"];

  const donutOptions: ApexOptions = {
    chart: { type: "donut", height: 350 },
    colors: donutColors,
    labels: donutCategories.map((c) => c.name),
    plotOptions: {
      pie: {
        startAngle: -90,
        endAngle: 270,
        donut: { size: "65%" },
      },
    },
    dataLabels: { enabled: false },
    legend: {
      position: "bottom",
      formatter: (val, opts) =>
        `${val} - ${opts.w.globals.series[opts.seriesIndex]}`,
    },
    responsive: [
      { breakpoint: 480, options: { chart: { width: 200 }, legend: { position: "bottom" } } },
    ],
  };

  const donutSeries = donutCategories.map((c) => c.count);

  // ── table ──────────────────────────────────────────────────────────────────

  const filtered = (reportData?.results ?? []).filter((row) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (
      row.case_number.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q) ||
      row.reporter_name.toLowerCase().includes(q) ||
      row.reporter_phone.includes(q) ||
      row.created_by.toLowerCase().includes(q) ||
      row.status.toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      title: "",
      dataIndex: "id",
      render: (_: any, record: any) => (
        <div
          className={`set-star rating-select ${filledStars[record.id] ? "filled" : ""}`}
          onClick={() => handleClick(String(record.id))}
        >
          <i className="ti ti-star-filled fs-16" />
        </div>
      ),
      sorter: (a: any, b: any) => a.id - b.id,
    },
    {
      title: "Case Number",
      dataIndex: "case_number",
      render: (text: string) => (
        <h6 className="d-flex fs-14 align-items-center fw-medium mb-0">
          <Link to="#" className="d-flex flex-column">
            {text}
          </Link>
        </h6>
      ),
      sorter: (a: any, b: any) => a.case_number.localeCompare(b.case_number),
    },
    {
      title: "Category",
      dataIndex: "category",
      render: (text: string, record: any) => (
        <h6 className="d-flex fs-14 align-items-center fw-medium mb-0">
          <Link to="#" className="d-flex flex-column">
            {text}
            <span className="text-body fs-13 fw-normal mt-1">{record.subcategory}</span>
          </Link>
        </h6>
      ),
      sorter: (a: any, b: any) => a.category.localeCompare(b.category),
    },
    {
      title: "Reporter",
      dataIndex: "reporter_phone",
      render: (_: any, record: any) => (
        <h6 className="d-flex fs-14 align-items-center fw-medium mb-0">
          <Link to="#" className="avatar avatar-rounded border me-2">
            <ImageWithBasePath src="assets/img/users/user-01.jpg" alt="User Image" />
          </Link>
          <Link to="#" className="d-flex flex-column">
            {record.reporter_name}
            <span className="text-body fs-13 fw-normal mt-1">{record.reporter_phone}</span>
          </Link>
        </h6>
      ),
      sorter: (a: any, b: any) => a.reporter_name.localeCompare(b.reporter_name),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (text: string) => (
        <span className={`badge badge-tag ${statusBadge(text)}`}>{text}</span>
      ),
      sorter: (a: any, b: any) => a.status.localeCompare(b.status),
    },
    {
      title: "Created Date",
      dataIndex: "created_on",
      render: (text: string) => fmtDate(text),
      sorter: (a: any, b: any) =>
        new Date(a.created_on || 0).getTime() - new Date(b.created_on || 0).getTime(),
    },
    {
      title: "Counsellor",
      dataIndex: "created_by",
      render: (text: string) => (
        <h6 className="d-flex fs-14 align-items-center fw-medium mb-0">
          <Link to="#" className="avatar avatar-rounded border me-2">
            <ImageWithBasePath src="assets/img/profiles/avatar-01.jpg" alt="User Image" />
          </Link>
          <Link to="#" className="d-flex flex-column">
            {text}
          </Link>
        </h6>
      ),
      sorter: (a: any, b: any) => a.created_by.localeCompare(b.created_by),
    },
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ========================
          Start Page Content
      ========================= */}
      <div className="page-wrapper">
        {/* Start Content */}
        <div className="content pb-0">
          {/* Page Header */}
          <PageHeader
            title="Case Reports"
            badgeCount={reportData?.summary.total ?? 0}
            showModuleTile={false}
            showExport={false}
          />
          {/* End Page Header */}

          {/* Summary tiles */}
          {reportData && (
            <div className="row mb-3">
              {[
                { label: "Total Cases",  value: reportData.summary.total,  color: "primary" },
                { label: "Open Cases",   value: reportData.summary.open,   color: "info"    },
                { label: "Closed Cases", value: reportData.summary.closed, color: "success" },
                { label: "GBV Cases",    value: reportData.summary.gbv,    color: "danger"  },
              ].map((tile) => (
                <div key={tile.label} className="col-6 col-md-3 d-flex">
                  <div className="card shadow flex-fill text-center py-3">
                    <h3 className={`fw-bold text-${tile.color} mb-1`}>{tile.value}</h3>
                    <p className="text-muted fs-13 mb-0">{tile.label}</p>
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
                    <Link
                      className="dropdown-toggle btn btn-outline-light shadow"
                      data-bs-toggle="dropdown"
                      to="#"
                    >
                      <i className="ti ti-calendar me-1" />
                      {selectedYear}
                    </Link>
                    <div className="dropdown-menu dropdown-menu-end">
                      {yearOptions.map((y) => (
                        <Link
                          key={y}
                          to="#"
                          className="dropdown-item"
                          onClick={() => handleYearChange(y)}
                        >
                          {y}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div id="leads-report">
                    {loading ? (
                      <div className="d-flex justify-content-center align-items-center" style={{ height: 310 }}>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Loading...
                      </div>
                    ) : (
                      <Chart options={barOptions} series={barSeries} type="bar" height={310} />
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-5 d-flex">
              <div className="card shadow flex-fill">
                <div className="card-header d-flex justify-content-between align-items-center flex-wrap row-gap-2">
                  <h6 className="mb-0">Cases By Category</h6>
                  <div className="dropdown">
                    <Link
                      className="dropdown-toggle btn btn-outline-light shadow"
                      data-bs-toggle="dropdown"
                      to="#"
                    >
                      <i className="ti ti-calendar me-1" />
                      {selectedYear}
                    </Link>
                    <div className="dropdown-menu dropdown-menu-end">
                      {yearOptions.map((y) => (
                        <Link
                          key={y}
                          to="#"
                          className="dropdown-item"
                          onClick={() => handleYearChange(y)}
                        >
                          {y}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div id="leads-analysis">
                    {loading ? (
                      <div className="d-flex justify-content-center align-items-center" style={{ height: 350 }}>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Loading...
                      </div>
                    ) : donutSeries.length > 0 ? (
                      <Chart options={donutOptions} series={donutSeries} type="donut" height={350} />
                    ) : (
                      <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ height: 350 }}>
                        <i className="ti ti-chart-donut fs-1 mb-2" />
                        <p className="fs-13">No category data available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* card start */}
          <div className="card border-0 rounded-0">
            <div className="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <div className="input-icon input-icon-start position-relative">
                <span className="input-icon-addon text-dark">
                  <i className="ti ti-search" />
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
              <Link
                to="#"
                className="btn btn-primary"
                data-bs-toggle="modal"
                data-bs-target="#download_report"
              >
                <i className="ti ti-file-download me-1" />
                Download Report
              </Link>
            </div>
            <div className="card-body">
              {/* table header */}
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <div className="dropdown">
                    <Link
                      to="#"
                      className="btn btn-outline-light shadow px-2"
                      data-bs-toggle="dropdown"
                      data-bs-auto-close="outside"
                    >
                      <i className="ti ti-filter me-2" />
                      Filter
                      <i className="ti ti-chevron-down ms-2" />
                    </Link>
                    <div className="filter-dropdown-menu dropdown-menu dropdown-menu-lg p-0">
                      <div className="filter-header d-flex align-items-center justify-content-between border-bottom">
                        <h6 className="mb-0">
                          <i className="ti ti-filter me-1" />
                          Filter
                        </h6>
                        <button
                          type="button"
                          className="btn-close close-filter-btn"
                          data-bs-dismiss="dropdown-menu"
                          aria-label="Close"
                        />
                      </div>
                      <div className="filter-set-view p-3">
                        <div className="accordion" id="accordionExample">
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link
                                to="#"
                                data-bs-toggle="collapse"
                                data-bs-target="#collapseTwo"
                                aria-expanded="true"
                                aria-controls="collapseTwo"
                              >
                                Case Number
                              </Link>
                            </div>
                            <div
                              className="filter-set-contents accordion-collapse collapse show"
                              id="collapseTwo"
                              data-bs-parent="#accordionExample"
                            >
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <div className="mb-2">
                                  <div className="input-icon-start input-icon position-relative">
                                    <span className="input-icon-addon fs-12">
                                      <i className="ti ti-search" />
                                    </span>
                                    <input
                                      type="text"
                                      className="form-control form-control-md"
                                      placeholder="Search"
                                    />
                                  </div>
                                </div>
                                <ul className="mb-0">
                                  {(reportData?.results.slice(0, 10) ?? []).map((c) => (
                                    <li key={c.id} className="mb-1">
                                      <label className="dropdown-item px-2 d-flex align-items-center">
                                        <input className="form-check-input m-0 me-1" type="checkbox" />
                                        {c.case_number} — {c.reporter_name}
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link
                                to="#"
                                className="collapsed"
                                data-bs-toggle="collapse"
                                data-bs-target="#collapseThree"
                                aria-expanded="false"
                                aria-controls="collapseThree"
                              >
                                Case Status
                              </Link>
                            </div>
                            <div
                              className="filter-set-contents accordion-collapse collapse"
                              id="collapseThree"
                              data-bs-parent="#accordionExample"
                            >
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <ul>
                                  {(reportData?.statuses ?? []).map((s) => (
                                    <li key={s.name}>
                                      <label className="dropdown-item px-2 d-flex align-items-center">
                                        <input className="form-check-input m-0 me-1" type="checkbox" />
                                        {s.name} ({s.count})
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                          <div className="filter-set-content">
                            <div className="filter-set-content-head">
                              <Link
                                to="#"
                                className="collapsed"
                                data-bs-toggle="collapse"
                                data-bs-target="#owner"
                                aria-expanded="false"
                                aria-controls="owner"
                              >
                                Category
                              </Link>
                            </div>
                            <div
                              className="filter-set-contents accordion-collapse collapse"
                              id="owner"
                              data-bs-parent="#accordionExample"
                            >
                              <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                                <div className="mb-1">
                                  <div className="input-icon-start input-icon position-relative">
                                    <span className="input-icon-addon fs-12">
                                      <i className="ti ti-search" />
                                    </span>
                                    <SearchInput value={searchText} onChange={handleSearch} />
                                  </div>
                                </div>
                                <ul className="mb-0">
                                  {(reportData?.categories ?? []).map((cat) => (
                                    <li key={cat.name} className="mb-1">
                                      <label className="dropdown-item px-2 d-flex align-items-center">
                                        <input className="form-check-input m-0 me-1" type="checkbox" />
                                        {cat.name} ({cat.count})
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <Link to="#" className="btn btn-outline-light w-100">
                            Reset
                          </Link>
                          <Link to={all_routes.caseReports} className="btn btn-primary w-100">
                            Filter
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  <PredefinedDatePicker />
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <div className="dropdown">
                    <Link
                      to="#"
                      className="dropdown-toggle btn btn-outline-light px-2 shadow"
                      data-bs-toggle="dropdown"
                    >
                      <i className="ti ti-sort-ascending-2 me-2" />
                      Sort By
                    </Link>
                    <div className="dropdown-menu">
                      <ul>
                        <li>
                          <Link to="#" className="dropdown-item">Newest</Link>
                        </li>
                        <li>
                          <Link to="#" className="dropdown-item">Oldest</Link>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="dropdown">
                    <Link
                      to="#"
                      className="btn bg-soft-indigo px-2 border-0"
                      data-bs-toggle="dropdown"
                      data-bs-auto-close="outside"
                    >
                      <i className="ti ti-columns-3 me-2" />
                      Manage Columns
                    </Link>
                    <div className="dropdown-menu dropdown-menu-md dropdown-md p-3">
                      <ul>
                        {["Case Number", "Category", "Reporter", "Status", "Created Date", "Counsellor"].map((col) => (
                          <li key={col} className="gap-1 d-flex align-items-center mb-2">
                            <i className="ti ti-columns me-1" />
                            <div className="form-check form-switch w-100 ps-0">
                              <label className="form-check-label d-flex align-items-center gap-2 w-100">
                                <span>{col}</span>
                                <input
                                  className="form-check-input switchCheckDefault ms-auto"
                                  type="checkbox"
                                  role="switch"
                                  defaultChecked
                                />
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              {/* table header */}

              {/* Report List */}
              {loading ? (
                <div className="d-flex justify-content-center align-items-center py-5 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />
                  Loading cases...
                </div>
              ) : (
                <div className="custom-table">
                  <Datatable
                    columns={columns}
                    dataSource={filtered}
                    Selection={true}
                    searchText={searchText}
                  />
                </div>
              )}
              {/* /Report List */}
            </div>
          </div>
          {/* card end */}
        </div>
        {/* End Content */}
        {/* Start Footer */}
        <Footer />
        {/* End Footer */}
      </div>
      {/* ========================
          End Page Content
      ========================= */}
    </>
  );
};

export default CaseReports;
