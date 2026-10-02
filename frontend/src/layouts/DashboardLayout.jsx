import { Outlet } from "react-router-dom";

import Navbar from "../components/includes/Navbar";
import Sidebar from "../components/includes/Sidebar";
import Header from "../components/includes/Header";
import Footer from "../components/includes/Footer";

const DashboardLayout = () => {
    return (
        <div className="app-container">

            <Sidebar />

            <div className="main-content">

                <Navbar />

                <Header />

                <div className="page-content">
                    <Outlet />
                </div>

                <Footer />

            </div>

        </div>
    );
};

export default DashboardLayout;