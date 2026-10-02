import { Link, useNavigate } from "react-router";
import HeaderSearchmodal from "../header-searchModal/headerSearchmodal";
import { useDispatch, useSelector } from "react-redux";
import { setMobileSidebar } from "../../core/redux/sidebarSlice";
import { useEffect, useState } from "react";
import { updateTheme } from "../../core/redux/themeSlice";
import { all_routes } from "../../routes/all_routes";
import API from "../../services/api";
import posLogo from "../../../Logo.jpeg";
// 1. Import CaseModal component
import CaseModal from "../../pages/users/cashier/dashboard/dashboardcomponents/modals/modalCases"; // Adjust this import path depending on where modalCases.tsx sits relative to this dashboard
import type { MessageItem } from "../../pages/users/cashier/dashboard/dashboardcomponents/Chat"; // Import definition types if needed



interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string;
  is_admin: boolean;
}

interface NotificationCounts {
  unread_messages: number;
  assigned_conversations: number;
}

const Header = () => {
  const navigate = useNavigate();
  const route = all_routes;
  const dispatch = useDispatch();
  const themeSettings = useSelector((state: any) => state.theme.themeSettings);
  const mobileSidebar = useSelector((state: any) => state.sidebarSlice.mobileSidebar);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationCounts>({
    unread_messages: 0,
    assigned_conversations: 0,
  });
  // 2. Set up local state variables for CaseModal integration
  const [activeThread, setActiveThread] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [chatContextMessages, setChatContextMessages] = useState<MessageItem[]>([]);
  const [showChat, setShowChat] = useState(false);
  const CASE_MODAL_ID = "offcanvas_add_walkin"; // distinct from Tabs' "offcanvas_add"

useEffect(() => {
  const handleGlobalCreateCaseFlow = () => {
    // Isolated standalone manual case entry — no thread context
    setShowChat(false);
    setActiveThread(null);
    setChatContextMessages([]);
    // CaseModal listens for this same event and opens itself with case_source = "walk-in"
  };

  window.addEventListener("trigger-create-case-flow", handleGlobalCreateCaseFlow);
  return () => window.removeEventListener("trigger-create-case-flow", handleGlobalCreateCaseFlow);
}, []);
  const fetchUserData = async () => {
    // Seed immediately from sessionStorage so header shows on first render
    try {
      const stored = sessionStorage.getItem("user");
      if (stored && !userProfile) setUserProfile(JSON.parse(stored));
    } catch { /* ignore */ }

    // Then fetch fresh data from the server
    try {
      const res = await API.get("me/");
      if (res.data?.status === "success") {
        setUserProfile(res.data.user);
        setNotifications(res.data.notifications);
        // Keep sessionStorage in sync
        sessionStorage.setItem("user", JSON.stringify(res.data.user));
      }
    } catch { /* stay with sessionStorage data */ }
  };

  useEffect(() => {
    fetchUserData();
    const interval = setInterval(fetchUserData, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleMobileSidebar = () => dispatch(setMobileSidebar(!mobileSidebar));

  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleUpdateTheme = (key: string, value: string) => {
    if (themeSettings["dir"] === "rtl" && key !== "dir") dispatch(updateTheme({ dir: "ltr" }));
    dispatch(updateTheme({ [key]: value }));
  };



  useEffect(() => {
    const el: any = document.documentElement;
    Object.entries(themeSettings).forEach(([k, v]) => el.setAttribute(k, v));
  }, [themeSettings]);

  const displayName = userProfile?.full_name || userProfile?.username || "…";
  const displayRole = userProfile?.role || "";
  const avatarSrc = userProfile?.avatar_url || "";
  const totalUnread = notifications.unread_messages;

  // Route the logo link to the dashboard matching the logged-in user's role
  const roleDashboardRoute = (() => {
    switch (userProfile?.role) {
      case "Admin":
        return route.adminDashboard;
      case "Store Manager":
        return route.supervisorDashboard;
      case "Cashier":
      default:
        return route.dashboard;
    }
  })();

  /** Renders user avatar: photo if available, else initial letter */
  const UserAvatar = ({ size, className = "" }: { size: number; className?: string }) =>
    avatarSrc ? (
      <img
        src={avatarSrc}
        width={size}
        height={size}
        className={`rounded-1 ${className}`}
        alt={displayName}
        style={{ objectFit: "cover" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    ) : (
      <span
        className={`rounded-1 d-flex align-items-center justify-content-center bg-primary text-white fw-semibold ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {displayName.charAt(0).toUpperCase()}
      </span>
    );

  return (
    <>
      {/* Topbar Start */}
      <header className="navbar-header" style={{ marginLeft: 0, width: "100%" }}>
        <div className="page-container topbar-menu">
          <div className="d-flex align-items-center gap-2">
            {/* Logo */}
            <Link to={route.dashboard} className="logo d-flex align-items-center">
              <span className="logo-light">
                <img src={posLogo} alt="Pos" style={{ height: 36, objectFit: "contain" }} />
              </span>
             
            </Link>
            {/* Sidebar toggle */}
            <Link id="mobile_btn" className="mobile-btn" to="#sidebar" onClick={toggleMobileSidebar}>
              <i className="ti ti-menu-deep fs-24" />
            </Link>
            <button className="sidenav-toggle-btn btn border-0 p-0" id="toggle_btn2">
              <i className="ti ti-arrow-bar-to-right" />
            </button>
            {/* Search */}
            <div className="me-auto d-flex align-items-center header-search d-lg-flex d-none">
              <div className="input-icon position-relative me-2">
                <input type="text" className="form-control" placeholder="Search Keyword" />
                <span className="input-icon-addon d-inline-flex p-0 header-search-icon">
                  <i className="ti ti-command" />
                </span>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center">
            {/* Mobile search */}
            <div className="header-item d-flex d-lg-none me-2">
              <button className="topbar-link btn" data-bs-toggle="modal" data-bs-target="#searchModal" type="button">
                <i className="ti ti-search fs-16" />
              </button>
            </div>

            {/* Fullscreen */}
            <div className="header-item">
              <div className="dropdown me-2">
                <Link to="#" className="btn topbar-link btnFullscreen" onClick={toggleFullscreen}>
                  <i className="ti ti-maximize" />
                </Link>
              </div>
            </div>
                    {/* Fullscreen */}
    {/* <div className="header-item">
  <div className="dropdown me-2">
    <Link 
      to="#" 
      className="btn topbar-link" 
      onClick={(e) => {
        e.preventDefault();
        // Fire the global event to trigger the sequence in Tabs
        window.dispatchEvent(new CustomEvent('trigger-create-case-flow'));
      }}
    >
      <i className="ti ti-walk" />
    </Link>
  </div>
</div> */}
            {/* Light/Dark mode */}
            <div className="header-item d-none d-sm-flex me-2">
              <Link
                to="#"
                id="dark-mode-toggle"
                className={`topbar-link btn btn-icon topbar-link header-togglebtn ${themeSettings["data-bs-theme"] === "dark" ? "activate" : ""}`}
                onClick={() => handleUpdateTheme("data-bs-theme", "light")}
              >
                <i className="ti ti-sun fs-16" />
              </Link>
              <Link
                to="#"
                id="light-mode-toggle"
                className={`topbar-link btn btn-icon topbar-link header-togglebtn ${themeSettings["data-bs-theme"] === "light" ? "activate" : ""}`}
                onClick={() => handleUpdateTheme("data-bs-theme", "dark")}
              >
                <i className="ti ti-moon fs-16" />
              </Link>
            </div>

            {/* Grid apps */}
            <div className="header-item d-none d-sm-flex">
              <div className="dropdown me-2">
                <Link to="#" className="btn topbar-link topbar-teal-link" data-bs-toggle="dropdown">
                  <i className="ti ti-layout-grid-add" />
                </Link>
                <div className="dropdown-menu dropdown-menu-end dropdown-menu-md p-2">
                  <Link to={route.contactGrid} className="dropdown-item">
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <span className="d-flex mb-1 fw-semibold text-dark">Contacts</span>
                        <span className="fs-13">View All the Contacts</span>
                      </div>
                      <i className="ti ti-chevron-right-pipe text-dark" />
                    </div>
                  </Link>
                  <Link to={route.pipeline} className="dropdown-item">
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <span className="d-flex mb-1 fw-semibold text-dark">Pipeline</span>
                        <span className="fs-13">View All the Pipeline</span>
                      </div>
                      <i className="ti ti-chevron-right-pipe text-dark" />
                    </div>
                  </Link>
                  <Link to={route.activities} className="dropdown-item">
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <span className="d-flex mb-1 fw-semibold text-dark">Activities</span>
                        <span className="fs-13">Activities</span>
                      </div>
                      <i className="ti ti-chevron-right-pipe text-dark" />
                    </div>
                  </Link>
                  <Link to={route.analytics} className="dropdown-item">
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <span className="d-flex mb-1 fw-semibold text-dark">Analytics</span>
                        <span className="fs-13">Analytics</span>
                      </div>
                      <i className="ti ti-chevron-right-pipe text-dark" />
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            {/* Help */}
            <div className="header-item d-none d-sm-flex">
              <div className="dropdown me-2">
                <Link to={route.faq} className="btn topbar-link topbar-indigo-link">
                  <i className="ti ti-help-hexagon" />
                </Link>
              </div>
            </div>

            {/* Reports */}
            <div className="header-item d-none d-sm-flex">
              <div className="dropdown me-2">
                <Link to={route.leadReports} className="btn topbar-link topbar-warning-link">
                  <i className="ti ti-chart-pie" />
                </Link>
              </div>
            </div>

            <div className="header-line" />

            {/* Messages — badge = total unread inbound messages */}
            <div className="header-item">
              <div className="dropdown me-2">
                <Link to={route.dashboard} className="btn topbar-link">
                  <i className="ti ti-message-circle-exclamation" />
                  {totalUnread > 0 && (
                    <span className="badge rounded-pill">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </Link>
              </div>
            </div>

            {/* Notifications — badge = assigned open conversations */}
            <div className="header-item">
              <div className="dropdown me-2">
                <button
                  className="topbar-link btn topbar-link dropdown-toggle drop-arrow-none"
                  data-bs-toggle="dropdown"
                  data-bs-offset="0,24"
                  type="button"
                  aria-haspopup="false"
                  aria-expanded="false"
                >
                  <i className="ti ti-bell-check fs-16 animate-ring" />
                  {notifications.assigned_conversations > 0 && (
                    <span className="badge rounded-pill">
                      {notifications.assigned_conversations > 99 ? "99+" : notifications.assigned_conversations}
                    </span>
                  )}
                </button>
                <div className="dropdown-menu p-0 dropdown-menu-end dropdown-menu-lg" style={{ minHeight: 160 }}>
                  <div className="p-2 border-bottom">
                    <div className="row align-items-center">
                      <div className="col">
                        <h6 className="m-0 fs-16 fw-semibold">Notifications</h6>
                      </div>
                      {notifications.assigned_conversations > 0 && (
                        <div className="col-auto">
                          <span className="badge bg-primary-transparent text-primary fs-12">
                            {notifications.assigned_conversations} assigned
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="notification-body position-relative z-2 rounded-0" data-simplebar="">
                    {notifications.unread_messages > 0 && (
                      <div className="dropdown-item notification-item py-3 text-wrap border-bottom">
                        <div className="d-flex">
                          <div className="me-2 flex-shrink-0">
                            <span
                              className="avatar avatar-md bg-success-transparent text-success rounded-circle d-flex align-items-center justify-content-center"
                              style={{ width: 38, height: 38 }}
                            >
                              <i className="ti ti-message-circle fs-18" />
                            </span>
                          </div>
                          <div className="flex-grow-1">
                            <p className="mb-0 fw-medium text-dark">Unread Messages</p>
                            <p className="mb-1 text-wrap">
                              You have{" "}
                              <span className="fw-semibold text-primary">{notifications.unread_messages}</span>{" "}
                              unread inbound message{notifications.unread_messages !== 1 ? "s" : ""}.
                            </p>
                            <Link to={route.dashboard} className="fs-12 text-primary">
                              Open inbox
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                    {notifications.assigned_conversations > 0 && (
                      <div className="dropdown-item notification-item py-3 text-wrap">
                        <div className="d-flex">
                          <div className="me-2 flex-shrink-0">
                            <span
                              className="avatar avatar-md bg-warning-transparent text-warning rounded-circle d-flex align-items-center justify-content-center"
                              style={{ width: 38, height: 38 }}
                            >
                              <i className="ti ti-user-check fs-18" />
                            </span>
                          </div>
                          <div className="flex-grow-1">
                            <p className="mb-0 fw-medium text-dark">Active Assignments</p>
                            <p className="mb-1 text-wrap">
                              <span className="fw-semibold text-warning">{notifications.assigned_conversations}</span>{" "}
                              open conversation{notifications.assigned_conversations !== 1 ? "s" : ""} assigned to you.
                            </p>
                            <Link to={route.dashboard} className="fs-12 text-primary">
                              View conversations
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                    {notifications.unread_messages === 0 && notifications.assigned_conversations === 0 && (
                      <div className="d-flex align-items-center justify-content-center py-4 text-muted fs-13">
                        <i className="ti ti-checks me-2 text-success" />
                        All caught up!
                      </div>
                    )}
                  </div>
                  <div className="p-2 rounded-bottom border-top text-center">
                    <Link to={route.dashboard} className="text-decoration-underline fs-14 mb-0">
                      Go to Inbox
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* User dropdown */}
            <div className="dropdown profile-dropdown d-flex align-items-center justify-content-center">
              <Link
                to="#"
                className="topbar-link dropdown-toggle drop-arrow-none position-relative"
                data-bs-toggle="dropdown"
                data-bs-offset="0,22"
                aria-haspopup="false"
                aria-expanded="false"
              >
                <UserAvatar size={38} />
                <span className="online text-success">
                  <i className="ti ti-circle-filled d-flex bg-white rounded-circle border border-1 border-white" />
                </span>
              </Link>
              <div className="dropdown-menu dropdown-menu-end dropdown-menu-md p-2">
                <div className="d-flex align-items-center bg-light rounded-3 p-2 mb-2">
                  <UserAvatar size={42} className="rounded-circle" />
                  <div className="ms-2">
                    <p className="fw-medium text-dark mb-0">{displayName}</p>
                    <span className="d-block fs-13 text-muted">{displayRole}</span>
                  </div>
                </div>
                <Link to={route.profileSettings} className="dropdown-item">
                  <i className="ti ti-user-circle me-1 align-middle" />
                  <span className="align-middle">Profile Settings</span>
                </Link>
                <a
                  href="#"
                  className="dropdown-item"
                  onClick={(e) => {
                    e.preventDefault();
                    const dropdown = (e.currentTarget as HTMLElement).closest('.dropdown');
                    const toggle = dropdown?.querySelector('[data-bs-toggle="dropdown"]') as HTMLElement;
                    const bs = (window as any).bootstrap;
                    if (bs && toggle) bs.Dropdown.getOrCreateInstance(toggle).hide();
                    setTimeout(() => navigate(route.platformSettings), 50);
                  }}
                >
                  <i className="ti ti-settings me-1 align-middle" />
                  <span className="align-middle">Platform Settings</span>
                </a>
                <div className="pt-2 mt-2 border-top">
                  <button
                    type="button"
                    className="dropdown-item text-danger w-100 text-start"
                    onClick={() => {
                      sessionStorage.removeItem("user");
                      window.location.href = "/main/logout/";
                    }}
                  >
                    <i className="ti ti-logout me-1 fs-17 align-middle" />
                    <span className="align-middle">Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      {/* Topbar End */}
      <HeaderSearchmodal />
       <CaseModal
        idPrefix={CASE_MODAL_ID}
        staticBackdrop={true}
        showChat={showChat}
       
        chatContextMessages={chatContextMessages}
        onSendMessage={(text) => console.log("Supervisor Note/Msg:", text)}
        onSendFile={(file) => console.log("Supervisor attached File:", file.name)}
      />
    </>
  );
};

export default Header;
