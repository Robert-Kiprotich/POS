import { useEffect, useState, useCallback } from "react";
import API from "../../services/api";

const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  login:        { label: "Login",           icon: "ti-login",        color: "text-success"   },
  login_failed: { label: "Failed Login",    icon: "ti-lock-exclamation", color: "text-danger" },
  logout:       { label: "Logout",          icon: "ti-logout",       color: "text-secondary" },
  user_created: { label: "User Created",    icon: "ti-user-plus",    color: "text-primary"   },
  user_updated: { label: "User Updated",    icon: "ti-user-edit",    color: "text-warning"   },
  user_deleted: { label: "User Deleted",    icon: "ti-user-minus",   color: "text-danger"    },
  case_created: { label: "Case Created",    icon: "ti-file-plus",    color: "text-info"      },
  case_updated: { label: "Case Updated",    icon: "ti-file-pencil",  color: "text-warning"   },
  case_deleted: { label: "Case Deleted",    icon: "ti-file-minus",   color: "text-danger"    },
};

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, icon: "ti-activity", color: "text-muted" };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function SystemLogs() {
  const [logs, setLogs]         = useState<any[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const pageSize                = 50;

  const [search, setSearch]     = useState("");
  const [actionF, setActionF]   = useState("");
  const [entityF, setEntityF]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (search)   params.set("search",    search);
      if (actionF)  params.set("action",    actionF);
      if (entityF)  params.set("entity",    entityF);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to",   dateTo);
      const res = await API.get(`activity-logs/?${params}`);
      setLogs(res.data.results || []);
      setTotal(res.data.total || 0);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }, [page, search, actionF, entityF, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, actionF, entityF, dateFrom, dateTo]);

  const totalPages = Math.ceil(total / pageSize);

  function resetFilters() {
    setSearch(""); setActionF(""); setEntityF(""); setDateFrom(""); setDateTo("");
  }

  const activeFilters = [search, actionF, entityF, dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">System Logs</h4>
            <p className="text-muted fs-13 mb-0">{total.toLocaleString()} total activity records</p>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
            <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
          </button>
        </div>

        {/* Stats tiles */}
        {!loading && logs.length > 0 && (() => {
          const counts = logs.reduce((acc: any, l) => { acc[l.action] = (acc[l.action] || 0) + 1; return acc; }, {});
          const tiles = [
            { label: "Logins",         value: counts.login         || 0, icon: "ti-login",           color: "text-success",  bg: "bg-success-gradient-100",
              onClick: () => setActionF("login") },
            { label: "Failed Logins",  value: counts.login_failed  || 0, icon: "ti-lock-exclamation", color: "text-danger",   bg: "bg-danger-gradient-100",
              onClick: () => setActionF("login_failed") },
            { label: "Cases Created",  value: counts.case_created  || 0, icon: "ti-file-plus",        color: "text-info",     bg: "bg-info-gradient-100",
              onClick: () => setActionF("case_created") },
            { label: "User Actions",   value: (counts.user_created || 0) + (counts.user_updated || 0) + (counts.user_deleted || 0),
              icon: "ti-users", color: "text-primary", bg: "bg-primary-gradient-100",
              onClick: () => setActionF("user_created") },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(t => (
                <div key={t.label} className="col-6 col-sm-3">
                  <div
                    className="card mb-0 border shadow-none"
                    style={{ cursor: 'pointer', transition: 'box-shadow .15s',
                      boxShadow: actionF === (t.label === 'Failed Logins' ? 'login_failed' : t.label === 'Logins' ? 'login' : t.label === 'Cases Created' ? 'case_created' : '')
                        ? '0 0 0 2px #E41F07' : undefined }}
                    onClick={t.onClick}
                  >
                    <div className="card-body p-3 position-relative">
                      <p className="fw-medium mb-1 fs-13">{t.label}</p>
                      <h4 className={`mb-0 ${t.color}`}>{t.value}</h4>
                      <div className={`avatar avatar-rounded avatar-sm ${t.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                        <i className={`ti ${t.icon} fs-5 ${t.color}`} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="card border shadow-none">
          {/* Toolbar */}
          <div className="card-header border-bottom py-3 d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div className="input-group input-group-flat" style={{ maxWidth: 240 }}>
              <span className="input-group-text bg-transparent border-end-0">
                <i className="ti ti-search text-muted" />
              </span>
              <input className="form-control border-start-0 ps-1 fs-13" placeholder="Search details…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>

            <div className="d-flex gap-2 flex-wrap align-items-center">
              <select className="form-select form-select-sm fs-13 w-auto" value={actionF} onChange={e => setActionF(e.target.value)}>
                <option value="">All Actions</option>
                {Object.entries(ACTION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="form-select form-select-sm fs-13 w-auto" value={entityF} onChange={e => setEntityF(e.target.value)}>
                <option value="">All Entities</option>
                <option value="Case">Case</option>
                <option value="User">User</option>
              </select>
              <input type="date" className="form-control form-control-sm fs-13 w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <input type="date" className="form-control form-control-sm fs-13 w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              {activeFilters > 0 && (
                <button className="btn btn-sm btn-outline-danger" onClick={resetFilters}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading logs…
              </div>
            ) : logs.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-clipboard-off fs-1 mb-2" />
                <p className="fs-14 mb-0">No activity logs found.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Timestamp</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Detail</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const meta = actionMeta(log.action);
                      const isFailed = log.action === 'login_failed';
                      return (
                        <tr key={log.id} style={isFailed ? { background: '#fff5f5' } : undefined}>
                          <td className="ps-3 text-nowrap text-muted">{fmtDate(log.timestamp)}</td>
                          <td className="fw-medium">{log.user_name || <span className="text-muted fst-italic">unknown</span>}</td>
                          <td><span className="badge bg-light text-dark text-capitalize">{log.user_role || "—"}</span></td>
                          <td>
                            <span className={`d-flex align-items-center gap-1 ${meta.color}`}>
                              <i className={`ti ${meta.icon}`} />
                              {meta.label}
                            </span>
                          </td>
                          <td>{log.entity || "—"}</td>
                          <td className="text-truncate" style={{ maxWidth: 260 }}>{log.detail || "—"}</td>
                          <td className="text-muted">{log.ip_address || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between fs-12 text-muted">
              <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong> — {total.toLocaleString()} records</span>
              <div className="d-flex gap-1">
                <button className="btn btn-sm btn-outline-secondary py-0 px-2" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                <button className="btn btn-sm btn-outline-secondary py-0 px-2" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                <button className="btn btn-sm btn-outline-secondary py-0 px-2" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                <button className="btn btn-sm btn-outline-secondary py-0 px-2" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
