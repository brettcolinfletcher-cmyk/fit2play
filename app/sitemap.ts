import type { MetadataRoute } from "next";

const BASE = "https://www.fit2perform.com.au";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/services", priority: 0.9 },
    { path: "/book", priority: 0.9 },
    { path: "/about", priority: 0.7 },
    { path: "/research", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
    { path: "/media", priority: 0.4 },
    { path: "/privacy", priority: 0.2 },
  ];
  return pages.map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    changeFrequency: "monthly",
    priority,
  }));
}
