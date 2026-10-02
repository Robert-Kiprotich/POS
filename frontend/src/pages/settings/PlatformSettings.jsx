import { useState, useEffect, useRef } from "react";
import API from "../../services/api";


const CHANNELS = [
  { key: "whatsapp",  label: "WhatsApp",  icon: "ti ti-brand-whatsapp", color: "#25D366" },
  { key: "facebook",  label: "Facebook",  icon: "ti ti-brand-facebook", color: "#1877F2" },
  { key: "instagram", label: "Instagram", icon: "ti ti-brand-instagram", color: "#E1306C" },
  { key: "email",     label: "Email",     icon: "ti ti-mail",            color: "#EA4335" },
];

const DEFAULT_FORM = {
  whatsapp:  { access_token: "", phone_number_id: "", business_account_id: "", verify_token: "", app_secret: "", is_active: true },
  facebook:  { access_token: "", page_id: "", app_id: "", app_secret: "", verify_token: "", is_active: true },
  instagram: { access_token: "", account_id: "", app_id: "", app_secret: "", verify_token: "", is_active: true },
  email:     { email_address: "", email_password: "", email_host: "", email_port: "587", email_use_tls: true, email_use_ssl: false, imap_host: "", imap_port: "993", is_active: true },
};

function StatusBadge({ status }) {
  const map = {
    connected:    { cls: "badge bg-success-transparent text-success",    icon: "ti ti-circle-check", label: "Connected" },
    configured:   { cls: "badge bg-info-transparent text-info",          icon: "ti ti-settings",     label: "Configured" },
    error:        { cls: "badge bg-danger-transparent text-danger",      icon: "ti ti-circle-x",     label: "Error" },
    disconnected: { cls: "badge bg-secondary-transparent text-secondary", icon: "ti ti-circle",      label: "Not Connected" },
    testing:      { cls: "badge bg-warning-transparent text-warning",    icon: "ti ti-loader",       label: "Testing…" },
    saved:        { cls: "badge bg-info-transparent text-info",          icon: "ti ti-circle-check", label: "Saved" },
  };
  const b = map[status] || map.disconnected;
  return <span className={b.cls}><i className={`${b.icon} me-1`} />{b.label}</span>;
}

function TokenHelpModal({ onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1055 }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content" ref={ref}>
          <div className="modal-header py-3">
            <h6 className="modal-title fw-semibold fs-15 d-flex align-items-center gap-2">
              <i className="ti ti-brand-whatsapp text-success" />
              How to get a Permanent WhatsApp Access Token
            </h6>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body fs-13" style={{ lineHeight: 1.7 }}>
            <div className="alert alert-warning py-2 fs-12 mb-3">
              <i className="ti ti-alert-triangle me-1" />
              <strong>Temporary tokens expire every 24 hours.</strong> A System User token never expires.
            </div>
            <ol className="ps-3 mb-0">
              <li className="mb-3">
                <strong>Open Meta Business Suite &rarr; System Users</strong><br />
                <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">business.facebook.com/settings/system-users <i className="ti ti-external-link fs-11" /></a>
                {" "}&mdash; sign in with the account that owns your WhatsApp Business App.
              </li>
              <li className="mb-3">
                <strong>Create a System User</strong><br />
                Click <em>Add</em> &rarr; name it (e.g. <code>holla-bot</code>) &rarr; role <strong>Admin</strong> &rarr; <em>Create System User</em>.
              </li>
              <li className="mb-3">
                <strong>Assign your Meta App</strong><br />
                Click <em>Add Assets</em> &rarr; <strong>Apps</strong> &rarr; select your app &rarr; <strong>Full Control</strong> &rarr; <em>Save Changes</em>.<br />
                <span className="text-muted fs-12">No app yet? <a href="https://developers.facebook.com/apps/create/" target="_blank" rel="noreferrer">Create one here <i className="ti ti-external-link fs-11" /></a></span>
              </li>
              <li className="mb-3">
                <strong>Generate the token</strong><br />
                Click <em>Generate New Token</em> &rarr; select your app &rarr; tick:
                <ul className="mt-1 mb-1">
                  <li><code>whatsapp_business_messaging</code></li>
                  <li><code>whatsapp_business_management</code></li>
                </ul>
                Set expiry to <strong>Never</strong> &rarr; <em>Generate Token</em>.
              </li>
              <li className="mb-3">
                <strong>Find your Phone Number ID &amp; Business Account ID</strong><br />
                <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps <i className="ti ti-external-link fs-11" /></a> &rarr; your app &rarr; <strong>WhatsApp &rarr; API Setup</strong>. Both IDs are shown on that page.
              </li>
              <li className="mb-3">
                <strong>Find your App Secret</strong><br />
                <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps <i className="ti ti-external-link fs-11" /></a> &rarr; your app &rarr; <strong>App Settings &rarr; Basic</strong> &rarr; click <em>Show</em> next to App Secret.
              </li>
              <li>
                <strong>Paste everything here &amp; Save</strong><br />
                Token starts with <code>EAALo4d4&hellip;</code>. After saving, click <em>Test Connection</em> to verify.
              </li>
            </ol>
          </div>
          <div className="modal-footer py-2">
            <a href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-users" target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm me-auto">
              <i className="ti ti-external-link me-1" />Official Docs
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecretField({ label, hasValue, value, onChange, placeholder, hint, half, onHelp }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`${half ? "col-md-6" : "col-12"} mb-3`}>
      <div className="d-flex align-items-center gap-1 mb-1">
        <label className="form-label fs-13 fw-semibold mb-0">{label}</label>
        {onHelp && (
          <button type="button" className="btn btn-link p-0 text-muted" style={{ lineHeight: 1 }} onClick={onHelp} title="How to get this token">
            <i className="ti ti-help-circle fs-14" />
          </button>
        )}
      </div>
      {!editing ? (
        <div className="input-group">
          <input
            type="password"
            className="form-control bg-light"
            value={hasValue ? "••••••••••••••••" : ""}
            placeholder={hasValue ? "" : `No ${label.toLowerCase()} saved`}
            readOnly
          />
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setEditing(true)}
            title="Edit"
          >
            <i className="ti ti-pencil" />
          </button>
        </div>
      ) : (
        <div className="input-group">
          <input
            type="text"
            className="form-control"
            placeholder={placeholder}
            value={value || ""}
            onChange={e => onChange(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => { onChange(""); setEditing(false); }}
            title="Cancel"
          >
            <i className="ti ti-x" />
          </button>
        </div>
      )}
      {hint && <div className="form-text text-muted fs-11">{hint}</div>}
    </div>
  );
}


function PlatformCard({ channel, form, onChange, onSave, onTest, status, saving, testing, testResult }) {
  const [show, setShow] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const f = form[channel.key] || {};
  const isEmail = channel.key === "email";

  const field = (name, label, type = "text", placeholder = "") => (
    <div className="col-md-6 mb-3">
      <label className="form-label fs-13 fw-semibold">{label}</label>
      <input
        type={type}
        className="form-control"
        placeholder={placeholder || label}
        value={f[name] || ""}
        onChange={e => onChange(channel.key, name, e.target.value)}
        autoComplete="off"
      />
    </div>
  );

  const toggle = (name, label) => (
    <div className="col-md-6 mb-3 d-flex align-items-center gap-2">
      <div className="form-check form-switch mb-0">
        <input
          className="form-check-input"
          type="checkbox"
          id={`${channel.key}-${name}`}
          checked={!!f[name]}
          onChange={e => onChange(channel.key, name, e.target.checked)}
        />
        <label className="form-check-label fs-13" htmlFor={`${channel.key}-${name}`}>{label}</label>
      </div>
    </div>
  );

  return (
    <div className="card mb-3 shadow-none border">
      <div
        className="card-header d-flex align-items-center justify-content-between py-3 px-4"
        style={{ cursor: "pointer" }}
        onClick={() => setShow(s => !s)}
      >
        <div className="d-flex align-items-center gap-3">
          <span
            className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
            style={{ width: 40, height: 40, background: channel.color + "20", color: channel.color, fontSize: 20 }}
          >
            <i className={channel.icon} />
          </span>
          <div>
            <h6 className="mb-0 fw-semibold fs-14">{channel.label}</h6>
            <small className="text-muted fs-11">
              {channel.key === "whatsapp"  && "WhatsApp Business Cloud API"}
              {channel.key === "facebook"  && "Facebook Messenger (Meta Graph API)"}
              {channel.key === "instagram" && "Instagram Direct Messages (Meta Graph API)"}
              {channel.key === "email"     && "IMAP / SMTP Email Integration"}
            </small>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <StatusBadge status={status} />
          <div className="form-check form-switch mb-0 ms-2" onClick={e => e.stopPropagation()}>
            <input
              className="form-check-input"
              type="checkbox"
              checked={!!f.is_active}
              onChange={e => onChange(channel.key, "is_active", e.target.checked)}
            />
          </div>
          <i className={`ti ${show ? "ti-chevron-up" : "ti-chevron-down"} text-muted ms-1`} />
        </div>
      </div>

      {show && (
        <div className="card-body px-4 pt-3 pb-4">
          <div className="row">
            {/* WhatsApp fields */}
            {channel.key === "whatsapp" && <>
              {showTokenHelp && <TokenHelpModal onClose={() => setShowTokenHelp(false)} />}
              <SecretField
                label="Access Token (Permanent)"
                hasValue={f.has_access_token}
                value={f.access_token}
                onChange={v => onChange(channel.key, "access_token", v)}
                placeholder="EAALo4d4..."
                hint="Generate a permanent token via Meta Business Suite → System Users"
                onHelp={() => setShowTokenHelp(true)}
              />
              {field("phone_number_id", "Phone Number ID", "text", "e.g. 781636031702460")}
              {field("business_account_id", "Business Account ID", "text", "e.g. 1881257979273444")}
              {field("verify_token", "Webhook Verify Token", "text", "whatsapp_verify_token")}
              <SecretField
                label="App Secret"
                hasValue={f.has_app_secret}
                value={f.app_secret}
                onChange={v => onChange(channel.key, "app_secret", v)}
                placeholder="App secret from Meta App Dashboard"
                half
              />
            </>}

            {/* Facebook fields */}
            {channel.key === "facebook" && <>
              <SecretField
                label="Page Access Token"
                hasValue={f.has_access_token}
                value={f.access_token}
                onChange={v => onChange(channel.key, "access_token", v)}
                placeholder="EAALo4d4..."
              />
              {field("page_id", "Page ID", "text", "e.g. 104112082326832")}
              {field("app_id", "App ID", "text", "")}
              <SecretField
                label="App Secret"
                hasValue={f.has_app_secret}
                value={f.app_secret}
                onChange={v => onChange(channel.key, "app_secret", v)}
                placeholder="App secret from Meta App Dashboard"
                half
              />
              {field("verify_token", "Webhook Verify Token", "text", "facebook_verify_token")}
            </>}

            {/* Instagram fields */}
            {channel.key === "instagram" && <>
              <SecretField
                label="Access Token"
                hasValue={f.has_access_token}
                value={f.access_token}
                onChange={v => onChange(channel.key, "access_token", v)}
                placeholder="EAALo4d4..."
              />
              {field("account_id", "Instagram Account ID", "text", "")}
              {field("app_id", "App ID", "text", "")}
              <SecretField
                label="App Secret"
                hasValue={f.has_app_secret}
                value={f.app_secret}
                onChange={v => onChange(channel.key, "app_secret", v)}
                placeholder="App secret from Meta App Dashboard"
                half
              />
              {field("verify_token", "Webhook Verify Token", "text", "instagram_verify_token")}
            </>}

            {/* Email fields */}
            {isEmail && <>
              {field("email_address", "Email Address", "email", "you@example.com")}
              <SecretField
                label="Password / App Password"
                hasValue={f.has_email_password}
                value={f.email_password}
                onChange={v => onChange(channel.key, "email_password", v)}
                placeholder="••••••••"
                half
              />
              {field("email_host", "SMTP Host", "text", "smtp.gmail.com")}
              {field("email_port", "SMTP Port", "number", "587")}
              {field("imap_host", "IMAP Host", "text", "imap.gmail.com")}
              {field("imap_port", "IMAP Port", "number", "993")}
              {toggle("email_use_tls", "Use TLS (STARTTLS)")}
              {toggle("email_use_ssl", "Use SSL")}
            </>}
          </div>

          {/* Webhook URL info */}
          {channel.key !== "email" && (
            <div className="alert alert-light border fs-12 py-2 mb-3">
              <i className="ti ti-link me-1 text-primary" />
              <strong>Webhook URL:</strong>{" "}
              <code className="fs-11">{window.location.origin}/inbox/{channel.key}/webhook/</code>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`alert ${testResult.ok ? "alert-success" : "alert-danger"} fs-12 py-2 mb-3`}>
              <i className={`ti ${testResult.ok ? "ti-circle-check" : "ti-circle-x"} me-1`} />
              {testResult.message}
            </div>
          )}

          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onSave(channel.key)}
              disabled={saving}
            >
              {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : <><i className="ti ti-device-floppy me-1" />Save</>}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => onTest(channel.key)}
              disabled={testing}
            >
              {testing ? <><span className="spinner-border spinner-border-sm me-1" />Testing…</> : <><i className="ti ti-plug me-1" />Test Connection</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformSettings() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [statuses, setStatuses] = useState({ whatsapp: "disconnected", facebook: "disconnected", instagram: "disconnected", email: "disconnected" });
  const [saving, setSaving] = useState({});
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Load existing platform settings from backend
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await API.get("platform-status/");
        if (res.data?.platforms) {
          const updated = { ...DEFAULT_FORM };
          const newStatuses = { ...statuses };
          const platforms = Array.isArray(res.data.platforms)
            ? res.data.platforms
            : Object.entries(res.data.platforms).map(([key, val]) => ({ platform: key, ...val }));
          platforms.forEach(p => {
            if (updated[p.platform] !== undefined) {
              updated[p.platform] = { ...updated[p.platform], ...p };
              newStatuses[p.platform] = p.is_active && p.configured ? "configured" : "disconnected";
            }
          });
          setForm(updated);
          setStatuses(newStatuses);
        }
      } catch (err) {
        // If 401/403, the user is not authenticated — values stay as defaults
        console.warn('platform-status load failed', err?.response?.status);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (channel, field, value) => {
    setForm(prev => ({ ...prev, [channel]: { ...prev[channel], [field]: value } }));
  };

  const handleSave = async (channel) => {
    setSaving(s => ({ ...s, [channel]: true }));
    try {
      await API.post(`platforms/${channel}/update/`, form[channel]);
      setStatuses(s => ({ ...s, [channel]: "saved" }));
      showToast(`${channel.charAt(0).toUpperCase() + channel.slice(1)} settings saved successfully.`);
    } catch (err) {
      showToast(`Failed to save ${channel} settings: ${err?.response?.data?.error || err.message}`, false);
    } finally {
      setSaving(s => ({ ...s, [channel]: false }));
    }
  };

  const handleTest = async (channel) => {
  setTesting(t => ({ ...t, [channel]: true }));
  setTestResults(r => ({ ...r, [channel]: null }));
  try {
    // Save first so the DB has the latest credentials before testing
    await API.post(`platforms/${channel}/update/`, form[channel]);
    const res = await API.post(`platform-status/test/`, { platform: channel });
    const ok = res.data?.status === "success" || res.data?.connected === true;
    setTestResults(r => ({ ...r, [channel]: { ok, message: res.data?.message || (ok ? "Connected!" : "Connection failed") } }));
    setStatuses(s => ({ ...s, [channel]: ok ? "connected" : "error" }));
  } catch (err) {
    const msg = err?.response?.data?.message || err?.response?.data?.error || err.message;
    setTestResults(r => ({ ...r, [channel]: { ok: false, message: `Error: ${msg}` } }));
    setStatuses(s => ({ ...s, [channel]: "error" }));
  } finally {
    setTesting(t => ({ ...t, [channel]: false }));
  }
};

  const handleSaveAll = async () => {
  setGlobalSaving(true);
  try {
    await Promise.all(CHANNELS.map(c => API.post(`platforms/${c.key}/update/`, form[c.key])));
    showToast("All platform settings saved successfully.");
  } catch (err) {
    showToast(`Save failed: ${err?.response?.data?.error || err.message}`, false);
  } finally {
    setGlobalSaving(false);
  }
};

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Page Header */}
        <div className="row align-items-center mb-4">
          <div className="col">
            <h4 className="fs-18 fw-semibold mb-1">Platform Settings</h4>
            <p className="text-muted fs-13 mb-0">Configure your messaging channels — WhatsApp, Facebook, Instagram and Email.</p>
          </div>
          <div className="col-auto">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveAll}
              disabled={globalSaving || loading}
            >
              {globalSaving
                ? <><span className="spinner-border spinner-border-sm me-2" />Saving All…</>
                : <><i className="ti ti-device-floppy me-2" />Save All</>}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`alert ${toast.ok ? "alert-success" : "alert-danger"} d-flex align-items-center gap-2 fs-13 mb-4`}
            style={{ position: "sticky", top: 16, zIndex: 1050 }}
          >
            <i className={`ti ${toast.ok ? "ti-circle-check" : "ti-circle-x"} fs-5`} />
            {toast.msg}
          </div>
        )}

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-5">
            <div className="spinner-border text-primary me-3" />
            <span className="text-muted fs-14">Loading platform settings…</span>
          </div>
        ) : (
          <div className="row">
            <div className="col-xl-8 col-lg-10">

              {/* Platform Cards */}
              {CHANNELS.map(ch => (
                <PlatformCard
                  key={ch.key}
                  channel={ch}
                  form={form}
                  onChange={handleChange}
                  onSave={handleSave}
                  onTest={handleTest}
                  status={statuses[ch.key]}
                  saving={!!saving[ch.key]}
                  testing={!!testing[ch.key]}
                  testResult={testResults[ch.key]}
                />
              ))}

              {/* Webhook info card */}
              <div className="card border shadow-none mt-1">
                <div className="card-body px-4 py-3">
                  <h6 className="fw-semibold fs-14 mb-3"><i className="ti ti-webhook me-2 text-primary" />Webhook Configuration</h6>
                  <p className="text-muted fs-13 mb-3">
                    Configure these webhook URLs in your Meta App Dashboard and email provider. 
                    All webhooks are pre-configured — you just need to copy the URL for your platform.
                  </p>
                  <div className="table-responsive">
                    <table className="table table-bordered table-sm fs-13 mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Platform</th>
                          <th>Webhook URL</th>
                          <th>Verify Token Field</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CHANNELS.filter(c => c.key !== "email").map(c => (
                          <tr key={c.key}>
                            <td>
                              <i className={`${c.icon} me-1`} style={{ color: c.color }} />
                              {c.label}
                            </td>
                            <td>
                              <code className="fs-11">{window.location.origin}/inbox/{c.key}/webhook/</code>
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 ms-2 text-muted"
                                title="Copy"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/inbox/${c.key}/webhook/`);
                                  showToast("Copied to clipboard!");
                                }}
                              >
                                <i className="ti ti-copy fs-12" />
                              </button>
                            </td>
                            <td>
                              {form[c.key]?.verify_token
                                ? <>
                                    <code className="fs-11">{form[c.key].verify_token}</code>
                                    <button
                                      type="button"
                                      className="btn btn-link btn-sm p-0 ms-2 text-muted"
                                      title="Copy"
                                      onClick={() => { navigator.clipboard.writeText(form[c.key].verify_token); showToast("Copied!"); }}
                                    >
                                      <i className="ti ti-copy fs-12" />
                                    </button>
                                  </>
                                : <span className="text-muted fs-11">Not set</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

            {/* Right info panel */}
            <div className="col-xl-4 col-lg-2 d-none d-lg-block">
              <div className="card border shadow-none">
                <div className="card-body px-4 py-3">
                  <h6 className="fw-semibold fs-14 mb-3"><i className="ti ti-info-circle me-2 text-primary" />Quick Guide</h6>
                  <ul className="list-unstyled mb-0">
                    <li className="mb-3 d-flex gap-2">
                      <span className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 bg-success-transparent text-success" style={{ width: 28, height: 28 }}>
                        <i className="ti ti-brand-whatsapp fs-13" />
                      </span>
                      <div>
                        <p className="fw-semibold fs-13 mb-1">WhatsApp</p>
                        <p className="text-muted fs-11 mb-0">Get your permanent token from Meta Business Suite → System Users. Add <strong>whatsapp_business_messaging</strong> permission.</p>
                      </div>
                    </li>
                    <li className="mb-3 d-flex gap-2">
                      <span className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 bg-primary-transparent text-primary" style={{ width: 28, height: 28 }}>
                        <i className="ti ti-brand-facebook fs-13" />
                      </span>
                      <div>
                        <p className="fw-semibold fs-13 mb-1">Facebook</p>
                        <p className="text-muted fs-11 mb-0">Go to your Facebook App → Messenger → Settings. Generate a Page Access Token and subscribe to <strong>messages</strong> webhook.</p>
                      </div>
                    </li>
                    <li className="mb-3 d-flex gap-2">
                      <span className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" style={{ width: 28, height: 28, background: "#E1306C20", color: "#E1306C" }}>
                        <i className="ti ti-brand-instagram fs-13" />
                      </span>
                      <div>
                        <p className="fw-semibold fs-13 mb-1">Instagram</p>
                        <p className="text-muted fs-11 mb-0">Connect your Instagram Business Account in the Meta App → Instagram → Settings. Uses the same token as Facebook.</p>
                      </div>
                    </li>
                    <li className="d-flex gap-2">
                      <span className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 bg-danger-transparent text-danger" style={{ width: 28, height: 28 }}>
                        <i className="ti ti-mail fs-13" />
                      </span>
                      <div>
                        <p className="fw-semibold fs-13 mb-1">Email</p>
                        <p className="text-muted fs-11 mb-0">Use an App Password if 2FA is enabled. Port 587 + TLS for Gmail/Outlook; Port 465 + SSL for cPanel hosts.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlatformSettings;
