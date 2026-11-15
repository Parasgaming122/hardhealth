"use client";

import { useSearchParams } from "next/navigation";
import LabVerificationView from "./[token]/lab-verification-view";

export default function LabVerificationQuery() {
  const token = useSearchParams().get("token") ?? "";
  return <LabVerificationView token={token} />;
}
