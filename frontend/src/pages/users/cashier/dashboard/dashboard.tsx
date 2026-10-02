import "overlayscrollbars/overlayscrollbars.css";
import Sourcestats from "./dashboardcomponents/Sourcestats";
import Todo from "./dashboardcomponents/Todo";
import Tabs from "./dashboardcomponents/Tabs";

const CounsellorDashboard = () => {
    return (
        <>
            <div className="page-wrapper" style={{ marginLeft: 0, width: "100%" }}>
                <div className="content p-3" >
                    <div className="row p-0">
                        <div className="container-fluid">
                            <Sourcestats/>
                            <div className="row g-3">
                                <Tabs/>
                                <Todo/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default CounsellorDashboard;