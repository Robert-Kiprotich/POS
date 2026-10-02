import { useState, useEffect, useCallback } from "react";
import API from "../../services/api";

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface Person {
  id: number;
  fullname: string;
  phone: string;
  email: string;
  age: number | null;
  agegroup: string;
  gender: string;
  nationality: string;
  town: string;
  persontype: string;
  created_on: string;
}

const TYPE_TABS = [
  { key: "",            label: "All" },
  { key: "reporter",   label: "Reporters" },
  { key: "client",     label: "Clients" },
  { key: "perpetrator", label: "Perpetrators" },
];

export default function ReportersList() {
  const [persons, setPersons]   = useState<Person[]>([]);
  const [filtered, setFiltered] = useState<Person[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("");
  const [search, setSearch]     = useState("");

  const load = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const res = await API.get("persons/", { params: type ? { type } : {} });
      if (res.data?.status === "success") {
        setPersons(res.data.results);
        setFiltered(res.data.results);
        console.log("res:",res)
      }
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(persons); return; }
    const q = search.toLowerCase();
    setFiltered(persons.filter(p =>
      p.fullname.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      (p.town || "").toLowerCase().includes(q)
    ));
  }, [search, persons]);

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Persons Registry</h4>
            <p className="text-muted fs-13 mb-0">Reporters, clients and perpetrators recorded across all cases.</p>
          </div>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => load(tab)} disabled={loading}>
            <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
          </button>
        </div>

        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            {/* Type tabs */}
            <div className="d-flex gap-1 flex-wrap">
              {TYPE_TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTab(t.key); setSearch(""); }}
                  className={`btn btn-sm fs-12 py-1 px-3 ${tab === t.key ? "btn-primary" : "btn-outline-secondary"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0">
                <i className="ti ti-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search name, phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-users-group fs-1 mb-2" />
                <p className="fs-14 mb-0">No persons found.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Name</th>
                      <th>Phone</th>
                      <th>Gender</th>
                      <th>Age</th>
                      <th>Nationality</th>
                      <th>Town</th>
                      <th>Type</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id}>
                        <td className="ps-3">
                          <div className="d-flex align-items-center gap-2">
                            <span className="avatar avatar-xs rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-semibold"
                              style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                              {(p.fullname || "?").charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <div className="fw-medium">{p.fullname || "—"}</div>
                              {p.email && <div className="text-muted fs-11">{p.email}</div>}
                            </div>
                          </div>
                        </td>
                        <td>{p.phone || "—"}</td>
                        <td>{p.gender || "—"}</td>
                        <td>{p.age ? `${p.age} ${p.agegroup ? `(${p.agegroup})` : ""}` : p.agegroup || "—"}</td>
                        <td>{p.nationality || "—"}</td>
                        <td>{p.town || "—"}</td>
                        <td>
                          <span className={`badge fs-11 text-capitalize ${
                            p.persontype === "reporter"    ? "bg-info-transparent text-info" :
                            p.persontype === "client"      ? "bg-success-transparent text-success" :
                            p.persontype === "perpetrator" ? "bg-danger-transparent text-danger" :
                            "bg-secondary-transparent text-secondary"
                          }`}>
                            {p.persontype || "Unknown"}
                          </span>
                        </td>
                        <td className="text-muted text-nowrap">{fmtDate(p.created_on)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filtered.length > 0 && (
            <div className="card-footer border-top py-2 px-3 text-muted fs-12">
              Showing {filtered.length} of {persons.length} record{persons.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
