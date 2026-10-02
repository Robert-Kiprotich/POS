import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { useSelector } from "react-redux"; 
import API from "../../../../services/api";
import { all_routes } from "../../../../routes/all_routes";
import wsService from "../../../../services/websocket";
import CaseModal from "../../cashier/dashboard/dashboardcomponents/modals/modalCases"; 
import type { MessageItem } from "../../cashier/dashboard/dashboardcomponents/Chat"; 
import { getCalls } from "../../../../services/Services"; 

import NotificationToast from "../../cashier/dashboard/dashboardcomponents/NotificationToast";
import { toast } from "../../../../utils/toast";

const route = all_routes;

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

const DIRECTION_META: Record<string, { icon: string; color: string; label: string }> = {
  inbound:  { icon: "ti ti-phone-incoming", color: "text-success", label: "Inbound" },
  outbound: { icon: "ti ti-phone-outgoing", color: "text-primary", label: "Outbound" },
};

const RESULT_BADGE: Record<string, string> = {
  answered:  "badge bg-success-transparent text-success",
  abandoned: "badge bg-danger-transparent text-danger",
  missed:    "badge bg-warning-transparent text-warning",
  busy:      "badge bg-info-transparent text-info",
  unknown:   "badge bg-secondary-transparent text-secondary",
};

interface Stats {
  total_conversations: number;
  total_messages: number;
  total_contacts: number;
  unread_messages: number;
  by_channel: Record<string, { conversations: number; messages: number; unread: number }>;
  by_status: Record<string, number>;
  agents_online: number;
}

interface CallRecord {
  id: string;
  agent: { id?: number; full_name: string } | null;
  created_at: string;
  updated_at: string;
  channel_id: string;
  direction: string;
  caller_number: string;
  caller_name: string;
  dialed_number: string;
  result: string | null;
  received_at: string;
  queued_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  wait_seconds: number | null;
  talk_seconds: number | null;
  call_duration: number | null;
  hold_time: number | null;
  call_qadone: boolean;
  hangup_cause: string;
  queue: string;
}

interface AssignableUser {
  id: number;
  name: string;
  role: string;
}

interface Agent {
  id: number;
  name: string;
  role: string;
  active_chats: number;
  max_chats: number;
  workload_pct: number;
  can_accept: boolean;
  status: string;
  conversations: { id: string; contact: string; channel: string; status: string; last_message: string; unread: number }[];
}

export default function Calls() {
  const [stats, setStats]             = useState<Stats | null>(null);
  const [calls, setCalls]             = useState<CallRecord[]>([]);
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<string>("all");
  const [refreshing, setRefreshing]   = useState(false);
  
  // Modal Evaluation States
  const [monitored, setMonitored]     = useState<CallRecord | null>(null);
  const [monitoredConvId, setMonitoredConvId] = useState<string | null>(null);
  const [assignUsers, setAssignUsers] = useState<AssignableUser[]>([]);
  const [supervisorUsers, setSupervisorUsers] = useState<AssignableUser[]>([]);
  const [showAssign, setShowAssign]   = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [actionBusy, setActionBusy]   = useState(false);

  // QA scorecard fields form metrics state
  const [metricGreeting, setMetricGreeting]   = useState(5);
  const [metricListening, setMetricListening] = useState(5);
  const [metricAccuracy, setMetricAccuracy]   = useState(5);
  const [metricCompliance, setMetricCompliance] = useState(5);
  const [supervisorNotes, setSupervisorNotes] = useState("");

  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const currentUser = useSelector((state: any) => state.auth?.user);
  console.log("Current User from Redux Store:", currentUser);

  // Dynamic values derived from currentUser
  const userRole = currentUser?.role_name || currentUser?.role;
  const userName = currentUser?.first_name 
    ? `${currentUser.first_name} ${currentUser.last_name || ""}`.trim()
    : currentUser?.full_name || currentUser?.username || "";

  const [activeThread, setActiveThread] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [chatContextMessages, setChatContextMessages] = useState<MessageItem[]>([]);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const load = useCallback(async () => {
    try {
      const [callsRes, statsRes, teamRes] = await Promise.allSettled([
        getCalls(),
        API.get("statistics/"),
        API.get("team/workload/"),
      ]);

      if (callsRes.status === "fulfilled") {
        setCalls(callsRes.value.slice(0, 50));
      }

      if (statsRes.status === "fulfilled" && statsRes.value.data?.success) {
        const d = statsRes.value.data.data;
        setStats({
          total_conversations: d.total_conversations || 0,
          total_messages: d.total_messages || 0,
          total_contacts: 0,
          unread_messages: 0,
          by_channel: {
            inbound:  { conversations: d.breakdown?.inbound?.conversations  || 0, messages: 0, unread: 0 },
            outbound: { conversations: d.breakbound?.outbound?.conversations || 0, messages: 0, unread: 0 },
          },
          by_status: {},
          agents_online: 0,
        });
      }

      if (teamRes.status === "fulfilled" && teamRes.value.data?.team_workload) {
        const team = teamRes.value.data.team_workload;
        setAgents(
          team.map((m: any) => ({
            id: m.counsellor_id,
            name: m.counsellor_name,
            role: m.role || "Counsellor",
            active_chats: m.active_chats || 0,
            max_chats: m.max_chats || 5,
            workload_pct: m.workload_pct || 0,
            can_accept: m.can_accept ?? true,
            status: m.status || "available",
            conversations: m.conversations || [],
          }))
        );
      }
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    API.get('assignable-users/').then(r => {
      if (r.data?.users) setAssignUsers(r.data.users);
    }).catch(() => {});
    API.get('supervisors/').then(r => {
      if (r.data?.supervisors) setSupervisorUsers(r.data.supervisors);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    wsService.connect();
    const unsub = wsService.onMessage((data: any) => {
      if (data.type !== 'new_call' && data.type !== 'call_updated') return;
      setCalls(prev => {
        const index = prev.findIndex(c => c.id === data.call?.id);
        if (index !== -1) {
          return prev.map(c => c.id === data.call.id ? { ...c, ...data.call } : c);
        }
        return [data.call, ...prev].slice(0, 50);
      });
    });
    return () => unsub();
  }, []);

  // Open the sliding sheet interface using Bootstrap Instance rules
  const openQAInspector = async (call: CallRecord) => {
    setMonitored(call);
    setMonitoredConvId(null);
    setMetricGreeting(5);
    setMetricListening(5);
    setMetricAccuracy(5);
    setMetricCompliance(5);
    setSupervisorNotes("");
    setShowAssign(false);
    setShowTransfer(false);
    // Resolve linked inbox conversation by caller number
    if (call.caller_number) {
      try {
        const r = await API.get(`conversation-by-phone/?phone=${encodeURIComponent(call.caller_number)}`);
        if (r.data?.conversation_id) setMonitoredConvId(r.data.conversation_id);
      } catch { /* no linked conversation — buttons will be disabled */ }
    }

    const element = document.getElementById("offcanvas_qa_evaluation");
    if (!element) return;
    const bootstrap = (window as any).bootstrap;
    const bsOffcanvas = bootstrap?.Offcanvas?.getOrCreateInstance(element);
    bsOffcanvas?.show();
  };

  const totalScorePossible = 20; 
  const currentTotalScore = metricGreeting + metricListening + metricAccuracy + metricCompliance;
  const evaluationPercentage = Math.round((currentTotalScore / totalScorePossible) * 100);

  const submitQAEvaluation = async () => {
    if (!monitored) return;
    setActionBusy(true);
    try {
      const payload = {
        call_id: monitored.id,
        scores: {
          greeting: metricGreeting,
          active_listening: metricListening,
          solution_accuracy: metricAccuracy,
          compliance: metricCompliance
        },
        percentage: evaluationPercentage,
        notes: supervisorNotes,
        evaluated_by: currentUser?.id || null
      };

      await API.post(`calls/evaluations/`, payload);
      toast.success("QA Evaluation saved successfully!");
      
      const element = document.getElementById("offcanvas_qa_evaluation");
      const bootstrap = (window as any).bootstrap;
      const bsOffcanvas = bootstrap?.Offcanvas?.getInstance(element);
      bsOffcanvas?.hide();

      setMonitored(null);
      load();
    } catch (err) {
      toast.error("Failed to save evaluation. Please try again.");
    } finally {
      setActionBusy(false);
    }
  };

  const doAction = async (url: string, body: object, successMsg: string) => {
    setActionBusy(true);
    try {
      const res = await API.post(url, body);
      toast.success(res.data?.message || successMsg);
      load();
    } catch { toast.error('Action failed. Please try again.'); }
    finally { setActionBusy(false); setShowAssign(false); setShowTransfer(false); }
  };

  const handleRefresh = () => { setRefreshing(true); load(); };

  const resultCounts = calls.reduce<Record<string, number>>((acc, c) => {
    const currentResult = c.result || "unknown";
    acc[currentResult] = (acc[currentResult] || 0) + 1;
    return acc;
  }, {});

  const filtered = filter === "all"
    ? calls
    : calls.filter(c => (c.result || "unknown") === filter || c.direction === filter);

  const STAT_CARDS = [
    { label: "Total Managed Calls",  value: stats?.total_conversations ?? "—", icon: "ti ti-phone-call", colorCls: "bg-primary-transparent text-primary" },
    { label: "Abandoned Calls",     value: resultCounts["abandoned"] || 0,    icon: "ti ti-phone-x",    colorCls: "bg-danger-transparent text-danger" },
    { label: "Answered Calls",      value: resultCounts["answered"] || 0,     icon: "ti ti-phone-check", colorCls: "bg-success-transparent text-success" },
    { label: "Active Agents Online", value: agents.filter(a => a.status === "available").length, icon: "ti ti-users", colorCls: "bg-info-transparent text-info" },
  ];

  return (
    <>
      <NotificationToast />
      <CaseModal
        showChat={showChat}
        activeThread={activeThread}
        chatContextMessages={chatContextMessages}
        onSendMessage={(text) => console.log("Supervisor Note/Msg:", text)}
        onSendFile={(file) => console.log("Supervisor attached File:", file.name)}
      />
  
      <div className="page-wrapper">
        <div className="content">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
            <div>
              <h4 className="mb-1 fw-semibold">
                {userRole} Telephony Dashboard {userName ? `— ${userName}` : ""}
              </h4>
              <p className="text-muted fs-13 mb-0">Real-time oversight of all queues, call flows, and active handles.</p>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={handleRefresh} disabled={refreshing}>
                <i className={`ti ti-refresh ${refreshing ? "fa-spin" : ""}`} /> Refresh
              </button>
              <Link to={route.platformSettings} className="btn btn-primary btn-sm d-flex align-items-center gap-1">
                <i className="ti ti-settings" /> Platform Settings
              </Link>
            </div>
          </div>

          {/* ── Stat Cards ──────────────────────────────────────────────── */}
          <div className="row g-3 mb-4">
            {STAT_CARDS.map(card => (
              <div className="col-xl-3 col-sm-6" key={card.label}>
                <div className="card h-100 shadow-none border">
                  <div className="card-body d-flex align-items-center gap-3 py-3">
                    <span className={`avatar avatar-lg rounded-circle d-flex align-items-center justify-content-center ${card.colorCls}`} style={{ width: 48, height: 48 }}>
                      <i className={`${card.icon} fs-4`} />
                    </span>
                    <div>
                      <p className="text-muted fs-12 mb-1">{card.label}</p>
                      <h4 className="mb-0 fw-bold">{loading ? <span className="placeholder-glow"><span className="placeholder col-6" /></span> : card.value.toLocaleString()}</h4>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-3">
            {/* ── Call Streams Log Table ──────────────────────────────────── */}
            <div className="col-xl-8">
              <div className="card shadow-none border h-100">
                <div className="card-header border-bottom d-flex align-items-center justify-content-between py-3">
                  <h6 className="mb-0 fw-semibold fs-14">Live Call Logs</h6>
                  <div className="d-flex gap-2 flex-wrap">
                    {["all", "answered", "abandoned", "inbound", "outbound"].map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline-secondary"} fs-11 py-1 px-2 text-capitalize`}
                      >
                        {f === "all" ? `All (${calls.length})` : `${f} (${resultCounts[f] || 0})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card-body p-0" style={{ overflowY: "auto", maxHeight: 480 }}>
                  {loading ? (
                    <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
                      <span className="spinner-border spinner-border-sm me-2" />Loading Telephony Streams…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
                      <i className="ti ti-phone-off me-2" />No calls matching the filtered scope found.
                    </div>
                  ) : (
                    <table className="table table-hover mb-0 fs-13">
                      <thead className="table-light">
                        <tr>
                          <th className="ps-3">Caller Identity</th>
                          <th>Direction</th>
                          <th>Outcome</th>
                          <th>Queue / Agent</th>
                          <th>Duration</th>
                          <th>QA Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(call => {
                          const dir = DIRECTION_META[call.direction] || { icon: "ti ti-phone", color: "text-muted", label: call.direction };
                          return (
                            <tr key={call.id} onClick={() => openQAInspector(call)} style={{ cursor: 'pointer' }}>
                              <td className="ps-3">
                                <div className="d-flex align-items-center gap-2">
                                  <span className="avatar avatar-xs rounded-circle bg-light text-dark fw-semibold d-flex align-items-center justify-content-center" style={{ width: 28, height: 28, fontSize: 11 }}>
                                    <i className="ti ti-user fs-12" />
                                  </span>
                                  <div className="d-flex flex-column">
                                    <span className="fw-medium text-dark">{call.caller_name || "Unknown Caller"}</span>
                                    <span className="text-muted fs-11">{call.caller_number}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`d-flex align-items-center gap-1 ${dir.color}`}>
                                  <i className={dir.icon} />
                                  <span className="d-none d-lg-inline">{dir.label}</span>
                                </span>
                              </td>
                              <td>
                                <span className={RESULT_BADGE[call.result || "unknown"]}>{call.result || "Active / Queued"}</span>
                              </td>
                              <td>
                                <div className="d-flex flex-column">
                                  <span className="text-dark fs-12 text-truncate" style={{ maxWidth: 120 }}>
                                    {call.agent?.full_name || <span className="text-danger fs-11">Not Assigned</span>}
                                  </span>
                                </div>
                              </td>
                              <td className="text-muted fw-medium">{formatDuration(call.call_duration)}</td>
                              <td>
                                <span className={`badge ${call.call_qadone ? 'bg-success-transparent text-success' : 'bg-warning-transparent text-warning'}`}>
                                  {call.call_qadone ? '✅ Evaluated' : '⏳ Pending QA'}
                                </span>
                              </td>
                              <td>
                                <button className="btn btn-xs btn-primary fs-11 py-1 px-2" onClick={e => { e.stopPropagation(); openQAInspector(call); }}>
                                  <i className="ti ti-checklist me-1" />Evaluate
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right Column (Direction Summary & Workload Metrics) ─── */}
            <div className="col-xl-4 d-flex flex-column gap-3">
              <div className="card shadow-none border">
                <div className="card-header border-bottom py-3">
                  <h6 className="mb-0 fw-semibold fs-14">Direction Breakdown</h6>
                </div>
                <div className="card-body py-2 px-3">
                  {Object.entries(DIRECTION_META).map(([key, meta]) => {
                    const matchedCount = calls.filter(c => c.direction === key).length;
                    return (
                      <div key={key} className="d-flex align-items-center justify-content-between py-2 border-bottom">
                        <div className="d-flex align-items-center gap-2">
                          <i className={`${meta.icon} ${meta.color} fs-5`} />
                          <span className="fs-13 fw-medium">{meta.label}</span>
                        </div>
                        <div><span className="badge bg-light text-dark fs-11">{loading ? "—" : `${matchedCount} calls`}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card shadow-none border flex-fill">
                <div className="card-header border-bottom py-3">
                  <h6 className="mb-0 fw-semibold fs-14">Agent Capacity Registry</h6>
                </div>
                <div className="card-body py-2 px-3" style={{ overflowY: 'auto', maxHeight: 340 }}>
                  {loading ? (
                    <div className="d-flex align-items-center justify-content-center py-3 text-muted fs-13"><span className="spinner-border spinner-border-sm me-2" />Loading Matrix…</div>
                  ) : agents.length === 0 ? (
                    <div className="d-flex align-items-center justify-content-center py-3 text-muted fs-13"><i className="ti ti-users me-2" />No line agents found.</div>
                  ) : (
                    agents.map(agent => (
                      <div key={agent.id} className="mb-3 pb-3 border-bottom">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <span className="avatar avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-primary text-white fw-semibold" style={{ width: 30, height: 30, fontSize: 12 }}>
                              {agent.name.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <p className="mb-0 fs-13 fw-medium">{agent.name}</p>
                              <p className="mb-0 fs-11 text-muted">{agent.role}</p>
                            </div>
                          </div>
                          <div className="text-end">
                            <span className={`badge fs-10 ${agent.status === 'available' ? 'bg-success-transparent text-success' : 'bg-warning-transparent text-warning'}`}>{agent.status}</span>
                            <p className="mb-0 fs-11 text-muted mt-1">{agent.active_chats}/{agent.max_chats} active</p>
                          </div>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <div className={`progress-bar ${agent.workload_pct >= 80 ? 'bg-danger' : 'bg-success'}`} style={{ width: `${Math.min(agent.workload_pct, 100)}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sliding Side-Drawer Component Template Hook */}
        <ModalQaEvaluation
          monitored={monitored}
          metricGreeting={metricGreeting}
          setMetricGreeting={setMetricGreeting}
          metricListening={metricListening}
          setMetricListening={setMetricListening}
          metricAccuracy={metricAccuracy}
          setMetricAccuracy={setMetricAccuracy}
          metricCompliance={metricCompliance}
          setMetricCompliance={setMetricCompliance}
          supervisorNotes={supervisorNotes}
          setSupervisorNotes={setSupervisorNotes}
          evaluationPercentage={evaluationPercentage}
          currentTotalScore={currentTotalScore}
          actionBusy={actionBusy}
          onSubmit={submitQAEvaluation}
          formatDuration={formatDuration}
          resultBadgeClass={RESULT_BADGE}
          assignUsers={assignUsers}
          supervisors={supervisorUsers}
          doAction={doAction}
          conversationId={monitoredConvId}
        />
      </div>
    </>
  );
}