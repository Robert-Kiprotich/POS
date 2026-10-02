import { useEffect, useState } from "react";
import { Link } from "react-router";
import Footer from "../../components/footer/footer";
import PageHeader from "../../components/page-header/pageHeader";
import CommonSelect from "../../components/common-select/commonSelect";
import { City, Country, State } from "../../core/json/selectOption";
import ImageWithBasePath from "../../components/imageWithBasePath";
import API from "../../services/api";
import { getCookie } from "../../services/csrf";
import { toast } from "../../utils/toast";

const ProfileSettings = () => {
  // Form State initialized to match your Django payload keys
  const [formData, setFormData] = useState({
    firstname: "",
    lastname: "",
    username: "",
    phone: "",
    email: "",
    // Added address extensions for form representation layout fields
    address: "",
    postal_code: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleInfo, setRoleInfo] = useState({ role_name: "", role_description: "" });

  // 1. Fetch authenticated user data on component mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        const response = await API.get(`users/me/`);
        const data = response.data;
        
        setFormData({
          firstname: data.firstname || "",
          lastname: data.lastname || "",
          username: data.username || "",
          phone: data.phone || "",
          email: data.email || "",
          address: data.address || "",
          postal_code: data.postal_code || "",
        });

        if (data.role) {
          setRoleInfo(data.role);
        }
      } catch (err) {
        console.error("Failed to load authenticated profile profile context:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  // 2. Controlled Input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, name, value } = e.target;
    // Fallback search to resolve input targets flexibly via id or name flags
    const fieldName = name || id; 
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  // 3. Submit handler with integrated CSRF safety tokens
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const csrfToken = getCookie("csrftoken");
      console.log("🔐 Appending CSRF Token protection signature:", csrfToken);

      const response = await API.patch(
        `users/me/`,
        formData,
        {
          headers: {
            "X-CSRFToken": csrfToken || "",
          },
        }
      );

      console.log("🚀 Profile patches saved successfully:", response.data);
      toast.success("Profile settings saved successfully!");
    } catch (err: any) {
      console.error("❌ Submission rejected:", err);
      toast.error(`Failed to save profile changes: ${err?.response?.data?.error || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wrapper d-flex align-items-center justify-content-center" style={{ minHeight: "80vh" }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading Profile Configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ========================
      Start Page Content
    ========================= */}
      <div className="page-wrapper">
        {/* Start Content */}
        <div className="content">
          {/* Page Header */}
          <PageHeader
            title="Settings"
            badgeCount={false}
            showModuleTile={false}
            showExport={false}
          />
          {/* End Page Header */}

          {/* start row */}
          <div className="row justify-content-center">
            {/* end col */}
            <div className="col-xl-9 col-lg-12">
              <div className="card mb-0">
                <div className="card-body">
                  <div className="border-bottom mb-3 pb-3">
                    <h5 className="mb-0 fs-17">Profile Settings</h5>
                  </div>
                  <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                      <h6 className="mb-1">{roleInfo.role_name || "User"} Information</h6>
                      <p className="mb-0 text-muted fs-13">
                        {roleInfo.role_description || "Provide your profile configuration information below"}
                      </p>
                    </div>
                    <div className="mb-3">
                      <div className="profile-upload d-flex align-items-center">
                        <div className="profile-upload-img avatar avatar-xxl border border-dashed rounded position-relative flex-shrink-0">
                          <span>
                            <i className="ti ti-photo" />
                          </span>
                          <ImageWithBasePath
                            id="ImgPreview"
                            src="assets/img/profiles/avatar-02.jpg"
                            alt="img"
                            className="preview1"
                          />
                          <Link to="#" id="removeImage1" className="profile-remove">
                            <i className="ti ti-x" />
                          </Link>
                        </div>
                        <div className="profile-upload-content ms-3">
                          <label className="d-inline-flex align-items-center position-relative btn btn-primary btn-sm mb-2">
                            <i className="ti ti-file-broken me-1" />
                            Upload File
                            <input
                              type="file"
                              id="imag"
                              className="input-img position-absolute w-100 h-100 opacity-0 top-0 end-0"
                            />
                          </label>
                          <p className="mb-0">JPG, GIF or PNG. Max size of 800K</p>
                        </div>
                      </div>
                    </div>
                    <div className="border-bottom mb-3">
                      {/* start row */}
                      <div className="row">
                        <div className="col-md-4">
                          <div className="mb-3">
                            <label className="form-label">
                              First Name <span className="text-danger">*</span>
                            </label>
                            <input
                              type="text"
                              name="firstname"
                              className="form-control"
                              value={formData.firstname}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-md-4">
                          <div className="mb-3">
                            <label className="form-label">
                              Last Name <span className="text-danger">*</span>
                            </label>
                            <input
                              type="text"
                              name="lastname"
                              className="form-control"
                              value={formData.lastname}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-md-4">
                          <div className="mb-3">
                            <label className="form-label">
                              User Name <span className="text-danger">*</span>
                            </label>
                            <input
                              type="text"
                              name="username"
                              className="form-control"
                              value={formData.username}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-md-4">
                          <div className="mb-3">
                            <label className="form-label">
                              Phone Number <span className="text-danger">*</span>
                            </label>
                            <input
                              type="text"
                              name="phone"
                              className="form-control"
                              value={formData.phone}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-md-4">
                          <div className="mb-3">
                            <label className="form-label">
                              Email <span className="text-danger">*</span>
                            </label>
                            <input
                              type="email"
                              name="email"
                              className="form-control"
                              value={formData.email}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                      </div>
                      {/* end row */}
                    </div>
                    <div className="border-bottom mb-3">
                      <div className="mb-3">
                        <h6 className="mb-1">Address</h6>
                        <p className="mb-0">Please enter the address details</p>
                      </div>
                      {/* start row */}
                      <div className="row">
                        <div className="col-md-12">
                          <div className="mb-3">
                            <label className="form-label">Address</label>
                            <input
                              type="text"
                              name="address"
                              className="form-control"
                              value={formData.address}
                              onChange={handleInputChange}
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-lg-6 col-md-6">
                          <div className="mb-3">
                            <label className="form-label">Country</label>
                            <CommonSelect
                              options={Country}
                              className="select"
                              defaultValue={Country[0]}
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-lg-6 col-md-6">
                          <div className="mb-3">
                            <label className="form-label">State / Province</label>
                            <CommonSelect
                              options={State}
                              className="select"
                              defaultValue={State[0]}
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-lg-6 col-md-6">
                          <div className="mb-3">
                            <label className="form-label">City</label>
                            <CommonSelect
                              options={City}
                              className="select"
                              defaultValue={City[0]}
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                        <div className="col-lg-6 col-md-6">
                          <div className="mb-3">
                            <label className="form-label">Postal Code</label>
                            <input
                              type="text"
                              name="postal_code"
                              className="form-control"
                              value={formData.postal_code}
                              onChange={handleInputChange}
                            />
                          </div>
                        </div>{" "}
                        {/* end col */}
                      </div>
                      {/* end row */}
                    </div>
                    <div className="d-flex align-items-center justify-content-end flex-wrap gap-2">
                      <Link to="#" className="btn btn-sm btn-light">
                        Cancel
                      </Link>
                      <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
                        {saving ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                            Saving...
                          </>
                        ) : (
                          "Save Changes"
                        )}
                      </button>
                    </div>
                  </form>
                </div>{" "}
                {/* end card body */}
              </div>{" "}
              {/* end card */}
            </div>{" "}
            {/* end col */}
          </div>
          {/* end row */}
        </div>
        {/* End Content */}
        {/* Start Footer */}
        <Footer />
        {/* End Footer */}
      </div>
      {/* ========================
      End Page Content
    ========================= */}
    </>
  );
};

export default ProfileSettings;