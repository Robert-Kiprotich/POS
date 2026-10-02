import { useState, useEffect, useCallback } from "react";
import API, { BACKEND_URL } from "../../services/api";
import axios from "axios";
import { toast, confirm } from "../../utils/toast";

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const SCORE_CHOICES = ["no", "partially", "yes"] as const;
type Score = typeof SCORE_CHOICES[number];

const SCORE_CLS: Record<Score, string> = {
  no:        "badge bg-danger-transparent text-danger",
  partially: "badge bg-warning-transparent text-warning",
  yes:       "badge bg-success-transparent text-success",
};

// ── scorecard sections & fields ──────────────────────────────────────────────
const SECTIONS = [
  {
    key: "og", label: "Opening Greeting",
    scores: [
      { key: "og_introduced_self",         label: "Introduced self" },
      { key: "og_introduced_organisation", label: "Introduced organisation" },
    ],
    comment: "og_comments",
  },
  {
    key: "ls", label: "Listening Skills",
    scores: [
      { key: "ls_no_interruptions",  label: "No interruptions" },
      { key: "ls_empathizes",        label: "Empathizes" },
      { key: "ls_rephrases",         label: "Rephrases" },
      { key: "ls_please_thank_you",  label: "Please / Thank you" },
      { key: "ls_no_hesitation",     label: "No hesitation" },
    ],
    comment: "ls_comments",
  },
  {
    key: "pa", label: "Pro-activeness",
    scores: [
      { key: "pa_solves_additional",     label: "Solves additional issues" },
      { key: "pa_confirms_satisfaction", label: "Confirms satisfaction" },
    ],
    comment: "pa_comments",
  },
  {
    key: "rc", label: "Resolution / Counselling",
    scores: [
      { key: "rc_accurate_information", label: "Accurate information" },
      { key: "rc_correct_language",     label: "Correct language" },
      { key: "rc_accurate_steps",       label: "Accurate steps" },
      { key: "rc_explains_process",     label: "Explains process" },
    ],
    comment: "rc_comments",
  },
  {
    key: "cc", label: "Closing the Call",
    scores: [
      { key: "cc_demonstrates_appreciation", label: "Demonstrates appreciation" },
      { key: "cc_client_satisfied",          label: "Client satisfied" },
    ],
    comment: "cc_comments",
  },
];

const CD_REPORTER = [
  { key: "cd_reporter_biodata",  label: "Reporter biodata" },
  { key: "cd_reporter_geodata",  label: "Reporter geodata" },
  { key: "cd_reporter_contacts", label: "Reporter contacts" },
];
const CD_CLIENT = [
  { key: "cd_client_biodata",       label: "Client biodata" },
  { key: "cd_client_geodata",       label: "Client geodata" },
  { key: "cd_caregiver_details",    label: "Caregiver details" },
  { key: "cd_education_disability", label: "Education / disability" },
];
const CD_CASE = [
  { key: "cd_case_categorization", label: "Case categorization" },
  { key: "cd_case_narration",      label: "Case narration" },
  { key: "cd_needs_assessment",    label: "Needs assessment" },
  { key: "cd_case_plan",           label: "Case plan" },
  { key: "cd_status_priority",     label: "Status / priority" },
  { key: "cd_services_offered",    label: "Services offered" },
];

// ── blank form ────────────────────────────────────────────────────────────────
function blankForm() {
  const f: Record<string, any> = { case_id: "", counsellor_id: "", feedback: "" };
  SECTIONS.forEach(s => {
    s.scores.forEach(sc => { f[sc.key] = ""; });
    f[s.comment] = "";
  });
  [...CD_REPORTER, ...CD_CLIENT, ...CD_CASE].forEach(c => { f[c.key] = false; });
  return f;
}

const PANEL_TRANSITION_MS = 300;

export default function QualityAnalysis() {
  const [records, setRecords]     = useState<any[]>([]);
  const [filtered, setFiltered]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [showPanel, setShowPanel] = useState(false); // mounted in DOM?
  const [panelIn, setPanelIn]     = useState(false); // slid into view?
  const [editing, setEditing]     = useState<any>(null);
  const [form, setForm]           = useState<Record<string, any>>(blankForm());
  const [saving, setSaving]       = useState(false);
  const [cases, setCases]         = useState<any[]>([]);
  const [users, setUsers]         = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/main/qa/`, { withCredentials: true });
      setRecords(res.data);
      setFiltered(res.data);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // load cases + users for dropdowns (only when panel opens)
  useEffect(() => {
    if (!showPanel) return;
    API.get("case-list/").then(r => setCases(r.data?.results || [])).catch(() => {});
    API.get("assignable-users/").then(r => setUsers(r.data?.users || [])).catch(() => {});
  }, [showPanel]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? records.filter(r =>
        r.case_number?.toLowerCase().includes(q) ||
        r.counsellor_name?.toLowerCase().includes(q) ||
        r.assessor_name?.toLowerCase().includes(q)
      ) : records
    );
  }, [search, records]);

  // Drive the slide-in animation: mount first with panelIn=false, then
  // flip to true on the next frame so the CSS transition has somewhere to
  // animate from.
  useEffect(() => {
    if (showPanel) {
      const id = requestAnimationFrame(() => setPanelIn(true));
      return () => cancelAnimationFrame(id);
    }
    setPanelIn(false);
  }, [showPanel]);

  function openPanel() {
    setShowPanel(true);
  }

  function closePanel() {
    setPanelIn(false); // triggers slide-out transition
    setTimeout(() => setShowPanel(false), PANEL_TRANSITION_MS);
  }

  function openNew() {
    setEditing(null);
    setForm(blankForm());
    openPanel();
  }

  function openEdit(rec: any) {
    setEditing(rec);
    const f: Record<string, any> = {
      case_id: rec.case_id,
      counsellor_id: rec.counsellor_id,
      feedback: rec.feedback || "",
    };
    SECTIONS.forEach(s => {
      s.scores.forEach(sc => { f[sc.key] = rec[sc.key] || ""; });
      f[s.comment] = rec[s.comment] || "";
    });
    [...CD_REPORTER, ...CD_CLIENT, ...CD_CASE].forEach(c => { f[c.key] = !!rec[c.key]; });
    setForm(f);
    openPanel();
  }

  function set(key: string, val: any) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${BACKEND_URL}/main/qa/${editing.id}/`, form, { withCredentials: true });
      } else {
        await axios.post(`${BACKEND_URL}/main/qa/`, form, { withCredentials: true });
      }
      closePanel();
      load();
    } catch { /* TODO: show error */ }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    const ok = await confirm("Delete this scorecard?", { title: 'Delete Scorecard', confirmText: 'Delete', icon: 'warning' });
    if (!ok) return;
    await axios.delete(`${BACKEND_URL}/main/qa/${id}/`, { withCredentials: true });
    load();
  }

  // ── score for a record (yes=2, partially=1, no=0) ─────────────────────────
  function calcScore(rec: any) {
    const scoreFields = SECTIONS.flatMap(s => s.scores.map(sc => sc.key));
    const total = scoreFields.length * 2;
    const got = scoreFields.reduce((acc, k) => {
      if (rec[k] === "yes") return acc + 2;
      if (rec[k] === "partially") return acc + 1;
      return acc;
    }, 0);
    return total > 0 ? Math.round((got / total) * 100) : 0;
  }

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Quality Analysis</h4>
            <p className="text-muted fs-13 mb-0">QA scorecards for counsellor call assessments.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              <i className="ti ti-plus me-1" />New Scorecard
            </button>
          </div>
        </div>

        <div className="card shadow-none border">
          {/* Toolbar */}
          <div className="card-header border-bottom py-3">
            <div className="input-group input-group-flat" style={{ maxWidth: 300 }}>
              <span className="input-group-text bg-transparent border-end-0">
                <i className="ti ti-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search case, counsellor, assessor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-clipboard-off fs-1 mb-2" />
                <p className="fs-14 mb-0">{records.length === 0 ? "No scorecards yet." : "No results match your search."}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Case #</th>
                      <th>Counsellor</th>
                      <th>Assessor</th>
                      <th>Score</th>
                      <th>Assessed On</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const score = calcScore(r);
                      const scoreCls = score >= 75 ? "bg-success-transparent text-success"
                                     : score >= 50 ? "bg-warning-transparent text-warning"
                                     : "bg-danger-transparent text-danger";
                      return (
                        <tr key={r.id}>
                          <td className="ps-3 fw-semibold">{r.case_number}</td>
                          <td>{r.counsellor_name}</td>
                          <td className="text-muted">{r.assessor_name}</td>
                          <td><span className={`badge ${scoreCls}`}>{score}%</span></td>
                          <td className="text-muted text-nowrap">{fmtDate(r.assessed_on)}</td>
                          <td>
                            <div className="d-flex gap-1">
                              <button className="btn btn-sm btn-outline-primary py-1 px-2 fs-11" onClick={() => openEdit(r)}>
                                <i className="ti ti-edit me-1" />Edit
                              </button>
                              <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11" onClick={() => del(r.id)}>
                                <i className="ti ti-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filtered.length > 0 && (
            <div className="card-footer border-top py-2 px-3 text-muted fs-12">
              Showing {filtered.length} of {records.length} scorecard{records.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* ── Offcanvas ─────────────────────────────────────────────────────── */}
      {showPanel && (
        <>
          <div
            className={`offcanvas-backdrop fade ${panelIn ? "show" : ""}`}
            style={{ zIndex: 1055, transition: `opacity ${PANEL_TRANSITION_MS}ms linear` }}
            onClick={closePanel}
          />
          <div
            className={`offcanvas offcanvas-end ${panelIn ? "show" : ""} bg-light`}
            tabIndex={-1}
            style={{
              width: "85%",
              maxWidth: "85vw",
              zIndex: 1060,
              visibility: "visible",
              transition: `transform ${PANEL_TRANSITION_MS}ms ease-in-out`,
            }}
          >
            {/* Header */}
            <div className="offcanvas-header bg-light border-0 pt-3 pb-0 px-4 justify-content-between">
              <h5 className="mb-0 fw-bold text-dark">{editing ? "Edit Scorecard" : "New Scorecard"}</h5>
              <button
                type="button"
                className="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
                onClick={closePanel}
                aria-label="Close"
              />
            </div>

            <div className="offcanvas-body bg-light px-4 pt-1 pb-5">
              {/* Case + Counsellor */}
              <div className="card shadow-sm border-0 rounded-3 bg-white mb-3">
                <div className="card-header bg-white border-bottom py-3 px-4">
                  <h6 className="mb-0 fw-bold text-dark fs-14">Case & Counsellor</h6>
                </div>
                <div className="card-body p-4">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fs-13">Case</label>
                      <select className="form-select fs-13" value={form.case_id} onChange={e => set("case_id", e.target.value)}>
                        <option value="">Select case…</option>
                        {cases.map((c: any) => <option key={c.id} value={c.id}>{c.case_number}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fs-13">Counsellor</label>
                      <select className="form-select fs-13" value={form.counsellor_id} onChange={e => set("counsellor_id", e.target.value)}>
                        <option value="">Select counsellor…</option>
                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Score sections */}
              {SECTIONS.map(sec => (
                <div key={sec.key} className="card shadow-sm border-0 rounded-3 bg-white mb-3">
                  <div className="card-header bg-white border-bottom py-3 px-4">
                    <h6 className="mb-0 fw-bold text-dark fs-14">{sec.label}</h6>
                  </div>
                  <div className="card-body p-4">
                    <div className="table-responsive">
                      <table className="table table-sm mb-2 fs-13">
                        <thead className="table-light">
                          <tr>
                            <th>Criteria</th>
                            {SCORE_CHOICES.map(s => <th key={s} className="text-capitalize">{s}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {sec.scores.map(sc => (
                            <tr key={sc.key}>
                              <td>{sc.label}</td>
                              {SCORE_CHOICES.map(s => (
                                <td key={s}>
                                  <input
                                    type="radio"
                                    className="form-check-input"
                                    name={sc.key}
                                    value={s}
                                    checked={form[sc.key] === s}
                                    onChange={() => set(sc.key, s)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <textarea
                      className="form-control form-control-sm fs-13 mt-2"
                      rows={2}
                      placeholder="Comments…"
                      value={form[sec.comment]}
                      onChange={e => set(sec.comment, e.target.value)}
                    />
                  </div>
                </div>
              ))}

              {/* Case Documentation */}
              <div className="card shadow-sm border-0 rounded-3 bg-white mb-3">
                <div className="card-header bg-white border-bottom py-3 px-4">
                  <h6 className="mb-0 fw-bold text-dark fs-14">Case Documentation</h6>
                </div>
                <div className="card-body p-4">
                  {[
                    { label: "Reporter Details", fields: CD_REPORTER },
                    { label: "Client Details",   fields: CD_CLIENT },
                    { label: "Case Information", fields: CD_CASE },
                  ].map(group => (
                    <div key={group.label} className="mb-3">
                      <p className="text-muted fs-12 mb-1">{group.label}</p>
                      <div className="d-flex flex-wrap gap-3">
                        {group.fields.map(f => (
                          <div key={f.key} className="form-check">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              id={f.key}
                              checked={!!form[f.key]}
                              onChange={e => set(f.key, e.target.checked)}
                            />
                            <label className="form-check-label fs-13" htmlFor={f.key}>{f.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback */}
              <div className="card shadow-sm border-0 rounded-3 bg-white">
                <div className="card-header bg-white border-bottom py-3 px-4">
                  <h6 className="mb-0 fw-bold text-dark fs-14">Overall Feedback</h6>
                </div>
                <div className="card-body p-4">
                  <textarea
                    className="form-control fs-13"
                    rows={3}
                    placeholder="Overall feedback…"
                    value={form.feedback}
                    onChange={e => set("feedback", e.target.value)}
                  />
                </div>
              </div>

              {/* Bottom submission row */}
              <div className="d-flex align-items-center justify-content-end gap-3 mt-4 pt-3 bg-light border-0">
                <button
                  type="button"
                  className="btn btn-outline-warning px-4 py-2 fw-medium"
                  style={{ color: "#ffb822", borderColor: "#ffb822" }}
                  onClick={closePanel}
                  disabled={saving}
                >
                  Cancel Evaluation
                </button>
                <button
                  type="button"
                  className="btn btn-success px-4 py-2 fw-medium d-flex align-items-center gap-1.5 text-white"
                  onClick={save}
                  disabled={saving}
                  style={{ backgroundColor: "#10b981", borderColor: "#10b981" }}
                >
                  {saving ? <span className="spinner-border spinner-border-sm" /> : <i className="ti ti-device-floppy fs-14" />}
                  {editing ? "Save Changes" : "Create Scorecard"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
