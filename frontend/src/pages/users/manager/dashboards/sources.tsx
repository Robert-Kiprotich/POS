import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import API from "../../../../services/api";
import { all_routes } from "../../../../routes/all_routes";
import wsService from "../../../../services/websocket";
import { proxyMediaUrl, proxyMediaById } from "../../../../services/mediaProxy";
import { toast, confirm } from "../../../../utils/toast";


import CaseModal from "../../cashier/dashboard/dashboardcomponents/modals/modalCases"; // Adjust this import path depending on where modalCases.tsx sits relative to this dashboard
import type { MessageItem } from "../../cashier/dashboard/dashboardcomponents/Chat"; // Import definition types if needed


const route = all_routes;

/** Format ISO timestamp to a short relative label */
function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CHANNEL_META: Record<string, { icon: string; color: string; label: string }> = {
  whatsapp:  { icon: "ti ti-brand-whatsapp", color: "text-success",  label: "WhatsApp" },
  facebook:  { icon: "ti ti-brand-messenger", color: "text-primary", label: "Messenger" },
  instagram: { icon: "ti ti-brand-instagram", color: "text-danger",  label: "Instagram" },
  email:     { icon: "ti ti-mail",            color: "text-warning", label: "Email" },
};

/** Render a last_message_preview string — replaces bracketed placeholders with icons */
function renderPreview(preview: string): JSX.Element {
  if (!preview) return <span className="text-muted fst-italic">—</span>;
  // Map known bracket patterns to icon + label
  const mediaMap: Record<string, { icon: string; label: string }> = {
    '[image]':    { icon: 'ti ti-photo',        label: 'Image' },
    '[video]':    { icon: 'ti ti-video',         label: 'Video' },
    '[audio]':    { icon: 'ti ti-music',         label: 'Audio' },
    '[sticker]':  { icon: 'ti ti-mood-smile',    label: 'Sticker' },
    '[document]': { icon: 'ti ti-file',          label: 'Document' },
    '[file]':     { icon: 'ti ti-paperclip',     label: 'File' },
  };
  const key = preview.trim().toLowerCase();
  if (mediaMap[key]) {
    const m = mediaMap[key];
    return (
      <span className="d-flex align-items-center gap-1 text-muted fst-italic">
        <i className={m.icon} /> {m.label}
      </span>
    );
  }
  // Emoji prefix patterns from backend (e.g. "📷 Image", "📄 Document: filename.pdf")
  return <span>{preview}</span>;
}

const STATUS_BADGE: Record<string, string> = {
  open:     "badge bg-success-transparent text-success",
  assigned: "badge bg-primary-transparent text-primary",
  pending:  "badge bg-warning-transparent text-warning",
  resolved: "badge bg-secondary-transparent text-secondary",
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

interface Conversation {
  id: number;
  contact: { name: string; profile_picture?: string };
  channel: string;
  status: string;
  priority: string;
  unread_count: number;
  last_message_preview: string;
  last_message_at: string;
  assigned_to?: { id?: number; full_name: string } | null;
}

interface LiveMessage {
  id: number;
  direction: string;
  content: string;
  message_type: string;
  created_at: string;
  media_url?: string;
  filename?: string;
  metadata?: Record<string, any>;
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
  status: 'available' | 'busy' | 'away' | 'offline';
  conversations: { id: number; contact: string; channel: string; status: string; last_message: string; unread: number }[];
}

export default function SourcesDashboard() {
  const [stats, setStats]             = useState<Stats | null>(null);
  const [conversations, setConvs]     = useState<Conversation[]>([]);
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<string>("all");
  const [refreshing, setRefreshing]   = useState(false);
  // Monitor panel state
  const [monitored, setMonitored]     = useState<Conversation | null>(null);
  const [liveMessages, setLiveMsgs]   = useState<LiveMessage[]>([]);
  const [msgLoading, setMsgLoading]   = useState(false);
  const [assignUsers, setAssignUsers] = useState<AssignableUser[]>([]);
  const [showAssign, setShowAssign]   = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [actionBusy, setActionBusy]   = useState(false);
  const msgBottomRef                  = useRef<HTMLDivElement>(null);

  // 2. Dynamic responsiveness + state-driven layout handling
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const currentUser = useSelector((state: any) => state.auth?.user);

  const isCounsellor = currentUser?.role === "Counsellor" || currentUser?.groups?.includes("Counsellor");


   // 2. Set up local state variables for CaseModal integration
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
      const [convRes, statsRes, teamRes] = await Promise.allSettled([
        API.get("conversations/"),
        API.get("statistics/"),
        API.get("team/workload/"),
      ]);

      if (convRes.status === "fulfilled" && convRes.value.data?.conversations) {
        setConvs(convRes.value.data.conversations.slice(0, 50));
      }

      if (statsRes.status === "fulfilled" && statsRes.value.data?.success) {
        const d = statsRes.value.data.data;
        setStats({
          total_conversations: d.total_conversations || 0,
          total_messages: d.total_messages || 0,
          total_contacts: 0,
          unread_messages: 0,
          by_channel: {
            whatsapp:  { conversations: d.breakdown?.whatsapp?.conversations  || 0, messages: d.whatsapp  || 0, unread: 0 },
            facebook:  { conversations: d.breakdown?.facebook?.conversations  || 0, messages: d.messenger || 0, unread: 0 },
            email:     { conversations: d.breakdown?.email?.conversations     || 0, messages: d.emails    || 0, unread: 0 },
            instagram: { conversations: d.breakdown?.instagram?.conversations || 0, messages: d.instagram || 0, unread: 0 },
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
      // keep previous data
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
  }, []);

  useEffect(() => {
    wsService.connect();
    const unsub = wsService.onMessage((data: any) => {
      if (data.type === 'team_status_update') {
        // Live counsellor availability change — patch the agents list in place
        setAgents(prev => {
          const exists = prev.some(a => a.id === data.counsellor_id);
          if (!exists) {
            // New agent connecting for the first time — add them
            return [...prev, {
              id: data.counsellor_id,
              name: data.name,
              role: data.role || '',
              active_chats: data.active_chats,
              max_chats: data.max_chats || 5,
              workload_pct: data.workload_pct || 0,
              can_accept: data.can_accept,
              status: data.status,
              conversations: [],
            }];
          }
          return prev.map(a => a.id === data.counsellor_id
            ? { ...a, status: data.status, can_accept: data.can_accept,
                active_chats: data.active_chats, workload_pct: data.workload_pct }
            : a
          );
        });
        return;
      }

      if (data.type !== 'new_message') return;
      const { conversation_id, message } = data;
      setConvs(prev => prev.map(c => c.id === conversation_id
        ? {
            ...c,
            last_message_preview: message?.content || c.last_message_preview,
            last_message_at: message?.created_at || c.last_message_at
          }
        : c
      ));
      setMonitored(prev => {
        if (prev && prev.id === conversation_id) {
          setLiveMsgs(m => m.find(x => x.id === message?.id) ? m : [...m, {
            id: message.id || Date.now(),
            direction: message.direction,
            content: message.content || '',
            message_type: message.message_type || 'text',
            created_at: message.created_at || new Date().toISOString(),
            media_url: message.media_url || '',
            filename: message.filename || message.metadata?.filename || '',
            metadata: message.metadata || {},
          }]);
        }
        return prev;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveMessages]);

  const openMonitor = async (conv: Conversation) => {
    setMonitored(conv);
    setLiveMsgs([]);
    setMsgLoading(true);
    setShowAssign(false);
    setShowTransfer(false);
    try {
      const res = await API.get(`conversations/${conv.id}/`);
      if (res.data?.messages) {
        setLiveMsgs(res.data.messages.map((m: any) => ({
          id: m.id,
          direction: m.direction,
          content: m.content || '',
          message_type: m.message_type || 'text',
          created_at: m.created_at,
          media_url: m.media_url || m.metadata?.media_url || '',
          filename: m.filename || m.metadata?.filename || '',
          metadata: m.metadata || {},
        })));
      }
    } catch {}
    setMsgLoading(false);
  };

  const doAction = async (url: string, body: object, successMsg: string, closeMonitor = false) => {
    setActionBusy(true);
    try {
      const res = await API.post(url, body);
      toast.success(res.data?.message || successMsg);
      load();
      if (closeMonitor) setMonitored(null);
    } catch { toast.error('Action failed. Please try again.'); }
    finally { setActionBusy(false); setShowAssign(false); setShowTransfer(false); }
  };

  const handleRefresh = () => { setRefreshing(true); load(); };

  const statusCounts = conversations.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const filtered = filter === "all"
    ? conversations
    : conversations.filter(c => c.status === filter || c.channel === filter);

  const STAT_CARDS = [
    { label: "Total Conversations", value: stats?.total_conversations ?? "—", icon: "ti ti-messages", colorCls: "bg-primary-transparent text-primary" },
    { label: "Total Messages",      value: stats?.total_messages      ?? "—", icon: "ti ti-message",  colorCls: "bg-success-transparent text-success" },
    { label: "Unread Messages",     value: totalUnread,                        icon: "ti ti-bell",     colorCls: "bg-warning-transparent text-warning" },
    { label: "Active Agents",       value: agents.filter(a => a.status === "available").length, icon: "ti ti-users", colorCls: "bg-info-transparent text-info" },
  ];


  
    // Helper utility to launch the offcanvas using bootstrap's runtime API methods safely
    const triggerModalOpen = () => {
      const element = document.getElementById("offcanvas_add");
      if (!element) return;
      
      // Fallback safe checks if bootstrap isn't instantly available globally
      const bootstrap = (window as any).bootstrap;
      const bsOffcanvas = bootstrap?.Offcanvas?.getOrCreateInstance(element);
      bsOffcanvas?.show();
    };
  
    // 3. Setup event listeners to catch the Header component event dispatch signals
    useEffect(() => {
      const handleGlobalCreateCaseFlow = () => {
        // Clear out thread contexts since this is an isolated standalone manual case entry layout view
        setShowChat(false);
        setActiveThread(null);
        setChatContextMessages([]);
        
        // Fire the offcanvas show command safely
        setTimeout(() => {
          triggerModalOpen();
        }, 50);
      };
  
      window.addEventListener("trigger-create-case-flow", handleGlobalCreateCaseFlow);
      
      return () => {
        window.removeEventListener("trigger-create-case-flow", handleGlobalCreateCaseFlow);
      };
    }, []);

  return (
<>
    <CaseModal
        showChat={showChat}
        activeThread={activeThread}
        chatContextMessages={chatContextMessages}
        onSendMessage={(text) => console.log("Supervisor Note/Msg:", text)}
        onSendFile={(file) => console.log("Supervisor attached File:", file.name)}
      />
  
    <div 
      className="page-wrapper">
      <div className="content">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
          <div>
            <h4 className="mb-1 fw-semibold">Sources Dashboard</h4>
            <p className="text-muted fs-13 mb-0">Real-time monitoring of all channels, conversations and agents.</p>
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <i className={`ti ti-refresh ${refreshing ? "fa-spin" : ""}`} />
              Refresh
            </button>
            <Link to={route.platformSettings} className="btn btn-primary btn-sm d-flex align-items-center gap-1">
              <i className="ti ti-settings" />
              Platform Settings
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
                    <h4 className="mb-0 fw-bold">
                      {loading
                        ? <span className="placeholder-glow"><span className="placeholder col-6" /></span>
                        : card.value.toLocaleString()}
                    </h4>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="row g-3">

          {/* ── Conversations Table ──────────────────────────────────── */}
          <div className="col-xl-8">
            <div className="card shadow-none border h-100">
              <div className="card-header border-bottom d-flex align-items-center justify-content-between py-3">
                <h6 className="mb-0 fw-semibold fs-14">All Conversations</h6>
                <div className="d-flex gap-2 flex-wrap">
                  {["all", "open", "assigned", "pending", "resolved"].map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline-secondary"} fs-11 py-1 px-2 text-capitalize`}
                    >
                      {f === "all" ? `All (${conversations.length})` : `${f} (${statusCounts[f] || 0})`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card-body p-0" style={{ overflowY: "auto", maxHeight: 480 }}>
                {loading ? (
                  <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
                    <span className="spinner-border spinner-border-sm me-2" />Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="d-flex align-items-center justify-content-center py-5 text-muted fs-13">
                    <i className="ti ti-inbox me-2" />No conversations found.
                  </div>
                ) : (
                  <table className="table table-hover mb-0 fs-13">
                    <thead className="table-light">
                      <tr>
                        <th className="ps-3">Contact</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th>Assigned</th>
                        <th>Last Message</th>
                        <th>Time</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(conv => {
                        const ch = CHANNEL_META[conv.channel] || { icon: "ti ti-message", color: "text-muted", label: conv.channel };
                        return (
                          <tr key={conv.id} onClick={() => openMonitor(conv)} style={{ cursor: 'pointer' }}
                            className={monitored?.id === conv.id ? 'table-primary' : ''}>
                            <td className="ps-3">
                              <div className="d-flex align-items-center gap-2">
                                <span className="avatar avatar-xs rounded-circle bg-light text-dark fw-semibold d-flex align-items-center justify-content-center" style={{ width: 28, height: 28, fontSize: 11 }}>
                                  {(conv.contact?.name || "?").charAt(0).toUpperCase()}
                                </span>
                                <span className="fw-medium text-dark text-truncate" style={{ maxWidth: 120 }}>
                                  {conv.contact?.name || "Unknown"}
                                </span>
                                {conv.unread_count > 0 && (
                                  <span className="badge bg-danger rounded-pill" style={{ fontSize: 9 }}>{conv.unread_count}</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`d-flex align-items-center gap-1 ${ch.color}`}>
                                <i className={ch.icon} />
                                <span className="d-none d-lg-inline">{ch.label}</span>
                              </span>
                            </td>
                            <td>
                              <span className={STATUS_BADGE[conv.status] || "badge bg-secondary-transparent text-secondary"}>
                                {conv.status}
                              </span>
                            </td>
                            <td className="text-muted text-truncate" style={{ maxWidth: 100 }}>
                              {conv.assigned_to?.name || <span className="text-danger fs-11">Unassigned</span>}
                            </td>
                            <td className="text-muted text-truncate" style={{ maxWidth: 140 }}>
                              {renderPreview(conv.last_message_preview || '')}
                            </td>
                            <td className="text-muted fs-11 text-nowrap">
                              {timeAgo(conv.last_message_at)}
                            </td>
                            <td>
                              <button className="btn btn-xs btn-outline-primary fs-11 py-0 px-2"
                                onClick={e => { e.stopPropagation(); openMonitor(conv); }}>
                                <i className="ti ti-eye me-1" />Monitor
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

          {/* ── Right Column ─────────────────────────────────────────── */}
          <div className="col-xl-4 d-flex flex-column gap-3">

            {/* Channel Breakdown */}
            <div className="card shadow-none border">
              <div className="card-header border-bottom py-3">
                <h6 className="mb-0 fw-semibold fs-14">Channel Breakdown</h6>
              </div>
              <div className="card-body py-2 px-3">
                {Object.entries(CHANNEL_META).map(([key, meta]) => {
                  const d = stats?.by_channel?.[key];
                  return (
                    <div key={key} className="d-flex align-items-center justify-content-between py-2 border-bottom">
                      <div className="d-flex align-items-center gap-2">
                        <i className={`${meta.icon} ${meta.color} fs-5`} />
                        <span className="fs-13 fw-medium">{meta.label}</span>
                      </div>
                      <div className="text-end">
                        <span className="badge bg-light text-dark fs-11 me-1" title="Conversations">
                          {loading ? "—" : (d?.conversations ?? 0)} convs
                        </span>
                        <span className="badge bg-light text-dark fs-11" title="Messages">
                          {loading ? "—" : (d?.messages ?? 0)} msgs
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Agent Workload */}
            <div className="card shadow-none border flex-fill">
              <div className="card-header border-bottom py-3">
                <h6 className="mb-0 fw-semibold fs-14">Agent Workload</h6>
              </div>
              <div className="card-body py-2 px-3" style={{ overflowY: 'auto', maxHeight: 340 }}>
                {loading ? (
                  <div className="d-flex align-items-center justify-content-center py-3 text-muted fs-13">
                    <span className="spinner-border spinner-border-sm me-2" />Loading…
                  </div>
                ) : agents.length === 0 ? (
                  <div className="d-flex align-items-center justify-content-center py-3 text-muted fs-13">
                    <i className="ti ti-users me-2" />No agents found.
                  </div>
                ) : (
                  agents.map(agent => (
                    <div key={agent.id} className="mb-3 pb-3 border-bottom">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center gap-2">
                          {/* Avatar with live presence dot */}
                          <div className="position-relative flex-shrink-0">
                            <span
                              className="avatar avatar-xs rounded-circle d-flex align-items-center justify-content-center bg-primary text-white fw-semibold"
                              style={{ width: 30, height: 30, fontSize: 12 }}
                            >
                              {agent.name.charAt(0).toUpperCase()}
                            </span>
                            <span style={{
                              position: 'absolute', bottom: 0, right: 0,
                              width: 9, height: 9, borderRadius: '50%',
                              border: '1.5px solid #fff',
                              background:
                                agent.status === 'available' ? '#10b981' :
                                agent.status === 'busy'      ? '#f59e0b' :
                                agent.status === 'away'      ? '#6366f1' : '#9ca3af',
                            }} title={agent.status} />
                          </div>
                          <div>
                            <p className="mb-0 fs-13 fw-medium">{agent.name}</p>
                            <p className="mb-0 fs-11 text-muted">{agent.role}</p>
                          </div>
                        </div>
                        <div className="text-end">
                          <span className={`badge fs-10 ${
                            agent.status === 'available' ? 'bg-success-transparent text-success' :
                            agent.status === 'busy'      ? 'bg-warning-transparent text-warning' :
                            agent.status === 'away'      ? 'bg-info-transparent text-info' :
                            'bg-secondary-transparent text-secondary'
                          }`}>
                            {agent.status}
                          </span>
                          <p className="mb-0 fs-11 text-muted mt-1">
                            {agent.active_chats}/{agent.max_chats} chats
                          </p>
                        </div>
                      </div>
                      <div className="mb-2">
                        <div className="d-flex justify-content-between mb-1">
                          <span className="fs-11 text-muted">Workload</span>
                          <span className="fs-11 fw-semibold">{agent.workload_pct}%</span>
                        </div>
                        <div className="progress" style={{ height: 6 }}>
                          <div
                            className={`progress-bar ${
                              agent.workload_pct >= 80 ? 'bg-danger' :
                              agent.workload_pct >= 50 ? 'bg-warning' : 'bg-success'
                            }`}
                            style={{ width: `${Math.min(agent.workload_pct, 100)}%` }}
                          />
                        </div>
                      </div>
                      {agent.conversations.length > 0 && (
                        <div>
                          {agent.conversations.map(cv => (
                            <div key={cv.id}
                              className="d-flex align-items-center justify-content-between py-1 px-2 rounded mb-1 bg-light"
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                const conv = conversations.find(c => c.id === cv.id);
                                if (conv) openMonitor(conv);
                              }}
                            >
                              <div className="d-flex align-items-center gap-2 overflow-hidden">
                                <i className={`${
                                  cv.channel === 'whatsapp' ? 'ti ti-brand-whatsapp text-success' :
                                  cv.channel === 'facebook' ? 'ti ti-brand-messenger text-primary' :
                                  cv.channel === 'instagram' ? 'ti ti-brand-instagram text-danger' :
                                  'ti ti-mail text-warning'
                                } fs-12 flex-shrink-0`} />
                                <span className="fs-12 text-dark text-truncate" style={{ maxWidth: 100 }}>
                                  {cv.contact}
                                </span>
                              </div>
                              <div className="d-flex align-items-center gap-1 flex-shrink-0">
                                {cv.unread > 0 && (
                                  <span className="badge bg-danger rounded-pill" style={{ fontSize: 9 }}>{cv.unread}</span>
                                )}
                                <span className={`badge fs-10 ${
                                  cv.status === 'open' ? 'bg-success-transparent text-success' :
                                  cv.status === 'assigned' ? 'bg-primary-transparent text-primary' :
                                  'bg-warning-transparent text-warning'
                                }`}>{cv.status}</span>
                                <i className="ti ti-eye fs-12 text-muted" title="Monitor" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {agent.conversations.length === 0 && (
                        <p className="text-muted fs-12 mb-0"><i className="ti ti-checks me-1 text-success" />No active chats</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Live Monitor Panel ─────────────────────────────────────── */}
      {monitored && (
        <div className="position-fixed top-0 end-0 h-100 bg-white shadow-lg border-start d-flex flex-column"
          style={{ width: 460, zIndex: 1050 }}>

          <div className="d-flex align-items-center justify-content-between p-3 border-bottom bg-light flex-shrink-0">
            <div>
              <p className="mb-0 fw-semibold fs-14">{monitored.contact?.name}</p>
              <p className="mb-0 fs-11 text-muted">
                <i className={`${CHANNEL_META[monitored.channel]?.icon} ${CHANNEL_META[monitored.channel]?.color} me-1`} />
                {CHANNEL_META[monitored.channel]?.label} &middot; <span className={STATUS_BADGE[monitored.status]}>{monitored.status}</span>
                {monitored.assigned_to && <span className="ms-2">&rarr; {monitored.assigned_to.name}</span>}
              </p>
            </div>
            <button className="btn-close" onClick={() => setMonitored(null)} />
          </div>

          <div className="d-flex gap-2 flex-wrap p-2 border-bottom flex-shrink-0">
            <div className="dropdown">
              <button className="btn btn-sm btn-outline-primary" onClick={() => { setShowAssign(p => !p); setShowTransfer(false); }} disabled={actionBusy}>
                <i className="ti ti-user-check me-1" />Assign
              </button>
              {showAssign && (
                <div className="dropdown-menu show" style={{ minWidth: 200, zIndex: 1060 }}>
                  <h6 className="dropdown-header fs-11">Assign to</h6>
                  {assignUsers.map(u => (
                    <button key={u.id} className="dropdown-item fs-12"
                      onClick={() => doAction(`conversations/${monitored.id}/assign/`, { to_user_id: u.id }, `Assigned to ${u.name}`)}>
                      {u.name} <span className="text-muted ms-1 fs-11">({u.role})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="dropdown">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => { setShowTransfer(p => !p); setShowAssign(false); }} disabled={actionBusy}>
                <i className="ti ti-arrows-transfer-up me-1" />Transfer
              </button>
              {showTransfer && (
                <div className="dropdown-menu show" style={{ minWidth: 200, zIndex: 1060 }}>
                  <h6 className="dropdown-header fs-11">Transfer to</h6>
                  {assignUsers.map(u => (
                    <button key={u.id} className="dropdown-item fs-12"
                      onClick={() => doAction(`conversations/${monitored.id}/transfer/`, { to_user_id: u.id }, `Transferred to ${u.name}`)}>
                      {u.name} <span className="text-muted ms-1 fs-11">({u.role})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-sm btn-outline-warning" disabled={actionBusy}
              onClick={async () => {
                const ok = await confirm('Escalate this conversation to pending?', { title: 'Escalate Conversation', confirmText: 'Escalate', icon: 'warning' });
                if (ok) doAction(`conversations/${monitored.id}/escalate/`, {}, 'Escalated');
              }}>
              <i className="ti ti-alert-triangle me-1" />Escalate
            </button>
            <button className="btn btn-sm btn-success" disabled={actionBusy}
              onClick={async () => {
                const ok = await confirm('Mark this conversation as resolved?', { title: 'Resolve Conversation', confirmText: 'Resolve', icon: 'question' });
                if (ok) doAction(`conversations/${monitored.id}/resolve/`, {}, 'Resolved', true);
              }}>
              <i className="ti ti-check me-1" />Resolve
            </button>
          </div>

          <div className="flex-fill overflow-auto p-3 bg-light">
            {msgLoading ? (
              <div className="d-flex align-items-center justify-content-center h-100 text-muted fs-13">
                <span className="spinner-border spinner-border-sm me-2" />Loading messages...
              </div>
            ) : liveMessages.length === 0 ? (
              <div className="d-flex align-items-center justify-content-center h-100 text-muted fs-13">
                <i className="ti ti-message-2 me-2" />No messages yet.
              </div>
            ) : liveMessages.map(msg => {
              const isOut = msg.direction === 'outbound';
              const isMedia = ['image','audio','video','file','document','sticker'].includes(msg.message_type);
              const rawUrl  = msg.media_url || msg.metadata?.media_url || '';
              const mediaId = msg.metadata?.media_id || '';
              const channel = monitored.channel || 'whatsapp';
              const mediaUrl = rawUrl
                ? proxyMediaUrl(rawUrl, channel, mediaId)
                : (mediaId ? proxyMediaById(mediaId, channel) : '');
              const displayFilename = msg.filename || msg.metadata?.filename || msg.content || 'Download file';

              return (
                <div key={msg.id} className={`d-flex mb-2 ${isOut ? 'justify-content-end' : 'justify-content-start'}`}>
                  <div className={`px-3 py-2 rounded fs-13 ${isOut ? 'bg-primary text-white' : 'bg-white border text-dark'}`}
                    style={{ maxWidth: '80%', wordBreak: 'break-word' }}>

                    {isMedia ? (
                      <>
                        {(msg.message_type === 'image' || msg.message_type === 'sticker') && (
                          mediaUrl ? (
                            <img
                              src={mediaUrl}
                              alt={displayFilename}
                              className="img-fluid rounded mb-1 d-block"
                              style={{ maxWidth: '200px', maxHeight: '240px', objectFit: 'cover', cursor: 'pointer' }}
                              onClick={() => window.open(mediaUrl, '_blank')}
                              onError={(e) => {
                                const t = e.currentTarget;
                                t.style.display = 'none';
                                const p = t.parentElement;
                                if (p && !p.querySelector('.img-err')) {
                                  const d = document.createElement('div');
                                  d.className = `img-err d-flex align-items-center gap-1 fs-12 ${isOut ? 'text-white-50' : 'text-muted'}`;
                                  d.innerHTML = `<i class="ti ti-photo-off"></i> Image unavailable`;
                                  p.insertBefore(d, t);
                                }
                              }}
                            />
                          ) : (
                            <span className={`d-flex align-items-center gap-1 fs-12 ${isOut ? 'text-white-50' : 'text-muted'}`}>
                              <i className="ti ti-photo" /> {msg.message_type === 'sticker' ? 'Sticker' : 'Image'}
                            </span>
                          )
                        )}
                        {msg.message_type === 'audio' && (
                          mediaUrl
                            ? <audio controls src={mediaUrl} style={{ maxWidth: '220px' }} className="d-block mb-1" />
                            : <span className={`d-flex align-items-center gap-1 fs-12 ${isOut ? 'text-white-50' : 'text-muted'}`}><i className="ti ti-music" /> Audio</span>
                        )}
                        {msg.message_type === 'video' && (
                          mediaUrl
                            ? <video controls src={mediaUrl} style={{ maxWidth: '240px' }} className="d-block mb-1 rounded" />
                            : <span className={`d-flex align-items-center gap-1 fs-12 ${isOut ? 'text-white-50' : 'text-muted'}`}><i className="ti ti-video" /> Video</span>
                        )}
                        {(msg.message_type === 'file' || msg.message_type === 'document') && (
                          mediaUrl
                            ? (
                              <a href={mediaUrl} target="_blank" rel="noreferrer"
                                className={`d-flex align-items-center gap-1 fs-12 text-decoration-none ${isOut ? 'text-white' : 'text-primary'}`}>
                                <i className="ti ti-file-download" /> {displayFilename}
                              </a>
                            ) : (
                              <span className={`d-flex align-items-center gap-1 fs-12 ${isOut ? 'text-white-50' : 'text-muted'}`}><i className="ti ti-file" /> {displayFilename}</span>
                            )
                        )}
                        {/* Caption below media */}
                        {msg.content && !['[image]','[audio]','[video]','[file]','[document]','[sticker]'].includes(msg.content) && (
                          <p className="mb-0 mt-1" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                        )}
                      </>
                    ) : (
                      <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    )}

                    <p className={`mb-0 fs-10 mt-1 ${isOut ? 'text-white-50' : 'text-muted'}`}>
                      {isOut ? 'Counsellor' : monitored.contact?.name} &middot; {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={msgBottomRef} />
          </div>
        </div>
      )}
    </div>
</>
    
  );

 
}

