import { Suspense } from "react";
import { AppProviders } from "@/components/app-providers";
import LabVerificationQuery from "./lab-verification-query";

export const metadata = { title: "Verify a lab report", robots: { index: false, follow: false } };

export default function LabVerificationQueryPage() {
  return (
    <AppProviders>
      <Suspense fallback={<main className="verify-page"><div className="verify-shell"><div className="card p-6 text-sm text-slate-500">Loading verification details…</div></div></main>}>
        <LabVerificationQuery />
      </Suspense>
    </AppProviders>
  );
}
