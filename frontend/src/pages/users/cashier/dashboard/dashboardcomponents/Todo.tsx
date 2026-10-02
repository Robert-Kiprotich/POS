import React from 'react'

function Todo() {
  return (
    <div className="col-lg-3">
    <div className="card h-100">
        <div className="card-body d-flex flex-column"> {/* Added flex-column to manage inner height cleanly */}
            {/* Call Log Title with Icon */}
            <div className="d-flex justify-content-between align-items-center mb-3 flex-shrink-0">
                <h4 className="mb-0">
                    <i className="fas fa-history me-2 text-secondary"></i>
                    Call Log
                </h4>
                <button className="btn btn-link p-0 text-primary">
                    <i className="fas fa-plus-circle fs-5"></i>
                </button>
            </div>

            {/* Search Input with Icon Group */}
            <div className="input-group mb-4 shadow-sm flex-shrink-0">
                <span className="input-group-text bg-white border-end-0 text-muted">
                    <i className="fas fa-search"></i>
                </span>
                <input
                    type="text"
                    className="form-control border-start-0 ps-0"
                    placeholder="Search logs..."
                    defaultValue=""
                />
            </div>

            {/* SCROLLABLE WRAPPER FOR LIST GROUP */}
            <div className="overflow-y-auto pe-1" style={{ maxHeight: '400px' }}>
                {/* Styled List Group with Dynamic Colored Icons */}
                <div className="list-group list-group-flush gap-2">
                    <div className="list-group-item bg-success-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-alt text-success"></i>
                        +254722116116
                    </div>

                    <div className="list-group-item bg-warning-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-volume text-warning"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-danger-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-slash text-danger"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-info-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-headset text-info"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-dark-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-square-alt text-dark"></i>
                       +254722116116
                    </div>

                    <div className="list-group-item bg-primary-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-tty text-primary"></i>
                       +254722116116
                    </div>
                     <div className="list-group-item bg-success-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-alt text-success"></i>
                        +254722116116
                    </div>

                    <div className="list-group-item bg-warning-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-volume text-warning"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-danger-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-slash text-danger"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-info-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-headset text-info"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-dark-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-square-alt text-dark"></i>
                       +254722116116
                    </div>

                    <div className="list-group-item bg-primary-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-tty text-primary"></i>
                       +254722116116
                    </div>
                     <div className="list-group-item bg-success-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-alt text-success"></i>
                        +254722116116
                    </div>

                    <div className="list-group-item bg-warning-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-volume text-warning"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-danger-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-slash text-danger"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-info-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-headset text-info"></i>
                      +254722116116
                    </div>

                    <div className="list-group-item bg-dark-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-phone-square-alt text-dark"></i>
                       +254722116116
                    </div>

                    <div className="list-group-item bg-primary-subtle border-0 rounded d-flex align-items-center gap-2 fw-medium py-2.5">
                        <i className="fas fa-tty text-primary"></i>
                       +254722116116
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>
  )
}

export default Todo