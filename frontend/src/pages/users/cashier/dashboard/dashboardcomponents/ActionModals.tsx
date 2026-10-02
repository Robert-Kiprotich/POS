import React, { useState } from 'react';

// ─── Resolve Modal ─────────────────────────────────────────────────────────────
interface ResolveModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  contactName?: string;
}

export const ResolveModal: React.FC<ResolveModalProps> = ({ show, onClose, onConfirm, busy, contactName }) => {
  if (!show) return null;
  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1060 }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 420 }}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-bottom py-3">
            <div className="d-flex align-items-center gap-2">
              <span className="avatar avatar-sm rounded-circle bg-success-transparent text-success d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                <i className="ti ti-circle-check fs-5" />
              </span>
              <div>
                <h5 className="modal-title mb-0 fw-semibold fs-15">Resolve Conversation</h5>
                <p className="mb-0 text-muted fs-12">Mark this conversation as resolved</p>
              </div>
            </div>
            <button className="btn-close" onClick={onClose} disabled={busy} />
          </div>
          <div className="modal-body p-4">
            <div className="d-flex align-items-start gap-3 p-3 rounded bg-success-transparent">
              <i className="ti ti-info-circle text-success fs-5 flex-shrink-0 mt-1" />
              <p className="mb-0 fs-13 text-dark">
                You are about to resolve the conversation
                {contactName ? <> with <strong>{contactName}</strong></> : ''}.
                {' '}The client will start a new conversation the next time they message.
              </p>
            </div>
          </div>
          <div className="modal-footer border-top py-3 gap-2">
            <button className="btn btn-light fs-13" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn btn-success fs-13 d-flex align-items-center gap-2"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy
                ? <><span className="spinner-border spinner-border-sm" /> Resolving…</>
                : <><i className="ti ti-circle-check" /> Resolve Conversation</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface User {
  id: number;
  name: string;
  role: string;
  email?: string;
}

// ─── Transfer Modal ────────────────────────────────────────────────────────────
interface TransferModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (userId: number, userName: string, note: string) => void;
  users: User[];
  busy: boolean;
}

export const TransferModal: React.FC<TransferModalProps> = ({ show, onClose, onConfirm, users, busy }) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [note, setNote] = useState('');

  if (!show) return null;

  const handleConfirm = () => {
    if (!selectedUser) return;
    onConfirm(selectedUser.id, selectedUser.name, note);
    setSelectedUser(null);
    setNote('');
  };

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1060 }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 480 }}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-bottom py-3">
            <div className="d-flex align-items-center gap-2">
              <span className="avatar avatar-sm rounded-circle bg-primary-transparent text-primary d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                <i className="ti ti-arrows-transfer-up fs-5" />
              </span>
              <div>
                <h5 className="modal-title mb-0 fw-semibold fs-15">Transfer Conversation</h5>
                <p className="mb-0 text-muted fs-12">Move this conversation to another counsellor or supervisor</p>
              </div>
            </div>
            <button className="btn-close" onClick={onClose} disabled={busy} />
          </div>
          <div className="modal-body p-4">
            <label className="form-label fw-medium fs-13">Select Agent / Supervisor <span className="text-danger">*</span></label>
            <div className="d-flex flex-column gap-2 mb-3" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {users.map(u => (
                <div
                  key={u.id}
                  className={`d-flex align-items-center gap-3 p-3 rounded border cursor-pointer ${selectedUser?.id === u.id ? 'border-primary bg-primary-transparent' : 'border-light bg-light'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedUser(u)}
                >
                  <span className={`avatar avatar-sm rounded-circle d-flex align-items-center justify-content-center fw-semibold text-white ${selectedUser?.id === u.id ? 'bg-primary' : 'bg-secondary'}`}
                    style={{ width: 34, height: 34, fontSize: 13, flexShrink: 0 }}>
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-fill">
                    <p className="mb-0 fw-medium fs-13 text-dark">{u.name}</p>
                    <p className="mb-0 fs-11 text-muted text-capitalize">{u.role}</p>
                  </div>
                  {selectedUser?.id === u.id && <i className="ti ti-circle-check-filled text-primary fs-5" />}
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-muted fs-13 text-center py-3">No agents available</p>
              )}
            </div>
            <label className="form-label fw-medium fs-13">Transfer Note <span className="text-muted fw-normal">(optional)</span></label>
            <textarea
              className="form-control fs-13"
              rows={3}
              placeholder="Add context for the receiving agent..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <div className="modal-footer border-top py-3 gap-2">
            <button className="btn btn-light fs-13" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn btn-primary fs-13 d-flex align-items-center gap-2"
              onClick={handleConfirm}
              disabled={!selectedUser || busy}
            >
              {busy && <span className="spinner-border spinner-border-sm" />}
              <i className="ti ti-arrows-transfer-up" />
              Transfer to {selectedUser?.name || '...'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ─── Escalate Modal ────────────────────────────────────────────────────────────
const ESCALATION_REASONS = [
  'Requires senior counsellor expertise',
  'Client in immediate danger',
  'Complex legal / police involvement',
  'Medical emergency',
  'Client requested supervisor',
  'Repeated contact — unresolved issue',
  'Other',
];

const URGENCY_LEVELS = [
  { value: 'low',      label: 'Low',      cls: 'bg-success-transparent text-success' },
  { value: 'medium',   label: 'Medium',   cls: 'bg-warning-transparent text-warning' },
  { value: 'high',     label: 'High',     cls: 'bg-danger-transparent text-danger' },
  { value: 'critical', label: 'Critical', cls: 'bg-danger text-white' },
];

interface EscalateModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (supervisorId: number, supervisorName: string, reason: string, urgency: string, details: string) => void;
  supervisors: User[];
  busy: boolean;
}

export const EscalateModal: React.FC<EscalateModalProps> = ({ show, onClose, onConfirm, supervisors, busy }) => {
  const [selectedSup, setSelectedSup] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState('medium');
  const [details, setDetails] = useState('');

  if (!show) return null;

  const handleConfirm = () => {
    if (!selectedSup || !reason) return;
    onConfirm(selectedSup.id, selectedSup.name, reason, urgency, details);
    setSelectedSup(null); setReason(''); setUrgency('medium'); setDetails('');
  };

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1060 }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 500 }}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-bottom py-3">
            <div className="d-flex align-items-center gap-2">
              <span className="avatar avatar-sm rounded-circle bg-warning-transparent text-warning d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                <i className="ti ti-alert-triangle fs-5" />
              </span>
              <div>
                <h5 className="modal-title mb-0 fw-semibold fs-15">Escalate Conversation</h5>
                <p className="mb-0 text-muted fs-12">Flag for supervisor review and action</p>
              </div>
            </div>
            <button className="btn-close" onClick={onClose} disabled={busy} />
          </div>
          <div className="modal-body p-4">
            {/* Urgency */}
            <label className="form-label fw-medium fs-13 mb-2">Urgency Level <span className="text-danger">*</span></label>
            <div className="d-flex gap-2 flex-wrap mb-4">
              {URGENCY_LEVELS.map(u => (
                <button
                  key={u.value}
                  type="button"
                  className={`btn btn-sm fs-12 fw-medium ${urgency === u.value ? u.cls + ' border-0' : 'btn-outline-secondary'}`}
                  onClick={() => setUrgency(u.value)}
                >
                  {u.value === 'critical' && <i className="ti ti-alert-circle me-1" />}
                  {u.label}
                </button>
              ))}
            </div>

            {/* Supervisor */}
            <label className="form-label fw-medium fs-13">Escalate To <span className="text-danger">*</span></label>
            <div className="d-flex flex-column gap-2 mb-3" style={{ maxHeight: 180, overflowY: 'auto' }}>
              {supervisors.map(s => (
                <div
                  key={s.id}
                  className={`d-flex align-items-center gap-3 p-3 rounded border ${selectedSup?.id === s.id ? 'border-warning bg-warning-transparent' : 'border-light bg-light'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedSup(s)}
                >
                  <span className={`avatar avatar-sm rounded-circle d-flex align-items-center justify-content-center fw-semibold text-white ${selectedSup?.id === s.id ? 'bg-warning' : 'bg-secondary'}`}
                    style={{ width: 34, height: 34, fontSize: 13, flexShrink: 0 }}>
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-fill">
                    <p className="mb-0 fw-medium fs-13 text-dark">{s.name}</p>
                    <p className="mb-0 fs-11 text-muted text-capitalize">{s.role}</p>
                  </div>
                  {selectedSup?.id === s.id && <i className="ti ti-circle-check-filled text-warning fs-5" />}
                </div>
              ))}
              {supervisors.length === 0 && (
                <p className="text-muted fs-13 text-center py-3">No supervisors found</p>
              )}
            </div>

            {/* Reason */}
            <label className="form-label fw-medium fs-13">Reason <span className="text-danger">*</span></label>
            <select className="form-select fs-13 mb-3" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">Select reason...</option>
              {ESCALATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* Details */}
            <label className="form-label fw-medium fs-13">Additional Details <span className="text-muted fw-normal">(optional)</span></label>
            <textarea
              className="form-control fs-13"
              rows={3}
              placeholder="Describe the situation and what has been done so far..."
              value={details}
              onChange={e => setDetails(e.target.value)}
            />
          </div>
          <div className="modal-footer border-top py-3 gap-2">
            <button className="btn btn-light fs-13" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn btn-warning fs-13 d-flex align-items-center gap-2"
              onClick={handleConfirm}
              disabled={!selectedSup || !reason || busy}
            >
              {busy && <span className="spinner-border spinner-border-sm" />}
              <i className="ti ti-alert-triangle" />
              Escalate to {selectedSup?.name || '...'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ─── Refer Modal ───────────────────────────────────────────────────────────────
const REFERRAL_TYPES = [
  'Medical / Hospital',
  'Legal / Lawyer',
  'Police / Law Enforcement',
  'NGO / Partner Organisation',
  'Government Agency',
  'Safe House / Shelter',
  'Mental Health / Counselling',
  'Education / School',
  'Other',
];

interface ReferModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (data: ReferralData) => void;
  busy: boolean;
}

export interface ReferralData {
  referral_type: string;
  organisation: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  reason: string;
  notes: string;
}

export const ReferModal: React.FC<ReferModalProps> = ({ show, onClose, onConfirm, busy }) => {
  const [data, setData] = useState<ReferralData>({
    referral_type: '', organisation: '', contact_person: '',
    contact_phone: '', contact_email: '', reason: '', notes: '',
  });

  if (!show) return null;

  const f = (field: keyof ReferralData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setData(p => ({ ...p, [field]: e.target.value }));

  const handleConfirm = () => {
    if (!data.referral_type || !data.organisation || !data.reason) return;
    onConfirm(data);
    setData({ referral_type: '', organisation: '', contact_person: '', contact_phone: '', contact_email: '', reason: '', notes: '' });
  };

  const isValid = data.referral_type && data.organisation && data.reason;

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1060 }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-bottom py-3">
            <div className="d-flex align-items-center gap-2">
              <span className="avatar avatar-sm rounded-circle bg-info-transparent text-info d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                <i className="ti ti-share fs-5" />
              </span>
              <div>
                <h5 className="modal-title mb-0 fw-semibold fs-15">External Referral</h5>
                <p className="mb-0 text-muted fs-12">Refer client to an external organisation or service</p>
              </div>
            </div>
            <button className="btn-close" onClick={onClose} disabled={busy} />
          </div>
          <div className="modal-body p-4">
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Referral Type <span className="text-danger">*</span></label>
                <select className="form-select fs-13" value={data.referral_type} onChange={f('referral_type')}>
                  <option value="">Select type...</option>
                  {REFERRAL_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Organisation / Institution <span className="text-danger">*</span></label>
                <input className="form-control fs-13" placeholder="e.g. Kenyatta National Hospital" value={data.organisation} onChange={f('organisation')} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Contact Person</label>
                <input className="form-control fs-13" placeholder="Name of contact" value={data.contact_person} onChange={f('contact_person')} />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-medium fs-13">Contact Phone</label>
                <input className="form-control fs-13" placeholder="+254..." value={data.contact_phone} onChange={f('contact_phone')} />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Contact Email</label>
                <input className="form-control fs-13" type="email" placeholder="contact@organisation.org" value={data.contact_email} onChange={f('contact_email')} />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Reason for Referral <span className="text-danger">*</span></label>
                <textarea className="form-control fs-13" rows={2} placeholder="Why is the client being referred?" value={data.reason} onChange={f('reason')} />
              </div>
              <div className="col-12">
                <label className="form-label fw-medium fs-13">Additional Notes <span className="text-muted fw-normal">(optional)</span></label>
                <textarea className="form-control fs-13" rows={2} placeholder="Any specific instructions or context..." value={data.notes} onChange={f('notes')} />
              </div>
            </div>
          </div>
          <div className="modal-footer border-top py-3 gap-2">
            <button className="btn btn-light fs-13" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn btn-info text-white fs-13 d-flex align-items-center gap-2"
              onClick={handleConfirm}
              disabled={!isValid || busy}
            >
              {busy && <span className="spinner-border spinner-border-sm" />}
              <i className="ti ti-share" />
              Create Referral
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
