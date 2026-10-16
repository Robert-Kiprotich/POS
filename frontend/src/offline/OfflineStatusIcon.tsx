import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { syncOutbox, isReallyOnline } from "./sync";

export default function OfflineStatusIcon() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // browser events + a real server check every 20s (navigator.onLine alone can lie)
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const check = async () => setOnline(await isReallyOnline());
    check();
    const t = setInterval(check, 20000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, []);

  const pending = useLiveQuery(() => db.outbox.where("status").equals("pending").count(), [], 0);
  const failed  = useLiveQuery(() => db.outbox.where("status").equals("failed").count(), [], 0);
  const synced  = useLiveQuery(() => db.meta.get("last_synced"), []);

 const syncNow = async () => {
  setSyncing(true);
  setSyncMsg("");
  try {
    const r = await syncOutbox();
    setSyncMsg(r.message);
  } catch (e: any) {
    setSyncMsg("Error: " + (e?.message || e));
  } finally {
    setSyncing(false);
  }
};

  const waiting = (pending ?? 0) + (failed ?? 0);

  return (
    <div className="dropdown me-2">
      <button
        type="button"
        className="btn topbar-link dropdown-toggle drop-arrow-none position-relative"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        title={online ? "Online" : "Offline"}
      >
        <i className={`ti ${online ? "ti-wifi text-success" : "ti-wifi-off text-danger"}`} />
        {waiting > 0 && <span className="badge rounded-pill">{waiting > 99 ? "99+" : waiting}</span>}
      </button>

      <div className="dropdown-menu dropdown-menu-end p-3 fs-13" style={{ minWidth: 250 }}>
        <div className="d-flex align-items-center mb-2">
          <i className={`ti ${online ? "ti-wifi text-success" : "ti-wifi-off text-danger"} fs-18 me-2`} />
          <span className={`fw-semibold ${online ? "text-success" : "text-danger"}`}>
            {online ? "Online" : "Offline mode"}
          </span>
        </div>

        {!online && (
          <div className="text-muted fs-12 mb-2">
            You can keep selling. Sales are saved on this device and upload when the connection returns.
          </div>
        )}

        <div className="d-flex justify-content-between py-1 border-top">
          <span className="text-muted">Waiting to sync</span>
          <strong className={pending ? "text-warning" : ""}>{pending ?? 0}</strong>
        </div>
        <div className="d-flex justify-content-between py-1">
          <span className="text-muted">Failed (needs review)</span>
          <strong className={failed ? "text-danger" : ""}>{failed ?? 0}</strong>
        </div>
        <div className="d-flex justify-content-between py-1">
          <span className="text-muted">Catalog updated</span>
          <span>{synced?.value ? new Date(synced.value).toLocaleTimeString() : "—"}</span>
        </div>

       
         <button
  type="button"
  className="btn btn-sm btn-primary w-100 mt-2"
  onClick={syncNow}
  disabled={syncing}
>
  {syncing ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-refresh me-1" />}
  Sync now
</button>
{syncMsg && <div className="text-muted fs-12 mt-1 text-center">{syncMsg}</div>}
      </div>
    </div>
  );
}