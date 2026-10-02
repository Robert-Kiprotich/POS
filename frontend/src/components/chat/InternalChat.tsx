import { useEffect, useRef, useState, useCallback } from "react";

interface UserInfo {
  id: number;
  name: string;
  username: string;
  role: string;
  initials: string;
}

interface ChatMessage {
  id: string;
  from_id: number;
  from_name: string;
  from_role: string;
  recipient_id: number;
  text: string;
  timestamp: string;
}

interface Conversation {
  user: UserInfo;
  messages: ChatMessage[];
  unread: number;
}

const ROLE_COLOR: Record<string, string> = {
  administrator: "bg-danger",
  supervisor: "bg-warning",
  counsellor: "bg-primary",
  agent: "bg-primary",
};

function roleColor(role: string) {
  for (const [k, v] of Object.entries(ROLE_COLOR)) {
    if (role.includes(k)) return v;
  }
  return "bg-secondary";
}

function Avatar({ user, size = 32, online = false }: { user: UserInfo; size?: number; online?: boolean }) {
  return (
    <div className="position-relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className={`rounded-circle d-flex align-items-center justify-content-center text-white fw-bold ${roleColor(user.role)}`}
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {user.initials}
      </div>
      {online && (
        <span
          className="position-absolute bg-success rounded-circle border border-white"
          style={{ width: 9, height: 9, bottom: 0, right: 0 }}
        />
      )}
    </div>
  );
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function playNotification() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* ignore */ }
}

function InternalChatInner({ myId }: { myId: number }) {
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "chat">("list");
  const [onlineUsers, setOnlineUsers] = useState<UserInfo[]>([]);
  const [convos, setConvos] = useState<Record<number, Conversation>>(() => {
    try {
      const saved = localStorage.getItem(`chat_convos_${myId}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);

  const totalUnread = Object.values(convos).reduce((s, c) => s + c.unread, 0);

  const connect = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/chat/`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "presence_list" || data.type === "presence_update") {
          const users: UserInfo[] = data.users ?? data.online_users ?? [];
          setOnlineUsers(users.filter((u) => u.id !== myId));
          if (data.type === "presence_update" && data.action === "join" && data.user?.id !== myId) {
            setConvos((prev) => {
              if (prev[data.user.id]) return prev;
              return { ...prev, [data.user.id]: { user: data.user, messages: [], unread: 0 } };
            });
          }
        } else if (data.type === "chat_message") {
          const msg: ChatMessage = data;
          const otherId = msg.from_id === myId ? msg.recipient_id : msg.from_id;
          if (msg.from_id !== myId) playNotification();
          setConvos((prev) => {
            const existing = prev[otherId];
            const user: UserInfo = existing?.user ?? {
              id: otherId, name: msg.from_name, username: "",
              role: msg.from_role, initials: (msg.from_name[0] || "?").toUpperCase(),
            };
            return {
              ...prev,
              [otherId]: {
                user,
                messages: [...(existing?.messages ?? []), msg],
                unread: msg.from_id !== myId ? (existing?.unread ?? 0) + 1 : (existing?.unread ?? 0),
              },
            };
          });
        }
      } catch { /* ignore */ }
    };
  }, [myId]);

  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [connect]);

  useEffect(() => {
    try {
      // Only persist messages, cap at 100 per conversation to avoid quota issues
      const toSave: Record<number, Conversation> = {};
      Object.entries(convos).forEach(([id, c]) => {
        toSave[Number(id)] = { ...c, messages: c.messages.slice(-100) };
      });
      localStorage.setItem(`chat_convos_${myId}`, JSON.stringify(toSave));
    } catch { /* quota exceeded */ }
  }, [convos, myId]);

  useEffect(() => {
    setConvos((prev) => {
      const next = { ...prev };
      onlineUsers.forEach((u) => {
        if (!next[u.id]) next[u.id] = { user: u, messages: [], unread: 0 };
        else next[u.id] = { ...next[u.id], user: u };
      });
      return next;
    });
  }, [onlineUsers]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [convos, activeId]);

  useEffect(() => {
    if (view === "chat" && activeId !== null && open) {
      setConvos((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], unread: 0 },
      }));
    }
  }, [view, activeId, open]);

  const sendMessage = () => {
    if (!text.trim() || !activeId || !wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: "chat_message", recipient_id: activeId, text: text.trim() }));
    setText("");
  };

  const openChat = (user: UserInfo) => { setActiveId(user.id); setView("chat"); setOpen(true); };
  const isOnline = (id: number) => onlineUsers.some((u) => u.id === id);
  const activeConvo = activeId ? convos[activeId] : null;

  const filteredUsers = Object.values(convos).filter((c) =>
    !search ||
    c.user.name.toLowerCase().includes(search.toLowerCase()) ||
    c.user.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Floating button */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1050 }}>
        <button
          onClick={() => { setOpen((v) => !v); if (!open) setView("list"); }}
          className="btn btn-primary rounded-circle shadow-lg d-flex align-items-center justify-content-center position-relative"
          style={{ width: 52, height: 52 }}
          title="Team Chat"
        >
          <i className={`ti ${open ? "ti-x" : "ti-message-circle"} fs-5`} />
          {!open && totalUnread > 0 && (
            <span className="position-absolute top-0 end-0 badge rounded-pill bg-danger fs-10"
              style={{ transform: "translate(25%,-25%)", minWidth: 18 }}>
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* Chat popup */}
      {open && (
        <div
          className="card shadow border-0"
          style={{
            position: "fixed", bottom: 88, right: 24, width: 340,
            height: 480, zIndex: 1049, display: "flex", flexDirection: "column",
            borderRadius: 16, overflow: "hidden",
          }}
        >
          {/* Header */}
          <div className="d-flex align-items-center justify-content-between px-3 py-2 bg-primary text-white flex-shrink-0">
            {view === "chat" && activeConvo ? (
              <>
                <div className="d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-link text-white p-0 me-1" onClick={() => setView("list")}>
                    <i className="ti ti-arrow-left fs-5" />
                  </button>
                  <Avatar user={activeConvo.user} size={30} online={isOnline(activeConvo.user.id)} />
                  <div>
                    <p className="mb-0 fw-semibold fs-13 lh-1">{activeConvo.user.name}</p>
                    <span className="fs-11 opacity-75 text-capitalize">{activeConvo.user.role}</span>
                  </div>
                </div>
                <span className={`badge fs-10 ${isOnline(activeConvo.user.id) ? "bg-success" : "bg-white text-secondary"}`}>
                  {isOnline(activeConvo.user.id) ? "Online" : "Offline"}
                </span>
              </>
            ) : (
              <>
                <div className="d-flex align-items-center gap-2">
                  <i className="ti ti-message-circle fs-5" />
                  <span className="fw-semibold fs-14">Team Chat</span>
                  <span className={`badge fs-10 ${connected ? "bg-success" : "bg-white text-secondary"}`}>
                    {connected ? "Live" : "Connecting…"}
                  </span>
                </div>
                <span className="badge bg-white text-primary fs-11">{onlineUsers.length} online</span>
              </>
            )}
          </div>

          {/* Body */}
          <div className="flex-grow-1 overflow-hidden d-flex flex-column">
            {view === "list" ? (
              <>
                <div className="px-3 pt-2 pb-1 flex-shrink-0">
                  <div className="input-group input-group-sm input-group-flat">
                    <span className="input-group-text bg-transparent border-end-0">
                      <i className="ti ti-search text-muted fs-13" />
                    </span>
                    <input className="form-control border-start-0 ps-0 fs-13"
                      placeholder="Search team…" value={search}
                      onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
                <div className="overflow-y-auto flex-grow-1 px-2 pb-2">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center text-muted py-5 fs-13">
                      <i className="ti ti-users-off d-block fs-1 mb-2 opacity-50" />
                      No team members found
                    </div>
                  ) : (
                    filteredUsers.map(({ user, unread }) => (
                      <button key={user.id}
                        className="btn w-100 text-start d-flex align-items-center gap-2 px-2 py-2 mb-1 rounded-3 border-0"
                        style={{ background: unread ? "#eef2ff" : "#f8f9fa" }}
                        onClick={() => openChat(user)}>
                        <Avatar user={user} size={36} online={isOnline(user.id)} />
                        <div className="flex-grow-1 overflow-hidden">
                          <p className="mb-0 fw-medium fs-13 text-truncate text-dark">{user.name}</p>
                          <span className="fs-11 text-muted text-capitalize">{user.role}</span>
                        </div>
                        {unread > 0
                          ? <span className="badge rounded-pill bg-primary fs-10">{unread}</span>
                          : isOnline(user.id) && <span className="badge bg-success-transparent text-success fs-10">Online</span>
                        }
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex-grow-1 overflow-y-auto px-3 py-2 d-flex flex-column gap-2"
                  style={{ background: "#f8f9fa" }}>
                  {!activeConvo?.messages.length ? (
                    <div className="text-center text-muted my-auto fs-13">
                      <i className="ti ti-message-dots d-block fs-1 mb-2 opacity-50" />
                      Start the conversation
                    </div>
                  ) : (
                    activeConvo.messages.map((msg) => {
                      const mine = msg.from_id === myId;
                      return (
                        <div key={msg.id} className={`d-flex ${mine ? "justify-content-end" : "justify-content-start"}`}>
                          <div style={{ maxWidth: "78%" }}>
                            <div className={`px-3 py-2 fs-13 ${mine
                              ? "bg-primary text-white rounded-3 rounded-bottom-end-0"
                              : "bg-white border rounded-3 rounded-bottom-start-0"}`}
                              style={{ wordBreak: "break-word" }}>
                              {msg.text}
                            </div>
                            <p className={`fs-11 text-muted mb-0 mt-1 ${mine ? "text-end" : ""}`}>
                              {fmtTime(msg.timestamp)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="px-3 py-2 border-top flex-shrink-0 d-flex gap-2 align-items-center bg-white">
                  <input
                    className="form-control form-control-sm fs-13 rounded-pill"
                    placeholder="Type a message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  />
                  <button
                    className="btn btn-primary btn-sm rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: 34, height: 34 }}
                    onClick={sendMessage}
                    disabled={!text.trim() || !connected}
                  >
                    <i className="ti ti-send fs-14" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function InternalChat() {
  const storedUser = JSON.parse(sessionStorage.getItem("user") || "{}");
  const myId: number = storedUser.id;
  const myRole: string = (storedUser.role || "").toLowerCase();
  const allowed = myRole.includes("counsellor") || myRole.includes("supervisor") ||
    myRole.includes("administrator") || myRole.includes("agent");
  if (!allowed || !myId) return null;
  return <InternalChatInner myId={myId} />;
}
