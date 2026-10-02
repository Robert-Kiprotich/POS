import { Outlet, useLocation, Navigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import Header from "../components/header/header";
import Sidebar from "../components/sidebar/sidebar";
import ThemeSettings from "../components/theme-settings/themeSettings";
import AISupport from "../pages/ai-support/AISupport";
import InternalChat from "../components/chat/InternalChat";

import { useEffect } from "react";
import { resetMobileSidebar } from "../core/redux/sidebarSlice";




const Feature = () => {
  const location = useLocation();

  const isLoggedIn = !!sessionStorage.getItem("user");
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  const dispatch = useDispatch();
  const themeSettings = useSelector((state: any) => state.theme.themeSettings);
  const { miniSidebar, mobileSidebar, expandMenu } = useSelector(
    (state: any) => state.sidebarSlice
  );

  const dataLayout = themeSettings["data-layout"];
  const dataWidth = themeSettings["data-width"];
  const dataSize = themeSettings["data-size"];
  const dir = themeSettings["dir"];

  // Check if current page is Wallboard
  const isWallboardPage = location.pathname === "/wallboard";

 useEffect(()=>{
dispatch(resetMobileSidebar())
},[location.pathname])

useEffect(() => {
  const handleCloseFilterClick = (event: Event) => {
    const target = event.target as HTMLElement;

    // Check if the clicked element has the .close-filter-btn class
    if (target.classList.contains('close-filter-btn')) {
      // Find the closest parent .dropdown-menu
      const dropdownMenu = target.closest('.dropdown-menu');

      if (dropdownMenu) {
        // Remove the .show class from the dropdown-menu
        dropdownMenu.classList.remove('show');

        // Optionally remove .show from the toggle button or dropdown wrapper
        const dropdownWrapper = dropdownMenu.closest('.dropdown');
        if (dropdownWrapper) {
          const toggleButton = dropdownWrapper.querySelector('[data-toggle]');
          if (toggleButton) {
            toggleButton.classList.remove('show');
          }
        }
      }
    }
  };

  // Attach the event listener to the document
  document.addEventListener('click', handleCloseFilterClick);

  // Clean up the event listener on component unmount
  return () => {
    document.removeEventListener('click', handleCloseFilterClick);
  };
}, []);

  return (
    <>
    <div
        className={`
        ${
          miniSidebar || dataLayout === "mini" || dataSize === "compact"
            ? "mini-sidebar"
            : ""
        }
        ${
          (expandMenu && miniSidebar) || (expandMenu && dataLayout === "mini")
            ? "expand-menu"
            : ""
        }
        ${mobileSidebar ? "menu-opened slide-nav" : ""}
        ${dataWidth === "box" ? "layout-box-mode mini-sidebar" : ""}
        ${dir === "rtl" ? "layout-mode-rtl" : ""}




      `}
      >
        <div className="main-wrapper">
          {!isWallboardPage && <Header/>}
          {!isWallboardPage && <Sidebar/>}
          <Outlet />
          {!isWallboardPage && <AISupport />}
          {!isWallboardPage && <ThemeSettings/>}
          {!isWallboardPage && <InternalChat />}
       
        </div>
        <div
          className={`sidebar-overlay${mobileSidebar ? " opened" : ""}`}
        ></div>
      </div>
    </>

  );
};

export default Feature;
