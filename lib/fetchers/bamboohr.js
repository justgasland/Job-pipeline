// bamboohr.js
// Public careers JSON endpoint, no auth. Reads company subdomains from config/companies.json.

import { safeGet, makeJob } from "./base.js";
import { loadJson } from "../loadJson.js";

const companies = loadJson(import.meta.url, "../../config/companies.json");

const API_TEMPLATE = (slug) => `https://${slug}.bamboohr.com/careers/list`;
const COMPANY_NAMES = { flutterwavego: "Flutterwave" };
const NIGERIAN_STATES = new Set([
  "abia",
  "adamawa",
  "akwa ibom",
  "anambra",
  "bauchi",
  "bayelsa",
  "benue",
  "borno",
  "cross river",
  "delta",
  "ebonyi",
  "edo",
  "ekiti",
  "enugu",
  "fct",
  "gombe",
  "imo",
  "jigawa",
  "kaduna",
  "kano",
  "katsina",
  "kebbi",
  "kogi",
  "kwara",
  "lagos",
  "nasarawa",
  "niger",
  "ogun",
  "ondo",
  "osun",
  "oyo",
  "plateau",
  "rivers",
  "sokoto",
  "taraba",
  "yobe",
  "zamfara",
  "abuja",
  "federal capital territory",
]);

export function formatBambooHRLocation(location = {}) {
  const city = String(location.city || "").trim();
  const state = String(location.state || "").trim();
  const parts = [city, state && state !== "." ? state : ""].filter(Boolean);

  if (NIGERIAN_STATES.has(state.toLowerCase())) parts.push("Nigeria");
  return parts.join(", ");
}

export async function fetchBambooHR() {
  const jobs = [];
  for (const slug of companies.bamboohr || []) {
    const res = await safeGet(API_TEMPLATE(slug));
    if (!res) continue;
    const data = await res.json();
    for (const item of data.result || []) {
      jobs.push(makeJob({
        title: item.jobOpeningName || "",
        company: COMPANY_NAMES[slug] || slug,
        location: formatBambooHRLocation(item.location),
        employmentType: item.employmentStatusLabel || "",
        link: `https://${slug}.bamboohr.com/careers/${item.id || ""}`,
        description: "",
        source: "bamboohr",
        postedAt: item.datePosted || item.postedDate || item.createdAt || "",
      }));
    }
  }
  return jobs;
}
