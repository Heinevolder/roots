"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (location.pathname.startsWith("/del/")) return; // shared recipes are for guests, not the app
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
