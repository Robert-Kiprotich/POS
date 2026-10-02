import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import ImageWithBasePath from "../../../../../components/imageWithBasePath";
import type { MessageItem } from "./Chat";
import { proxyMediaUrl, proxyMediaById } from "../../../../../services/mediaProxy";
import { TransferModal, EscalateModal, ReferModal, ResolveModal } from "./ActionModals";
import type { ReferralData } from "./ActionModals";

// ── Emoji categories ────────────────────────────────────────────────────────
const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  { label: 'Smileys',  icon: '😊', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'] },
  { label: 'Gestures', icon: '👋', emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','👀','👁','👅','👄'] },
  { label: 'Hearts',   icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💯','🔥','⭐','🌟','✨','💫','💥','🎉','🎊','🎈','🎁','🏆','🥇','🎖','🏅','🥈','🥉','🎗','🎀','🎵','🎶'] },
  { label: 'People',   icon: '👶', emojis: ['👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎅','🤶','🧙','🧝','🧛','🧟','🧞','🧜','🧚'] },
  { label: 'Animals',  icon: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐜','🦂','🐢','🐍','🦎','🐙','🦑','🦐','🦀','🐟','🐠','🐬','🐳','🦈','🦭','🐊','🐅','🐆','🦓','🐘','🦒','🦘','🐃'] },
  { label: 'Food',     icon: '🍕', emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🌽','🌶','🥐','🍞','🥖','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍘','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🍯','☕','🧃','🥤','🧋','🍺','🍷','🥂','🍸','🍹'] },
  { label: 'Objects',  icon: '💡', emojis: ['📱','💻','⌨️','🖥','📷','📸','📹','📞','☎️','📺','📻','🔋','🔌','💡','🔦','💰','💳','💎','⚖️','🔧','🔨','🛠','🔑','🗝','🔐','🔒','🔓','🚪','🛏','🛋','🚽','🚿','🛁','🧴','🧹','🧺','🧻','🧼','🪥','🧽','🛒','📦','📫','📬','📭','📮','📝','✏️','🖊','📖','📚','📎','🖇','📐','📏','🪢','📌','📍','✂️','🗑','🔍','🔎','🔗'] },
  { label: 'Symbols',  icon: '✅', emojis: ['✅','❌','❎','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','🔈','🔇','🔉','🔊','📢','📣','🔔','🔕','💹','📈','📉','📊','🎯','🎲','♟','🎮','🧩','🪄','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎼','🎹','🥁','🎷','🎺','🎸','🎻'] },
];

// ── Pending attachment (preview before send) ────────────────────────────────
interface PendingAttachment {
  file: File;
  previewUrl: string;  // object URL for images; '' for other types
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption: string;
}


interface ChatWindowProps {
  activeThread: {
    id: string;
    name: string;
    email?: string;
    channel?: string;
    avatar: string;
    contactId?: string;
    userId?: number;
  } | null;
  messages: MessageItem[];
  onSendMessage: (text: string) => void;
  onSendFile?: (file: File, caption?: string) => void;
  onOpenCaseModal: () => void;
  onResolve?: () => void;
  onEscalate?: (toName: string) => void;
  onTransfer?: (userId: number, userName: string) => void;
  assignableUsers?: { id: number; name: string; role: string }[];
  supervisors?: { id: number; name: string; role: string }[];
  all_routes?: Record<string, string>;
  lockedInfo?: { action: 'transferred' | 'escalated'; toName: string };
}

const LEVEL_META = {
  success: { icon: 'ti-circle-check', bg: 'bg-success', text: 'text-white' },
  danger:  { icon: 'ti-alert-circle',  bg: 'bg-danger',  text: 'text-white' },
  info:    { icon: 'ti-info-circle',   bg: 'bg-primary', text: 'text-white' },
};

const ToastStack: React.FC<{ toasts: { id: number; msg: string; level: 'success'|'danger'|'info' }[] }> = ({ toasts }) => (
  <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340, pointerEvents: 'none' }}>
    {toasts.map(t => {
      const m = LEVEL_META[t.level];
      return (
        <div key={t.id} className={`d-flex align-items-center gap-2 px-3 py-2 rounded shadow ${m.bg} ${m.text}`}
          style={{ fontSize: 13, fontWeight: 500, animation: 'slideInRight .2s ease', pointerEvents: 'auto' }}>
          <i className={`ti ${m.icon} fs-5 flex-shrink-0`} />
          <span>{t.msg}</span>
        </div>
      );
    })}
    <style>{`@keyframes slideInRight{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
  </div>
);

export const ChatWindow: React.FC<ChatWindowProps> = ({
  activeThread,
  messages,
  onSendMessage,
  onSendFile,
  onOpenCaseModal,
  onResolve,
  onEscalate,
  onTransfer,
  assignableUsers = [],
  supervisors = [],
  all_routes = {},
  lockedInfo,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [sendingFile, setSendingFile] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showReferModal, setShowReferModal] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [callInProgress, setCallInProgress] = useState(false);
  const [callMessage, setCallMessage] = useState("");
  const [toasts, setToasts] = useState<{ id: number; msg: string; level: 'success'|'danger'|'info' }[]>([]);

  const showToast = useCallback((msg: string, level: 'success'|'danger'|'info' = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, level }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Separate supervisors from all users
  const allAgents = assignableUsers;

  useEffect(() => {
    const instance = scrollRef.current?.osInstance();
    if (instance) {
      const viewport = instance.elements().viewport;
      viewport.scrollTop = viewport.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojis) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojis(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojis]);

  const handleTransferConfirm = async (userId: number, userName: string, note: string) => {
    if (!activeThread) return;
    setActionBusy(true);
    try {
      const API = (await import('../../../../../services/api')).default;
      const res = await API.post(`conversations/${activeThread.id}/transfer/`, { to_user_id: userId, note });
      setShowTransferModal(false);
      onTransfer?.(userId, res.data?.transferred_to_name || userName);
    } catch {
      showToast('Failed to transfer. Please try again.', 'danger');
    } finally {
      setActionBusy(false);
    }
  };

  const handleEscalateConfirm = async (supId: number, supName: string, reason: string, urgency: string, details: string) => {
    if (!activeThread) return;
    setActionBusy(true);
    try {
      const API = (await import('../../../../../services/api')).default;
      const res = await API.post(`conversations/${activeThread.id}/escalate/`, { to_person_id: supId, reason, urgency, details });
      setShowEscalateModal(false);
      onEscalate?.(res.data?.escalated_to_name || supName);
    } catch {
      showToast('Failed to escalate. Please try again.', 'danger');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReferConfirm = async (data: ReferralData) => {
    if (!activeThread) return;
    setActionBusy(true);
    try {
      const API = (await import('../../../../../services/api')).default;
      const res = await API.post(`conversations/${activeThread.id}/refer/`, data);
      setShowReferModal(false);
      showToast(res.data?.message || 'Referral created successfully.', 'success');
    } catch {
      showToast('Failed to create referral. Please try again.', 'danger');
    } finally {
      setActionBusy(false);
    }
  };

  const handleResolve = async () => {
    if (!activeThread || resolving) return;
    setResolving(true);
    try {
      await import('../../../../../services/api').then(m => m.default.post(`conversations/${activeThread.id}/resolve/`));
      setShowResolveModal(false);
      onResolve?.();
    } catch {
      showToast('Failed to resolve conversation.', 'danger');
    } finally {
      setResolving(false);
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue("");
      setShowEmojis(false);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    // Don't auto-close — let the user keep picking
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const mime = file.type || 'application/octet-stream';
      let mediaType: PendingAttachment['mediaType'] = 'document';
      if (mime.startsWith('image/')) mediaType = 'image';
      else if (mime.startsWith('audio/')) mediaType = 'audio';
      else if (mime.startsWith('video/')) mediaType = 'video';

      const previewUrl = mime.startsWith('image/') ? URL.createObjectURL(file) : '';
      setPendingAttachment({ file, previewUrl, mediaType, caption: '' });
      setShowEmojis(false);
    }
    e.target.value = '';
  };

  const handleCancelAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
  };

  const handleSendAttachment = async () => {
    if (!pendingAttachment || !onSendFile) return;
    setSendingFile(true);
    try {
      await onSendFile(pendingAttachment.file, pendingAttachment.caption);
    } finally {
      if (pendingAttachment.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
      setPendingAttachment(null);
      setSendingFile(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!activeThread) return;
    
    setCallInProgress(true);
    setCallMessage("📞 Sending WhatsApp call request...");
    
    try {
      const API = (await import('../../../../../services/api')).default;
      
      // Call the WhatsApp endpoint to send a call request message
      const response = await API.post(`whatsapp/calls/initiate/${activeThread.id}/`, {
        call_type: 'voice',
        message: 'Please call me back regarding your inquiry'
      });
      
      if (response.data.success) {
        setCallMessage("✅ Call request sent! Customer will be notified to call back on WhatsApp.");
        
        setTimeout(() => {
          setCallInProgress(false);
          setCallMessage("");
        }, 3000);
      }
    } catch (error: any) {
      console.error('Failed to initiate call:', error);
      const errorMsg = error.response?.data?.error || 'Failed to send call request';
      setCallMessage(`❌ ${errorMsg}`);
      setTimeout(() => {
        setCallInProgress(false);
        setCallMessage("");
      }, 3000);
    }
  };

  if (!activeThread) {
    return (
      <div
        className="flex-fill chat-messages bg-light d-flex align-items-center justify-content-center h-100"
        style={{ minHeight: "450px" }}
      >
        <ToastStack toasts={toasts} />
        <div className="text-center text-muted">
          <i className="ti ti-message-2 fs-1 mb-2 d-block" />
          <p className="fs-14 mb-0">
            Select a conversation to open the case management dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-fill chat-messages bg-white d-flex flex-column h-100">
      <ToastStack toasts={toasts} />
      <div className="card border-0 mb-0 rounded-0 d-flex flex-column flex-grow-1 shadow-none">

        {/* Header */}
        <div className="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3 p-3 bg-white border-bottom flex-shrink-0">
          <div className="d-flex align-items-center">
            <span className="avatar me-2 flex-shrink-0">
              <ImageWithBasePath
                src={activeThread.avatar}
                alt={activeThread.name}
                className="rounded-circle"
              />
            </span>
            <div>
              <h6 className="fs-14 mb-1 text-dark fw-semibold">
                {activeThread.name}
              </h6>
              {activeThread.channel === 'email' && activeThread.email ? (
                <p className="mb-0 text-primary fs-11">
                  {activeThread.email}
                </p>
              ) : (
                <p className="mb-0 d-inline-flex align-items-center custom-dot text-muted fs-12">
                  <i className="ti ti-point-filled text-success me-1" /> Active
                  Chat Link
                </p>
              )}
            </div>
          </div>

          <div className="gap-2 d-flex align-items-center flex-wrap">
            <button 
              onClick={handleInitiateCall} 
              disabled={callInProgress || activeThread.channel !== 'whatsapp'}
              className="btn btn-icon btn-light btn-sm rounded" 
              title={activeThread.channel === 'whatsapp' ? 'Request WhatsApp Call' : 'Calls only available for WhatsApp'}
              style={{ opacity: activeThread.channel !== 'whatsapp' ? 0.5 : 1, cursor: activeThread.channel !== 'whatsapp' ? 'not-allowed' : 'pointer' }}
            >
              <i className={`ti ti-phone ${callInProgress ? 'fa-spin' : ''}`} />
            </button>
            {callMessage && (
              <div className="alert alert-info py-1 px-2 mb-0" style={{ fontSize: '11px', maxWidth: '250px' }}>
                {callMessage}
              </div>
            )}
            <Link to="#" className="btn btn-icon btn-light btn-sm rounded" title="Video">
              <i className="ti ti-video" />
            </Link>
            <button type="button" className="btn btn-icon btn-light btn-sm rounded text-primary"
              onClick={onOpenCaseModal} title="Case Management">
              <i className="ti ti-folder-plus" />
            </button>

            {/* ── Action buttons ── */}
            <div className="d-flex align-items-center gap-1 ms-1">
              <button type="button"
                className="btn btn-sm btn-outline-primary rounded d-flex align-items-center gap-1"
                onClick={() => setShowTransferModal(true)}
                title="Transfer to another agent">
                <i className="ti ti-arrows-transfer-up fs-13" />
                <span className="d-none d-xl-inline">Transfer</span>
              </button>
              <button type="button"
                className="btn btn-sm btn-outline-warning rounded d-flex align-items-center gap-1"
                onClick={() => setShowEscalateModal(true)}
                title="Escalate to supervisor">
                <i className="ti ti-alert-triangle fs-13" />
                <span className="d-none d-xl-inline">Escalate</span>
              </button>
              <button type="button"
                className="btn btn-sm btn-outline-info rounded d-flex align-items-center gap-1"
                onClick={() => setShowReferModal(true)}
                title="Refer to external organisation">
                <i className="ti ti-share fs-13" />
                <span className="d-none d-xl-inline">Refer</span>
              </button>
              <button type="button"
                className="btn btn-sm btn-success rounded d-flex align-items-center gap-1"
                onClick={() => setShowResolveModal(true)}
                disabled={resolving}
                title="Mark conversation as resolved">
                <i className="ti ti-check fs-13" />
                <span className="d-none d-xl-inline">{resolving ? 'Resolving…' : 'Resolve'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="card-body p-0 bg-white flex-grow-1 overflow-hidden position-relative">
          <OverlayScrollbarsComponent
            ref={scrollRef}
            className="message-body p-4"
          >
            {messages.length === 0 ? (
              <div className="d-flex align-items-center justify-content-center h-100">
                <p className="text-muted fs-13">No messages yet.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isYou = msg.sender === "you";
                const isMedia = ['image','audio','video','file','document'].includes(msg.message_type || '');
                const rawUrl = msg.mediaUrl || msg.metadata?.media_url || '';
                const mediaId = msg.metadata?.media_id || '';
                const channel = msg.channel || 'whatsapp';
                // Route through backend proxy for Meta CDN URLs that require auth.
                // Pass media_id so the proxy can re-resolve if the stored URL has expired.
                const mediaUrl = rawUrl
                  ? proxyMediaUrl(rawUrl, channel, mediaId)
                  : (mediaId ? proxyMediaById(mediaId, channel) : '');
                const displayFilename = msg.filename || msg.metadata?.filename || msg.text || 'Download file';
                return (
                  <div
                    key={msg.id}
                    className={`chat-list mb-3 ${isYou ? "ms-auto text-end" : ""}`}
                    style={isYou ? { maxWidth: "85%" } : undefined}
                  >
                    <div className={`d-flex align-items-start ${isYou ? "justify-content-end" : ""}`}>
                      {!isYou && (
                        <span className="avatar me-2 flex-shrink-0">
                          <ImageWithBasePath src={msg.avatar} className="rounded-circle" alt={msg.senderName} />
                        </span>
                      )}
                      <div>
                        <div className={`d-flex align-items-center mb-1 ${isYou ? "justify-content-end" : ""}`}>
                          <h6 className="fs-12 fw-semibold mb-0 text-dark">{msg.senderName}</h6>
                          {!isYou && msg.senderEmail && msg.channel === 'email' && (
                            <span className="ms-1 text-muted fs-10">&lt;{msg.senderEmail}&gt;</span>
                          )}
                          <p className="mb-0 text-muted fs-10 ms-2">{msg.timestamp}</p>
                        </div>
                        <div className={`message-box rounded fs-13 text-start ${
                          isYou ? "bg-primary text-white d-inline-block px-2 py-1" : "bg-light text-dark p-3"
                        }`}>
                          {isMedia ? (
                            <>
                              {msg.message_type === 'image' && (
                                mediaUrl ? (
                                  <img
                                    src={mediaUrl}
                                    alt={displayFilename}
                                    className="img-fluid rounded mb-1"
                                    style={{ maxWidth: '240px', maxHeight: '300px', objectFit: 'cover', cursor: 'pointer' }}
                                    onClick={() => window.open(mediaUrl, '_blank')}
                                    onError={(e) => {
                                      // Image failed to load (expired Meta CDN URL) — show placeholder
                                      const target = e.currentTarget;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent && !parent.querySelector('.img-error')) {
                                        const el = document.createElement('div');
                                        el.className = `img-error d-flex align-items-center gap-2 p-2 rounded ${isYou ? 'text-white-50' : 'text-muted'}`;
                                        el.innerHTML = `<i class="ti ti-photo-off fs-5"></i><span class="fs-12">Image unavailable</span>`;
                                        parent.insertBefore(el, target);
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className={`d-flex align-items-center gap-2 ${isYou ? 'text-white-50' : 'text-muted'}`}>
                                    <i className="ti ti-photo fs-5" />
                                    <span className="fs-12">{displayFilename}</span>
                                  </div>
                                )
                              )}
                              {msg.message_type === 'audio' && (
                                mediaUrl ? (
                                  <audio controls src={mediaUrl} className="d-block mb-1" style={{ maxWidth: '260px' }} />
                                ) : (
                                  <div className={`d-flex align-items-center gap-2 ${isYou ? 'text-white-50' : 'text-muted'}`}>
                                    <i className="ti ti-music fs-5" />
                                    <span className="fs-12">{displayFilename}</span>
                                  </div>
                                )
                              )}
                              {msg.message_type === 'video' && (
                                mediaUrl ? (
                                  <video controls src={mediaUrl} className="d-block mb-1 rounded" style={{ maxWidth: '280px' }} />
                                ) : (
                                  <div className={`d-flex align-items-center gap-2 ${isYou ? 'text-white-50' : 'text-muted'}`}>
                                    <i className="ti ti-video fs-5" />
                                    <span className="fs-12">{displayFilename}</span>
                                  </div>
                                )
                              )}
                              {(msg.message_type === 'file' || msg.message_type === 'document') && (
                                mediaUrl ? (
                                  <a href={mediaUrl} target="_blank" rel="noreferrer"
                                    className={`d-flex align-items-center gap-2 text-decoration-none ${isYou ? 'text-white' : 'text-primary'}`}>
                                    <i className="ti ti-file-download fs-5 flex-shrink-0" />
                                    <span className="fs-12 text-break">{displayFilename}</span>
                                  </a>
                                ) : (
                                  <div className={`d-flex align-items-center gap-2 ${isYou ? 'text-white-50' : 'text-muted'}`}>
                                    <i className="ti ti-file fs-5 flex-shrink-0" />
                                    <span className="fs-12 text-break">{displayFilename}</span>
                                  </div>
                                )
                              )}
                              {/* Caption below media — skip bracketed placeholders */}
                              {msg.text && !['[image]','[audio]','[video]','[file]','[document]'].includes(msg.text) && msg.text !== displayFilename && (
                                <p className="mb-0 mt-1">{msg.text}</p>
                              )}
                            </>
                          ) : msg.channel === 'email' && msg.html_body ? (
                            <div
                              className="email-html-body"
                              style={{
                                maxWidth: '520px',
                                maxHeight: '400px',
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                border: '1px solid #e9ecef',
                                borderRadius: '6px',
                                padding: '12px',
                                background: '#fff',
                                fontSize: '13px',
                              }}
                              dangerouslySetInnerHTML={{ __html: msg.html_body }}
                            />
                          ) : msg.channel === 'email' ? (
                            <div style={{ maxWidth: '480px' }}>
                              {/* Main body — preserve paragraph breaks */}
                              <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                {msg.text}
                              </p>
                              {/* Signature — separated with a subtle divider */}
                              {msg.signature && (
                                <>
                                  <hr style={{ borderColor: '#dee2e6', margin: '8px 0' }} />
                                  <p className="mb-0 text-muted" style={{ whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: '1.5' }}>
                                    {msg.signature}
                                  </p>
                                </>
                              )}
                            </div>
                          ) : (
                            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                          )}
                        </div>
                      </div>
                      {isYou && (
                        <span className="avatar ms-2 flex-shrink-0">
                          <ImageWithBasePath src={msg.avatar} className="rounded-circle" alt="You" />
                        </span>
                      )}
                    </div>
                    {/* WhatsApp delivery ticks — only for outbound WA messages */}
                    {isYou && (msg.channel === 'whatsapp' || activeThread?.channel === 'whatsapp') && (
                      <div className="d-flex justify-content-end" style={{ fontSize: 11, marginTop: 1 }}>
                        {msg.wa_status === 'read' ? (
                          <span title="Read" style={{ color: '#53bdeb', letterSpacing: '-4px' }}>
                            <i className="ti ti-check" /><i className="ti ti-check" />
                          </span>
                        ) : msg.wa_status === 'delivered' ? (
                          <span title="Delivered" style={{ color: '#8696a0', letterSpacing: '-4px' }}>
                            <i className="ti ti-check" /><i className="ti ti-check" />
                          </span>
                        ) : (
                          <span title="Sent" style={{ color: '#8696a0' }}>
                            <i className="ti ti-check" />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </OverlayScrollbarsComponent>
        </div>

        {/* Footer */}
        {lockedInfo ? (
          <div className="message-footer border-top p-3 bg-light flex-shrink-0 mt-auto d-flex align-items-center gap-3">
            <span className={`badge fs-12 px-3 py-2 ${
              lockedInfo.action === 'escalated' ? 'bg-warning text-dark' : 'bg-primary text-white'
            }`}>
              <i className={`ti ${
                lockedInfo.action === 'escalated' ? 'ti-alert-triangle' : 'ti-arrows-transfer-up'
              } me-1`} />
              Conversation {lockedInfo.action} to {lockedInfo.toName}
            </span>
            <span className="text-muted fs-12">This conversation is now read-only.</span>
          </div>
        ) : (
          <div className="message-footer border-top bg-white flex-shrink-0 mt-auto" style={{ position: 'relative' }}>

            {/* ── Emoji Picker ──────────────────────────────────────────── */}
            {showEmojis && (
              <div
                ref={emojiPickerRef}
                className="border rounded shadow bg-white"
                style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0,
                  zIndex: 200, display: 'flex', flexDirection: 'column',
                  maxHeight: 320,
                }}
              >
                {/* Search */}
                <div className="p-2 border-bottom d-flex align-items-center gap-2">
                  <i className="ti ti-search text-muted fs-13" />
                  <input
                    type="text"
                    className="form-control form-control-sm border-0 shadow-none p-0 fs-13"
                    placeholder="Search emojis…"
                    value={emojiSearch}
                    onChange={e => { setEmojiSearch(e.target.value); setEmojiCategory(-1); }}
                    autoFocus
                  />
                  {emojiSearch && (
                    <button className="btn-close btn-sm" style={{ fontSize: 9 }}
                      onClick={() => { setEmojiSearch(''); setEmojiCategory(0); }} />
                  )}
                </div>
                {/* Category tabs */}
                {!emojiSearch && (
                  <div className="d-flex px-2 pt-1 gap-1 flex-wrap border-bottom">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                      <button key={cat.label} type="button"
                        title={cat.label}
                        onClick={() => setEmojiCategory(i)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 18, padding: '2px 4px',
                          borderBottom: emojiCategory === i ? '2px solid #0d6efd' : '2px solid transparent',
                          lineHeight: 1.4,
                        }}>
                        {cat.icon}
                      </button>
                    ))}
                  </div>
                )}
                {/* Emoji grid */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {(emojiSearch
                      ? EMOJI_CATEGORIES.flatMap(c => c.emojis)
                      : (EMOJI_CATEGORIES[emojiCategory]?.emojis || EMOJI_CATEGORIES[0].emojis)
                    ).map((emoji, i) => (
                      <span
                        key={`${emoji}-${i}`}
                        onClick={() => handleEmojiClick(emoji)}
                        title={emoji}
                        style={{
                          cursor: 'pointer', fontSize: 22, lineHeight: 1.3,
                          padding: '2px 3px', borderRadius: 4,
                          transition: 'background .1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── File attachment preview ───────────────────────────────── */}
            {pendingAttachment && (
              <div className="px-3 pt-3 pb-2 border-bottom bg-light">
                <div className="d-flex align-items-start gap-3">
                  {/* Thumbnail / icon */}
                  <div className="flex-shrink-0">
                    {pendingAttachment.mediaType === 'image' && pendingAttachment.previewUrl ? (
                      <img
                        src={pendingAttachment.previewUrl}
                        alt="preview"
                        className="rounded border"
                        style={{ width: 72, height: 72, objectFit: 'cover' }}
                      />
                    ) : pendingAttachment.mediaType === 'video' ? (
                      <div className="rounded border bg-dark d-flex align-items-center justify-content-center text-white"
                        style={{ width: 72, height: 72 }}>
                        <i className="ti ti-video fs-3" />
                      </div>
                    ) : pendingAttachment.mediaType === 'audio' ? (
                      <div className="rounded border bg-info-subtle d-flex align-items-center justify-content-center text-info"
                        style={{ width: 72, height: 72 }}>
                        <i className="ti ti-music fs-3" />
                      </div>
                    ) : (
                      <div className="rounded border bg-secondary-subtle d-flex align-items-center justify-content-center text-secondary"
                        style={{ width: 72, height: 72 }}>
                        <i className="ti ti-file fs-3" />
                      </div>
                    )}
                  </div>

                  {/* File name + caption input */}
                  <div className="flex-fill">
                    <p className="mb-1 fs-12 fw-semibold text-dark text-truncate" style={{ maxWidth: 260 }}>
                      {pendingAttachment.file.name}
                    </p>
                    <p className="mb-2 fs-11 text-muted">
                      {(pendingAttachment.file.size / 1024).toFixed(0)} KB &middot; {pendingAttachment.mediaType}
                    </p>
                    <input
                      type="text"
                      className="form-control form-control-sm fs-12"
                      placeholder="Add a caption (optional)…"
                      value={pendingAttachment.caption}
                      onChange={e => setPendingAttachment(prev => prev ? { ...prev, caption: e.target.value } : prev)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendAttachment(); }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="d-flex flex-column gap-2 flex-shrink-0">
                    <button
                      className="btn btn-sm btn-primary d-flex align-items-center gap-1"
                      onClick={handleSendAttachment}
                      disabled={sendingFile}
                    >
                      {sendingFile
                        ? <span className="spinner-border spinner-border-sm" />
                        : <><i className="ti ti-send fs-13" /> Send</>}
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={handleCancelAttachment}
                      disabled={sendingFile}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Text compose bar ──────────────────────────────────────── */}
            <div className="p-3">
              <div className="d-flex align-items-center gap-2">
                <div className="flex-fill">
                  <input
                    type="text"
                    className="form-control border-0 shadow-none ps-0 fs-13"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder="Type message response here…"
                    disabled={!!pendingAttachment}
                  />
                </div>
                <div className="d-flex align-items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="d-none"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.webp,.gif,.svg"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    className="btn btn-icon btn-light btn-sm rounded"
                    onClick={() => { fileInputRef.current?.click(); setShowEmojis(false); }}
                    title="Attach image or file"
                    disabled={!!pendingAttachment}
                  >
                    <i className="ti ti-paperclip" />
                  </button>
                  <button
                    type="button"
                    className={`btn btn-icon btn-sm rounded ${showEmojis ? 'btn-primary' : 'btn-light'}`}
                    onClick={() => { setShowEmojis(p => !p); setPendingAttachment(null); setEmojiSearch(''); setEmojiCategory(0); }}
                    title="Emoji"
                  >
                    <i className="ti ti-mood-smile-beam" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-primary btn-sm rounded"
                    onClick={handleSend}
                    disabled={!!pendingAttachment || !inputValue.trim()}
                    title="Send message"
                  >
                    <i className="ti ti-send" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      <ResolveModal
        show={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        onConfirm={handleResolve}
        busy={resolving}
        contactName={activeThread.name}
      />
      <TransferModal
        show={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onConfirm={handleTransferConfirm}
        users={allAgents}
        busy={actionBusy}
      />
      <EscalateModal
        show={showEscalateModal}
        onClose={() => setShowEscalateModal(false)}
        onConfirm={handleEscalateConfirm}
        supervisors={supervisors}
        busy={actionBusy}
      />
      <ReferModal
        show={showReferModal}
        onClose={() => setShowReferModal(false)}
        onConfirm={handleReferConfirm}
        busy={actionBusy}
      />
    </div>
  );
};