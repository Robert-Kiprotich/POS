import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { syncOutbox } from "./sync";

export default function OfflineBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const pending = useLiveQuery(() => db.outbox.where("status").equals("pending").count(), [], 0);
  const failed  = useLiveQuery(() => db.outbox.where("status").equals("failed").count(), [], 0);
  const synced  = useLiveQuery(() => db.meta.get("last_synced"), []);

  return (
    <div className="d-flex align-items-center gap-2 fs-12">
      <span className={`badge ${online ? "bg-success-transparent text-success" : "bg-danger-transparent text-danger"}`}>
        <i className={`ti ${online ? "ti-wifi" : "ti-wifi-off"} me-1`} />{online ? "Online" : "Offline"}
      </span>
      {pending > 0 && (
        <button className="btn btn-sm btn-outline-warning py-0 px-2 fs-11" onClick={() => syncOutbox()}>
          {pending} sale{pending !== 1 ? "s" : ""} waiting to sync
        </button>
      )}
      {failed > 0 && <span className="badge bg-danger text-white">{failed} failed, needs review</span>}
      {synced?.value && <span className="text-muted">Catalog: {new Date(synced.value).toLocaleTimeString()}</span>}
    </div>
  );
}