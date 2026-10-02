import { Link } from "react-router"
import ImageWithBasePath from "../../../../components/imageWithBasePath"

const MainDashboard = () => {
  return (
    <>
  {/* ========================
			Start Page Content
		========================= */}
  <div className="page-wrapper">
    {/* Start Content */}
    <div className="content pb-0">
      {/* Page Header */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
        <div>
          <h4 className="mb-0">Dashboard</h4>
        </div>
        <div className="gap-2 d-flex align-items-center flex-wrap">
          <div className="avatar-list-stacked me-2">
            <Link
              to="#"
              className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
            >
              <ImageWithBasePath
                className="w-auto h-auto img-fluid"
                src="assets/img/company/company-09.svg"
                alt="img"
              />
            </Link>
            <Link
              to="#"
              className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
            >
              <ImageWithBasePath
                className="w-auto h-auto img-fluid"
                src="assets/img/company/company-10.svg"
                alt="img"
              />
            </Link>
            <Link
              to="#"
              className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
            >
              <ImageWithBasePath
                className="w-auto h-auto img-fluid"
                src="assets/img/company/company-01.svg"
                alt="img"
              />
            </Link>
            <Link
              to="#"
              className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
            >
              <ImageWithBasePath
                className="w-auto h-auto img-fluid"
                src="assets/img/company/company-02.svg"
                alt="img"
              />
            </Link>
            <Link
              to="#"
              className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
            >
              <ImageWithBasePath
                className="w-auto h-auto img-fluid"
                src="assets/img/company/company-11.svg"
                alt="img"
              />
            </Link>
            <Link
              className="avatar bg-primary border text-white fs-24 avatar-rounded"
              to="#"
            >
              +
            </Link>
          </div>
          <div className="daterangepick form-control w-auto d-flex align-items-center me-2">
            <i className="ti ti-calendar text-dark me-2" />
            <span className="reportrange-picker-field text-dark">
              23 May 2025 - 30 May 2025
            </span>
          </div>
          <Link
            to="javascript:void(0);"
            className="btn btn-icon btn-outline-light shadow"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            aria-label="Download"
            data-bs-original-title="Download"
          >
            <i className="ti ti-download" />
          </Link>
          <Link
            to="javascript:void(0);"
            className="btn btn-icon btn-outline-light shadow"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            aria-label="Refresh"
            data-bs-original-title="Refresh"
          >
            <i className="ti ti-refresh" />
          </Link>
          <Link
            to="javascript:void(0);"
            className="btn btn-icon btn-outline-light shadow"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            aria-label="Collapse"
            data-bs-original-title="Collapse"
            id="collapse-header"
          >
            <i className="ti ti-transition-top" />
          </Link>
        </div>
      </div>
      {/* End Page Header */}
      {/* start row */}
      <div className="row">
        <div className="col-xxl-8 col-xl-7 d-flex">
          <div className="card flex-fill">
            <div className="card-body pb-0">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                  <span className="line-title d-block me-2" />
                  Revenue Analytics
                </h5>
                <ul className="nav nav-tabs nav-solid-danger border rounded gap-2 p-1">
                  <li className="nav-item">
                    <Link
                      className="nav-link py-1 px-2 rounded active"
                      to="#wekly"
                      data-bs-toggle="tab"
                    >
                      Weekly
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      className="nav-link py-1 px-2 rounded"
                      to="#monthly"
                      data-bs-toggle="tab"
                    >
                      Monthly
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link
                      className="nav-link py-1 px-2 rounded"
                      to="#yearly"
                      data-bs-toggle="tab"
                    >
                      Yearly
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center flex-wrap gap-2">
                  <h4 className="mb-0">495K</h4>
                  <p className="mb-0">Revenue with Sales (USD)</p>
                </div>
                <div className="d-flex align-items-center flex-wrap gap-2">
                  <div className="d-flex align-items-center border rounded px-2 py-1">
                    <p className="d-flex align-items-center mb-0">
                      <i className="ti ti-circle-filled fs-8 text-primary me-1" />
                      Revenue
                    </p>
                  </div>
                  <div className="d-flex align-items-center border rounded px-2 py-1">
                    <p className="d-flex align-items-center mb-0">
                      <i className="ti ti-circle-filled fs-8 text-light-500 me-1" />
                      Sales
                    </p>
                  </div>
                </div>
              </div>
              <div id="performance-stats" />
            </div>
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
        <div className="col-xxl-4 col-xl-5 d-flex">
          <div className="card flex-fill">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-0">
                <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                  <span className="line-title d-block me-2" />
                  Traffic Sources
                </h5>
                <Link
                  to="deals.html"
                  className="btn btn-sm btn-icon btn-outline-light"
                >
                  <i className="ti ti-arrow-right" />
                </Link>
              </div>
              <div id="traffic-sources-chart" />
            </div>
            <div className="mb-1">
              <div className="px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                <p className="text-dark d-flex align-items-center mb-0">
                  <i className="ti ti-circle-filled text-success fs-8 me-1" />
                  Organic Search
                </p>
                <p className="text-dark fw-semibold mb-0">6598</p>
              </div>
              <div className="px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                <p className="text-dark d-flex align-items-center mb-0">
                  <i className="ti ti-circle-filled text-info fs-8 me-1" />
                  Direct Traffic
                </p>
                <p className="text-dark fw-semibold mb-0">2458</p>
              </div>
              <div className="px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                <p className="text-dark d-flex align-items-center mb-0">
                  <i className="ti ti-circle-filled text-warning fs-8 me-1" />
                  Referral Traffic
                </p>
                <p className="text-dark fw-semibold mb-0">1456</p>
              </div>
              <div className="px-3 pt-2 pb-3 d-flex align-items-center justify-content-between">
                <p className="text-dark d-flex align-items-center mb-0">
                  <i className="ti ti-circle-filled text-purple fs-8 me-1" />
                  Social Media
                </p>
                <p className="text-dark fw-semibold mb-0">845</p>
              </div>
            </div>
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
      </div>
      {/* end row */}
      {/* start row */}
      <div className="row">
        <div className="col-xl-3 col-sm-6 d-flex">
          <div className="card flex-fill">
            <div className="card-body position-relative">
              <p className="fw-medium mb-1">Revenue</p>
              <h4 className="mb-3">$15,44,540</h4>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-success border-0">
                  +2.5%
                </span>
                <p className="text-dark mb-0">From Last Week</p>
              </div>
              <div className="custom-card-icon">
                <div className="avatar avatar-rounded avatar-lg bg-primary-gradient-100 position-absolute top-0 end-0">
                  <ImageWithBasePath
                    src="assets/img/icons/revenue-icon.svg"
                    alt="icon"
                    className="img-fluid w-auto h-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>{" "}
        {/* end col */}
        <div className="col-xl-3 col-sm-6 d-flex">
          <div className="card flex-fill">
            <div className="card-body position-relative">
              <p className="fw-medium mb-1">Active Deals</p>
              <h4 className="mb-3">147</h4>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-danger border-0">
                  -21.15%
                </span>
                <p className="text-dark mb-0">From Last Week</p>
              </div>
              <div className="custom-card-icon">
                <div className="avatar avatar-rounded avatar-lg bg-info-gradient-100 position-absolute top-0 end-0">
                  <ImageWithBasePath
                    src="assets/img/icons/deal-icon.svg"
                    alt="icon"
                    className="img-fluid w-auto h-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>{" "}
        {/* end col */}
        <div className="col-xl-3 col-sm-6 d-flex">
          <div className="card flex-fill">
            <div className="card-body position-relative">
              <p className="fw-medium mb-1">Conversion Rate</p>
              <h4 className="mb-3">32.8%</h4>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-success border-0">
                  +15.5%
                </span>
                <p className="text-dark mb-0">From Last Week</p>
              </div>
              <div className="custom-card-icon">
                <div className="avatar avatar-rounded avatar-lg bg-pink-gradient-100 position-absolute top-0 end-0">
                  <ImageWithBasePath
                    src="assets/img/icons/conversion-icon.svg"
                    alt="icon"
                    className="img-fluid w-auto h-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>{" "}
        {/* end col */}
        <div className="col-xl-3 col-sm-6 d-flex">
          <div className="card flex-fill">
            <div className="card-body position-relative">
              <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
                <div>
                  <div className="d-flex align-items-center gap-1">
                    <h4 className="mb-0">4569</h4>
                    <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-success border-0">
                      +2.5%
                    </span>
                  </div>
                  <p className="fw-medium mb-1">Total Contacts</p>
                </div>
                <div id="contact-chart" />
              </div>
              <div className="d-flex alig-items-center gap-2">
                <div className="avatar-list-stacked avatar-group-sm">
                  <span className="avatar avatar-rounded">
                    <ImageWithBasePath
                      className="border border-white"
                      src="assets/img/profiles/avatar-03.jpg"
                      alt="img"
                    />
                  </span>
                  <span className="avatar avatar-rounded">
                    <ImageWithBasePath
                      className="border border-white"
                      src="assets/img/profiles/avatar-05.jpg"
                      alt="img"
                    />
                  </span>
                  <span className="avatar avatar-rounded">
                    <ImageWithBasePath
                      className="border border-white"
                      src="assets/img/profiles/avatar-01.jpg"
                      alt="img"
                    />
                  </span>
                  <Link
                    className="avatar bg-light text-dark fs-10 avatar-rounded"
                    to="javascript:void(0);"
                  >
                    +4
                  </Link>
                </div>
                <p className="text-dark mb-0">From Last Week</p>
              </div>
            </div>
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
      </div>
      {/* end row */}
      {/* start row */}
      <div className="row">
        <div className="col-xxl-4 col-xl-12 d-flex">
          <div className="card flex-fill">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                  <span className="line-title d-block me-2" />
                  Top Deals
                </h5>
                <div className="dropdown">
                  <Link
                    className="dropdown-toggle btn btn-outline-light shadow"
                    data-bs-toggle="dropdown"
                    to="javascript:void(0);"
                  >
                    Last 30 Days
                  </Link>
                  <div className="dropdown-menu dropdown-menu-end">
                    <Link to="javascript:void(0);" className="dropdown-item">
                      Last 30 Days
                    </Link>
                    <Link to="javascript:void(0);" className="dropdown-item">
                      Last 6 months
                    </Link>
                    <Link to="javascript:void(0);" className="dropdown-item">
                      Last 12 months
                    </Link>
                  </div>
                </div>
              </div>
              <div className="d-flex align-items-sm-center justify-content-between gap-2 flex-sm-row flex-column mb-3">
                <div className="d-flex align-items-center">
                  <Link
                    to="company-details.html"
                    className="avatar avatar-md border rounded-circle flex-shrink-0"
                  >
                    <ImageWithBasePath
                      src="assets/img/icons/company-icon-01.svg"
                      className="img-fluid w-auto h-auto"
                      alt="img"
                    />
                  </Link>
                  <div className="ms-2 flex-fill">
                    <p className="fw-medium text-truncate mb-1 fs-14">
                      <Link to="company-details.html">NovaWave LLC</Link>
                    </p>
                    <p className="fs-13 mb-0">Germany</p>
                  </div>
                </div>
                <div className="text-sm-end mb-0">
                  <p className="fw-semibold mb-0 text-dark">$19,94,938</p>
                </div>
              </div>
              <div className="d-flex align-items-sm-center justify-content-between gap-2 flex-sm-row flex-column mb-3">
                <div className="d-flex align-items-center">
                  <Link
                    to="company-details.html"
                    className="avatar avatar-md border rounded-circle flex-shrink-0"
                  >
                    <ImageWithBasePath
                      src="assets/img/icons/company-icon-03.svg"
                      className="img-fluid w-auto h-auto"
                      alt="img"
                    />
                  </Link>
                  <div className="ms-2 flex-fill">
                    <h6 className="fw-medium text-truncate mb-1 fs-14">
                      <Link to="company-details.html">Silver Hawk</Link>
                    </h6>
                    <p className="fs-13 mb-0">Australia</p>
                  </div>
                </div>
                <div className="text-sm-end mb-0">
                  <p className="fw-semibold mb-0 text-dark">$15,44,540</p>
                </div>
              </div>
              {/* Item-4 */}
              <div className="d-flex align-items-sm-center justify-content-between gap-2 flex-sm-row flex-column mb-3">
                <div className="d-flex align-items-center">
                  <Link
                    to="company-details.html"
                    className="avatar avatar-md border rounded-circle flex-shrink-0"
                  >
                    <ImageWithBasePath
                      src="assets/img/icons/company-icon-04.svg"
                      className="img-fluid w-auto h-auto"
                      alt="img"
                    />
                  </Link>
                  <div className="ms-2 flex-fill">
                    <h6 className="fw-medium text-truncate mb-1 fs-14">
                      <Link to="company-details.html">Summit LLC</Link>
                    </h6>
                    <p className="fs-13 mb-0">Italy</p>
                  </div>
                </div>
                <div className="text-sm-end mb-0">
                  <p className="fw-semibold mb-0 text-dark">$10,36,390</p>
                </div>
              </div>
              {/* Item-2 */}
              <div className="d-flex align-items-sm-center justify-content-between gap-2 flex-sm-row flex-column mb-3">
                <div className="d-flex align-items-center">
                  <Link
                    to="company-details.html"
                    className="avatar avatar-md border rounded-circle flex-shrink-0"
                  >
                    <ImageWithBasePath
                      src="assets/img/icons/company-icon-02.svg"
                      className="img-fluid w-auto h-auto"
                      alt="img"
                    />
                  </Link>
                  <div className="ms-2 flex-fill">
                    <h6 className="fw-medium text-truncate mb-1 fs-14">
                      <Link to="company-details.html">Bluesky Industries</Link>
                    </h6>
                    <p className="fs-13 mb-0">Canada</p>
                  </div>
                </div>
                <div className="text-sm-end mb-0">
                  <p className="fw-semibold mb-0 text-dark">$10,15,280</p>
                </div>
              </div>
              {/* Item-5 */}
              <div className="d-flex align-items-sm-center justify-content-between gap-2 flex-sm-row flex-column mb-3">
                <div className="d-flex align-items-center">
                  <Link
                    to="company-details.html"
                    className="avatar avatar-md border rounded-circle flex-shrink-0"
                  >
                    <ImageWithBasePath
                      src="assets/img/icons/company-icon-05.svg"
                      className="img-fluid w-auto h-auto"
                      alt="img"
                    />
                  </Link>
                  <div className="ms-2 flex-fill">
                    <h6 className="fw-medium text-truncate mb-1 fs-14">
                      <Link to="company-details.html">HealthTech Innovations</Link>
                    </h6>
                    <p className="fs-13 mb-0">UK</p>
                  </div>
                </div>
                <div className="text-sm-end mb-0">
                  <p className="fw-semibold mb-0 text-dark">$10,14,112</p>
                </div>
              </div>
              <Link
                className="btn btn-sm btn-light d-flex align-items-center"
                to="deals.html"
              >
                View All
                <i className="ti ti-chevron-right ms-1" />
              </Link>
            </div>
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
        <div className="col-xxl-4 col-xl-6 d-flex flex-column">
          <div className="card flex-fill">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                  <span className="line-title d-block me-2" />
                  Pipeline Statistics
                </h5>
                <div className="dropdown">
                  <Link
                    className="dropdown-toggle btn btn-outline-light shadow"
                    data-bs-toggle="dropdown"
                    to="javascript:void(0);"
                  >
                    Weekly
                  </Link>
                  <div className="dropdown-menu dropdown-menu-end">
                    <Link to="javascript:void(0);" className="dropdown-item">
                      Monthly
                    </Link>
                    <Link to="javascript:void(0);" className="dropdown-item">
                      Weekly
                    </Link>
                    <Link to="javascript:void(0);" className="dropdown-item">
                      Last 12 months
                    </Link>
                  </div>
                </div>
              </div>
              <div className="row g-3 mb-3">
                <div className="col-6 col-sm-3">
                  <div>
                    <p className="mb-1">Lead</p>
                    <p className="text-dark fw-medium mb-1">$20010</p>
                    <p className="mb-0">80 Deals</p>
                  </div>
                </div>
                <div className="col-6 col-sm-3">
                  <div>
                    <p className="mb-1">Proposal</p>
                    <p className="text-dark fw-medium mb-1">$17210</p>
                    <p className="mb-0">23 Deals</p>
                  </div>
                </div>
                <div className="col-6 col-sm-3">
                  <div>
                    <p className="mb-1">Sales</p>
                    <p className="text-dark fw-medium mb-1">$9210</p>
                    <p className="mb-0">12 Deals</p>
                  </div>
                </div>
                <div className="col-6 col-sm-3">
                  <div>
                    <p className="mb-1">Won</p>
                    <p className="text-dark fw-medium mb-1">$8210</p>
                    <p className="mb-0">21 Deals</p>
                  </div>
                </div>
              </div>
              <div id="pipelineChart" />
            </div>
          </div>
          <div className="card flex-fill">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h5 className="mb-0 fw-bold d-inline-flex align-items-center gap-1">
                  <span className="fw-normal fs-14 text-body">
                    Profit Earned
                  </span>{" "}
                  $85K{" "}
                </h5>
                <div className="dropdown">
                  <Link
                    className="dropdown-toggle btn btn-outline-light shadow"
                    data-bs-toggle="dropdown"
                    to="javascript:void(0);"
                  >
                    2025
                  </Link>
                  <div className="dropdown-menu dropdown-menu-end">
                    <Link to="javascript:void(0);" className="dropdown-item">
                      2025
                    </Link>
                    <Link to="javascript:void(0);" className="dropdown-item">
                      2024
                    </Link>
                    <Link to="javascript:void(0);" className="dropdown-item">
                      2023
                    </Link>
                  </div>
                </div>
              </div>
              <div id="profit-chart" />
            </div>
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
        <div className="col-xxl-4 col-xl-6 d-flex">
          <div className="card flex-fill">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                  <span className="line-title d-block me-2" />
                  Deals Overview
                </h5>
                <Link
                  to="deals.html"
                  className="btn btn-sm btn-icon btn-outline-light"
                >
                  <i className="ti ti-arrow-right" />
                </Link>
              </div>
              <div className="progress-stacked progress-md bg-white gap-1 mb-3">
                <div
                  className="progress-bar bg-success rounded overflow-hidden"
                  role="progressbar"
                  style={{ width: "30%" }}
                  aria-valuenow={10}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
                <div
                  className="progress-bar bg-secondary rounded overflow-hidden"
                  role="progressbar"
                  style={{ width: "35%" }}
                  aria-valuenow={15}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
                <div
                  className="progress-bar bg-purple rounded overflow-hidden"
                  role="progressbar"
                  style={{ width: "25%" }}
                  aria-valuenow={15}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
                <div
                  className="progress-bar bg-danger rounded overflow-hidden"
                  role="progressbar"
                  style={{ width: "10%" }}
                  aria-valuenow={20}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="mb-4">
                <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
                  <h4 className="mb-0">2656</h4>
                  <span className="d-inline-flex align-items-center badge rounded-pill badge-soft-success border-0">
                    +12.5%
                  </span>
                  <p className="mb-0">compared to last week</p>
                </div>
                <div className="p-2 d-flex align-items-center justify-content-between border-bottom">
                  <p className="text-dark d-flex align-items-center mb-0">
                    <i className="ti ti-circle-filled text-teal fs-8 me-1" />
                    Successful Deals
                  </p>
                  <p className="text-dark mb-0">1000 Deals</p>
                </div>
                <div className="p-2 d-flex align-items-center justify-content-between border-bottom">
                  <p className="text-dark d-flex align-items-center mb-0">
                    <i className="ti ti-circle-filled text-secondary fs-8 me-1" />
                    Pending Deals
                  </p>
                  <p className="text-dark mb-0">1056 Deals</p>
                </div>
                <div className="p-2 d-flex align-items-center justify-content-between border-bottom">
                  <p className="text-dark d-flex align-items-center mb-0">
                    <i className="ti ti-circle-filled text-purple fs-8 me-1" />
                    Rejected Deals
                  </p>
                  <p className="text-dark mb-0">500 Deals</p>
                </div>
                <div className="p-2 d-flex align-items-center justify-content-between">
                  <p className="text-dark d-flex align-items-center mb-0">
                    <i className="ti ti-circle-filled text-danger fs-8 me-1" />
                    Upcoming Deals
                  </p>
                  <p className="text-dark mb-0">100 Deals</p>
                </div>
              </div>
              <div className="p-3 border rounded bg-light d-flex align-items-center justify-content-between">
                <div>
                  <p className="mb-1">Deals Won</p>
                  <h4 className="mb-0">689</h4>
                </div>
                <div className="avatar-group avatar-group-sm">
                  <Link
                    to="#"
                    className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
                  >
                    <ImageWithBasePath
                      className="w-auto h-auto img-fluid"
                      src="assets/img/company/company-09.svg"
                      alt="img"
                    />
                  </Link>
                  <Link
                    to="#"
                    className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
                  >
                    <ImageWithBasePath
                      className="w-auto h-auto img-fluid"
                      src="assets/img/company/company-10.svg"
                      alt="img"
                    />
                  </Link>
                  <Link
                    to="#"
                    className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
                  >
                    <ImageWithBasePath
                      className="w-auto h-auto img-fluid"
                      src="assets/img/company/company-01.svg"
                      alt="img"
                    />
                  </Link>
                  <Link
                    to="#"
                    className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
                  >
                    <ImageWithBasePath
                      className="w-auto h-auto img-fluid"
                      src="assets/img/company/company-02.svg"
                      alt="img"
                    />
                  </Link>
                  <Link
                    to="#"
                    className="avatar avatar-rounded border bg-white p-1 d-inline-flex align-items-center justify-content-center"
                  >
                    <ImageWithBasePath
                      className="w-auto h-auto img-fluid"
                      src="assets/img/company/company-11.svg"
                      alt="img"
                    />
                  </Link>
                </div>
              </div>
            </div>
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
      </div>
      {/* end row */}
      {/* start row */}
      <div className="row">
        <div className="col-md-12 d-flex">
          <div className="card flex-fill">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between flex-wrap row-gap-3 mb-3">
                <h5 className="mb-0 fs-16 fw-bold d-inline-flex items-center">
                  <span className="line-title d-block me-2" />
                  Recent Deals
                </h5>
                <Link
                  className="btn btn-sm btn-light d-inline-flex align-items-center"
                  to="deals.html"
                >
                  View All
                  <i className="ti ti-chevron-right ms-1" />
                </Link>
              </div>
              <div className="table-responsive custom-table">
                <table
                  className="table table-bordered dataTable table-nowrap"
                  id="deal-project"
                >
                  <thead className="table-white">
                    <tr>
                      <th>Deal Name</th>
                      <th>Stage</th>
                      <th>Deal Value</th>
                      <th>Tags</th>
                      <th>Owner</th>
                      <th>Probability</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>{" "}
            {/* end card body */}
          </div>{" "}
          {/* end card */}
        </div>{" "}
        {/* end col */}
      </div>
      {/* end row */}
    </div>
    {/* End Content */}
    {/* Start Footer */}
    <footer className="footer d-block d-md-flex justify-content-between text-md-start text-center">
      <p className="mb-md-0 mb-1">
        Copyright ©{" "}
        <Link
          to="javascript:void(0);"
          className="link-primary text-decoration-underline"
        >
          CRMS
        </Link>
      </p>
      <div className="d-flex align-items-center gap-2 footer-links justify-content-center justify-content-md-end">
        <Link to="javascript:void(0);">About</Link>
        <Link to="javascript:void(0);">Terms</Link>
        <Link to="javascript:void(0);">Contact Us</Link>
      </div>
    </footer>
    {/* End Footer */}
  </div>
  {/* ========================
			End Page Content
		========================= */}
</>

  )
}

export default MainDashboard