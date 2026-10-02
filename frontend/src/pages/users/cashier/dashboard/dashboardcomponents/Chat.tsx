import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChatThreads } from "./ChatThreads";
import { ChatWindow } from "./ChatWindow";
import type { ChatThreadItem } from "./ChatThreads";
import MessageItem from "./Chat";
import API, { BACKEND_URL } from "../../../../../services/api";
import wsService from "../../../../../services/websocket";
import NotificationToast from "./NotificationToast";

// Route Facebook/Meta CDN profile picture URLs through the backend proxy
// to avoid CORS blocks and handle token-gated URLs
const proxyProfilePic = (url?: string | null): string => {
  if (!url) return 'assets/img/users/avatar-5.jpg';
  if (url.includes('fbsbx.com') || url.includes('fbcdn.net')) {
    return `${BACKEND_URL}/api/media-proxy/?url=${encodeURIComponent(url)}&channel=facebook`;
  }
  return url;
};

export interface MessageItem {
  id: number;
  sender: "them" | "you";
  senderName: string;
  senderEmail?: string;
  avatar: string;
  text: string;
  timestamp: string;
  channel?: string;
  message_type?: string;
  mediaUrl?: string;
  filename?: string;
  metadata?: Record<string, any>;
  html_body?: string;
  subject?: string;
  signature?: string;
  wa_status?: string;
}

interface ChatProps {
  onThreadSelect: (
    thread: { id: string; name: string; avatar: string; channel: string },
    messages: MessageItem[]
  ) => void;
  triggerModalOpen: () => void;
}

const Chat: React.FC<ChatProps> = ({ onThreadSelect, triggerModalOpen }) => {
  const [threads, setThreads] = useState<ChatThreadItem[]>([]);
  const [conversations, setConversations] = useState<Record<string, MessageItem[]>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [lockedThreads, setLockedThreads] = useState<Record<string, { action: 'transferred' | 'escalated'; toName: string }>>({});
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [supervisors, setSupervisors] = useState<{ id: number; name: string; role: string }[]>([]);
  const currentUser = React.useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('user') || '{}'); } catch { return {}; }
  }, []);
  const myName = currentUser.full_name || currentUser.username || 'You';
  const myAvatar = currentUser.avatar_url || 'assets/img/users/avatar-2.jpg';
  const wsCleanupRef = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const selectedThreadIdRef = useRef<string>("");
  const fetchMessagesRef = useRef<((id: string) => Promise<any>) | null>(null);

  // Helper function to format timestamps
  const formatTimestamp = (timestamp: string): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isYesterday) return 'Yesterday';
    return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Full timestamp for message bubbles (always show date + time)
  const formatMessageTimestamp = (timestamp: string): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    return `${date.toLocaleDateString([], { day: '2-digit', month: 'short' })}, ${time}`;
  };

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    console.log('🔌 Setting up WebSocket connection...');
    
    // Connect to WebSocket
    wsService.connect();
    
    // Listen for new messages
    const handleMessage = (data: any) => {
      console.log('📨 WebSocket event:', data.type, data);
      
      if (data.type === 'conversation_assigned') {
        const convId = String(data.conversation_id);
        const currentUserId = currentUser.id;
        // If this assignment is for ME, add the thread to my list
        if (data.assigned_to_id === currentUserId) {
          setThreads(prev => {
            if (prev.some(t => t.id === convId)) return prev;
            const newThread: ChatThreadItem = {
              id: convId,
              name: data.contact_name || 'Contact',
              channel: data.channel || '',
              avatar: 'assets/img/users/avatar-5.jpg',
              lastMessage: data.action === 'escalation'
                ? `Escalated by ${data.from_name}${data.reason ? ': ' + data.reason : ''}`
                : `Transferred by ${data.from_name}${data.note ? ': ' + data.note : ''}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              unreadCount: 1,
            };
            return [newThread, ...prev];
          });
        }
        return;
      }

      if (data.type === 'message_status') {
        const { conversation_id, message_id, wa_status } = data;
        setConversations(prev => {
          const msgs = prev[String(conversation_id)];
          if (!msgs) return prev;
          return {
            ...prev,
            [String(conversation_id)]: msgs.map(m =>
              m.id === message_id ? { ...m, wa_status } : m
            ),
          };
        });
      }

      if (data.type === 'new_message') {
        const { conversation_id, message, conversation } = data;
        
        if (message && conversation_id) {
          const convIdStr = String(conversation_id);

          // If this conversation is currently open, silently merge new messages
          if (convIdStr === selectedThreadIdRef.current) {
            fetchMessagesRef.current?.(convIdStr, true);
          } else {
            // For background conversations, add the message to state
            const contactAvatar = proxyProfilePic(
                                 conversation?.contact?.profile_pic_url || 
                                 conversation?.contact?.pic_https || 
                                 conversation?.contact?.profile_picture);
            
            const newMessage: MessageItem = {
              id: message.id || Date.now(),
              sender: message.direction === 'outbound' ? 'you' : 'them',
              senderName: message.direction === 'outbound' ? 'You' : (message.sender_name || conversation?.contact?.name || 'Contact'),
              senderEmail: message.direction === 'inbound' ? message.sender_email : undefined,
              avatar: message.direction === 'outbound' ? myAvatar : contactAvatar,
              text: message.content || message.text || '',
              timestamp: message.created_at 
                ? formatMessageTimestamp(message.created_at) 
                : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              channel: conversation?.channel,
              message_type: message.message_type || 'text',
              mediaUrl: message.media_url || '',
              filename: message.filename || '',
              metadata: { filename: message.filename || '', mime_type: message.mime_type || '' },
              wa_status: message.wa_status || '',
            };
            
            setConversations(prev => {
              const existingMessages = prev[convIdStr] || [];
              const exists = existingMessages.some(m => m.id === newMessage.id);
              if (exists) return prev;
              return { ...prev, [convIdStr]: [...existingMessages, newMessage] };
            });
          }
          
          // Always update the thread's last message preview
          setThreads(prev => prev.map(thread => {
            if (thread.id === convIdStr) {
              return {
                ...thread,
                lastMessage: message.content || message.text || '',
                timestamp: message.created_at ? formatMessageTimestamp(message.created_at) : thread.timestamp,
                unreadCount: convIdStr === selectedThreadIdRef.current ? 0 : (thread.unreadCount || 0) + 1,
              };
            }
            return thread;
          }));
        }
      }
      
      // Handle call-related WebSocket events
      if (data.type === 'call_initiated' || data.type === 'call_started' || data.type === 'call_ended') {
        const { conversation_id, call } = data;
        
        if (conversation_id) {
          // Update thread with call information
          setThreads(prev => prev.map(thread => {
            if (thread.id === String(conversation_id)) {
              const callStatus = call?.status || 'initiating';
              const callDuration = call?.duration_formatted ? ` (${call.duration_formatted})` : '';
              const callIcon = call?.call_type === 'incoming' ? '📥' : '📞';
              
              return {
                ...thread,
                lastMessage: `${callIcon} Call ${callStatus}${callDuration}`,
                timestamp: formatTimestamp(call?.started_at || new Date().toISOString()),
                callInfo: {
                  status: callStatus,
                  type: call?.call_type,
                  duration: call?.duration_formatted,
                  callId: call?.id,
                },
              };
            }
            return thread;
          }));
          
          // Show notification to user
          if (call?.status === 'connected' || call?.call_type === 'incoming') {
            // You could add a toast notification here
            console.log(`📞 ${call.call_type} call ${call.status} for conversation ${conversation_id}`);
          }
        }
      }
    };
    
    // Register handler
    const unregister = wsService.onMessage(handleMessage);
    wsCleanupRef.current = unregister;
    
    // Cleanup on unmount
    return () => {
      console.log('🔌 Cleaning up WebSocket...');
      if (wsCleanupRef.current) {
        wsCleanupRef.current();
      }
    };
  }, []);

  // Fetch conversations from API
  useEffect(() => {
    console.log('🚀 Chat component mounted - fetching conversations...');
    const fetchConversations = async () => {
      try {
        setLoading(true);
        console.log('📡 Making API request to: conversations/');
        const response = await API.get('conversations/');
        console.log('✅ API Response received:', response.data);
        
        // API returns { conversations: [...], total: N, page: 1, page_size: 20 }
        if (response.data && response.data.conversations) {
          const apiConversations = response.data.conversations;
          console.log(`📊 Found ${apiConversations.length} conversation(s)`);
          
          // Transform API data to thread format
          const threadItems: ChatThreadItem[] = apiConversations.map((conv: {
            id: number;
            assigned_to?: { name?: string };
            contact?: { name?: string; profile_picture?: string; pic_https?: string; profile_pic_url?: string; email?: string };
            channel?: string;
            last_message_preview?: string;
            last_message_at?: string;
            created_at?: string;
            unread_count?: number;
          }) => ({
            id: String(conv.id),
            name: conv.contact?.name || 'Unknown Contact',
            email: conv.contact?.email || '',
            channel: conv.channel || '',
            avatar: proxyProfilePic(
                   conv.contact?.profile_pic_url || 
                   conv.contact?.pic_https || 
                   conv.contact?.profile_picture
                   ),
            lastMessage: conv.last_message_preview || 'No messages yet',
            timestamp: formatTimestamp(conv.last_message_at || conv.created_at || ''),
            unreadCount: conv.unread_count || 0,
          }));
          
          console.log('📝 Transformed threads:', threadItems);
          setThreads(threadItems);
        } else {
          console.warn('⚠️ No results in API response');
        }
      } catch (error) {
        console.error('❌ Failed to fetch conversations:', error);
        // Fallback to empty array if API fails
        setThreads([]);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
    API.get('assignable-users/').then(r => {
      if (r.data?.users) setAssignableUsers(r.data.users);
    }).catch(() => {});
    API.get('supervisors/').then(r => {
      if (r.data?.supervisors) setSupervisors(r.data.supervisors);
    }).catch(() => {});
  }, []);

  // Transform a raw API message object into a MessageItem
  const transformMessage = useCallback((msg: any, contactName: string, contactAvatar: string, channel: string): MessageItem => ({
    id: msg.id,
    sender: msg.direction === 'outbound' ? 'you' : 'them',
    senderName: msg.direction === 'outbound' ? myName : contactName,
    senderEmail: msg.direction === 'inbound' ? msg.sender_email : undefined,
    avatar: msg.direction === 'outbound' ? myAvatar : contactAvatar,
    text: msg.content || msg.text || '',
    timestamp: formatMessageTimestamp(msg.created_at),
    channel,
    message_type: msg.message_type || 'text',
    mediaUrl: msg.media_url || msg.metadata?.media_url || '',
    filename: msg.filename || msg.metadata?.filename || '',
    metadata: {
      ...(msg.metadata || {}),
      media_id: msg.media_id || msg.metadata?.media_id || '',
      filename: msg.filename || msg.metadata?.filename || '',
      mime_type: msg.mime_type || msg.metadata?.mime_type || '',
    },
    html_body: msg.html_body || '',
    subject: msg.subject || '',
    signature: msg.signature || '',
    wa_status: msg.wa_status || '',
  }), [myName, myAvatar]);

  // Fetch messages — full load on first open, silent merge on background polls
  const fetchMessages = useCallback(async (conversationId: string, silent = false) => {
    try {
      // silent=true (background poll): don't mark read, don't send WA blue ticks
      const url = silent
        ? `conversations/${conversationId}/`
        : `conversations/${conversationId}/?mark_read=true`;
      const response = await API.get(url);
      if (response.data?.messages) {
        const contactName = response.data.conversation?.contact?.name || 'Contact';
        const contactAvatar = response.data.conversation?.contact?.profile_pic_url ||
          response.data.conversation?.contact?.pic_https ||
          response.data.conversation?.contact?.profile_picture ||
          'assets/img/users/avatar-5.jpg';
        const channel = response.data.channel || response.data.conversation?.channel || '';
        const incoming: MessageItem[] = response.data.messages.map((msg: any) =>
          transformMessage(msg, contactName, contactAvatar, channel)
        );
        setConversations(prev => {
          const existing = prev[conversationId] || [];
          if (!silent) return { ...prev, [conversationId]: incoming };
          // Silent merge: only append messages whose id isn't already present
          const existingIds = new Set(existing.map(m => m.id));
          const newOnes = incoming.filter(m => !existingIds.has(m.id));
          if (newOnes.length === 0) return prev; // nothing changed — no re-render
          return { ...prev, [conversationId]: [...existing, ...newOnes] };
        });
        return incoming;
      }
    } catch {
      // silent — don't log on background polls
    }
    return [];
  }, [transformMessage]);

  const activeThread = threads.find((t) => t.id === selectedThreadId) || null;
  const activeMessages = conversations[selectedThreadId] || [];

  // Keep ref in sync so WS handler always has current value
  selectedThreadIdRef.current = selectedThreadId;
  fetchMessagesRef.current = fetchMessages;

  // Poll active conversation silently every 3s — appends only new messages, no scroll jump
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (!selectedThreadId) return;
    pollIntervalRef.current = setInterval(() => {
      if (selectedThreadIdRef.current) {
        fetchMessagesRef.current?.(selectedThreadIdRef.current, true);
      }
    }, 3000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [selectedThreadId]);

  const handleThreadSelectAndOpenModal = async (id: string) => {
    console.log('👆 Thread selected:', id);
    setSelectedThreadId(id);
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t))
    );

    // ALWAYS fetch fresh messages when opening a conversation
    console.log('📥 Fetching messages for conversation:', id);
    const messages = await fetchMessages(id);

    const thread = threads.find((t) => t.id === id);

    if (thread) {
      // Notify Tabs so CaseModal gets the right data with the fetched messages
      console.log('📤 Passing', messages.length, 'messages to CaseModal');
      onThreadSelect(thread, messages);
    }

    setTimeout(triggerModalOpen, 100);
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedThreadId) return;

    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    
    // Optimistically add message to UI
    const newMessage: MessageItem = {
      id: Date.now(),
      sender: "you",
      senderName: myName,
      avatar: myAvatar,
      text,
      timestamp,
      wa_status: 'sent',
    };
    
    setConversations((prev) => ({
      ...prev,
      [selectedThreadId]: [...(prev[selectedThreadId] || []), newMessage],
    }));

    // Send to API
    try {
      await API.post('send-message/', {
        conversation_id: parseInt(selectedThreadId),
        message: text,
      });
      
      // Refresh conversation to get updated messages
      await fetchMessages(selectedThreadId);
    } catch (error) {
      console.error('Failed to send message:', error);
      // You could add error handling UI here
    }
  };

  const handleSendFile = async (file: File, caption = '') => {
    if (!selectedThreadId) return;

    const mime = file.type || 'application/octet-stream';
    let msgType: MessageItem['message_type'] = 'document';
    if (mime.startsWith('image/')) msgType = 'image';
    else if (mime.startsWith('audio/')) msgType = 'audio';
    else if (mime.startsWith('video/')) msgType = 'video';

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Optimistic preview using a local object URL
    const localUrl = URL.createObjectURL(file);
    const optimisticMsg: MessageItem = {
      id: Date.now(),
      sender: 'you',
      senderName: myName,
      avatar: myAvatar,
      text: caption || file.name,
      timestamp,
      message_type: msgType,
      mediaUrl: localUrl,
      filename: file.name,
      metadata: { filename: file.name, mime_type: mime },
    };

    setConversations((prev) => ({
      ...prev,
      [selectedThreadId]: [...(prev[selectedThreadId] || []), optimisticMsg],
    }));

    try {
      const formData = new FormData();
      formData.append('conversation_id', selectedThreadId);
      formData.append('file', file);
      formData.append('caption', caption);

      await API.post('send-media/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Refresh to get the real server message (with actual media_url)
      await fetchMessages(selectedThreadId);
    } catch (error) {
      console.error('Failed to send file:', error);
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };

  const handleResolveConversation = () => {
    if (!selectedThreadId) return;
    setThreads(prev => prev.filter(t => t.id !== selectedThreadId));
    setConversations(prev => { const n = {...prev}; delete n[selectedThreadId]; return n; });
    setSelectedThreadId('');
  };

  const handleEscalateConversation = (toName: string) => {
    setLockedThreads(prev => ({ ...prev, [selectedThreadId]: { action: 'escalated', toName } }));
  };

  const handleTransferConversation = (userId: number, userName: string) => {
    setLockedThreads(prev => ({ ...prev, [selectedThreadId]: { action: 'transferred', toName: userName } }));
  };

  return (
    <div className="chat-wrapper">
      <NotificationToast activeConversationId={selectedThreadId || undefined} />
      <div className="card shadow-none mb-0 rounded-0 border-0">
        <div className="card-body p-0">
          <div className="d-lg-flex">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center" style={{ width: '300px', height: 'calc(100vh - 200px)' }}>
                <div className="text-center">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-2 text-muted fs-13">Loading conversations...</p>
                </div>
              </div>
            ) : (
              <ChatThreads
                threads={threads}
                selectedThreadId={selectedThreadId}
                onThreadSelect={handleThreadSelectAndOpenModal}
              />
            )}
            <ChatWindow
              activeThread={activeThread}
              messages={activeMessages}
              onSendMessage={handleSendMessage}
              onSendFile={handleSendFile}
              onOpenCaseModal={triggerModalOpen}
              onResolve={handleResolveConversation}
              onEscalate={handleEscalateConversation}
              onTransfer={handleTransferConversation}
              assignableUsers={assignableUsers}
              supervisors={supervisors}
              lockedInfo={selectedThreadId ? lockedThreads[selectedThreadId] : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;