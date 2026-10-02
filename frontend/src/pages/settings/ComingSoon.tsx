const ComingSoon = () => {
  return (
    <div className="page-wrapper">
      <div className="content">
        <div className="row justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
          <div className="col-md-6 text-center">
            <div className="card border shadow-none">
              <div className="card-body p-5">
                <span className="avatar rounded-circle bg-primary-transparent text-primary d-flex align-items-center justify-content-center mx-auto mb-4" style={{ width: 80, height: 80 }}>
                  <i className="ti ti-tools fs-1" />
                </span>
                <h4 className="fw-semibold mb-2">Feature Under Development</h4>
                <p className="text-muted fs-14 mb-0">
                  This module is currently being built and will be available in an upcoming release.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComingSoon;
