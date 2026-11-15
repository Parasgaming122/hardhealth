"use client";

import type { ReactNode } from "react";
import { DemoProvider } from "@/components/demo-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}
