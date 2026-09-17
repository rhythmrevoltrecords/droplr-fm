"use client";
import { useEffect, useState } from "react";

/** Hidden form field with the visitor's IANA timezone, so release-day email and saves follow their local midnight. */
export function TimezoneField() {
  const [tz, setTz] = useState("");
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    } catch {}
  }, []);
  return <input type="hidden" name="tz" value={tz} />;
}
