import React, { useState, useEffect, useMemo } from "react";
import { ALL_COLUMNS } from "./CasesList";

type ColKey = typeof ALL_COLUMNS[number]["key"];

interface AdvancedFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: Record<string, any>) => void;
  cases: any[];
}

const OFFCANVAS_ID = "offcanvas_advanced_filters";

const BOOL_KEYS = new Set([
  "is_gbv", "is_client", "has_medical_exam", "incident_reported",
  "hiv_tested", "pep_given", "art_given", "ecp_given", "counselling_given", "is_referred",
]);
const DATE_KEYS = new Set(["created_on", "updated_on", "incident_date", "reporter_dob"]);
const ENUM_KEYS = new Set(["priority", "status", "category", "reporter_gender", "source", "created_by", "case_type"]);

export default function AdvancedFiltersModal({
  isOpen,
  onClose,
  onApply,
  cases,
}: AdvancedFiltersModalProps) {
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});

  const groups = useMemo(() => Array.from(new Set(ALL_COLUMNS.map(c => c.group))), []);

  // Open / close the Bootstrap offcanvas when isOpen changes
  useEffect(() => {
    const el = document.getElementById(OFFCANVAS_ID);
    if (!el) return;
    const bs = (window as any).bootstrap;
    if (!bs?.Offcanvas) return;
    if (isOpen) {
      bs.Offcanvas.getOrCreateInstance(el).show();
    } else {
      bs.Offcanvas.getInstance(el)?.hide();
    }
  }, [isOpen]);

  // Sync Bootstrap hide event → onClose so pressing Escape or the × also works
  useEffect(() => {
    const el = document.getElementById(OFFCANVAS_ID);
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("hidden.bs.offcanvas", handler);
    return () => el.removeEventListener("hidden.bs.offcanvas", handler);
  }, [onClose]);

  const getUniqueValues = (field: ColKey): any[] => {
    const vals = cases.map(c => c[field]).filter(v => v != null && v !== "").sort();
    return Array.from(new Set(vals));
  };

  const renderFieldInput = (col: typeof ALL_COLUMNS[number]) => {
    const field = col.key;
    const value = filterValues[field] ?? "";
    const active = value !== "" && value !== null && value !== undefined;

    const style: React.CSSProperties = {
      backgroundColor: active ? "#FFF5F0" : "#fff",
      borderColor: active ? "#E41F07" : "#dee2e6",
      fontSize: "0.875rem",
      transition: "all .2s",
    };

    if (BOOL_KEYS.has(field)) {
      return (
        <select className="form-select form-select-sm" value={value} style={style}
          onChange={e => setFilterValues(p => ({ ...p, [field]: e.target.value }))}>
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (DATE_KEYS.has(field)) {
      return (
        <input type="date" className="form-control form-control-sm" value={value} style={style}
          onChange={e => setFilterValues(p => ({ ...p, [field]: e.target.value }))} />
      );
    }
    if (ENUM_KEYS.has(field)) {
      return (
        <select className="form-select form-select-sm" value={value} style={style}
          onChange={e => setFilterValues(p => ({ ...p, [field]: e.target.value }))}>
          <option value="">All</option>
          {getUniqueValues(field).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }
    return (
      <input type="text" className="form-control form-control-sm" placeholder="Search…"
        value={value} style={style}
        onChange={e => setFilterValues(p => ({ ...p, [field]: e.target.value }))} />
    );
  };

  const handleApply = () => {
    const active = Object.fromEntries(
      Object.entries(filterValues).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    );
    onApply(active);
    onClose();
  };

  const handleClear = () => setFilterValues({});

  const activeCount = Object.values(filterValues).filter(v => v !== "" && v !== null && v !== undefined).length;

  return (
    <div
      className="offcanvas offcanvas-end"
      tabIndex={-1}
      id={OFFCANVAS_ID}
      aria-labelledby="offcanvasFiltersLabel"
      style={{ width: 560 }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="offcanvas-header border-bottom py-3 px-4"
        style={{ background: "linear-gradient(135deg, #E41F07 0%, #FFA201 100%)" }}
      >
        <div className="d-flex align-items-center gap-2">
          <div className="avatar avatar-sm rounded d-flex align-items-center justify-content-center"
            style={{ background: "rgba(255,255,255,0.2)", width: 36, height: 36 }}>
            <i className="ti ti-adjustments fs-5 text-white" />
          </div>
          <div>
            <h5 className="offcanvas-title fw-bold fs-15 mb-0 text-white" id="offcanvasFiltersLabel">
              Advanced Filters
            </h5>
            <p className="mb-0 fs-12" style={{ color: "rgba(255,255,255,0.75)" }}>
              Refine case search with detailed criteria
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {activeCount > 0 && (
            <span className="badge fs-12 fw-semibold px-2 py-1"
              style={{ background: "#fff", color: "#E41F07" }}>
              {activeCount} active
            </span>
          )}
          <button type="button" className="btn-close"
            style={{ filter: "brightness(0) invert(1)", opacity: 0.85 }}
            onClick={onClose} aria-label="Close" />
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="offcanvas-body p-0" style={{ overflowY: "auto", background: "#fafafa" }}>
        {groups.map((group, idx) => {
          const groupCols = ALL_COLUMNS.filter(c => c.group === group);
          const groupActive = groupCols.filter(c => {
            const v = filterValues[c.key];
            return v !== "" && v !== null && v !== undefined;
          }).length;

          return (
            <div key={group} className={idx < groups.length - 1 ? "border-bottom" : ""}>
              {/* Group header */}
              <div className="px-4 pt-3 pb-2 d-flex align-items-center gap-2">
                <div style={{
                  width: 4, height: 18, borderRadius: 2,
                  background: "linear-gradient(180deg,#E41F07,#FFA201)",
                  flexShrink: 0,
                }} />
                <h6 className="mb-0 fw-bold fs-12 text-uppercase" style={{ color: "#2d3748", letterSpacing: "0.5px", flex: 1 }}>
                  {group}
                </h6>
                {groupActive > 0 && (
                  <span className="badge fs-10 rounded-pill"
                    style={{ background: "#FFE7E1", color: "#E41F07" }}>
                    {groupActive} set
                  </span>
                )}
              </div>

              {/* Fields grid */}
              <div className="px-4 pb-3">
                <div className="row g-2">
                  {groupCols.map(col => {
                    const field = col.key;
                    const active = filterValues[field] !== "" && filterValues[field] != null;
                    return (
                      <div key={field} className="col-6">
                        <div
                          className="p-2 rounded"
                          style={{
                            border: active ? "1.5px solid #E41F07" : "1px solid #e8e8e8",
                            background: active ? "#fff" : "#f8f9fa",
                            transition: "all .2s",
                          }}
                        >
                          <label className="form-label fw-semibold mb-1 d-flex align-items-center justify-content-between"
                            style={{ fontSize: "0.78rem", color: active ? "#E41F07" : "#444" }}>
                            <span>{col.label}</span>
                            {active && (
                              <span className="badge fs-9 ms-1 px-1"
                                style={{ background: "#E41F07", color: "#fff", borderRadius: 2 }}>
                                SET
                              </span>
                            )}
                          </label>
                          {renderFieldInput(col)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="offcanvas-footer border-top py-3 px-4 bg-white d-flex align-items-center justify-content-between gap-2">
        <div>
          {activeCount > 0 && (
            <button
              className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
              onClick={handleClear}
            >
              <i className="ti ti-trash fs-13" /> Clear All
            </button>
          )}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-light fs-13" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-sm fw-semibold fs-13 d-flex align-items-center gap-1"
            onClick={handleApply}
            style={{
              background: "linear-gradient(135deg,#E41F07,#FFA201)",
              color: "#fff",
              border: "none",
              boxShadow: "0 2px 8px rgba(228,31,7,0.25)",
            }}
          >
            <i className="ti ti-check fs-13" />
            Apply Filters
            {activeCount > 0 && (
              <span className="badge ms-1 fs-10"
                style={{ background: "rgba(255,255,255,0.25)" }}>
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
