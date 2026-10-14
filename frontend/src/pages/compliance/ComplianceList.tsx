import { useState, useEffect, useCallback } from "react";
import API from "../../services/api";
import { showSuccess, showError, showWarning, showConfirm } from "../../components/alerts/Alerts";

// Keep in sync with ComplianceRecord.DocumentType on the backend
const TYPE_OPTIONS = [
  { value: "business_permit", label: "Business Permit" },
  { value: "vmd",             label: "VMD" },
  { value: "pcpb",            label: "PCPB" },
  { value: "kephis",          label: "KEPHIS" },
  { value: "other",           label: "Other" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]));

// Keep in sync with ComplianceRecord.ApplicationStatus on the backend
const STATUS_OPTIONS = [
  { value: "new",     label: "New" },
  { value: "renewal", label: "Renewal" },
];
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]));
const statusBadgeCls = (s?: string) =>
  `badge ${s === "renewal" ? "bg-info-transparent text-info" : "bg-success-transparent text-success"}`;

const MAX_MB = 10;
const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";

const isImage = (url?: string | null) => !!url && /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url);

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function expiryInfo(iso?: string | null) {
  if (!iso) return { label: "No expiry", cls: "badge bg-secondary-transparent text-secondary" };
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0)   return { label: `Expired ${fmtDate(iso)}`, cls: "badge bg-danger-transparent text-danger" };
  if (days <= 30) return { label: `Expires ${fmtDate(iso)}`, cls: "badge bg-warning-transparent text-warning" };
  return { label: `Valid until ${fmtDate(iso)}`, cls: "badge bg-success-transparent text-success" };
}

function extractError(err: any, fallback: string) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return fallback;
  if (data.detail || data.error) return data.detail || data.error;
  const field = Object.keys(data)[0];
  const msg = Array.isArray(data[field]) ? data[field][0] : data[field];
  return field ? `${field}: ${msg}` : fallback;
}

const emptyForm = {
  document_type: "business_permit",
  application_status: "new",
  title: "",
  expiry_date: "",
  next_renewal_date: "",
  notes: "",
};

export default function ComplianceList() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Offcanvas
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [mode, setMode] = useState<"add" | "edit" | "view">("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("compliance-records/", { params: { page_size: 1000 } });
      setRecords(res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading compliance records:", err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Local preview for a newly chosen image; revoke to avoid leaks
  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setLocalPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setLocalPreview(null);
  }, [file]);

  const filtered = records.filter(r => {
    if (typeFilter !== "all" && r.document_type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (r.title || "").toLowerCase().includes(q) || (r.notes || "").toLowerCase().includes(q);
    }
    return true;
  });

  // ── Offcanvas handlers ────────────────────────────────────────────────
  function openAdd() {
    setMode("add"); setSelected(null); setForm(emptyForm); setFile(null); setFormError("");
    setShowOffcanvas(true);
  }
  function openEdit(r: any) {
    setMode("edit"); setSelected(r); setFile(null); setFormError("");
    setForm({
      document_type: r.document_type,
      application_status: r.application_status ?? "new",
      title: r.title ?? "",
      expiry_date: r.expiry_date ? r.expiry_date.slice(0, 10) : "",
      next_renewal_date: r.next_renewal_date ? r.next_renewal_date.slice(0, 10) : "",
      notes: r.notes ?? "",
    });
    setShowOffcanvas(true);
  }
  function openView(r: any) {
    setMode("view"); setSelected(r); setFormError("");
    setShowOffcanvas(true);
  }
  function closeOffcanvas() { setShowOffcanvas(false); }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setFormError(`File is too large (max ${MAX_MB} MB).`);
      e.target.value = "";
      return;
    }
    setFormError("");
    setFile(f);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!form.title.trim()) return setFormError("Title is required.");
    if (mode === "add" && !file) return setFormError("Please choose a file to upload.");

    const fd = new FormData();
    fd.append("document_type", form.document_type);
    fd.append("application_status", form.application_status);
    fd.append("title", form.title.trim());
    fd.append("notes", form.notes);
    fd.append("expiry_date", form.expiry_date);               // "" clears it on the server
    fd.append("next_renewal_date", form.next_renewal_date);   // "" clears it on the server
    if (file) fd.append("file", file);

    setSaving(true);
    try {
      const cfg = { headers: { "Content-Type": "multipart/form-data" } };
      if (mode === "edit" && selected) {
        await API.patch(`compliance-records/${selected.id}/`, fd, cfg);
        showSuccess(`"${form.title}" was updated.`, "Record Updated");
      } else {
        await API.post("compliance-records/", fd, cfg);
        showSuccess(`"${form.title}" was uploaded.`, "Record Added");
      }
      setShowOffcanvas(false);
      load();
    } catch (err: any) {
      const msg = extractError(err, "Could not save this record. Please try again.");
      setFormError(msg);
      showError(msg, "Save Failed");
    } finally { setSaving(false); }
  }

  async function handleDelete(r: any) {
    const ok = await showConfirm(
      `You are about to delete "${r.title}" and its uploaded file. This cannot be undone.`,
      "Delete this record?", "Yes, delete it", "Cancel"
    );
    if (!ok) return;
    setDeletingId(r.id);
    try {
      await API.delete(`compliance-records/${r.id}/`);
      setRecords(prev => prev.filter(x => x.id !== r.id));
      if (selected?.id === r.id) setShowOffcanvas(false);
    } catch (err: any) {
      showError(extractError(err, "Failed to delete record."), "Delete Failed");
    } finally { setDeletingId(null); }
  }

  const expiredCount  = records.filter(r => r.expiry_date && new Date(r.expiry_date).getTime() < Date.now()).length;
  const expiringCount = records.filter(r => {
    if (!r.expiry_date) return false;
    const d = (new Date(r.expiry_date).getTime() - Date.now()) / 86400000;
    return d >= 0 && d <= 30;
  }).length;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Compliance Records</h4>
            <p className="text-muted fs-13 mb-0">Business permits, VMD, PCPB, KEPHIS and other regulatory documents.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <i className="ti ti-plus me-1" />Add Record
            </button>
          </div>
        </div>

        {/* Stats */}
        {!loading && records.length > 0 && (
          <div className="row g-3 mb-4">
            {[
              { label: "Total Records",    value: records.length, color: "text-primary" },
              { label: "Expiring in 30d",  value: expiringCount,  color: "text-warning" },
              { label: "Expired",          value: expiredCount,   color: "text-danger" },
            ].map(s => (
              <div key={s.label} className="col-6 col-sm-4 col-lg-3">
                <div className="card mb-0 shadow-none border">
                  <div className="card-body p-3">
                    <p className="fw-medium mb-1 fs-13">{s.label}</p>
                    <h4 className={`mb-0 ${s.color}`}>{s.value}</h4>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 260 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13" placeholder="Search title, notes…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <select className="form-select form-select-sm fs-13" style={{ width: 210 }}
              value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All document types</option>
              {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading records…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-file-off fs-1 mb-2" />
                <p className="fs-14 mb-0">{records.length === 0 ? "No compliance records yet." : "No results match your filters."}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">File</th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Validity</th>
                      <th>Next Renewal</th>
                      <th>Uploaded By</th>
                      <th>Date Added</th>
                      <th className="text-end pe-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const exp = expiryInfo(r.expiry_date);
                      return (
                        <tr key={r.id}>
                          <td className="ps-3">
                            {isImage(r.file_url)
                              ? <img src={r.file_url} alt={r.title} width={36} height={36} style={{ objectFit: "cover", borderRadius: 6 }} />
                              : <i className="ti ti-file-type-pdf fs-3 text-danger" />}
                          </td>
                          <td className="fw-semibold text-dark">{r.title}</td>
                          <td><span className="badge bg-primary-transparent text-primary">{TYPE_LABEL[r.document_type] || r.document_type}</span></td>
                          <td>
                            <span className={statusBadgeCls(r.application_status)}>
                              {STATUS_LABEL[r.application_status] || r.application_status}
                            </span>
                          </td>
                          <td><span className={exp.cls}>{exp.label}</span></td>
                          <td className="text-muted text-nowrap">{r.next_renewal_date ? fmtDate(r.next_renewal_date) : "—"}</td>
                          <td className="text-muted text-nowrap">{r.uploaded_by_name}</td>
                          <td className="text-muted text-nowrap">{fmtDate(r.created_at)}</td>
                          <td className="text-end pe-3">
                            <div className="d-inline-flex gap-1">
                              <button className="btn btn-sm btn-outline-info py-1 px-2 fs-11" onClick={() => openView(r)}>
                                <i className="ti ti-eye me-1" />View
                              </button>
                              <button className="btn btn-sm btn-outline-primary py-1 px-2 fs-11" onClick={() => openEdit(r)}>
                                <i className="ti ti-edit me-1" />Edit
                              </button>
                              <button className="btn btn-sm btn-outline-danger py-1 px-2 fs-11"
                                onClick={() => handleDelete(r)} disabled={deletingId === r.id}>
                                {deletingId === r.id
                                  ? <span className="spinner-border spinner-border-sm" />
                                  : <><i className="ti ti-trash me-1" />Delete</>}
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
        </div>
      </div>

      {/* ============ Offcanvas: view / add / edit ============ */}
      {showOffcanvas && (
        <>
          <div className="offcanvas-backdrop fade show" onClick={closeOffcanvas} />
          <div className="offcanvas offcanvas-end show" style={{ visibility: "visible", width: 420 }} tabIndex={-1}>
            <div className="offcanvas-header bg-primary text-white py-3">
              <h5 className="offcanvas-title text-white fs-15 fw-semibold">
                {mode === "add" && "Add Compliance Record"}
                {mode === "edit" && "Edit Compliance Record"}
                {mode === "view" && "Record Details"}
              </h5>
              <button type="button" className="btn-close btn-close-white" onClick={closeOffcanvas} />
            </div>

            <div className="offcanvas-body">
              {formError && <div className="alert alert-danger fs-13 py-2">{formError}</div>}

              {mode === "view" && selected ? (
                <div className="d-flex flex-column gap-3 fs-13">
                  {isImage(selected.file_url) ? (
                    <a href={selected.file_url} target="_blank" rel="noreferrer">
                      <img src={selected.file_url} alt={selected.title} className="img-fluid border rounded" />
                    </a>
                  ) : (
                    <a href={selected.file_url} target="_blank" rel="noreferrer" className="btn btn-outline-danger btn-sm align-self-start">
                      <i className="ti ti-file-type-pdf me-1" />Open PDF
                    </a>
                  )}
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">TITLE</label>
                    <span className="fw-semibold text-dark fs-14">{selected.title}</span>
                  </div>
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">DOCUMENT TYPE</label>
                    <span>{TYPE_LABEL[selected.document_type] || selected.document_type}</span>
                  </div>
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">APPLICATION STATUS</label>
                    <span className={statusBadgeCls(selected.application_status)}>
                      {STATUS_LABEL[selected.application_status] || selected.application_status}
                    </span>
                  </div>
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">VALIDITY</label>
                    <span className={expiryInfo(selected.expiry_date).cls}>{expiryInfo(selected.expiry_date).label}</span>
                  </div>
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">NEXT RENEWAL</label>
                    <span>{selected.next_renewal_date ? fmtDate(selected.next_renewal_date) : <em className="text-muted">Not set</em>}</span>
                  </div>
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">NOTES</label>
                    <span>{selected.notes || <em className="text-muted">No notes</em>}</span>
                  </div>
                  <div>
                    <label className="text-muted fs-12 fw-medium d-block mb-1">UPLOADED BY</label>
                    <span>{selected.uploaded_by_name}</span> <span className="text-muted">· {fmtDate(selected.created_at)}</span>
                  </div>
                </div>
              ) : (
                <form id="compliance-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Document Type <span className="text-danger">*</span></label>
                    <select className="form-select fs-13" value={form.document_type}
                      onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Application Status <span className="text-danger">*</span></label>
                    <select className="form-select fs-13" value={form.application_status}
                      onChange={e => setForm(f => ({ ...f, application_status: e.target.value }))}>
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Title <span className="text-danger">*</span></label>
                    <input type="text" className="form-control fs-13" placeholder="e.g. Single Business Permit 2026"
                      value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">
                      File {mode === "add" && <span className="text-danger">*</span>}
                    </label>
                    <input type="file" accept={ACCEPT} className="form-control fs-13" onChange={onFileChange} />
                    <div className="fs-11 text-muted mt-1">JPG, PNG, WEBP or PDF, up to {MAX_MB} MB.</div>

                    {localPreview && (
                      <img src={localPreview} alt="Preview" className="img-fluid border rounded mt-2" style={{ maxHeight: 200 }} />
                    )}
                    {mode === "edit" && selected && !file && (
                      <div className="fs-12 mt-2">
                        Current file:{" "}
                        <a href={selected.file_url} target="_blank" rel="noreferrer">open</a>
                        <span className="text-muted"> · choose a new file above to replace it</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Expiry Date</label>
                    <input type="date" className="form-control fs-13" value={form.expiry_date}
                      onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
                    <div className="fs-11 text-muted mt-1">Leave blank if it doesn't expire.</div>
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Next Date of Renewal</label>
                    <input type="date" className="form-control fs-13" value={form.next_renewal_date}
                      onChange={e => setForm(f => ({ ...f, next_renewal_date: e.target.value }))} />
                    <div className="fs-11 text-muted mt-1">When this must next be renewed.</div>
                  </div>

                  <div>
                    <label className="form-label fs-13 fw-medium mb-1">Notes</label>
                    <textarea className="form-control fs-13" rows={3} placeholder="Reference number, issuing office, etc."
                      value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                </form>
              )}
            </div>

            <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-sm btn-light border" onClick={closeOffcanvas} disabled={saving}>
                {mode === "view" ? "Close" : "Cancel"}
              </button>
              {mode === "view" && selected && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => openEdit(selected)}>
                  <i className="ti ti-edit me-1" />Edit
                </button>
              )}
              {mode !== "view" && (
                <button type="submit" form="compliance-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  {mode === "edit" ? "Update Record" : "Save Record"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}