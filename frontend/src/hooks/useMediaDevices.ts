import { useCallback, useEffect, useState } from "react";

interface MediaDeviceGroups {
  mics: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  permissionError: string | null;
  refresh: () => Promise<void>;
}

export function useMediaDevices(): MediaDeviceGroups {
  const [devices, setDevices] = useState<{
    mics: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
    speakers: MediaDeviceInfo[];
  }>({ mics: [], cameras: [], speakers: [] });
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      probe.getTracks().forEach((t) => t.stop());

      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        mics: all.filter((d) => d.kind === "audioinput"),
        cameras: all.filter((d) => d.kind === "videoinput"),
        speakers: all.filter((d) => d.kind === "audiooutput"),
      });
      setPermissionError(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone/camera access denied";
      setPermissionError(msg);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...devices, permissionError, refresh };
}
