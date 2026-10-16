import { useEffect } from "react";
import { startOutboxPolling, startCatalogLoop } from "./sync";
import { useBranchAccess } from "../hooks/useBranchAccess";

export default function OfflineBootstrap() {
  const { userBranchId, loading } = useBranchAccess();

  // Sales upload polling: starts right away, never waits for anything
  useEffect(() => startOutboxPolling(), []);

  // Catalog refresh: fine to wait for the branch
  useEffect(() => {
    if (loading) return;
    return startCatalogLoop(userBranchId);
  }, [loading, userBranchId]);

  return null;
}