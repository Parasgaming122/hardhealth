"use client";

import { useEffect, useState } from "react";

export function AuthOriginField({ source }: { source: "login" | "signup" }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return <><input type="hidden" name="origin" value={origin} /><input type="hidden" name="source" value={source} /></>;
}
