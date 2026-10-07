import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";

// ───────────────────────── formatting helpers ─────────────────────────
const money = (n: any) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: any) => Number(n || 0).toLocaleString("en-KE");

function fmtDate(d: string) {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function presetRange(preset: string): [string, string] {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "today": return [iso(now), iso(now)];
    case "week": {
      const s = new Date(now); s.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return [iso(s), iso(now)];
    }
    case "last_month": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "year": return [iso(new Date(y, 0, 1)), iso(now)];
    default: return [iso(new Date(y, m, 1)), iso(now)]; // month
  }
}

const BADGE_CLS = (v: string) => {
  const s = String(v || "").toLowerCase();
  if (/(completed|paid|cleared|approved|active|^ok$|restock|returned)/.test(s)) return "badge bg-success-transparent text-success";
  if (/(pending|draft|issued|in hand|received|low|partial|expiring|deposited|adjust|moved)/.test(s)) return "badge bg-warning-transparent text-warning";
  if (/(cancel|reject|bounce|overdue|out of stock|expired|damaged|inactive|refund)/.test(s)) return "badge bg-danger-transparent text-danger";
  return "badge bg-secondary-transparent text-secondary";
};

function formatCell(value: any, type: string) {
  switch (type) {
    case "money": return money(value);
    case "number": return num(value);
    case "percent": return `${Number(value || 0).toFixed(1)}%`;
    case "date": return fmtDate(value);
    case "datetime": return fmtDateTime(value);
    default: return value === null || value === undefined || value === "" ? "—" : String(value);
  }
}
const plainCell = (value: any, type: string) =>
  type === "date" ? fmtDate(value) : type === "datetime" ? fmtDateTime(value) : value ?? "";

function errorMessage(err: any) {
  const d = err.response?.data;
  const v = d?.error || d?.detail;
  return Array.isArray(v) ? v[0] : v || "Could not load this report. Please try again.";
}

const PRESETS = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["last_month", "Last month"], ["year", "This year"]];

// ───────────────────────── page ─────────────────────────
export default function Reports() {
  const [options, setOptions] = useState<any>(null);
  const [reportKey, setReportKey] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState("month");
  const [[dateFrom, dateTo], setRange] = useState<[string, string]>(presetRange("month"));

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [printAll, setPrintAll] = useState(false); // print every row, not just the visible page

  // Load the report catalogue + dropdown options once.
  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("reports/options/");
        setOptions(res.data);
        if (res.data.reports.length) setReportKey(res.data.reports[0].key);
        if (res.data.forced_branch) setFilters({ branch: String(res.data.forced_branch) });
      } catch (err: any) {
        if (err.response?.status === 401) window.location.href = "/login";
        else setError(errorMessage(err));
      }
    })();
  }, []);

  const spec = useMemo(() => options?.reports.find((r: any) => r.key === reportKey), [options, reportKey]);

  const run = useCallback(async () => {
    if (!spec) return;
    setLoading(true); setError("");
    try {
      const params: any = { report: reportKey };
      if (spec.date) { params.date_from = dateFrom; params.date_to = dateTo; }
      Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
      const res = await API.get("reports/", { params });
      setData(res.data);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [spec, reportKey, dateFrom, dateTo, filters]);

  useEffect(() => { run(); }, [run]);
  useEffect(() => { setPage(1); }, [reportKey, filters, dateFrom, dateTo, search, sort]);

  function changeReport(key: string) {
    setReportKey(key);
    setFilters(options?.forced_branch ? { branch: String(options.forced_branch) } : {});
    setSearch(""); setSort(null); setData(null);
  }

  const setFilter = (name: string, value: string) => setFilters(f => ({ ...f, [name]: value }));
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && !(k === "branch" && options?.forced_branch)).length;

  // Filtering + sorting happen in the browser over the rows the server returned.
  const columns: any[] = data?.columns || [];
  const rows = useMemo(() => {
    let list: any[] = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (q) {
      const textCols = columns.filter(c => ["text", "badge", "date"].includes(c.type));
      list = list.filter(r => textCols.some(c => String(r[c.key] ?? "").toLowerCase().includes(q)));
    }
    if (sort) {
      const numeric = ["money", "number", "percent"].includes(columns.find(c => c.key === sort.key)?.type);
      list = [...list].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        return (numeric ? Number(x) - Number(y) : String(x ?? "").localeCompare(String(y ?? ""))) * sort.dir;
      });
    }
    return list;
  }, [data, search, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = printAll ? rows : rows.slice((page - 1) * pageSize, page * pageSize);

  function exportRows(kind: "csv" | "xlsx") {
    if (!data) return;
    const table = [
      columns.map(c => c.label),
      ...rows.map(r => columns.map(c => plainCell(r[c.key], c.type))),
    ];
    const name = `${reportKey}_${dateFrom}_${dateTo}`;
    if (kind === "xlsx") {
      const ws = XLSX.utils.aoa_to_sheet(table);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, (spec?.label || "Report").slice(0, 30));
      XLSX.writeFile(wb, `${name}.xlsx`);
    } else {
      const csv = table.map(r => r.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `${name}.csv`;
      a.click();
    }
  }

  // Dropdown option lists for the generic filter kinds.
  const listFor = (kind: string): { value: string; label: string }[] => {
    if (kind === "branch") return (options?.branches || []).map((b: any) => ({ value: String(b.id), label: `${b.name} (${b.code})` }));
    if (kind === "cashier") return (options?.cashiers || []).map((c: any) => ({ value: String(c.id), label: c.name }));
    if (kind === "category") return (options?.categories || []).map((c: any) => ({ value: String(c.id), label: c.name }));
    return [];
  };

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    (options?.reports || []).forEach((r: any) => (map[r.group] = [...(map[r.group] || []), r]));
    return map;
  }, [options]);

  // ───────────────────────── render ─────────────────────────
  if (!options && !error) {
    return (
      <div className="page-wrapper"><div className="content">
        <div className="d-flex align-items-center justify-content-center py-5 text-muted">
          <span className="spinner-border spinner-border-sm me-2" />Loading reports…
        </div>
      </div></div>
    );
  }
  if (!options) {
    return <div className="page-wrapper"><div className="content"><div className="alert alert-danger fs-13">{error}</div></div></div>;
  }

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Reports</h4>
            <p className="text-muted fs-13 mb-0">Pick a report, narrow it down with the filters, then export or print it.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap d-print-none">
            <button className="btn btn-outline-secondary btn-sm" onClick={run} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportRows("csv")} disabled={!rows.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportRows("xlsx")} disabled={!rows.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setPrintAll(true); setTimeout(() => { window.print(); setPrintAll(false); }, 100); }} disabled={!rows.length}>
              <i className="ti ti-printer me-1" />Print
            </button>
          </div>
        </div>

        {/* ── Report picker + filters ── */}
        <div className="card shadow-none border mb-3 d-print-none">
          <div className="card-body p-3">
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-4 col-xl-3">
                <label className="form-label fs-13 fw-medium">Report</label>
                <select className="form-select" value={reportKey} onChange={e => changeReport(e.target.value)}>
                  {Object.entries(groups).map(([g, list]) => (
                    <optgroup key={g} label={g}>
                      {list.map((r: any) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {spec?.date && (
                <>
                  <div className="col-12 col-md-auto">
                    <label className="form-label fs-13 fw-medium">{spec.date}</label>
                    <div className="d-flex gap-2 align-items-center">
                      <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={dateFrom} max={dateTo}
                        onChange={e => { setPreset("custom"); setRange([e.target.value, dateTo]); }} />
                      <span className="text-muted fs-13">to</span>
                      <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={dateTo} min={dateFrom}
                        onChange={e => { setPreset("custom"); setRange([dateFrom, e.target.value]); }} />
                    </div>
                  </div>
                  <div className="col-12 col-md-auto">
                    <div className="btn-group btn-group-sm">
                      {PRESETS.map(([k, l]) => (
                        <button key={k} className={`btn ${preset === k ? "btn-primary" : "btn-outline-secondary"}`}
                          onClick={() => { setPreset(k); setRange(presetRange(k)); }}>{l}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {spec?.filters?.length > 0 && (
              <div className="row g-2 mt-1">
                {spec.filters.map((f: any) => {
                  const opts = f.kind === "select" ? f.options : listFor(f.kind);
                  const locked = f.name === "branch" && !!options.forced_branch;
                  return (
                    <div key={f.name} className="col-6 col-md-3 col-xl-2">
                      <label className="form-label fs-12 text-muted mb-1">{f.label}</label>
                      <select className="form-select form-select-sm fs-13" value={filters[f.name] || ""} disabled={locked}
                        onChange={e => setFilter(f.name, e.target.value)}>
                        {!locked && <option value="">{f.name === "group_by" ? "No grouping (detailed)" : `All`}</option>}
                        {opts.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  );
                })}
                {activeFilters > 0 && (
                  <div className="col-auto d-flex align-items-end">
                    <button className="btn btn-sm btn-outline-danger" onClick={() => setFilters(options.forced_branch ? { branch: String(options.forced_branch) } : {})}>
                      <i className="ti ti-x me-1" />Clear filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Print header */}
        <div className="d-none d-print-block mb-3">
          <h4 className="mb-0">{spec?.label}</h4>
          {data?.range && <p className="mb-0 fs-13">{fmtDate(data.range.start)} to {fmtDate(data.range.end)}</p>}
        </div>

        {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}
        {data?.note && <div className="alert alert-light border fs-13 py-2">{data.note}</div>}
        {data?.truncated && (
          <div className="alert alert-warning fs-13 py-2">
            Showing the first 5,000 rows. Narrow the date range or filters to see everything.
          </div>
        )}

        {/* ── Summary tiles ── */}
        {data?.summary?.length > 0 && (
          <div className="row g-3 mb-3">
            {data.summary.map((s: any) => (
              <div key={s.label} className="col-6 col-md-4 col-xl-2">
                <div className="card mb-0 shadow-none border h-100">
                  <div className="card-body p-3">
                    <p className="fw-medium mb-1 fs-12 text-muted">{s.label}</p>
                    <h6 className="mb-0">{s.type === "money" ? money(s.value) : num(s.value)}</h6>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2 d-print-none">
            <h6 className="mb-0">{spec?.label}{data?.range && <span className="text-muted fw-normal fs-13 ms-2">{fmtDate(data.range.start)} – {fmtDate(data.range.end)}</span>}</h6>
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13" placeholder="Search in results…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
          </div>

          <div className="card-body p-0">
            {loading && !data ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Building report…
              </div>
            ) : rows.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-report fs-1 mb-2" />
                <p className="fs-14 mb-0">{data ? "Nothing to show for these filters." : "Choose a report to get started."}</p>
              </div>
            ) : (
              <div className="table-responsive" style={{ opacity: loading ? 0.5 : 1 }}>
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {columns.map(c => {
                        const right = ["money", "number", "percent"].includes(c.type);
                        return (
                          <th key={c.key} className={`text-nowrap ${right ? "text-end" : ""}`} style={{ cursor: "pointer" }}
                            onClick={() => setSort(s => s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}>
                            {c.label}
                            {sort?.key === c.key && <i className={`ti ${sort.dir === 1 ? "ti-arrow-up" : "ti-arrow-down"} ms-1`} />}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <tr key={i}>
                        {columns.map(c => {
                          const right = ["money", "number", "percent"].includes(c.type);
                          const v = r[c.key];
                          return (
                            <td key={c.key} className={`text-nowrap ${right ? "text-end" : ""}`}>
                              {c.type === "badge"
                                ? <span className={BADGE_CLS(v)}>{v || "—"}</span>
                                : c.type === "money" && c.key.includes("balance") && Number(v) > 0
                                  ? <span className="text-danger fw-semibold">{formatCell(v, c.type)}</span>
                                  : formatCell(v, c.type)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted d-print-none">
              <span>Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)}</strong> of <strong>{rows.length}</strong> row{rows.length !== 1 ? "s" : ""}</span>
              <div className="d-flex align-items-center gap-1">
                <select className="form-select form-select-sm fs-12 w-auto" value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 25, 50, 100, 500].map(n => <option key={n} value={n}>{n} / page</option>)}
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
          )}
        </div>
      </div>
    </div>
  );
}
