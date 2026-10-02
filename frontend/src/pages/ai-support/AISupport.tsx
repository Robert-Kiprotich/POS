import { useState, useEffect, useRef } from "react";
import "./AISupport.css";
import axios from "axios";
import { BACKEND_URL } from "../../services/api";

// Dedicated axios instance that always hits the Django backend directly
const AI_API = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Copy CSRF token on every mutating request
AI_API.interceptors.request.use((config) => {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  if (match && ["post","put","patch","delete"].includes(config.method || "")) {
    config.headers["X-CSRFToken"] = match[1];
  }
  return config;
});

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AISession {
  id: string;
  title: string;
  messages: AIMessage[];
  created_at: Date;
}

interface CaseContext {
  id: number;
  case_number: string;
  client_name: string;
  status: string;
  category: string;
  description: string;
  created_at: string;
  conversations: Array<{
    id: string;
    message: string;
    sender: string;
    timestamp: string;
  }>;
}

const useAISupport = () => {
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your AI Support Assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);

  useEffect(() => {
    const saved = localStorage.getItem("ai_support_sessions");
    if (saved) {
      setSessions(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("ai_support_sessions", JSON.stringify(sessions));
  }, [sessions]);

  const addMessage = (message: AIMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const createSession = (title: string, initialMessages: AIMessage[]) => {
    const newSession: AISession = {
      id: Date.now().toString(),
      title,
      messages: initialMessages,
      created_at: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages(initialMessages);
    return newSession;
  };

  const loadSession = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      setMessages(session.messages);
    }
  };

  const deleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hi! I'm your AI Support Assistant. How can I help you today?",
          timestamp: new Date(),
        },
      ]);
    }
  };

  return {
    sessions,
    currentSessionId,
    messages,
    addMessage,
    createSession,
    loadSession,
    deleteSession,
    setSessions,
    setMessages,
    setCurrentSessionId,
  };
};

const AISupport = () => {
  const aiState = useAISupport();
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [caseContext, setCaseContext] = useState<CaseContext | null>(null);
  const [loadingCase, setLoadingCase] = useState(false);
  const [showCaseSearch, setShowCaseSearch] = useState(false);
  const [showCaseDetails, setShowCaseDetails] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiState.messages, loading]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    aiState.addMessage(userMessage);
    setInputValue("");
    setLoading(true);

    try {
      const response = await AI_API.post("/api/ai-chat/", {
        message: inputValue,
        conversation_history: aiState.messages
          .filter((msg) => msg.id !== "welcome")
          .map((msg) => ({ role: msg.role, content: msg.content })),
        case_context: caseContext,
      });

      const reply = response.data?.response || response.data?.error || "No response received.";
      aiState.addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      });
    } catch (error: any) {
      console.error("AI chat error:", error);
      const detail = error?.response?.data?.error || error?.message || "Unknown error";
      aiState.addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${detail}`,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadCase = async () => {
    if (!caseId.trim()) return;
    setLoadingCase(true);
    try {
      const response = await AI_API.get(`/api/cases/${caseId}/ai-context/`);
      const data = response.data;
      if (data) {
        setCaseContext(data);
        aiState.addMessage({
          id: Date.now().toString(),
          role: "assistant",
          content: `I've loaded case **${data.case_number}** for **${data.client_name}**.\n\n- Status: ${data.status}\n- Category: ${data.category}\n- Priority: ${data.priority}\n\nYou can now ask me anything about this case.`,
          timestamp: new Date(),
        });
      }
    } catch (error: any) {
      console.error("Case load error:", error);
      const detail = error?.response?.status === 404
        ? `No case found with ID "${caseId}".`
        : `Failed to load case: ${error?.response?.data?.error || error?.message}`;
      aiState.addMessage({
        id: Date.now().toString(),
        role: "assistant",
        content: detail,
        timestamp: new Date(),
      });
    } finally {
      setLoadingCase(false);
    }
  };

  const handleClearCase = () => {
    setCaseContext(null);
    setCaseId("");
    setShowCaseSearch(false);
    aiState.addMessage({
      id: Date.now().toString(),
      role: "assistant",
      content: "Case context cleared. Ask me anything or load a new case.",
      timestamp: new Date(),
    });
  };

  const handleNewChat = () => {
    setInputValue("");
    setCaseContext(null);
    setCaseId("");
    aiState.setCurrentSessionId(null);
    aiState.setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your AI Support Assistant. How can I help you today?",
      timestamp: new Date(),
    }]);
  };

  return (
    <>
      <div
        className="sidebar-ai-support offcanvas offcanvas-end"
        tabIndex={-1}
        id="ai-support-offcanvas"
      >
        <div className="d-flex align-items-center gap-2 px-3 py-3 offcanvas-header border-bottom" style={{background: '#E41F07', color: 'white'}}>
          <h5 className="flex-grow-1 mb-0">AI Support</h5>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleNewChat}
            title="New Chat"
            style={{background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none'}}
          >
            <i className="ti ti-plus" />
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowCaseSearch(!showCaseSearch)}
            title="Load Case Context"
            style={{background: caseContext ? '#FFA201' : 'rgba(255,255,255,0.2)', color: 'white', border: 'none'}}
          >
            <i className="ti ti-folder" />
          </button>
          <button
            type="button"
            className="btn-close btn-close-white"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          />
        </div>
        {showCaseSearch && (
          <div className="px-3 py-2 border-bottom bg-light">
            <div className="input-group input-group-sm mb-2">
              <input
                type="text"
                className="form-control"
                placeholder="Enter Case ID..."
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoadCase()}
                disabled={loadingCase}
              />
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleLoadCase}
                disabled={loadingCase || !caseId.trim()}
              >
                {loadingCase ? <span className="spinner-border spinner-border-sm" /> : <i className="ti ti-search" />}
              </button>
            </div>
            {caseContext && (
              <div className="d-flex align-items-center justify-content-between">
                <small className="text-muted">
                  <i className="ti ti-check-circle text-success me-1" />
                  Case {caseContext.case_number} loaded
                </small>
                <button
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={handleClearCase}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
        {caseContext && (
          <div className="px-3 py-2 border-bottom" style={{background: '#f8f9fa'}}>
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
              <span className="badge bg-primary" style={{fontSize: '0.9rem', padding: '0.5rem 0.75rem'}}>Case Loaded</span>
              <small className="text-muted fw-bold">{caseContext.case_number}</small>
              <div className="d-flex gap-1">
                <button
                  className="btn btn-sm btn-link p-0"
                  onClick={() => setShowCaseDetails(!showCaseDetails)}
                  title={showCaseDetails ? "Collapse case details" : "Expand case details"}
                  style={{color: '#666'}}
                >
                  {showCaseDetails ? (
                    <i className="ti ti-chevron-up" />
                  ) : (
                    <i className="ti ti-chevron-down" />
                  )}
                </button>
                <button
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={handleClearCase}
                  title="Clear case"
                >
                  ✕
                </button>
              </div>
            </div>
            
            {showCaseDetails && (
              <div className="small" style={{fontSize: '0.85rem'}}>
                <table className="table table-sm table-borderless mb-0" style={{marginBottom: '0'}}>
                  <tbody>
                    <tr>
                      <td style={{fontWeight: '600', width: '40%', paddingBottom: '0.5rem'}}>Case ID:</td>
                      <td style={{paddingBottom: '0.5rem'}}>{caseContext.case_number}</td>
                    </tr>
                    <tr>
                      <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Client:</td>
                      <td style={{paddingBottom: '0.5rem'}}>{caseContext.client_name}</td>
                    </tr>
                    <tr>
                      <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Status:</td>
                      <td style={{paddingBottom: '0.5rem'}}>
                        <span className={`badge ${caseContext.status?.toLowerCase() === 'closed' ? 'bg-success' : caseContext.status?.toLowerCase() === 'open' ? 'bg-warning' : 'bg-secondary'}`} style={{fontSize: '0.75rem'}}>
                          {caseContext.status}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Category:</td>
                      <td style={{paddingBottom: '0.5rem'}}>{caseContext.category}</td>
                    </tr>
                    {caseContext.priority && (
                      <tr>
                        <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Priority:</td>
                        <td style={{paddingBottom: '0.5rem'}}>
                          <span className={`badge ${caseContext.priority?.toLowerCase() === 'high' ? 'bg-danger' : caseContext.priority?.toLowerCase() === 'medium' ? 'bg-warning' : 'bg-info'}`} style={{fontSize: '0.75rem'}}>
                            {caseContext.priority}
                          </span>
                        </td>
                      </tr>
                    )}
                    {caseContext.created_at && (
                      <tr>
                        <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Created:</td>
                        <td style={{paddingBottom: '0.5rem'}}>{caseContext.created_at}</td>
                      </tr>
                    )}
                    {caseContext.reporter && caseContext.reporter.name && (
                      <tr>
                        <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Reporter:</td>
                        <td style={{paddingBottom: '0.5rem'}}>{caseContext.reporter.name} {caseContext.reporter.phone && `(${caseContext.reporter.phone})`}</td>
                      </tr>
                    )}
                    {caseContext.conversations && caseContext.conversations.length > 0 && (
                      <tr>
                        <td style={{fontWeight: '600', paddingBottom: '0.5rem'}}>Messages:</td>
                        <td style={{paddingBottom: '0.5rem'}}>
                          <span className="badge bg-info" style={{fontSize: '0.75rem'}}>
                            {caseContext.conversations.length}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="offcanvas-body h-100 d-flex flex-column p-0">
          <div className="ai-messages-panel flex-grow-1" style={{padding: '12px', overflowY: 'auto'}}>
            {aiState.messages.map((message) => (
              <div
                key={message.id}
                className={`ai-message-bubble ai-${message.role}`}
              >
                <span className="ai-avatar">
                  {message.role === "user" ? "👤" : "🤖"}
                </span>
                <div className="ai-message-body">
                  <p className="ai-message-text" style={{whiteSpace: 'pre-wrap'}}>{message.content}</p>
                  <small className="ai-message-time">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-message-bubble ai-assistant">
                <span className="ai-avatar">🤖</span>
                <div className="ai-message-body">
                  <div className="ai-typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-input-section" style={{padding: '12px', marginTop: 0, border: 'none'}}>
            <div className="input-group mb-0">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Ask a question..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                disabled={loading}
              />
              <button
                className="btn btn-sm"
                type="button"
                onClick={handleSendMessage}
                disabled={loading || !inputValue.trim()}
                style={{background: '#FFA201', color: 'white', border: 'none'}}
              >
                <i className="ti ti-send" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AISupport;
