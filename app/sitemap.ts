import type { MetadataRoute } from "next";

// S14 (nextjs-seo): every other route is either auth-gated (role workspaces),
// noindex (demo, token resolution, lab verification, auth pages) or an API
// route, so the landing page is the complete indexable surface. URLs must be
// absolute, so resolve them against the same public site URL the root layout
// uses for metadataBase.
function publicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;
  const vercelHost = process.env.VERCEL_URL ?? process.env.VERCEL_BRANCH_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", publicSiteUrl()).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
