// Workable's public job board API, configured only for verified company slugs.

import { safeGet, safePostJson, makeJob, stripHtml } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");
const API_BASE = "https://apply.workable.com/api";
const COMPANY_NAMES = { kuda: "Kuda" };

function formatLocation(location, remote) {
  const parts = [
    location?.city,
    location?.region,
    location?.country,
  ]
    .map((part) => String(part || "").trim())
    .filter((part, index, all) => part && all.indexOf(part) === index);

  if (parts.length) return parts.join(", ");
  return remote ? "Remote" : "";
}

export function normalizeWorkableJob(listing, details = listing, slug = "") {
  const location = details.location || listing.location || {};
  const description = [details.description, details.requirements, details.benefits]
    .filter(Boolean)
    .map(stripHtml)
    .filter(Boolean)
    .join("\n\n");

  return makeJob({
    title: details.title || listing.title || "",
    company: COMPANY_NAMES[slug] || slug,
    location: formatLocation(location, details.remote ?? listing.remote),
    employmentType: details.employmentType || listing.employmentType || "",
    link: listing.shortcode
      ? `https://apply.workable.com/${slug}/j/${listing.shortcode}/`
      : "",
    description,
    source: "workable",
    postedAt: details.published || listing.published || "",
  });
}

export async function fetchWorkable() {
  const jobs = [];

  for (const slug of companies.workable || []) {
    const listResponse = await safePostJson(
      `${API_BASE}/v3/accounts/${encodeURIComponent(slug)}/jobs`,
      {},
    );
    if (!listResponse) continue;

    const data = await listResponse.json();
    for (const listing of data.results || []) {
      if (listing.state && listing.state !== "published") continue;
      if (listing.isInternal) continue;

      let details = listing;
      if (listing.shortcode) {
        const detailResponse = await safeGet(
          `${API_BASE}/v2/accounts/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(listing.shortcode)}`,
        );
        if (detailResponse) {
          try {
            details = await detailResponse.json();
          } catch (err) {
            console.warn(`[workable] ${slug}/${listing.shortcode} detail failed: ${err.message}`);
          }
        }
      }
      jobs.push(normalizeWorkableJob(listing, details, slug));
    }
  }

  return jobs;
}
