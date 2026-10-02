import React, { useState, useEffect, useRef } from 'react'
import { Link } from "react-router"
import Chat from './Chat'
import Cases from './Cases'
import CaseModal from './modals/modalCases'
import type { MessageItem } from './Chat'
import wsService from '../../../../../services/websocket'
import { BACKEND_URL } from '../../../../../services/api'

const proxyProfilePic = (url?: string | null): string => {
  if (!url) return 'assets/img/users/avatar-5.jpg';
  if (url.includes('fbsbx.com') || url.includes('fbcdn.net')) {
    return `${BACKEND_URL}/api/media-proxy/?url=${encodeURIComponent(url)}&channel=facebook`;
  }
  return url;
};

function Tabs() {
  const [activeTab, setActiveTab] = useState<'chat' | 'cases'>('chat');

  // Lifted state so CaseModal can be shared between both tabs
  const [activeThread, setActiveThread] = useState<{ id: string; name: string; avatar: string; channel: string } | null>(null);
  const [chatContextMessages, setChatContextMessages] = useState<MessageItem[]>([]);
  const [showChat, setShowChat] = useState(false);
  const wsCleanupRef = useRef<(() => void) | null>(null);

  const handleThreadSelect = (
    thread: { id: string; name: string; avatar: string },
    messages: MessageItem[]
  ) => {
    setActiveThread(thread);
    setChatContextMessages(messages);
    setShowChat(true);
  };
const handleOpenFromCases = () => {
    setShowChat(false);
    setActiveThread(null);
    setChatContextMessages([]);
  };
  



  // Listen for real-time message updatescon
  useEffect(() => {
    const handleMessage = (data: any) => {
      if (data.type === 'new_message') {
        const { conversation_id, message, conversation } = data;
        
        // If this message is for the currently open conversation, update it
        if (activeThread && String(conversation_id) === activeThread.id && message) {
          // Get avatar from conversation contact if available
          const contactAvatar = proxyProfilePic(
                               conversation?.contact?.profile_pic_url || 
                               conversation?.contact?.pic_https || 
                               conversation?.contact?.profile_picture);
          
          const newMessage: MessageItem = {
            id: message.id || Date.now(),
            sender: message.direction === 'outbound' ? 'you' : 'them',
            senderName: message.direction === 'outbound' ? 'You' : activeThread.name,
            avatar: message.direction === 'outbound' 
              ? 'assets/img/users/avatar-2.jpg' 
              : contactAvatar,
            text: message.content || message.text || '',
            timestamp: message.created_at 
              ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            message_type: message.message_type || 'text',
            mediaUrl: message.media_url || '',
            filename: message.filename || '',
            metadata: { filename: message.filename || '', mime_type: message.mime_type || '' },
          };
          
          setChatContextMessages(prev => {
            // Prevent duplicates
            const exists = prev.some(m => m.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
          });
          
          console.log('🔄 Tabs: Updated CaseModal with new real-time message');
        }
      }
    };
    
    const unregister = wsService.onMessage(handleMessage);
    wsCleanupRef.current = unregister;
    
    return () => {
      if (wsCleanupRef.current) {
        wsCleanupRef.current();
      }
    };
  }, [activeThread]);

   const triggerModalOpen = () => {
    const element = document.getElementById("offcanvas_add");
    if (!element) return;
   
    const bsOffcanvas = window.bootstrap?.Offcanvas.getOrCreateInstance(element);
    bsOffcanvas?.show();
  };


  const handleSendMessage = async (text: string) => {
    if (!activeThread) return;
    
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    
    // Optimistically add to UI
    const newMsg: MessageItem = {
      id: Date.now(),
      sender: "you",
      senderName: "You",
      avatar: "assets/img/users/avatar-2.jpg",
      text,
      timestamp,
    };
    
    setChatContextMessages((prev) => [...prev, newMsg]);
    
    // Send via API (will be broadcast via WebSocket)
    try {
      const API = (await import('../../../../../services/api')).default;
      await API.post('send-message/', {
        conversation_id: parseInt(activeThread.id),
        message: text,
      });
      console.log('✅ Message sent via API');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  };

  const handleSendFile = async (file: File) => {
    if (!activeThread) return;

    const mime = file.type || 'application/octet-stream';
    let msgType = 'file';
    if (mime.startsWith('image/')) msgType = 'image';
    else if (mime.startsWith('audio/')) msgType = 'audio';
    else if (mime.startsWith('video/')) msgType = 'video';

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const localUrl = URL.createObjectURL(file);

    const optimisticMsg: MessageItem = {
      id: Date.now(),
      sender: 'you',
      senderName: 'You',
      avatar: 'assets/img/users/avatar-2.jpg',
      text: file.name,
      timestamp,
      message_type: msgType as MessageItem['message_type'],
      mediaUrl: localUrl,
      filename: file.name,
      metadata: { filename: file.name, mime_type: mime },
    };

    setChatContextMessages((prev) => [...prev, optimisticMsg]);

    try {
      const API = (await import('../../../../../services/api')).default;
      const formData = new FormData();
      formData.append('conversation_id', activeThread.id);
      formData.append('file', file);
      formData.append('caption', '');
      await API.post('send-media/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.log('✅ File sent via API');
    } catch (error) {
      console.error('❌ Failed to send file:', error);
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  };



useEffect(() => {
  const handleGlobalCreateCaseFlow = () => {
    // 1. Force the active tab view to switch over to the Case List
    setActiveTab('cases'); 

    // 2. Clear out the active thread and chat states 
    handleOpenFromCases();
    
    // 3. Fire the Bootstrap modal sequence after a minor timeout 
    //    to match your internal Cases button behavior
    setTimeout(() => {
      triggerModalOpen();
    }, 50);
  };

  window.addEventListener('trigger-create-case-flow', handleGlobalCreateCaseFlow);
  
  return () => {
    window.removeEventListener('trigger-create-case-flow', handleGlobalCreateCaseFlow);
  };
}, []);
  return (
    <div className="col-lg-9">
      <div className="card">
        <div className="card-body">

          <ul className="nav nav-tabs nav-solid-success nav-tabs-rounded nav-justified mb-4">
            <li className="nav-item">
              <Link
                className={`nav-link ${activeTab === 'chat' ? 'active' : ''}`}
                to="#solid-rounded-justified-tab1"
                data-bs-toggle="tab"
                onClick={() => setActiveTab('chat')}
              >
                Chat Sources
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link ${activeTab === 'cases' ? 'active' : ''}`}
                to="#solid-rounded-justified-tab2"
                data-bs-toggle="tab"
                onClick={() => setActiveTab('cases')}
              >
                Case List
              </Link>
            </li>
          </ul>

          <div className="tab-content">
            <div className="tab-pane show active" id="solid-rounded-justified-tab1">
              <Chat
                onThreadSelect={handleThreadSelect}
                triggerModalOpen={triggerModalOpen}
              />
            </div>
            <div className="tab-pane" id="solid-rounded-justified-tab2">
              <Cases onCreateCase={handleOpenFromCases} triggerModalOpen={triggerModalOpen} />
            </div>
          </div>

        </div>
      </div>

      {/* Single CaseModal instance shared by both tabs */}
      <CaseModal
        showChat={showChat}
        activeThread={activeThread}
        chatContextMessages={chatContextMessages}
        onSendMessage={handleSendMessage}
        onSendFile={handleSendFile}
      />
    </div>
  )
}

export default Tabs