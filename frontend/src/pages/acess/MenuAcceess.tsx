import { useState, useEffect, useCallback, useMemo } from "react";
import API from "../../services/api";
import { SidebarData } from "../../components/sidebar/sidebarData"; // adjust to where SidebarData.ts lives
import { defaultAllows } from "./menuAccessHelpers"; // adjust to where menuAccessHelpers.tsx lives

type Item = { key: string; label: string; group: string };

// Flatten SidebarData into one row per clickable item. New pages added to SidebarData show up here automatically.
function buildCatalog(): Item[] {
  const out: Item[] = [];
  (SidebarData as any[]).forEach(section => {
    const sectionName = section.tittle || "Main menu";
    (section.submenuItems || []).forEach((item: any) => {
      if (item.submenuItems?.length) {
        item.submenuItems.forEach((c: any) => c.key && out.push({ key: c.key, label: `${item.label} › ${c.label}`, group: sectionName }));
      } else if (item.key) {
        out.push({ key: item.key, label: item.label, group: sectionName });
      }
    });
  });
  // The two dashboards share a label in the sidebar; make them distinguishable here.
  return out.map(i =>
    i.key === "admin_dashboard" ? { ...i, label: "Dashboard (admin view)" } : i
  );
}

// Raw items, needed to work out the built-in defaults per role.
function rawItemByKey(): Record<string, any> {
  const map: Record<string, any> = {};
  (SidebarData as any[]).forEach(s =>
    (s.submenuItems || []).forEach((i: any) => {
      if (i.key) map[i.key] = i;
      (i.submenuItems || []).forEach((c: any) => c.key && (map[c.key] = c));
    })
  );
  return map;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
const isAdminRole = (r: any) => String(r.role_name || "").toLowerCase().includes("admin");

function errorMessage(err: any) {
  const d = err.response?.data;
  const v = d?.error || d?.detail;
  return Array.isArray(v) ? v[0] : v || "Could not save. Please try again.";
}

export default function MenuAccess() {
  const catalog = useMemo(buildCatalog, []);
  const raw = useMemo(rawItemByKey, []);

  const [roles, setRoles] = useState<any[]>([]);
  const [custom, setCustom] = useState<Record<string, string[]>>({});   // roles an admin has customised
  const [baseline, setBaseline] = useState<Record<string, Set<string>>>({}); // what's currently in effect
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});       // what's ticked on screen
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("menu-permissions/");
      const rs: any[] = (res.data.roles || []).filter((r: any) => !isAdminRole(r) && r.requires_login !== false); // skip HR-only roles
      const perms: Record<string, string[]> = res.data.permissions || {};
      const base: Record<string, Set<string>> = {};
      rs.forEach(r => {
        const saved = perms[String(r.id)];
        base[r.id] = new Set(
          saved ?? catalog.filter(i => defaultAllows(raw[i.key], r.role_name)).map(i => i.key)
        );
      });
      setRoles(rs);
      setCustom(perms);
      setBaseline(base);
      setDraft(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, new Set(v)])));
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else setMessage({ type: "danger", text: "Could not load permissions. Only administrators can open this page." });
    } finally {
      setLoading(false);
    }
  }, [catalog, raw]);

  useEffect(() => { load(); }, [load]);

  const dirtyRoles = roles.filter(r => draft[r.id] && !sameSet(draft[r.id], baseline[r.id]));

  function toggle(roleId: number, key: string) {
    setMessage(null);
    setDraft(d => {
      const next = new Set(d[roleId]);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...d, [roleId]: next };
    });
  }

  function setColumn(roleId: number, on: boolean) {
    setMessage(null);
    setDraft(d => ({ ...d, [roleId]: new Set(on ? catalog.map(i => i.key) : []) }));
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    try {
      for (const r of dirtyRoles) {
        await API.put("menu-permissions/", { role: r.id, menu_keys: [...draft[r.id]] });
      }
      window.dispatchEvent(new Event("menu-access-changed"));
      await load();
      setMessage({ type: "success", text: "Permissions saved. People see the change the next time their menu loads (a page refresh is enough)." });
    } catch (err: any) {
      setMessage({ type: "danger", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function resetRole(r: any) {
    if (!window.confirm(`Reset "${r.role_name}" to the built-in defaults?`)) return;
    setSaving(true);
    setMessage(null);
    try {
      await API.put("menu-permissions/", { role: r.id, menu_keys: null });
      window.dispatchEvent(new Event("menu-access-changed"));
      await load();
      setMessage({ type: "success", text: `"${r.role_name}" is back on the built-in defaults.` });
    } catch (err: any) {
      setMessage({ type: "danger", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const groups = Array.from(new Set(catalog.map(i => i.group)));

  return (
    <div className="page-wrapper">
      <div className="content">

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Access Control</h4>
            <p className="text-muted fs-13 mb-0">Choose which menu pages each role can open. Administrators always have full access.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading || saving}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-secondary btn-sm" disabled={!dirtyRoles.length || saving}
              onClick={() => setDraft(Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, new Set(v)])))}>
              Discard changes
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={!dirtyRoles.length || saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-check me-1" />}
              Save changes{dirtyRoles.length ? ` (${dirtyRoles.length} role${dirtyRoles.length > 1 ? "s" : ""})` : ""}
            </button>
          </div>
        </div>

        {message && <div className={`alert alert-${message.type} fs-13 py-2`}>{message.text}</div>}

        <div className="alert alert-light border fs-13 py-2">
          This controls which pages appear in the menu and open for a role. What data a page can load or change is still
          decided by the server. For example, salary data stays admin-only even if a role is given the Salaries page.
        </div>

        <div className="card shadow-none border">
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading permissions…
              </div>
            ) : roles.length === 0 ? (
              <div className="d-flex flex-column align-items-center py-5 text-muted">
                <i className="ti ti-lock fs-1 mb-2" />
                <p className="fs-14 mb-0">No roles to configure yet. Create roles first, then set their access here.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table mb-0 fs-13 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ minWidth: 220 }}>Menu page</th>
                      <th className="text-center text-nowrap">
                        <div>Administrator</div>
                        <span className="badge bg-secondary-transparent text-secondary">Always full access</span>
                      </th>
                      {roles.map(r => {
                        const isCustom = custom[String(r.id)] !== undefined;
                        return (
                          <th key={r.id} className="text-center text-nowrap">
                            <div className="text-capitalize">{r.role_name}</div>
                            <span className={`badge ${isCustom ? "bg-primary-transparent text-primary" : "bg-secondary-transparent text-secondary"}`}>
                              {isCustom ? "Customised" : "Built-in defaults"}
                            </span>
                            <div className="mt-1 fw-normal">
                              <button className="btn btn-link btn-sm p-0 fs-12" onClick={() => setColumn(r.id, true)}>All</button>
                              <span className="text-muted mx-1">·</span>
                              <button className="btn btn-link btn-sm p-0 fs-12" onClick={() => setColumn(r.id, false)}>None</button>
                              {isCustom && (
                                <>
                                  <span className="text-muted mx-1">·</span>
                                  <button className="btn btn-link btn-sm p-0 fs-12 text-danger" onClick={() => resetRole(r)} disabled={saving}>Reset</button>
                                </>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <GroupRows key={g} group={g} items={catalog.filter(i => i.group === g)}
                        roles={roles} draft={draft} baseline={baseline} onToggle={toggle} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupRows({ group, items, roles, draft, baseline, onToggle }: any) {
  return (
    <>
      <tr className="table-active">
        <td colSpan={roles.length + 2} className="fw-semibold fs-12 text-muted">{group}</td>
      </tr>
      {items.map((i: Item) => (
        <tr key={i.key}>
          <td className="fw-medium text-dark">{i.label}</td>
          <td className="text-center"><i className="ti ti-check text-success" /></td>
          {roles.map((r: any) => {
            const on = draft[r.id]?.has(i.key);
            const changed = on !== baseline[r.id]?.has(i.key);
            return (
              <td key={r.id} className={`text-center ${changed ? "bg-warning-transparent" : ""}`}>
                <input type="checkbox" className="form-check-input" checked={!!on}
                  aria-label={`${i.label} for ${r.role_name}`} onChange={() => onToggle(r.id, i.key)} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
