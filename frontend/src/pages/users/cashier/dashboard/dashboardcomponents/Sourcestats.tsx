import React, { useState, useEffect, useCallback } from 'react'
import API from '../../../../../services/api'

interface StatsData {
  calls: number;
  whatsapp: number;
  messenger: number;
  emails: number;
  instagram: number;
  cases: { total: number; open: number; closed: number; pending: number; referred: number };
}

/** Format a Date as "D Mon YY" e.g. "10 May 26" */
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** ISO date string YYYY-MM-DD */
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Sourcestats() {
  // Default: last 30 days
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(today.getDate() - 30);

  const [dateFrom, setDateFrom] = useState<Date>(thirtyAgo);
  const [dateTo, setDateTo]     = useState<Date>(today);
  const [showPicker, setShowPicker] = useState(false);
  const [tempFrom, setTempFrom] = useState(toISO(thirtyAgo));
  const [tempTo,   setTempTo]   = useState(toISO(today));

  const [stats, setStats] = useState<StatsData>({
    calls: 0, whatsapp: 0, messenger: 0, emails: 0, instagram: 0,
    cases: { total: 0, open: 0, closed: 0, pending: 0, referred: 0 },
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async (from: Date, to: Date) => {
    try {
      setLoading(true);
      const res = await API.get('counsellor-stats/', {
        params: { date_from: toISO(from), date_to: toISO(to) },
      });
      if (res.data?.success && res.data?.data) {
        const d = res.data.data;
        setStats({
          calls:     d.calls     || 0,
          whatsapp:  d.whatsapp  || 0,
          messenger: d.messenger || 0,
          emails:    d.emails    || 0,
          instagram: d.instagram || 0,
          cases:     d.cases     || { total: 0, open: 0, closed: 0, pending: 0, referred: 0 },
        });
      }
    } catch {
      // keep previous values on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(dateFrom, dateTo); }, [fetchStats, dateFrom, dateTo]);

  const applyDateRange = () => {
    const from = new Date(tempFrom);
    const to   = new Date(tempTo);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
      setDateFrom(from);
      setDateTo(to);
    }
    setShowPicker(false);
  };

  const CHANNEL_CARDS = [
    { key: 'calls' as const,     label: 'Calls',     iconCls: 'ti ti-phone',           colorCls: 'text-secondary' },
    { key: 'whatsapp' as const,  label: 'WhatsApp',  iconCls: 'ti ti-brand-whatsapp',  colorCls: 'text-success'   },
    { key: 'messenger' as const, label: 'Messenger', iconCls: 'ti ti-brand-messenger', colorCls: 'text-primary'   },
    { key: 'emails' as const,    label: 'Emails',    iconCls: 'ti ti-mail',            colorCls: 'text-danger'    },
  ];

  const CASE_CARDS = [
    { key: 'total' as const,    label: 'Total Cases',   colorCls: 'text-dark'    },
    { key: 'open' as const,     label: 'Open',          colorCls: 'text-primary' },
    { key: 'closed' as const,   label: 'Closed',        colorCls: 'text-success' },
    { key: 'pending' as const,  label: 'Pending',       colorCls: 'text-warning' },
    { key: 'referred' as const, label: 'Referred',      colorCls: 'text-info'    },
  ];

  return (
    <div className="mb-3">

      {/* ── Date Range Controls ─────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0 fw-semibold text-dark fs-14">My Activity</h6>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-light btn-sm" onClick={() => fetchStats(dateFrom, dateTo)}
            disabled={loading} title="Refresh" type="button">
            <i className={`ti ti-refresh${loading ? ' fa-spin' : ''}`} />
          </button>
          <button className="btn btn-light btn-sm" onClick={() => window.print()} title="Print" type="button">
            <i className="ti ti-printer" />
          </button>
          <div className="position-relative">
            <button className="btn btn-light btn-sm d-flex align-items-center gap-2 fs-13"
              onClick={() => setShowPicker(s => !s)} type="button">
              <i className="ti ti-calendar text-muted" />
              <span>{fmtDate(dateFrom)} – {fmtDate(dateTo)}</span>
              <i className="ti ti-chevron-down text-muted" />
            </button>
            {showPicker && (
              <div className="card shadow border position-absolute end-0 mt-1 p-3"
                style={{ zIndex: 1050, minWidth: 260 }} onClick={e => e.stopPropagation()}>
                <div className="mb-2">
                  <label className="form-label fs-12 text-muted mb-1">From</label>
                  <input type="date" className="form-control form-control-sm" value={tempFrom}
                    max={tempTo} onChange={e => setTempFrom(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fs-12 text-muted mb-1">To</label>
                  <input type="date" className="form-control form-control-sm" value={tempTo}
                    min={tempFrom} max={toISO(new Date())} onChange={e => setTempTo(e.target.value)} />
                </div>
                <div className="d-flex flex-wrap gap-1 mb-3">
                  {[{ label: 'Today', days: 0 }, { label: '7 days', days: 7 },
                    { label: '30 days', days: 30 }, { label: '90 days', days: 90 }].map(p => (
                    <button key={p.label} type="button"
                      className="btn btn-outline-secondary btn-sm fs-11 py-0 px-2"
                      onClick={() => {
                        const t = new Date(); const f = new Date(t);
                        f.setDate(t.getDate() - p.days);
                        setTempFrom(toISO(f)); setTempTo(toISO(t));
                      }}>{p.label}</button>
                  ))}
                </div>
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm flex-fill" onClick={applyDateRange}>Apply</button>
                  <button type="button" className="btn btn-light btn-sm" onClick={() => setShowPicker(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── All Stats — single row ───────────────────────── */}
      <div className="row g-2">
        {CHANNEL_CARDS.map(card => (
          <div className="col" key={card.key}>
            <div className="card h-100 mb-0">
              <div className="card-body d-flex align-items-center py-2 px-3">
                <i className={`${card.iconCls} fs-4 ${card.colorCls} me-2`} />
                <div>
                  <small className="text-muted d-block lh-1">{card.label}</small>
                  <h5 className="mb-0">
                    {loading
                      ? <span className="placeholder-glow"><span className="placeholder col-6" /></span>
                      : stats[card.key].toLocaleString()}
                  </h5>
                </div>
              </div>
            </div>
          </div>
        ))}
        {CASE_CARDS.map(card => (
          <div className="col" key={card.key}>
            <div className="card h-100 mb-0">
              <div className="card-body py-2 px-3 text-center">
                <small className="text-muted d-block lh-1">{card.label}</small>
                <h5 className={`mb-0 ${card.colorCls}`}>
                  {loading
                    ? <span className="placeholder-glow"><span className="placeholder col-6" /></span>
                    : stats.cases[card.key].toLocaleString()}
                </h5>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showPicker && (
        <div className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1040 }}
          onClick={() => setShowPicker(false)} />
      )}
    </div>
  );
}

export default Sourcestats;
