import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const COLUMNS = [
  { key: "employee_number",     label: "Emp #" },
  { key: "first_name",          label: "Name" },
  { key: "position",            label: "Position" },
  { key: "role_name",           label: "Role" },
  { key: "branch_name",         label: "Branch" },
  { key: "phone",               label: "Phone" },
  { key: "status",              label: "Employment" },
  { key: "system_access_state", label: "System Access" },
] as const;

type Mode = "add" | "edit" | "view";

interface EmpForm {
  role: string;
  user: string;
  requires_login_override: "" | "true" | "false";
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  national_id: string;
  personal_email: string;
  work_email: string;
  phone: string;
  alt_phone: string;
  address: string;
  position: string;
  department: string;
  employment_type: string;
  status: string;
  hire_date: string;
  end_date: string;
  manager: string;
  branch: string;
  basic_salary: string;
  bank_name: string;
  bank_account: string;
  nssf_number: string;
  nhif_number: string;
  kra_pin: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  notes: string;
}

const emptyForm: EmpForm = {
  role: "",
  user: "",
  requires_login_override: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  gender: "",
  date_of_birth: "",
  national_id: "",
  personal_email: "",
  work_email: "",
  phone: "",
  alt_phone: "",
  address: "",
  position: "",
  department: "",
  employment_type: "full_time",
  status: "active",
  hire_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  manager: "",
  branch: "",
  basic_salary: "",
  bank_name: "",
  bank_account: "",
  nssf_number: "",
  nhif_number: "",
  kra_pin: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relation: "",
  notes: "",
};

function exportCSV(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const lines = [
    headers.join(","),
    ...rows.map(r =>
      COLUMNS.map(c => {
        let v: any = r[c.key];
        if (c.key === "status") v = r.status_display || r.status;
        if (c.key === "system_access_state") v = accessLabel(r.system_access_state);
        return `"${String(v ?? "").replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const data = [
    headers,
    ...rows.map(r =>
      COLUMNS.map(c => {
        let v: any = r[c.key];
        if (c.key === "status") v = r.status_display || r.status;
        if (c.key === "system_access_state") v = accessLabel(r.system_access_state);
        return String(v ?? "");
      })
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function accessLabel(state: string) {
  switch (state) {
    case "hr_only":  return "HR-only";
    case "pending":  return "Pending login";
    case "active":   return "Active login";
    case "disabled": return "Disabled";
    default:         return state || "—";
  }
}

function accessBadge(state: string) {
  switch (state) {
    case "hr_only":  return "bg-secondary-transparent text-secondary";
    case "pending":  return "bg-warning-transparent text-warning";
    case "active":   return "bg-success-transparent text-success";
    case "disabled": return "bg-danger-transparent text-danger";
    default:         return "bg-light text-muted";
  }
}

const employmentBadge = (s: string) => {
  const map: Record<string, string> = {
    active:     "bg-success-transparent text-success",
    on_leave:   "bg-warning-transparent text-warning",
    suspended:  "bg-danger-transparent text-danger",
    terminated: "bg-dark-transparent text-dark",
    resigned:   "bg-secondary-transparent text-secondary",
  };
  return map[s] || "bg-secondary-transparent text-secondary";
};

export default function EmployeesList() {
  const [items, setItems]       = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  // Lookups
  const [roles, setRoles]                     = useState<any[]>([]);
  const [availableUsers, setAvailableUsers]   = useState<any[]>([]);
  const [branches, setBranches]               = useState<any[]>([]);
  const [managers, setManagers]               = useState<any[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<any[]>([]);
  const [statuses, setStatuses]               = useState<any[]>([]);
  const [genders, setGenders]                 = useState<any[]>([]);

  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter]     = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [mode, setMode]         = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm]         = useState<EmpForm>(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("employees/");
      const raw: any[] =
        res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setItems(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading employees:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const res = await API.get("employees/form_data/");
      setRoles(res.data?.roles || []);
      setAvailableUsers(res.data?.available_users || []);
      setBranches(res.data?.branches || []);
      setManagers(res.data?.managers || []);
      setEmploymentTypes(res.data?.employment_types || []);
      setStatuses(res.data?.statuses || []);
      setGenders(res.data?.genders || []);
    } catch (err) {
      console.error("Failed to load lookups:", err);
    }
  }, []);

  useEffect(() => { load(); loadLookups(); }, [load, loadLookups]);
  useEffect(() => { setPage(1); }, [search, statusFilter, roleFilter, accessFilter, branchFilter]);

  useEffect(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter(e => e.status === statusFilter);
    if (roleFilter !== "all")   list = list.filter(e => String(e.role ?? "") === roleFilter);
    if (accessFilter !== "all") list = list.filter(e => e.system_access_state === accessFilter);
     if (branchFilter === "none") list = list.filter(e => !e.branch);
    else if (branchFilter !== "all") list = list.filter(e => String(e.branch ?? "") === branchFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.employee_number || "").toLowerCase().includes(q) ||
        (e.first_name || "").toLowerCase().includes(q) ||
        (e.middle_name || "").toLowerCase().includes(q) ||
        (e.last_name || "").toLowerCase().includes(q) ||
        (e.position || "").toLowerCase().includes(q) ||
        (e.department || "").toLowerCase().includes(q) ||
        (e.phone || "").toLowerCase().includes(q) ||
        (e.role_name || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, statusFilter, roleFilter, accessFilter,branchFilter, items]);
const handleQuickAssignBranch = async (emp: any, branchId: string) => {
  const prev = emp.branch;
  const name = branches.find(b => String(b.id) === branchId)?.name || "";
  setItems(list => list.map(x => x.id === emp.id
    ? { ...x, branch: branchId ? Number(branchId) : null, branch_name: name } : x));
  try {
    await API.patch(`employees/${emp.id}/`, { branch: branchId ? Number(branchId) : null });
  } catch (err: any) {
    setItems(list => list.map(x => x.id === emp.id ? { ...x, branch: prev } : x));
    alert(err.response?.data?.error || "Failed to assign branch.");
    load();
  }
};
  // --- Derived: does the selected role require login? ---
  const selectedRole = roles.find(r => String(r.id) === form.role);
  const roleRequiresLogin =
    form.requires_login_override === "true"  ? true
    : form.requires_login_override === "false" ? false
    : !!selectedRole?.requires_login;

  // --- Offcanvas ---
  const openOffcanvas = () => {
    const el = document.getElementById("employee-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getOrCreateInstance(el)?.show();
  };
  const closeOffcanvas = () => {
    const el = document.getElementById("employee-offcanvas");
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
      role: item.role ? String(item.role) : "",
      user: item.user ? String(item.user) : "",
      requires_login_override:
        item.requires_login_override === true  ? "true"
        : item.requires_login_override === false ? "false"
        : "",
      first_name: item.first_name || "",
      middle_name: item.middle_name || "",
      last_name: item.last_name || "",
      gender: item.gender || "",
      date_of_birth: item.date_of_birth || "",
      national_id: item.national_id || "",
      personal_email: item.personal_email || "",
      work_email: item.work_email || "",
      phone: item.phone || "",
      alt_phone: item.alt_phone || "",
      address: item.address || "",
      position: item.position || "",
      department: item.department || "",
      employment_type: item.employment_type || "full_time",
      status: item.status || "active",
      hire_date: item.hire_date || "",
      end_date: item.end_date || "",
      manager: item.manager ? String(item.manager) : "",
      branch: item.branch ? String(item.branch) : "",
      basic_salary: item.basic_salary ?? "",
      bank_name: item.bank_name || "",
      bank_account: item.bank_account || "",
      nssf_number: item.nssf_number || "",
      nhif_number: item.nhif_number || "",
      kra_pin: item.kra_pin || "",
      emergency_contact_name: item.emergency_contact_name || "",
      emergency_contact_phone: item.emergency_contact_phone || "",
      emergency_contact_relation: item.emergency_contact_relation || "",
      notes: item.notes || "",
    });
    setError("");
    openOffcanvas();
  };

  const handleOpenView = (item: any) => {
    setMode("view");
    setSelected(item);
    openOffcanvas();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role)              { setError("Please choose a role."); return; }
    if (!form.first_name.trim()) { setError("First name is required."); return; }
    if (!form.last_name.trim())  { setError("Last name is required."); return; }
    if (!form.position.trim())   { setError("Position is required."); return; }
    if (!form.hire_date)         { setError("Hire date is required."); return; }
    if (form.user && !roleRequiresLogin) {
      setError("Cannot link a user account to an HR-only employee.");
      return;
    }

    setSaving(true);
    setError("");

    const payload: any = {
      role: Number(form.role),
      user: form.user ? Number(form.user) : null,
      requires_login_override:
        form.requires_login_override === "true"  ? true
        : form.requires_login_override === "false" ? false
        : null,
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender,
      date_of_birth: form.date_of_birth || null,
      national_id: form.national_id.trim(),
      personal_email: form.personal_email.trim(),
      work_email: form.work_email.trim(),
      phone: form.phone.trim(),
      alt_phone: form.alt_phone.trim(),
      address: form.address.trim(),
      position: form.position.trim(),
      department: form.department.trim(),
      employment_type: form.employment_type,
      status: form.status,
      hire_date: form.hire_date,
      end_date: form.end_date || null,
      manager: form.manager ? Number(form.manager) : null,
      branch: form.branch ? Number(form.branch) : null,
      basic_salary: form.basic_salary === "" ? null : form.basic_salary,
      bank_name: form.bank_name.trim(),
      bank_account: form.bank_account.trim(),
      nssf_number: form.nssf_number.trim(),
      nhif_number: form.nhif_number.trim(),
      kra_pin: form.kra_pin.trim(),
      emergency_contact_name: form.emergency_contact_name.trim(),
      emergency_contact_phone: form.emergency_contact_phone.trim(),
      emergency_contact_relation: form.emergency_contact_relation.trim(),
      notes: form.notes,
    };

    try {
      if (mode === "edit" && selected) {
        await API.patch(`employees/${selected.id}/`, payload);
      } else {
        await API.post("employees/", payload);
      }
      closeOffcanvas();
      load();
      loadLookups();
    } catch (err: any) {
      const data = err.response?.data;
      const msg =
        typeof data === "string" ? data
        : data?.error
        || data?.message
        || (data && Object.values(data).flat().join(" "))
        || "Failed to save employee.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this employee record? The linked user account is not removed.")) return;
    try {
      await API.delete(`employees/${id}/`);
      load();
      loadLookups();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to delete employee.");
    }
  };

  const handleGrantLogin = async (emp: any) => {
    if (emp.has_login) return;
    if (emp.system_access_state === "hr_only") {
      alert("This employee is HR-only (e.g. cleaner). Change the role or override before granting a login.");
      return;
    }
    const username = window.prompt(
      `Grant login to ${emp.full_name}.\nUsername (defaults to employee number):`,
      emp.employee_number.toLowerCase()
    );
    if (username === null) return;
    const password = window.prompt("Password (leave blank to use the username):", "") ?? "";
    try {
      await API.post(`employees/${emp.id}/grant_login/`, {
        username: username.trim() || emp.employee_number.toLowerCase(),
        password: password.trim() || undefined,
      });
      load();
      loadLookups();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to grant login.");
    }
  };

  const handleRevokeLogin = async (emp: any) => {
    if (!emp.has_login) return;
    if (!window.confirm(`Revoke login for ${emp.full_name}? The employee record stays.`)) return;
    try {
      await API.post(`employees/${emp.id}/revoke_login/`, {});
      load();
      loadLookups();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to revoke login.");
    }
  };

 const activeFilterCount =
  [statusFilter !== "all", roleFilter !== "all", accessFilter !== "all", branchFilter !== "all"]
    .filter(Boolean).length;
  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Action Bar */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Employees</h4>
            <p className="text-muted fs-13 mb-0">
              Staff records. Some employees log in to the system; others (cleaners, groundsmen) do not.
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
              <i className="ti ti-user-plus me-1" />Add Employee
            </button>
          </div>
        </div>

        {/* Tiles */}
        {!loading && items.length > 0 && (() => {
          const tiles = [
            { label: "Total Employees", value: items.length, icon: "ti-users", bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "System Users",    value: items.filter(e => e.system_access_state === "active").length, icon: "ti-user-check", bg: "bg-success-gradient-100", color: "text-success" },
            { label: "Pending Login",   value: items.filter(e => e.system_access_state === "pending").length, icon: "ti-clock-hour-4", bg: "bg-warning-gradient-100", color: "text-warning" },
            { label: "HR-only Staff",   value: items.filter(e => e.system_access_state === "hr_only").length, icon: "ti-user-off", bg: "bg-secondary-gradient-100", color: "text-secondary" },
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
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search name, position, role…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }}
                value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="all">All roles</option>
                {roles.map(r => (
                  <option key={r.id} value={String(r.id)}>
                    {r.role_name}{r.requires_login ? "" : " (HR-only)"}
                  </option>
                ))}
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }}
  value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
  <option value="all">All branches</option>
  <option value="none">Unassigned</option>
  {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
</select>
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }}
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All employment</option>
                {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }}
                value={accessFilter} onChange={e => setAccessFilter(e.target.value)}>
                <option value="all">All access</option>
                <option value="active">Active login</option>
                <option value="pending">Pending login</option>
                <option value="hr_only">HR-only</option>
                <option value="disabled">Disabled</option>
              </select>
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger"
                  onClick={() => { setRoleFilter("all"); setStatusFilter("all"); setAccessFilter("all"); setBranchFilter("all"); }}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading employees…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-users fs-1 mb-2" />
                <p className="fs-14 mb-0">
                  {items.length === 0 ? "No employees found." : "No results match your filters."}
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
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(e => (
                      <tr key={e.id}>
                        <td className="fw-semibold text-dark text-nowrap">{e.employee_number}</td>
                        <td>{e.full_name || `${e.first_name} ${e.last_name}`}</td>
                        <td>{e.position}</td>
                        <td>
                          {e.role_name
                            ? <span className="badge bg-primary-transparent text-primary">{e.role_name}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
  <select
    className="form-select form-select-sm fs-12"
    style={{ minWidth: 140 }}
    value={e.branch ? String(e.branch) : ""}
    onChange={ev => handleQuickAssignBranch(e, ev.target.value)}
  >
    <option value="">— Unassigned —</option>
    {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
  </select>
</td>
                        <td className="text-nowrap">{e.phone || <span className="text-muted">—</span>}</td>
                        <td>
                          <span className={`badge ${employmentBadge(e.status)}`}>
                            {e.status_display || e.status}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${accessBadge(e.system_access_state)}`}>
                            {accessLabel(e.system_access_state)}
                          </span>
                        </td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            {e.system_access_state === "pending" && (
                              <button className="btn btn-sm btn-icon btn-light" title="Grant Login" onClick={() => handleGrantLogin(e)}>
                                <i className="ti ti-key text-success" />
                              </button>
                            )}
                            {e.has_login && (
                              <button className="btn btn-sm btn-icon btn-light" title="Revoke Login" onClick={() => handleRevokeLogin(e)}>
                                <i className="ti ti-user-off text-warning" />
                              </button>
                            )}
                            <button className="btn btn-sm btn-icon btn-light" title="View" onClick={() => handleOpenView(e)}>
                              <i className="ti ti-eye text-muted" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Edit" onClick={() => handleOpenEdit(e)}>
                              <i className="ti ti-edit text-primary" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Delete" onClick={() => handleDelete(e.id)}>
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

          {/* Pagination — same as before */}
          {!loading && filtered.length > 0 && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = (page - 1) * pageSize + 1;
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> employees</span>
                <div className="d-flex align-items-center gap-1">
                  <select className="form-select form-select-sm fs-12 w-auto" value={pageSize}
                    onChange={ev => { setPageSize(Number(ev.target.value)); setPage(1); }}>
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  {totalPages > 1 && (
                    <nav className="ms-2">
                      <ul className="pagination pagination-sm mb-0">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p - 1)}><i className="ti ti-chevron-left" /></button>
                        </li>
                        <li className="page-item disabled"><span className="page-link">{page} / {totalPages}</span></li>
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p + 1)}><i className="ti ti-chevron-right" /></button>
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
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="employee-offcanvas" style={{ width: "560px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-16 fw-semibold">
            {mode === "add" && "Add New Employee"}
            {mode === "edit" && "Edit Employee"}
            {mode === "view" && "Employee Details"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

          {mode === "view" && selected ? (
            <EmployeeView item={selected} fmtDate={fmtDate} accessLabel={accessLabel} accessBadge={accessBadge} />
          ) : (
            <form id="employee-form" onSubmit={handleSave} className="d-flex flex-column gap-3">

              <SectionTitle icon="ti-briefcase" title="Role & Access" />
              <div className="row g-2">
                <Field className="col-md-6" label="Role *">
                  <select className="form-select fs-13" required
                    value={form.role}
                    onChange={ev => {
                      const roleId = ev.target.value;
                      const role = roles.find(r => String(r.id) === roleId);
                      setForm(f => ({
                        ...f,
                        role: roleId,
                        requires_login_override: "", // reset override when role changes
                        user: role && !role.requires_login ? "" : f.user,
                      }));
                    }}>
                    <option value="">— Select a role —</option>
                    {roles.map(r => (
                      <option key={r.id} value={String(r.id)}>
                        {r.role_name}{r.requires_login ? "" : " (HR-only)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="col-md-6" label="Position *">
                  <input type="text" className="form-control fs-13" required
                    value={form.position}
                    onChange={ev => setForm({ ...form, position: ev.target.value })} />
                </Field>

                <Field className="col-md-6" label="Login Requirement">
                  <select className="form-select fs-13"
                    value={form.requires_login_override}
                    onChange={ev => setForm({
                      ...form,
                      requires_login_override: ev.target.value as any,
                      user: ev.target.value === "false" ? "" : form.user,
                    })}>
                    <option value="">
                      Inherit from role {selectedRole ? `(${selectedRole.requires_login ? "requires login" : "HR-only"})` : ""}
                    </option>
                    <option value="true">Force: should have login</option>
                    <option value="false">Force: HR-only (no login)</option>
                  </select>
                </Field>

                <Field className="col-md-6" label="Linked User Account">
                  <select className="form-select fs-13"
                    value={form.user}
                    disabled={!roleRequiresLogin}
                    onChange={ev => setForm({ ...form, user: ev.target.value })}>
                    <option value="">— No user account —</option>
                    {/* existing linked user on edit */}
                    {selected?.user && (
                      <option value={String(selected.user)}>
                        {selected.user_username} (currently linked)
                      </option>
                    )}
                    {availableUsers.map(u => (
                      <option key={u.id} value={String(u.id)}>
                        {u.username} · {u.firstname} {u.lastname}
                      </option>
                    ))}
                  </select>
                  <small className="text-muted fs-12">
                    {roleRequiresLogin
                      ? "Optional — you can also grant login later from the list."
                      : "Not applicable: this employee is HR-only."}
                  </small>
                </Field>
              </div>

              <SectionTitle icon="ti-user" title="Identity" />
              <div className="row g-2">
                <Field className="col-md-4" label="First Name *">
                  <input type="text" className="form-control fs-13" required
                    value={form.first_name}
                    onChange={ev => setForm({ ...form, first_name: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Middle Name">
                  <input type="text" className="form-control fs-13"
                    value={form.middle_name}
                    onChange={ev => setForm({ ...form, middle_name: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Last Name *">
                  <input type="text" className="form-control fs-13" required
                    value={form.last_name}
                    onChange={ev => setForm({ ...form, last_name: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Gender">
                  <select className="form-select fs-13"
                    value={form.gender}
                    onChange={ev => setForm({ ...form, gender: ev.target.value })}>
                    <option value="">—</option>
                    {genders.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </Field>
                <Field className="col-md-4" label="Date of Birth">
                  <input type="date" className="form-control fs-13"
                    value={form.date_of_birth}
                    onChange={ev => setForm({ ...form, date_of_birth: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="National ID">
                  <input type="text" className="form-control fs-13"
                    value={form.national_id}
                    onChange={ev => setForm({ ...form, national_id: ev.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-address-book" title="Contact" />
              <div className="row g-2">
                <Field className="col-md-6" label="Personal Email">
                  <input type="email" className="form-control fs-13"
                    value={form.personal_email}
                    onChange={ev => setForm({ ...form, personal_email: ev.target.value })} />
                </Field>
                <Field className="col-md-6" label="Work Email">
                  <input type="email" className="form-control fs-13"
                    value={form.work_email}
                    onChange={ev => setForm({ ...form, work_email: ev.target.value })} />
                </Field>
                <Field className="col-md-6" label="Phone">
                  <input type="text" className="form-control fs-13"
                    value={form.phone}
                    onChange={ev => setForm({ ...form, phone: ev.target.value })} />
                </Field>
                <Field className="col-md-6" label="Alt Phone">
                  <input type="text" className="form-control fs-13"
                    value={form.alt_phone}
                    onChange={ev => setForm({ ...form, alt_phone: ev.target.value })} />
                </Field>
                <Field className="col-12" label="Address">
                  <input type="text" className="form-control fs-13"
                    value={form.address}
                    onChange={ev => setForm({ ...form, address: ev.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-briefcase" title="Employment" />
              <div className="row g-2">
                <Field className="col-md-4" label="Department">
                  <input type="text" className="form-control fs-13"
                    value={form.department}
                    onChange={ev => setForm({ ...form, department: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Employment Type">
                  <select className="form-select fs-13"
                    value={form.employment_type}
                    onChange={ev => setForm({ ...form, employment_type: ev.target.value })}>
                    {employmentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field className="col-md-4" label="Status">
                  <select className="form-select fs-13"
                    value={form.status}
                    onChange={ev => setForm({ ...form, status: ev.target.value })}>
                    {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
                <Field className="col-md-4" label="Hire Date *">
                  <input type="date" className="form-control fs-13" required
                    value={form.hire_date}
                    onChange={ev => setForm({ ...form, hire_date: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="End Date">
                  <input type="date" className="form-control fs-13"
                    value={form.end_date}
                    onChange={ev => setForm({ ...form, end_date: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Branch">
                  <select className="form-select fs-13"
                    value={form.branch}
                    onChange={ev => setForm({ ...form, branch: ev.target.value })}>
                    <option value="">—</option>
                    {branches.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </select>
                </Field>
                <Field className="col-md-6" label="Manager">
                  <select className="form-select fs-13"
                    value={form.manager}
                    onChange={ev => setForm({ ...form, manager: ev.target.value })}>
                    <option value="">— None —</option>
                    {managers
                      .filter(m => !selected || m.id !== selected.id)
                      .map(m => (
                        <option key={m.id} value={String(m.id)}>
                          {m.employee_number} · {m.first_name} {m.last_name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>

              <SectionTitle icon="ti-cash" title="Compensation & Statutory" />
              <div className="row g-2">
                <Field className="col-md-4" label="Basic Salary">
                  <input type="number" step="0.01" className="form-control fs-13"
                    value={form.basic_salary}
                    onChange={ev => setForm({ ...form, basic_salary: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Bank Name">
                  <input type="text" className="form-control fs-13"
                    value={form.bank_name}
                    onChange={ev => setForm({ ...form, bank_name: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Bank Account">
                  <input type="text" className="form-control fs-13"
                    value={form.bank_account}
                    onChange={ev => setForm({ ...form, bank_account: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="NSSF No.">
                  <input type="text" className="form-control fs-13"
                    value={form.nssf_number}
                    onChange={ev => setForm({ ...form, nssf_number: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="NHIF No.">
                  <input type="text" className="form-control fs-13"
                    value={form.nhif_number}
                    onChange={ev => setForm({ ...form, nhif_number: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="KRA PIN">
                  <input type="text" className="form-control fs-13"
                    value={form.kra_pin}
                    onChange={ev => setForm({ ...form, kra_pin: ev.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-phone-call" title="Emergency Contact" />
              <div className="row g-2">
                <Field className="col-md-4" label="Name">
                  <input type="text" className="form-control fs-13"
                    value={form.emergency_contact_name}
                    onChange={ev => setForm({ ...form, emergency_contact_name: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Phone">
                  <input type="text" className="form-control fs-13"
                    value={form.emergency_contact_phone}
                    onChange={ev => setForm({ ...form, emergency_contact_phone: ev.target.value })} />
                </Field>
                <Field className="col-md-4" label="Relationship">
                  <input type="text" className="form-control fs-13"
                    value={form.emergency_contact_relation}
                    onChange={ev => setForm({ ...form, emergency_contact_relation: ev.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-notes" title="Notes" />
              <Field label="Notes">
                <textarea rows={3} className="form-control fs-13"
                  value={form.notes}
                  onChange={ev => setForm({ ...form, notes: ev.target.value })} />
              </Field>
            </form>
          )}
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="employee-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
              {mode === "edit" ? "Update Employee" : "Create Employee"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
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
function EmployeeView({
  item, fmtDate, accessLabel, accessBadge,
}: { item: any; fmtDate: (s?: string) => string; accessLabel: (s: string) => string; accessBadge: (s: string) => string }) {
  return (
    <div className="d-flex flex-column gap-3 fs-13">
      <SectionTitle icon="ti-user" title="Identity" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="EMPLOYEE #" value={item.employee_number} /></div>
        <div className="col-6"><ViewRow label="FULL NAME" value={item.full_name} /></div>
        <div className="col-6"><ViewRow label="GENDER" value={item.gender_display} /></div>
        <div className="col-6"><ViewRow label="DATE OF BIRTH" value={fmtDate(item.date_of_birth)} /></div>
        <div className="col-6"><ViewRow label="NATIONAL ID" value={item.national_id} /></div>
      </div>

      <SectionTitle icon="ti-briefcase" title="Employment" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="ROLE" value={item.role_name} /></div>
        <div className="col-6"><ViewRow label="POSITION" value={item.position} /></div>
        <div className="col-6"><ViewRow label="DEPARTMENT" value={item.department} /></div>
        <div className="col-6"><ViewRow label="TYPE" value={item.employment_type_display} /></div>
        <div className="col-6"><ViewRow label="STATUS" value={item.status_display} /></div>
        <div className="col-6"><ViewRow label="HIRE DATE" value={fmtDate(item.hire_date)} /></div>
        <div className="col-6"><ViewRow label="END DATE" value={item.end_date ? fmtDate(item.end_date) : ""} /></div>
        <div className="col-6"><ViewRow label="BRANCH" value={item.branch_name} /></div>
        <div className="col-6"><ViewRow label="MANAGER" value={item.manager_name} /></div>
      </div>

      <SectionTitle icon="ti-shield" title="System Access" />
      <div className="row g-3">
        <div className="col-6">
          <ViewRow
            label="ACCESS STATE"
            value={<span className={`badge ${accessBadge(item.system_access_state)}`}>{accessLabel(item.system_access_state)}</span>}
          />
        </div>
        <div className="col-6"><ViewRow label="LINKED USER" value={item.user_username} /></div>
        <div className="col-6">
          <ViewRow
            label="REQUIRES LOGIN"
            value={item.requires_login ? "Yes" : "No"}
          />
        </div>
        <div className="col-6">
          <ViewRow
            label="OVERRIDE"
            value={
              item.requires_login_override === true ? "Force: requires login"
              : item.requires_login_override === false ? "Force: HR-only"
              : "Inherit from role"
            }
          />
        </div>
      </div>

      <SectionTitle icon="ti-address-book" title="Contact" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="PERSONAL EMAIL" value={item.personal_email} /></div>
        <div className="col-6"><ViewRow label="WORK EMAIL" value={item.work_email} /></div>
        <div className="col-6"><ViewRow label="PHONE" value={item.phone} /></div>
        <div className="col-6"><ViewRow label="ALT PHONE" value={item.alt_phone} /></div>
        <div className="col-12"><ViewRow label="ADDRESS" value={item.address} /></div>
      </div>

      <SectionTitle icon="ti-cash" title="Compensation" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="BASIC SALARY" value={item.basic_salary} /></div>
        <div className="col-6"><ViewRow label="BANK" value={item.bank_name} /></div>
        <div className="col-6"><ViewRow label="BANK ACCOUNT" value={item.bank_account} /></div>
      </div>

      <SectionTitle icon="ti-file-certificate" title="Statutory" />
      <div className="row g-3">
        <div className="col-4"><ViewRow label="NSSF" value={item.nssf_number} /></div>
        <div className="col-4"><ViewRow label="NHIF" value={item.nhif_number} /></div>
        <div className="col-4"><ViewRow label="KRA PIN" value={item.kra_pin} /></div>
      </div>

      <SectionTitle icon="ti-phone-call" title="Emergency Contact" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="NAME" value={item.emergency_contact_name} /></div>
        <div className="col-6"><ViewRow label="PHONE" value={item.emergency_contact_phone} /></div>
        <div className="col-6"><ViewRow label="RELATION" value={item.emergency_contact_relation} /></div>
      </div>

      <SectionTitle icon="ti-notes" title="Notes" />
      <ViewRow label="NOTES" value={item.notes} />
    </div>
  );
}