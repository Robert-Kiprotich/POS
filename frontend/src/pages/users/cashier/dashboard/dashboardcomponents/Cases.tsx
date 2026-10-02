import { Link } from "react-router";
import PredefinedDatePicker from "../../../../../components/common-dateRangePicker/PredefinedDatePicker";
import { useState, useEffect } from "react";
import SearchInput from "../../../../../components/dataTable/dataTableSearch";
import { all_routes } from "../../../../../routes/all_routes";
import { getRootApiCases } from "../../../../../services/Services";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CasesProps {
  onCreateCase: () => void;
  triggerModalOpen: () => void;
}

const priorityConfig: Record<number, { label: string; badgeBg: string; textColor: string }> = {
  1: { label: "Low",    badgeBg: "bg-info-transparent",    textColor: "text-info" },
  2: { label: "Medium", badgeBg: "bg-warning-transparent", textColor: "text-warning" },
  3: { label: "High",   badgeBg: "bg-danger-transparent",  textColor: "text-danger" },
};

// ── CaseCard — mirrors PersonCard style from tasks.tsx ────────────────────────
const CaseCard = ({ caseItem }: { caseItem: any }) => {
  const priority = priorityConfig[caseItem.case_priority] ?? {
    label: `Level ${caseItem.case_priority}`,
    badgeBg: "bg-secondary",
    textColor: "text-secondary",
  };

  const reporterName = caseItem.case_reporter
    ? `${caseItem.case_reporter.firstname || ""} ${caseItem.case_reporter.lastname || ""}`.trim() ||
      caseItem.case_reporter.email ||
      "Unknown"
    : "—";

  // Initials from case number or reporter name
  const initials = (caseItem.case_number || reporterName || "?")
    .split(/[\s-]/)
    .map((w: string) => w[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const createdDate = caseItem.case_createdon
    ? new Date(caseItem.case_createdon).toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";

  const disposition = caseItem.case_disposition || "Open";
  const isComplete = disposition === "Complete";
  const status = caseItem.case_reporterclientrel?.category_status || "Active";

  return (
    <div className="card border shadow-sm mb-3">
      {/* ── Card Header ── */}
      <div className="card-header bg-light d-flex justify-content-between align-items-center py-2 px-3">
        <div className="d-flex align-items-center gap-2">
          {/* Avatar circle with initials */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#dbeafe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 12,
              color: "#1e40af",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div>
            <div className="fw-semibold fs-13">{caseItem.case_number || "No Number"}</div>
            <div className="text-muted fs-11">
              Reporter: {reporterName}
            </div>
          </div>
        </div>

        {/* Action menu */}
        <div className="d-flex gap-2 align-items-center">
          <div className="dropdown">
            <Link
              to="#"
              className="btn btn-sm btn-outline-secondary fs-12"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <i className="ti ti-dots-vertical" />
            </Link>
            <div className="dropdown-menu dropdown-menu-end">
              <Link
                className="dropdown-item"
                to="#"
                data-bs-toggle="offcanvas"
                data-bs-target="#offcanvas_edit"
              >
                <i className="ti ti-edit text-blue me-1" /> Edit
              </Link>
              <Link
                className="dropdown-item text-danger"
                to="#"
                data-bs-toggle="modal"
                data-bs-target="#delete_modal"
              >
                <i className="ti ti-trash me-1" /> Delete
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card Body ── */}
      <div className="card-body p-3">
        {/* Badges row: priority, status, disposition */}
        <div className="d-flex flex-wrap gap-2 mb-3">
          <span className={`badge ${priority.badgeBg} ${priority.textColor} fs-11`}>
            <i className="ti ti-flag me-1" />{priority.label} Priority
          </span>
          <span className={`badge fs-11 ${status === "Active" ? "bg-success-transparent text-success" : "bg-danger-transparent text-danger"}`}>
            <i className="ti ti-circle-filled me-1" style={{ fontSize: 8 }} />{status}
          </span>
          <span className={`badge fs-11 ${isComplete ? "bg-success-transparent text-success" : "bg-secondary-transparent text-secondary"}`}>
            <i className={`ti ${isComplete ? "ti-circle-check" : "ti-clock"} me-1`} />
            {disposition}
          </span>
        </div>

        {/* Info rows */}
        <div className="d-flex flex-wrap gap-3 mb-2">
          <span className="fs-12 text-muted">
            <i className="ti ti-calendar me-1" />
            Created: <span className="text-dark fw-medium">{createdDate}</span>
          </span>
          <span className="fs-12 text-muted">
            <i className="ti ti-clock me-1" />
            Age: <span className="text-dark fw-medium">{caseItem.age_in_days ?? "—"} days</span>
          </span>
        </div>

        {/* Disposition progress bar */}
        <div className="mt-3 border-top pt-3">
          <div className="d-flex align-items-center justify-content-between fs-12 mb-1">
            <span className="text-muted fw-medium">Disposition Progress</span>
            <span className={`fw-semibold ${isComplete ? "text-success" : "text-danger"}`}>
              {disposition}
            </span>
          </div>
          <div className="progress" style={{ height: 6 }}>
            <div
              className={`progress-bar ${isComplete ? "bg-success" : "bg-danger"}`}
              role="progressbar"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Cases: React.FC<CasesProps> = ({ onCreateCase, triggerModalOpen }) => {
  const [searchText, setSearchText] = useState<string>("");
  const [casesData, setCasesData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        setLoading(true);
        const data = await getRootApiCases();
        setCasesData(data);
        console.log("✅ Cases loaded successfully:", data);
      } catch (error) {
        console.error("❌ Component failed to load cases:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCases();
  }, []);

  const filteredCases = casesData.filter((c) => {
    const search = searchText.toLowerCase();
    const reporterName = c.case_reporter
      ? `${c.case_reporter.firstname || ""} ${c.case_reporter.lastname || ""}`.toLowerCase()
      : "";
    return (
      String(c.case_number || "").toLowerCase().includes(search) ||
      reporterName.includes(search) ||
      String(c.case_disposition || "").toLowerCase().includes(search)
    );
  });

  return (
    <>
      <div className="card border-0 rounded-0">
        {/* ── Toolbar ── */}
        <div className="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
          <div className="input-icon input-icon-start position-relative">
            <span className="input-icon-addon text-dark">
              <i className="ti ti-search" />
            </span>
            <SearchInput value={searchText} onChange={setSearchText} />
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="dropdown">
              <Link
                to="#"
                className="dropdown-toggle btn btn-outline-light px-2 shadow"
                data-bs-toggle="dropdown"
              >
                <i className="ti ti-sort-ascending-2 me-2" />Sort By
              </Link>
              <div className="dropdown-menu">
                <ul>
                  <li><Link to="#" className="dropdown-item">Newest</Link></li>
                  <li><Link to="#" className="dropdown-item">Oldest</Link></li>
                </ul>
              </div>
            </div>
            <PredefinedDatePicker />
            <div className="dropdown">
              <Link
                to="#"
                className="btn btn-outline-light shadow px-2"
                data-bs-toggle="dropdown"
                data-bs-auto-close="outside"
              >
                <i className="ti ti-filter me-2" />Filter
                <i className="ti ti-chevron-down ms-2" />
              </Link>
              <div className="filter-dropdown-menu dropdown-menu dropdown-menu-lg p-0">
                <div className="filter-header d-flex align-items-center justify-content-between border-bottom p-3">
                  <h6 className="mb-0"><i className="ti ti-filter me-1" /> Filter</h6>
                  <button type="button" className="btn-close" data-bs-dismiss="dropdown-menu" />
                </div>
                <div className="filter-set-view p-3">
                  <div className="accordion" id="accordionExample">
                    <div className="filter-set-content">
                      <div className="filter-set-content-head">
                        <Link to="#" className="collapsed" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false">
                          Case Category
                        </Link>
                      </div>
                      <div className="filter-set-contents accordion-collapse collapse" id="collapseThree" data-bs-parent="#accordionExample">
                        <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                          <ul>
                            {["Sales","Marketing","Email","Chats","Operational","Collaborative"].map((item) => (
                              <li key={item}>
                                <label className="dropdown-item px-2 d-flex align-items-center">
                                  <input className="form-check-input m-0 me-1" type="checkbox" /> {item}
                                </label>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div className="filter-set-content">
                      <div className="filter-set-content-head">
                        <Link to="#" className="collapsed" data-bs-toggle="collapse" data-bs-target="#Status" aria-expanded="false">
                          Status
                        </Link>
                      </div>
                      <div className="filter-set-contents accordion-collapse collapse" id="Status" data-bs-parent="#accordionExample">
                        <div className="filter-content-list bg-light rounded border p-2 shadow mt-2">
                          <ul>
                            {["Active","Inactive"].map((item) => (
                              <li key={item}>
                                <label className="dropdown-item px-2 d-flex align-items-center">
                                  <input className="form-check-input m-0 me-1" type="checkbox" /> {item}
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
                    <Link to={all_routes.pipeline} className="btn btn-primary w-100">Filter</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Card List ── */}
        <div className="card-body">
          {loading ? (
            <div className="text-center p-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center text-muted p-5">
              <i className="ti ti-folder-off fs-1 d-block mb-2" />
              No cases found.
            </div>
          ) : (
            // Single column — stacked vertically, full width, like PersonCard in tasks.tsx
            <div className="d-flex flex-column">
              {filteredCases.map((caseItem, index) => (
                <CaseCard key={caseItem.id ?? index} caseItem={caseItem} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Cases;