import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API from '../../../../../services/api';

interface CallRecord {
  id: string;
  conversation_id: number;
  contact_name: string;
  contact_phone: string;
  call_type: 'incoming' | 'outgoing';
  status: 'initiating' | 'ringing' | 'connected' | 'ended' | 'failed';
  started_at: string | null;
  connected_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  duration_formatted: string | null;
}

export const CallHistory: React.FC = () => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'failed' | 'ended'>('all');

  useEffect(() => {
    fetchCalls();
  }, []);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const response = await API.get('whatsapp/calls/history/');
      if (response.data.success) {
        setCalls(response.data.calls);
      }
    } catch (err: any) {
      console.error('Failed to fetch call history:', err);
      setError(err.response?.data?.error || 'Failed to load call history');
    } finally {
      setLoading(false);
    }
  };

  const filteredCalls = calls.filter(call => {
    if (filter !== 'all' && call.call_type !== filter) return false;
    if (statusFilter !== 'all' && call.status !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; icon: string }> = {
      initiating: { class: 'bg-info', icon: 'ti ti-phone' },
      ringing: { class: 'bg-warning', icon: 'ti ti-phone-calling' },
      connected: { class: 'bg-success', icon: 'ti ti-phone-check' },
      ended: { class: 'bg-secondary', icon: 'ti ti-phone-off' },
      failed: { class: 'bg-danger', icon: 'ti ti-phone-x' },
    };
    const badge = badges[status] || badges.initiating;
    return (
      <span className={`badge ${badge.class}`}>
        <i className={`${badge.icon} me-1`}></i>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTypeIcon = (callType: string) => {
    if (callType === 'incoming') {
      return <i className="ti ti-arrow-down-left text-success me-1" title="Incoming"></i>;
    }
    return <i className="ti ti-arrow-up-right text-primary me-1" title="Outgoing"></i>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2 text-muted">Loading call history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-body text-center py-5">
          <i className="ti ti-alert-circle text-danger fs-1 mb-2"></i>
          <p className="text-danger">{error}</p>
          <button className="btn btn-primary btn-sm" onClick={fetchCalls}>
            <i className="ti ti-refresh me-1"></i> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header bg-white">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h5 className="card-title mb-0">
            <i className="ti ti-phone-calling me-2"></i>
            WhatsApp Call History
          </h5>
          <div className="d-flex gap-2">
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
            >
              <option value="all">All Calls</option>
              <option value="incoming">Incoming Only</option>
              <option value="outgoing">Outgoing Only</option>
            </select>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">All Statuses</option>
              <option value="connected">Connected</option>
              <option value="ended">Ended</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card-body p-0">
        {filteredCalls.length === 0 ? (
          <div className="text-center py-5">
            <i className="ti ti-phone-off text-muted fs-1 mb-2"></i>
            <p className="text-muted mb-0">No calls found</p>
            <small className="text-muted">Call history will appear here when calls are made or received</small>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover table-nowrap mb-0">
              <thead className="bg-light">
                <tr>
                  <th style={{ width: '40px' }}>Type</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => (
                  <tr key={call.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        {getTypeIcon(call.call_type)}
                      </div>
                    </td>
                    <td>
                      <div className="fw-semibold">{call.contact_name}</div>
                    </td>
                    <td>
                      <small className="text-muted">{call.contact_phone}</small>
                    </td>
                    <td>{getStatusBadge(call.status)}</td>
                    <td>
                      <small>{formatDate(call.started_at)}</small>
                    </td>
                    <td>
                      {call.duration_formatted ? (
                        <span className="badge bg-light text-dark">
                          <i className="ti ti-clock me-1"></i>
                          {call.duration_formatted}
                        </span>
                      ) : (
                        <small className="text-muted">--</small>
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/conversations/${call.conversation_id}/`}
                        className="btn btn-sm btn-icon btn-light"
                        title="View Conversation"
                      >
                        <i className="ti ti-message"></i>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredCalls.length > 0 && (
        <div className="card-footer bg-white">
          <div className="d-flex justify-content-between align-items-center">
            <small className="text-muted">
              Showing {filteredCalls.length} of {calls.length} calls
            </small>
            <button className="btn btn-sm btn-light" onClick={fetchCalls}>
              <i className="ti ti-refresh me-1"></i> Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
