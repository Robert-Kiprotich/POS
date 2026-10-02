import React, { useState, useEffect, useCallback, useRef } from 'react';
import wsService from '../../../../../services/websocket';

interface Toast {
  id: number;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  persistent?: boolean;
}

interface Props {
  /** ID of the conversation currently open — new_message toasts for it are suppressed */
  activeConversationId?: string;
}

const LEVEL_STYLES: Record<Toast['level'], { bg: string; icon: string; border: string }> = {
  info:    { bg: '#1a73e8', icon: 'ℹ️', border: '#1558b0' },
  success: { bg: '#1e8e3e', icon: '✅', border: '#137333' },
  warning: { bg: '#f9ab00', icon: '⚠️', border: '#e37400' },
  error:   { bg: '#d93025', icon: '❌', border: '#a50e0e' },
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp:  '💬',
  facebook:  '📘',
  instagram: '📸',
  email:     '📧',
};

const NotificationToast: React.FC<Props> = ({ activeConversationId }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeIdRef = useRef(activeConversationId);
  activeIdRef.current = activeConversationId;

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]);
    if (!toast.persistent) setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  useEffect(() => {
    const unregister = wsService.onMessage((data: any) => {
      if (data.type === 'conversation_assigned') {
        const action: string = data.action || 'transfer';
        const fromName: string = data.from_name || 'A colleague';
        const contactName: string = data.contact_name || 'a contact';
        const isEscalation = action === 'escalation';
        push({
          title: isEscalation
            ? `⚠️ Escalation from ${fromName}`
            : `🔄 Conversation transferred to you`,
          body: isEscalation
            ? `${contactName} — ${data.reason || ''}`
            : `${contactName} via ${data.channel || ''}${data.note ? ' · ' + data.note : ''}`,
          level: isEscalation ? 'warning' : 'info',
          persistent: true,
        });
        return;
      }

      if (data.type === 'system_notification') {
        push({
          title: data.title || 'Notification',
          body: data.body || '',
          level: (['info', 'success', 'warning', 'error'].includes(data.level)
            ? data.level : 'info') as Toast['level'],
        });
        return;
      }

      if (data.type === 'new_message' && data.direction === 'inbound') {
        const convId = String(data.conversation_id);
        // Suppress if this conversation is currently open
        if (convId === activeIdRef.current) return;
        const contactName = data.conversation?.contact?.name
          || data.message?.sender_name
          || 'New message';
        const channel: string = data.conversation?.channel || data.channel || '';
        const icon = CHANNEL_ICON[channel] || '💬';
        const preview: string = (data.message?.content || data.message?.text || '').slice(0, 80);
        push({
          title: `${icon} ${contactName}`,
          body: preview,
          level: 'info',
        });
      }
    });
    return unregister;
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360,
    }}>
      {toasts.map(toast => {
        const s = LEVEL_STYLES[toast.level];
        return (
          <div key={toast.id} style={{
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 10, padding: '12px 16px',
            color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            animation: 'slideInRight 0.25s ease',
          }}>
            <span style={{ fontSize: 18, lineHeight: 1.3 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: toast.body ? 3 : 0 }}>
                {toast.title}
              </div>
              {toast.body && (
                <div style={{ fontSize: 13, opacity: 0.92, wordBreak: 'break-word' }}>
                  {toast.body}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              style={{
                background: 'none', border: 'none', color: '#fff',
                cursor: 'pointer', fontSize: 16, lineHeight: 1,
                padding: '0 0 0 4px', opacity: 0.8, flexShrink: 0,
              }}
            >×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default NotificationToast;
