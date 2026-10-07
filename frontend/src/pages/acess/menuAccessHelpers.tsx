import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import API from "../../services/api";
import { SidebarData } from "../../components/sidebar/sidebarData"; // adjust to where SidebarData.ts lives

export type MenuAccess = { is_admin: boolean; configured: boolean; keys: string[] };

const norm = (s: any) => String(s || "").trim().toLowerCase();

/** Does this role match one of the item's built-in default roles? */
export function defaultAllows(item: any, roleName: string) {
  return (item.roles || []).some((r: string) => norm(r) === norm(roleName));
}

/**
 * Can this user see this item?
 *  - Admins and roles nobody has customised use the built-in `roles` in SidebarData.
 *  - Customised roles use exactly the keys the admin saved.
 */
export function canSee(item: any, roleName: string, access: MenuAccess | null) {
  if (access && access.configured && !access.is_admin) return access.keys.includes(item.key);
  return defaultAllows(item, roleName);
}

/** Returns a copy of SidebarData containing only what this user may see. */
export function filterSidebar(roleName: string, access: MenuAccess | null, data: any[] = SidebarData) {
  return data
    .map(section => {
      const items = (section.submenuItems || [])
        .map((item: any) => {
          // Parent with children: keep it only if at least one child is visible.
          if (item.submenuItems && item.submenuItems.length) {
            const kids = item.submenuItems.filter((c: any) => canSee(c, roleName, access));
            return kids.length ? { ...item, submenuItems: kids } : null;
          }
          return canSee(item, roleName, access) ? item : null;
        })
        .filter(Boolean);
      return items.length ? { ...section, submenuItems: items } : null;
    })
    .filter(Boolean);
}

/** Loads the logged-in user's menu access. Reloads when the admin saves changes. */
export function useMenuAccess() {
  const [access, setAccess] = useState<MenuAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await API.get("menu-permissions/mine/");
      setAccess(res.data);
    } catch (err) {
      console.error("Could not load menu access, using built-in defaults:", err);
      setAccess(null); // falls back to the defaults in SidebarData
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("menu-access-changed", load);
    return () => window.removeEventListener("menu-access-changed", load);
  }, [load]);

  return { access, loading };
}

/**
 * Optional: wrap a page's route element so typing the URL doesn't bypass the menu.
 *   <Route path="/suppliers" element={<MenuGuard menuKey="suppliers" roleName={roleName}><SupplierList/></MenuGuard>} />
 * Note: this protects the PAGE only. Your API permissions still decide what data is returned.
 */
export function MenuGuard({ menuKey, roleName, children }: { menuKey: string; roleName: string; children: any }) {
  const { access, loading } = useMenuAccess();
  if (loading) return null;
  const item = findItem(menuKey);
  if (item && !canSee(item, roleName, access)) return <Navigate to="/" replace />;
  return children;
}

function findItem(key: string): any {
  for (const s of SidebarData as any[])
    for (const i of s.submenuItems || []) {
      if (i.key === key) return i;
      for (const c of i.submenuItems || []) if (c.key === key) return c;
    }
  return null;
}
