import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../../../services/api";

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fullName(u: any) {
  const n = `${u.firstname || ""} ${u.lastname || ""}`.trim();
  return n || u.username;
}

const COLUMNS = [
  { key: "username",    label: "Username" },
  { key: "firstname",   label: "Name" },
  { key: "email",       label: "Email" },
  { key: "phone",       label: "Phone" },
  { key: "role",        label: "Role" },
  { key: "is_active",   label: "Status" },
  { key: "date_joined", label: "Joined" },
] as const;

type Mode = "add" | "edit" | "view";

interface UserForm {
  username: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  role: string;       // role id as string (kept as "" for none)
  is_active: boolean;
}

const emptyForm: UserForm = {
  username: "",
  firstname: "",
  lastname: "",
  email: "",
  phone: "",
  address: "",
  password: "",
  role: "",
  is_active: true,
};

function exportCSV(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const lines = [
    headers.join(","),
    ...rows.map(r =>
      COLUMNS.map(c => {
        let v: any = r[c.key];
        if (c.key === "role") v = r.role?.role_name ?? "";
        if (c.key === "is_active") v = r.is_active ? "Active" : "Inactive";
        return `"${String(v ?? "").replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const data = [
    headers,
    ...rows.map(r =>
      COLUMNS.map(c => {
        let v: any = r[c.key];
        if (c.key === "role") v = r.role?.role_name ?? "";
        if (c.key === "is_active") v = r.is_active ? "Active" : "Inactive";
        return String(v ?? "");
      })
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  XLSX.writeFile(wb, `users_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function UsersList() {
  const [items, setItems]       = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [roles, setRoles]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  // Admin gate: null = still checking, true/false = result
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const [search, setSearch]             = useState("");
  const [roleFilter, setRoleFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [mode, setMode]         = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm]         = useState<UserForm>(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  // --- Load roles once (for filters + form) ---
  const loadRoles = useCallback(async () => {
    try {
      const res = await API.get("users/form_data/");
      setRoles(res.data?.roles || []);
    } catch (err) {
      console.error("Failed to load roles:", err);
    }
  }, []);

  // --- Who am I? Also decides whether the page renders ---
  const loadMe = useCallback(async () => {
    try {
      const res = await API.get("users/me/");
      const me = res.data;
      setCurrentUser(me);
      setIsAdmin(!!me?.is_admin || String(me?.role?.role_name || "").toLowerCase().includes("admin"));
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      setIsAdmin(false);
    }
  }, []);

  // --- Load the user list (admins only) ---
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("users/");
      const raw: any[] =
        res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setItems(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else if (err.response?.status === 403) setIsAdmin(false);
      else console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadMe();
    })();
  }, [loadMe]);

  useEffect(() => {
    if (isAdmin) {
      loadRoles();
      load();
    }
  }, [isAdmin, loadRoles, load]);

  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    let list = items;
    if (roleFilter !== "all") {
      list = list.filter(u => String(u.role?.id ?? "") === roleFilter);
    }
    if (statusFilter !== "all") {
      const wantActive = statusFilter === "active";
      list = list.filter(u => !!u.is_active === wantActive);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.username || "").toLowerCase().includes(q) ||
        (u.firstname || "").toLowerCase().includes(q) ||
        (u.lastname || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, roleFilter, statusFilter, items]);

  // --- Offcanvas helpers ---
  const openOffcanvas = () => {
    const el = document.getElementById("user-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getOrCreateInstance(el)?.show();
  };
  const closeOffcanvas = () => {
    const el = document.getElementById("user-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getInstance(el)?.hide();
  };

  const handleOpenAdd = () => {
    setMode("add");
    setSelected(null);
    setForm({ ...emptyForm });
    setError("");
    openOffcanvas();
  };

  const handleOpenEdit = (item: any) => {
    setMode("edit");
    setSelected(item);
    setForm({
      username: item.username || "",
      firstname: item.firstname || "",
      lastname: item.lastname || "",
      email: item.email || "",
      phone: item.phone || "",
      address: item.address || "",
      password: "",
      role: item.role?.id ? String(item.role.id) : "",
      is_active: item.is_active ?? true,
    });
    setError("");
    openOffcanvas();
  };

  const handleOpenView = (item: any) => {
    setMode("view");
    setSelected(item);
    openOffcanvas();
  };

  // --- Save (create or update) ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.username.trim())  { setError("Username is required."); return; }
    if (!form.firstname.trim()) { setError("First name is required."); return; }
    if (mode === "add" && !form.password.trim()) {
      setError("Password is required for new users.");
      return;
    }
    if (mode === "add" && form.password.trim().length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }

    setSaving(true);
    setError("");

    const payload: any = {
      username: form.username.trim().toLowerCase(),
      firstname: form.firstname.trim(),
      lastname: form.lastname.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      is_active: form.is_active,
    };
    if (form.role) payload.role = Number(form.role);
    if (form.password) payload.password = form.password;

    try {
      if (mode === "edit" && selected) {
        await API.patch(`users/${selected.id}/`, payload);
      } else {
        await API.post("users/", payload);
      }
      closeOffcanvas();
      load();
    } catch (err: any) {
      const data = err.response?.data;
      const msg =
        typeof data === "string" ? data
        : data?.error
        || data?.message
        || (data && Object.values(data).flat().join(" "))
        || "Failed to save user.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: any) => {
    if (u.id === currentUser?.id) {
      alert("You cannot delete your own account.");
      return;
    }
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await API.delete(`users/${u.id}/`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to delete user.");
    }
  };

  const handleResetPassword = async (u: any) => {
    const pwd = window.prompt(
      `Reset password for "${u.username}".\nLeave blank to use the username as password.`,
      ""
    );
    if (pwd === null) return; // cancelled
    try {
      await API.post(`users/${u.id}/reset_password/`, pwd ? { password: pwd } : {});
      alert("Password reset successfully.");
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to reset password.");
    }
  };

  const handleToggleStatus = async (u: any) => {
    if (u.id === currentUser?.id) {
      alert("You cannot disable your own account.");
      return;
    }
    const verb = u.is_active ? "disable" : "enable";
    if (!window.confirm(`${verb[0].toUpperCase() + verb.slice(1)} user "${u.username}"?`)) return;
    try {
      await API.post(`users/${u.id}/toggle_status/`, {});
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to change status.");
    }
  };

  // --- Admin gate: block non-admins from even seeing the page ---
  if (isAdmin === null) {
    return (
      <div className="page-wrapper">
        <div className="content d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
          <span className="spinner-border spinner-border-sm me-2" />
          <span className="text-muted fs-13">Checking access…</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-wrapper">
        <div className="content">
          <div className="card shadow-none border">
            <div className="card-body text-center py-5">
              <i className="ti ti-lock fs-1 text-danger mb-2 d-block" />
              <h5 className="fw-semibold mb-1">Access Denied</h5>
              <p className="text-muted fs-13 mb-0">
                Only administrators can manage users.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeFilterCount =
    [roleFilter !== "all", statusFilter !== "all"].filter(Boolean).length;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Action Bar */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Users</h4>
            <p className="text-muted fs-13 mb-0">
              Manage staff accounts, roles and access.
            </p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filtered)} disabled={!filtered.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportExcel(filtered)} disabled={!filtered.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleOpenAdd}>
              <i className="ti ti-user-plus me-1" />Add User
            </button>
          </div>
        </div>

        {/* Tiles */}
        {!loading && items.length > 0 && (() => {
          const tiles = [
            { label: "Total Users",   value: items.length,                                       icon: "ti-users",        bg: "bg-primary-gradient-100",  color: "text-primary" },
            { label: "Active",        value: items.filter(u => u.is_active).length,              icon: "ti-circle-check", bg: "bg-success-gradient-100",  color: "text-success" },
            { label: "Inactive",      value: items.filter(u => !u.is_active).length,             icon: "ti-circle-x",     bg: "bg-secondary-gradient-100",color: "text-secondary" },
            { label: "Administrators",value: items.filter(u => u.is_admin).length,               icon: "ti-shield",       bg: "bg-info-gradient-100",     color: "text-info" },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(s => (
                <div key={s.label} className="col-6 col-sm-3">
                  <div className="card mb-0 shadow-none border">
                    <div className="card-body p-3 position-relative">
                      <p className="fw-medium mb-1 fs-13">{s.label}</p>
                      <h4 className={`mb-0 ${s.color}`}>{s.value}</h4>
                      <div className={`avatar avatar-rounded avatar-sm ${s.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                        <i className={`ti ${s.icon} fs-5 ${s.color}`} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Table */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 300 }}>
              <span className="input-group-text bg-transparent border-end-0">
                <i className="ti ti-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search username, name, email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select
                className="form-select form-select-sm fs-13"
                style={{ width: 170 }}
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
              >
                <option value="all">All roles</option>
                {roles.map(r => (
                  <option key={r.id} value={String(r.id)}>{r.role_name}</option>
                ))}
              </select>
              <select
                className="form-select form-select-sm fs-13"
                style={{ width: 150 }}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {activeFilterCount > 0 && (
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => { setRoleFilter("all"); setStatusFilter("all"); }}
                >
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading users…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-users fs-1 mb-2" />
                <p className="fs-14 mb-0">
                  {items.length === 0 ? "No users found." : "No results match your filters."}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {COLUMNS.map(c => <th key={c.key} className="text-nowrap">{c.label}</th>)}
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(u => (
                      <tr key={u.id}>
                        <td className="fw-semibold text-dark">{u.username}</td>
                        <td>{fullName(u)}</td>
                        <td className="text-truncate" style={{ maxWidth: 200 }}>
                          {u.email || <span className="text-muted">—</span>}
                        </td>
                        <td className="text-nowrap">
                          {u.phone || <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {u.role?.role_name
                            ? <span className="badge bg-primary-transparent text-primary">{u.role.role_name}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {u.is_active
                            ? <span className="badge bg-success-transparent text-success">Active</span>
                            : <span className="badge bg-secondary-transparent text-secondary">Inactive</span>}
                        </td>
                        <td className="text-muted text-nowrap">{fmtDate(u.date_joined)}</td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            <button className="btn btn-sm btn-icon btn-light" title="View" onClick={() => handleOpenView(u)}>
                              <i className="ti ti-eye text-muted" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Edit" onClick={() => handleOpenEdit(u)}>
                              <i className="ti ti-edit text-primary" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Reset Password" onClick={() => handleResetPassword(u)}>
                              <i className="ti ti-key text-warning" />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-light"
                              title={u.is_active ? "Disable" : "Enable"}
                              onClick={() => handleToggleStatus(u)}
                              disabled={u.id === currentUser?.id}
                            >
                              <i className={`ti ${u.is_active ? "ti-user-off" : "ti-user-check"} ${u.is_active ? "text-secondary" : "text-success"}`} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-light"
                              title="Delete"
                              onClick={() => handleDelete(u)}
                              disabled={u.id === currentUser?.id}
                            >
                              <i className="ti ti-trash text-danger" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = (page - 1) * pageSize + 1;
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>
                  Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> users
                </span>
                <div className="d-flex align-items-center gap-1">
                  <select
                    className="form-select form-select-sm fs-12 w-auto"
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  >
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  {totalPages > 1 && (
                    <nav className="ms-2">
                      <ul className="pagination pagination-sm mb-0">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p - 1)}>
                            <i className="ti ti-chevron-left" />
                          </button>
                        </li>
                        <li className="page-item disabled">
                          <span className="page-link">{page} / {totalPages}</span>
                        </li>
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p + 1)}>
                            <i className="ti ti-chevron-right" />
                          </button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Offcanvas */}
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="user-offcanvas" style={{ width: "500px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-16 fw-semibold">
            {mode === "add" && "Add New User"}
            {mode === "edit" && "Edit User"}
            {mode === "view" && "User Details"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

          {mode === "view" && selected ? (
            <UserView item={selected} fmtDate={fmtDate} />
          ) : (
            <form id="user-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
              <SectionTitle icon="ti-user" title="Account" />
              <div className="row g-2">
                <Field className="col-md-6" label="Username *">
                  <input
                    type="text"
                    className="form-control fs-13"
                    required
                    disabled={mode === "edit"}
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                  />
                  {mode === "edit" && (
                    <small className="text-muted fs-12">Username cannot be changed.</small>
                  )}
                </Field>
                <Field className="col-md-6" label="Role">
                  <select
                    className="form-select fs-13"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="">— No role —</option>
                    {roles.map(r => (
                      <option key={r.id} value={String(r.id)}>{r.role_name}</option>
                    ))}
                  </select>
                </Field>
                <Field className="col-md-6" label="First Name *">
                  <input
                    type="text"
                    className="form-control fs-13"
                    required
                    value={form.firstname}
                    onChange={e => setForm({ ...form, firstname: e.target.value })}
                  />
                </Field>
                <Field className="col-md-6" label="Last Name">
                  <input
                    type="text"
                    className="form-control fs-13"
                    value={form.lastname}
                    onChange={e => setForm({ ...form, lastname: e.target.value })}
                  />
                </Field>
              </div>

              <SectionTitle icon="ti-address-book" title="Contact" />
              <div className="row g-2">
                <Field className="col-md-6" label="Email">
                  <input
                    type="email"
                    className="form-control fs-13"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field className="col-md-6" label="Phone">
                  <input
                    type="text"
                    className="form-control fs-13"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field className="col-12" label="Address">
                  <input
                    type="text"
                    className="form-control fs-13"
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                  />
                </Field>
              </div>

              <SectionTitle icon="ti-lock" title="Security" />
              <div className="row g-2">
                <Field className="col-12" label={mode === "add" ? "Password *" : "New Password (leave blank to keep)"}>
                  <input
                    type="password"
                    className="form-control fs-13"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
                <div className="col-12 form-check form-switch ps-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="is_active_switch"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    disabled={selected?.id === currentUser?.id}
                  />
                  <label className="form-check-label fs-13 ms-1" htmlFor="is_active_switch">
                    Active (can log in)
                  </label>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="user-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
              {mode === "edit" ? "Update User" : "Create User"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Small helpers ---------- */
function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="d-flex align-items-center gap-2 mt-1 pb-1 border-bottom">
      <i className={`ti ${icon} text-primary fs-15`} />
      <span className="fw-semibold fs-13 text-dark">{title}</span>
    </div>
  );
}

function Field({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="form-label fs-12 fw-medium text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function ViewRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <label className="text-muted fs-12 fw-medium d-block">{label}</label>
      <span className="text-dark fs-13">{value || <span className="text-muted">—</span>}</span>
    </div>
  );
}

function UserView({ item, fmtDate }: { item: any; fmtDate: (s?: string) => string }) {
  return (
    <div className="d-flex flex-column gap-3 fs-13">
      <SectionTitle icon="ti-user" title="Account" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="USERNAME" value={item.username} /></div>
        <div className="col-6">
          <ViewRow
            label="ROLE"
            value={item.role?.role_name
              ? <span className="badge bg-primary-transparent text-primary">{item.role.role_name}</span>
              : ""}
          />
        </div>
        <div className="col-6"><ViewRow label="FIRST NAME" value={item.firstname} /></div>
        <div className="col-6"><ViewRow label="LAST NAME" value={item.lastname} /></div>
        <div className="col-6">
          <ViewRow
            label="STATUS"
            value={item.is_active
              ? <span className="badge bg-success-transparent text-success">Active</span>
              : <span className="badge bg-secondary-transparent text-secondary">Inactive</span>}
          />
        </div>
        <div className="col-6">
          <ViewRow
            label="ADMIN"
            value={item.is_admin
              ? <span className="badge bg-info-transparent text-info">Yes</span>
              : <span className="badge bg-secondary-transparent text-secondary">No</span>}
          />
        </div>
      </div>

      <SectionTitle icon="ti-address-book" title="Contact" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="EMAIL" value={item.email} /></div>
        <div className="col-6"><ViewRow label="PHONE" value={item.phone} /></div>
        <div className="col-12"><ViewRow label="ADDRESS" value={item.address} /></div>
      </div>

      <SectionTitle icon="ti-calendar" title="Activity" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="DATE JOINED" value={fmtDate(item.date_joined)} /></div>
      </div>
    </div>
  );
}