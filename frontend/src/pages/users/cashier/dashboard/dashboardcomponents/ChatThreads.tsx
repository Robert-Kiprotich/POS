import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import ImageWithBasePath from "../../../../../components/imageWithBasePath";

export interface ChatThreadItem {
  id: string;
  name: string;
  email?: string;
  channel?: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isReadReceipt?: boolean;
  callInfo?: {
    status: string;
    type?: string;
    duration?: string;
    callId?: string;
  };
}

interface ChatThreadsProps {
  threads: ChatThreadItem[];
  selectedThreadId: string;
  onThreadSelect: (id: string) => void;
}

export const ChatThreads: React.FC<ChatThreadsProps> = ({
  threads,
  selectedThreadId,
  onThreadSelect,
}) => {
  const currentUser = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('user') || '{}'); } catch { return {}; }
  }, []);

  const displayName = currentUser.full_name || currentUser.username || 'You';
  const displayRole = currentUser.role || '';
  const avatarUrl   = currentUser.avatar_url || '';
  return (
    <div
      className="chat-user-nav border-end h-100 flex-shrink-0"
      style={{ width: "300px" }}
    >
      <OverlayScrollbarsComponent
        style={{ height: "calc(100vh - 200px)", width: "100%" }}
      >
        <div className="d-flex align-items-center justify-content-between border-bottom p-3 bg-white">
          <div className="d-flex align-items-center">
            <span className="avatar me-2 flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} className="rounded-circle" alt={displayName}
                  style={{ width: 38, height: 38, objectFit: 'cover' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span className="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white fw-semibold"
                  style={{ width: 38, height: 38, fontSize: 15 }}>
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div>
              <h6 className="fs-14 mb-1 text-dark fw-semibold">{displayName}</h6>
              <p className="mb-0 text-muted fs-12 text-capitalize">{displayRole}</p>
            </div>
          </div>
          <Link
            to="#"
            className="btn btn-icon btn-primary btn-sm d-flex align-items-center justify-content-center rounded"
          >
            <i className="ti ti-plus" />
          </Link>
        </div>

        <div>
          <div className="input-group w-auto input-group-flat p-4 pb-0">
            <span className="input-group-text border-end-0 bg-transparent text-muted">
              <i className="ti ti-search" />
            </span>
            <input
              type="text"
              className="form-control border-start-0 ps-1"
              placeholder="Search Keyword"
            />
          </div>

          <div className="chat-users p-4">
            <h6 className="mb-3 text-secondary fs-12 uppercase fw-bold tracking-wider">
              All Messages
            </h6>

            {threads.map((thread) => {
              const isActive = selectedThreadId === thread.id;
              const hasCall = thread.callInfo && thread.callInfo.status !== 'ended' && thread.callInfo.status !== 'failed';
              const callStatusColor = {
                'initiating': 'text-info',
                'ringing': 'text-warning',
                'connected': 'text-success',
              }[thread.callInfo?.status || ''] || 'text-secondary';
              
              return (
                <div
                  key={thread.id}
                  onClick={() => onThreadSelect(thread.id)}
                  className={`d-flex align-items-center justify-content-between rounded p-3 user-list mb-1 ${
                    isActive ? "active bg-light" : ""
                  }`}
                  style={{ cursor: "pointer", transition: "all 0.2s" }}
                >
                  <div className="d-flex align-items-center overflow-hidden">
                    <div className="avatar me-2 flex-shrink-0 position-relative">
                      <ImageWithBasePath
                        src={thread.avatar}
                        className="rounded-circle"
                        alt={thread.name}
                      />
                      {thread.unreadCount > 0 && (
                        <span
                          className="badge bg-danger rounded-circle position-absolute bottom-0 end-0 d-flex align-items-center justify-content-center p-0 text-white"
                          style={{
                            width: "18px",
                            height: "18px",
                            fontSize: "10px",
                            transform: "translate(25%, 25%)",
                            zIndex: 2,
                          }}
                        >
                          {thread.unreadCount}
                        </span>
                      )}
                      {hasCall && (
                        <span
                          className="badge bg-success rounded-circle position-absolute top-0 start-0 d-flex align-items-center justify-content-center p-0"
                          style={{
                            width: "16px",
                            height: "16px",
                            fontSize: "9px",
                            transform: "translate(-25%, -25%)",
                            zIndex: 2,
                          }}
                          title={`Call ${thread.callInfo?.status}`}
                        >
                          <i className="ti ti-phone" style={{ fontSize: '9px' }} />
                        </span>
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <h6 className="fs-14 mb-1 text-dark fw-semibold text-truncate">
                        {thread.name}
                      </h6>
                      {thread.channel === 'email' && thread.email && (
                        <p className="mb-0 text-truncate text-primary fs-11" style={{ maxWidth: "160px" }}>
                          {thread.email}
                        </p>
                      )}
                      <p
                        className="mb-0 text-truncate text-muted fs-13"
                        style={{ maxWidth: "140px" }}
                      >
                        {hasCall && (
                          <span className={callStatusColor}>
                            <i className="ti ti-phone me-1" style={{ fontSize: '11px' }} />
                          </span>
                        )}
                        {thread.lastMessage}
                      </p>
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <span className="text-muted d-block fs-11 mb-1">
                      {thread.timestamp}
                    </span>
                    {hasCall && thread.callInfo?.duration && (
                      <span className="badge bg-light text-dark fs-10">
                        <i className="ti ti-clock me-1" style={{ fontSize: '9px' }} />
                        {thread.callInfo.duration}
                      </span>
                    )}
                    {thread.isReadReceipt && (
                      <span className="d-block text-success fs-14">
                        <i className="ti ti-checks" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
};