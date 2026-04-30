"use client";

import { useEffect } from "react";

export function SessionRefresher() {
  useEffect(() => {
    fetch("/api/auth/renew", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
