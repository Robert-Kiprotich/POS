import React, { useState, useEffect, useCallback } from "react";
import API, { BACKEND_URL } from "../../services/api";
import axios from "axios";
import { toast, confirm } from "../../utils/toast";

// Calls API lives at /api/calls/ — separate from the inbox API base (/inbox/)
const callsAPI = axios.create({
  baseURL: `${BACKEND_URL}/api/calls/`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Add CSRF token to mutating requests
import { getCookie } from "../../services/csrf";
callsAPI.interceptors.request.use(config => {
  const mutating = ["post", "put", "patch", "delete"];
  if (mutating.includes(config.method || "")) {
    config.headers["X-CSRFToken"] = getCookie("csrftoken") || "";
  }
  return config;
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Extension {
  id: string;
  transport: string;
  aors: string;
  auth: string;
  context: string;
  disallow: string;
  allow: string;
  direct_media: string;
  ice_support: string;
  force_rport: string;
  rewrite_contact: string;
  rtp_symmetric: string;
  webrtc: string;
  allow_overlap: boolean;
  ep_status: string;
  agent: null | any;
  queue: null | string;
}

// Fields that the creation form exposes
interface ExtensionForm {
  id: string;            // extension number, e.g. "10025" or range "10025-10030"
  context: string;
  transport: string;
  // Codecs
  codec_alaw: boolean;
  codec_gsm: boolean;
  codec_ulaw: boolean;
  codec_g722: boolean;
  codec_g723: boolean;
  codec_g729: boolean;
  // Other settings
  direct_media: boolean;
  ice_support: boolean;
  force_rport: boolean;
  rtp_symmetric: boolean;
  allow_overlap: boolean;
  webrtc: boolean;
}

const DEFAULT_FORM: ExtensionForm = {
  id: "",
  context: "helplineagents",
  transport: "transport-wss",
  codec_alaw: true,
  codec_gsm: true,
  codec_ulaw: true,
  codec_g722: true,
  codec_g723: false,
  codec_g729: false,
  direct_media: true,
  ice_support: true,
  force_rport: false,
  rtp_symmetric: false,
  allow_overlap: false,
  webrtc: true,
};

const CONTEXT_OPTIONS = [
  { value: "helplineagents",      label: "Helpline Agents" },
  { value: "helplineadmins",      label: "Helpline Admins" },
  { value: "helplinesupervisors", label: "Helpline Supervisors" },
];

const TRANSPORT_OPTIONS = [
  { value: "transport-wss", label: "WSS (WebRTC)" },
  { value: "transport-udp", label: "UDP" },
];

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  AVAILABLE:   { bg: "bg-success-transparent", text: "text-success" },
  UNAVAILABLE: { bg: "bg-secondary-transparent", text: "text-secondary" },
  WALKIN:      { bg: "bg-info-transparent",    text: "text-info" },
  BUSY:        { bg: "bg-warning-transparent", text: "text-warning" },
  RINGING:     { bg: "bg-primary-transparent", text: "text-primary" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAllow(form: ExtensionForm): string {
  const codecs = [];
  if (form.codec_alaw) codecs.push("alaw");
  if (form.codec_gsm)  codecs.push("gsm");
  if (form.codec_ulaw) codecs.push("ulaw");
  if (form.codec_g722) codecs.push("g722");
  if (form.codec_g723) codecs.push("g723");
  if (form.codec_g729) codecs.push("g729");
  return codecs.length ? codecs.join(",") : "alaw";
}

/** Parse "10025" → [10025] or "10025-10030" → [10025,10026,...,10030] */
function parseRange(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return [parseInt(trimmed, 10)];
  const match = trimmed.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  const [, a, b] = match.map(Number);
  if (a > b || b - a > 99) return null; // max 100 at once
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// ── Component ─────────────────────────────────────────────────────────────────

const OFFCANVAS_ID = "offcanvas_extension_create";

function openOffcanvas() {
  const el = document.getElementById(OFFCANVAS_ID);
  if (!el) return;
  const bs = (window as any).bootstrap;
  bs?.Offcanvas?.getOrCreateInstance(el)?.show();
}

function closeOffcanvas() {
  const el = document.getElementById(OFFCANVAS_ID);
  if (!el) return;
  const bs = (window as any).bootstrap;
  bs?.Offcanvas?.getInstance(el)?.hide();
}

const ExtensionsManagement: React.FC = () => {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [form, setForm]               = useState<ExtensionForm>({ ...DEFAULT_FORM });
  const [formError, setFormError]     = useState("");
  const [search, setSearch]           = useState("");
  const [ctxFilter, setCtxFilter]     = useState("all");
  const [nextUrl, setNextUrl]         = useState<string | null>(null);
  const [prevUrl, setPrevUrl]         = useState<string | null>(null);
  const [total, setTotal]             = useState(0);

  const fetchExtensions = useCallback(async (url = "endpoints/") => {
    setLoading(true);
    try {
      const res = await callsAPI.get(url);
      const d = res.data;
      setExtensions(d.results || []);
      setNextUrl(d.next || null);
      setPrevUrl(d.previous || null);
      setTotal(d.count || 0);
    } catch {
      toast.error("Failed to load extensions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExtensions(); }, [fetchExtensions]);

  const handleFieldChange = (field: keyof ExtensionForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFormError("");
  };

  const handleSubmit = async () => {
    const ids = parseRange(form.id);
    if (!ids) {
      setFormError("Enter a valid extension number (e.g. 10025) or range (e.g. 10025-10030, max 100).");
      return;
    }

    setSaving(true);
    setFormError("");

    const allow   = buildAllow(form);
    const payload = {
      transport:       form.transport,
      context:         form.context,
      disallow:        "all",
      allow,
      direct_media:    form.direct_media ? "yes" : "no",
      ice_support:     form.ice_support  ? "yes" : "no",
      force_rport:     form.force_rport  ? "Yes" : "No",
      rtp_symmetric:   form.rtp_symmetric  ? "Yes" : "No",
      allow_overlap:   form.allow_overlap,
      webrtc:          form.webrtc ? "yes" : "no",
      rewrite_contact: "yes",
    };

    let created = 0;
    let failed  = 0;
    for (const extId of ids) {
      try {
        await callsAPI.post("endpoints/", { ...payload, id: String(extId) });
        created++;
      } catch {
        failed++;
      }
    }

    setSaving(false);

    if (created > 0 && failed === 0) {
      toast.success(`${created} extension${created > 1 ? "s" : ""} created successfully.`);
      setForm({ ...DEFAULT_FORM });
      closeOffcanvas();
      fetchExtensions();
    } else if (created > 0) {
      toast.warning(`${created} created, ${failed} failed (IDs may already exist).`);
      fetchExtensions();
    } else {
      setFormError("Failed to create extension(s). The ID(s) may already exist.");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm(`Delete extension ${id}?`, {
      title: "Delete Extension",
      confirmText: "Delete",
      icon: "warning",
    });
    if (!ok) return;
    try {
      await callsAPI.delete(`endpoints/${id}/`);
      toast.success(`Extension ${id} deleted.`);
      fetchExtensions();
    } catch {
      toast.error("Failed to delete extension.");
    }
  };

  // Filter client-side
  const filtered = extensions.filter(e => {
    const matchSearch = !search ||
      e.id.includes(search) ||
      e.context.toLowerCase().includes(search.toLowerCase()) ||
      e.ep_status.toLowerCase().includes(search.toLowerCase());
    const matchCtx = ctxFilter === "all" || e.context === ctxFilter;
    return matchSearch && matchCtx;
  });

  // ── Status badge ────────────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const s = STATUS_STYLE[status] || { bg: "bg-light", text: "text-muted" };
    return (
      <span className={`badge fs-11 ${s.bg} ${s.text}`}>{status}</span>
    );
  };

  // ── Codec/bool display ──────────────────────────────────────────────────────
  const BoolChip = ({ val, label }: { val: string | boolean; label: string }) => {
    const isYes = val === "yes" || val === "Yes" || val === true;
    return (
      <span className={`badge fs-10 me-1 ${isYes ? "bg-success-transparent text-success" : "bg-light text-muted"}`}>
        {isYes ? "✓" : "✗"} {label}
      </span>
    );
  };

  return (
    <>
    <div className="page-wrapper">
      <div className="content">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
          <div>
            <h4 className="mb-1 fw-semibold">Extensions</h4>
            <p className="text-muted fs-13 mb-0">
              Manage SIP/WebRTC endpoints — {total} total
            </p>
          </div>
          <button
            className="btn btn-primary d-flex align-items-center gap-2"
            onClick={() => { setForm({ ...DEFAULT_FORM }); setFormError(""); openOffcanvas(); }}
          >
            <i className="ti ti-plus" />
            New Extension
          </button>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="card shadow-sm border mb-3">
          <div className="card-body py-2 px-3 d-flex align-items-center gap-3 flex-wrap">
            <div className="d-flex align-items-center gap-2 flex-fill" style={{ maxWidth: 280 }}>
              <i className="ti ti-search text-muted" />
              <input
                type="text"
                className="form-control border-0 shadow-none ps-0 fs-13"
                placeholder="Search by ID, context, status…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="d-flex gap-1 flex-wrap">
              {[
                { val: "all",                   label: "All" },
                { val: "helplineagents",         label: "Agents" },
                { val: "helplineadmins",         label: "Admins" },
                { val: "helplinesupervisors",    label: "Supervisors" },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  className={`btn btn-sm ${ctxFilter === val ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setCtxFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ms-auto text-muted fs-12">
              {filtered.length} of {total} shown
            </span>
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div className="card shadow-sm border">
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
                <span className="spinner-border spinner-border-sm me-2" />Loading extensions…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
                <i className="ti ti-headset-off me-2 fs-4" />No extensions found.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-3">Extension</th>
                      <th>Context</th>
                      <th>Transport</th>
                      <th>Codecs</th>
                      <th>Features</th>
                      <th>Status</th>
                      <th>Assigned</th>
                      <th className="pe-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(ext => (
                      <tr key={ext.id}>
                        <td className="ps-3">
                          <div className="d-flex align-items-center gap-2">
                            <div className="avatar avatar-xs rounded-circle d-flex align-items-center justify-content-center"
                              style={{ width: 30, height: 30, background: "#FFE7E1" }}>
                              <i className="ti ti-headset fs-14" style={{ color: "#E41F07" }} />
                            </div>
                            <span className="fw-semibold text-dark">{ext.id}</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark fs-11">
                            {CONTEXT_OPTIONS.find(c => c.value === ext.context)?.label || ext.context}
                          </span>
                        </td>
                        <td>
                          <span className="text-muted fs-12">
                            <i className={`ti ${ext.transport === "transport-wss" ? "ti-wifi" : "ti-network"} me-1`} />
                            {ext.transport === "transport-wss" ? "WSS" : "UDP"}
                          </span>
                        </td>
                        <td>
                          <span className="fs-11 text-muted">{ext.allow || "—"}</span>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            <BoolChip val={ext.webrtc}       label="WebRTC" />
                            <BoolChip val={ext.ice_support}  label="ICE" />
                            <BoolChip val={ext.direct_media} label="DM" />
                          </div>
                        </td>
                        <td><StatusBadge status={ext.ep_status || "UNAVAILABLE"} /></td>
                        <td>
                          {ext.agent
                            ? <span className="fs-12 text-primary">{ext.agent}</span>
                            : <span className="fs-11 text-muted fst-italic">Unassigned</span>}
                        </td>
                        <td className="pe-3 text-end">
                          <button
                            className="btn btn-xs btn-outline-danger fs-11 py-0 px-2 d-flex align-items-center gap-1"
                            onClick={() => handleDelete(ext.id)}
                            title="Delete extension"
                          >
                            <i className="ti ti-trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {(prevUrl || nextUrl) && (
            <div className="card-footer border-top d-flex justify-content-between align-items-center py-2 px-3">
              <button
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                disabled={!prevUrl}
                onClick={() => {
                  if (prevUrl) {
                    // Extract just the path+query relative to the calls API base
                    const rel = prevUrl.replace(/^.*\/api\/calls\//, '');
                    fetchExtensions(rel);
                  }
                }}
              >
                <i className="ti ti-chevron-left" /> Previous
              </button>
              <span className="text-muted fs-12">{total} total extensions</span>
              <button
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                disabled={!nextUrl}
                onClick={() => {
                  if (nextUrl) {
                    const rel = nextUrl.replace(/^.*\/api\/calls\//, '');
                    fetchExtensions(rel);
                  }
                }}
              >
                Next <i className="ti ti-chevron-right" />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>

    {/* ── Create Extension Offcanvas ───────────────────────────────────────── */}
    <div
      className="offcanvas offcanvas-end"
      tabIndex={-1}
      id={OFFCANVAS_ID}
      aria-labelledby="offcanvasExtensionLabel"
      style={{ width: 520 }}
    >
      {/* Header */}
      <div className="offcanvas-header border-bottom py-3 px-4"
        style={{ borderTop: "4px solid #E41F07" }}>
        <div className="d-flex align-items-center gap-2">
          <div className="avatar avatar-sm rounded d-flex align-items-center justify-content-center"
            style={{ background: "#FFE7E1", width: 36, height: 36 }}>
            <i className="ti ti-headset fs-5" style={{ color: "#E41F07" }} />
          </div>
          <h5 className="offcanvas-title fw-bold fs-15 mb-0" id="offcanvasExtensionLabel">
            Create Extension
          </h5>
        </div>
        <button
          type="button"
          className="btn-close"
          onClick={() => { closeOffcanvas(); setFormError(""); }}
          aria-label="Close"
        />
      </div>

      {/* Body */}
      <div className="offcanvas-body p-4 bg-white" style={{ overflowY: "auto" }}>

        {/* Endpoint ID */}
        <div className="mb-4">
          <label className="form-label fw-semibold fs-13">
            Endpoint ID <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${formError ? "is-invalid" : ""}`}
            placeholder="e.g. 10025 or 10025-10030"
            value={form.id}
            onChange={e => handleFieldChange("id", e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
          <div className="form-text text-muted fs-12 mt-1">
            <i className="ti ti-info-circle me-1" />
            Enter a single number or a range separated by a dash (max 100 at once)
          </div>
          {formError && (
            <div className="invalid-feedback d-block fs-12 mt-1">
              <i className="ti ti-alert-circle me-1" />{formError}
            </div>
          )}
        </div>

        {/* Context + Transport */}
        <div className="row g-3 mb-4">
          <div className="col-6">
            <label className="form-label fw-semibold fs-13">
              Context <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.context}
              onChange={e => handleFieldChange("context", e.target.value)}
            >
              {CONTEXT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label fw-semibold fs-13">
              Transport <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.transport}
              onChange={e => handleFieldChange("transport", e.target.value)}
            >
              {TRANSPORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Codecs */}
        <div className="mb-4">
          <div className="d-flex align-items-center gap-2 mb-3">
            <i className="ti ti-music fs-5" style={{ color: "#E41F07" }} />
            <h6 className="mb-0 fw-semibold fs-14">Codecs</h6>
          </div>
          <div className="row g-2">
            {[
              { key: "codec_alaw", label: "G.711 A-law" },
              { key: "codec_gsm",  label: "GSM" },
              { key: "codec_ulaw", label: "G.711 U-law" },
              { key: "codec_g722", label: "G.722" },
              { key: "codec_g723", label: "G.723" },
              { key: "codec_g729", label: "G.729" },
            ].map(({ key, label }) => (
              <div key={key} className="col-4">
                <label
                  className="d-flex align-items-center gap-2 fs-13 p-2 rounded border"
                  style={{
                    cursor: "pointer",
                    background: form[key as keyof ExtensionForm] ? "#f0fdf4" : "#fff",
                    borderColor: form[key as keyof ExtensionForm] ? "#10b981" : "#dee2e6",
                    transition: "all .15s",
                  }}
                >
                  <input
                    type="checkbox"
                    className="form-check-input m-0 flex-shrink-0"
                    style={{ accentColor: "#10b981" }}
                    checked={form[key as keyof ExtensionForm] as boolean}
                    onChange={e => handleFieldChange(key as keyof ExtensionForm, e.target.checked)}
                  />
                  {label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Other Settings */}
        <div className="mb-2">
          <div className="d-flex align-items-center gap-2 mb-3">
            <i className="ti ti-adjustments fs-5" style={{ color: "#E41F07" }} />
            <h6 className="mb-0 fw-semibold fs-14">Other Settings</h6>
          </div>
          <div className="row g-2">
            {[
              { key: "direct_media",  label: "Direct Media",   icon: "ti-arrows-exchange" },
              { key: "ice_support",   label: "ICE Support",    icon: "ti-snowflake" },
              { key: "force_rport",   label: "Force rport",    icon: "ti-lock" },
              { key: "rtp_symmetric", label: "RTP Symmetric",  icon: "ti-arrows-left-right" },
              { key: "allow_overlap", label: "Allow Overlap",  icon: "ti-layers" },
              { key: "webrtc",        label: "WebRTC Support", icon: "ti-wifi" },
            ].map(({ key, label, icon }) => (
              <div key={key} className="col-4">
                <label
                  className="d-flex align-items-center gap-2 fs-13 p-2 rounded border"
                  style={{
                    cursor: "pointer",
                    background: form[key as keyof ExtensionForm] ? "#eff6ff" : "#fff",
                    borderColor: form[key as keyof ExtensionForm] ? "#3b82f6" : "#dee2e6",
                    transition: "all .15s",
                  }}
                >
                  <input
                    type="checkbox"
                    className="form-check-input m-0 flex-shrink-0"
                    style={{ accentColor: "#3b82f6" }}
                    checked={form[key as keyof ExtensionForm] as boolean}
                    onChange={e => handleFieldChange(key as keyof ExtensionForm, e.target.checked)}
                  />
                  <span>
                    <i className={`ti ${icon} me-1 text-muted`} />{label}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="offcanvas-footer border-top py-3 px-4 d-flex justify-content-end gap-2 bg-light">
        <button
          type="button"
          className="btn btn-light fs-13"
          onClick={() => { closeOffcanvas(); setFormError(""); }}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary fs-13 d-flex align-items-center gap-2"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving
            ? <><span className="spinner-border spinner-border-sm" /> Creating…</>
            : <><i className="ti ti-device-floppy" /> Create Extension</>}
        </button>
      </div>
    </div>
    </>
  );
};

export default ExtensionsManagement;
