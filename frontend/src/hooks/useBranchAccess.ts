import { useEffect, useState } from "react";
import API from "../services/api";

const listOf = (res: any) =>
  res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);

export function useBranchAccess() {
  const [state, setState] = useState<{
    loading: boolean; me: any; branches: any[];
    isHO: boolean; userBranchId: number | null; hoId: number | null;
  }>({ loading: true, me: null, branches: [], isHO: false, userBranchId: null, hoId: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meRes, brRes] = await Promise.all([API.get("users/me/"), API.get("branches/")]);
        const me = meRes.data;
        const branches = listOf(brRes);
        const hq = branches.find((b: any) => (b.name || "").trim().toLowerCase() === "head office");
        const isAdmin = !!me.is_admin || (me.role?.role_name || "").toLowerCase().includes("admin");
        const isHO = isAdmin || (!!hq && me.branch === hq.id);
        if (alive) setState({
          loading: false, me, branches, isHO,
          userBranchId: me.branch ?? null, hoId: hq?.id ?? null,
        });
      } catch (e) {
        console.error("useBranchAccess:", e);
        if (alive) setState(s => ({ ...s, loading: false }));
      }
    })();
    return () => { alive = false; };
  }, []);

  return state;
}