/**
 * P2-8 (brief 8.7 / 22 / Rule 1): UI-safe config constants — no server-only
 * imports, so client components can use them. The live values always come from
 * the server (`readPlatformConfig` / `getPlatformConfigForAdmin`); these are
 * the brief-22 defaults and the editor's labels only.
 */
export const CONFIG_DEFAULTS: Record<string, number> = {
  registration_fee: 500,
  renewal_fee: 400,
  base_plan_quota_mb: 1024,
  plus_plan_quota_mb: 5120,
  plus_plan_price: 1000,
  pro_plan_quota_mb: 20480,
  pro_plan_price: 2500,
  provider_share_percent: 30,
  storage_alert_percent: 80,
  prescription_valid_days: 30,
  prescription_max_fills: 1,
  court_access_days: 30,
  emergency_access_hours: 24,
};

export type PlatformConfig = Record<string, number>;

export const CONFIG_LABELS: Record<string, string> = {
  registration_fee: "Registration fee · PKR",
  renewal_fee: "Renewal fee · PKR / year",
  base_plan_quota_mb: "Base plan quota · MB",
  plus_plan_quota_mb: "Plus plan quota · MB",
  plus_plan_price: "Plus plan price · PKR / year",
  pro_plan_quota_mb: "Pro plan quota · MB",
  pro_plan_price: "Pro plan price · PKR / year",
  provider_share_percent: "Provider share · %",
  storage_alert_percent: "Storage alert · %",
  prescription_valid_days: "Prescription validity · days",
  prescription_max_fills: "Max prescription fills",
  court_access_days: "Court access · days",
  emergency_access_hours: "Emergency access · hours",
};
