// Jobberman's public Nigeria category pages expose listing cards without login.

import { decodeHtml, safeGet, makeJob, stripHtml } from "./base.js";

const CATEGORY_URLS = [
  "https://www.jobberman.com/jobs/creative-design",
  "https://www.jobberman.com/jobs/product-project-management",
];

function getAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\b${escapedName}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function parsePostedDate(cardText, now) {
  const match = cardText.match(
    /\bposted\s+(today|yesterday|\d+\s+(?:hours?|days?|weeks?|months?)\s+ago)\b/i,
  );
  if (!match) return "";

  const relative = match[1].toLowerCase();
  let days = 0;
  if (relative === "yesterday") {
    days = 1;
  } else if (relative !== "today") {
    const [, amountText, unit] = relative.match(/^(\d+)\s+(hours?|days?|weeks?|months?)/);
    const amount = Number(amountText);
    if (unit.startsWith("hour")) {
      days = amount / 24;
    } else if (unit.startsWith("week")) {
      days = amount * 7;
    } else if (unit.startsWith("month")) {
      days = amount * 30;
    } else {
      days = amount;
    }
  }

  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function parseJobbermanListings(html, now = new Date()) {
  const cards =
    html.match(/<article\b(?=[^>]*data-cy=["']listing-cards-components["'])[\s\S]*?<\/article>/gi) ||
    [];

  return cards.flatMap((card) => {
    const titleTag = card.match(
      /<a\b(?=[^>]*data-cy=["']listing-title-link["'])[^>]*>/i,
    )?.[0];
    if (!titleTag) return [];

    const title = decodeHtml(getAttribute(titleTag, "title") || stripHtml(titleTag));
    const rawLink = getAttribute(titleTag, "href");
    let link;
    try {
      const url = new URL(rawLink, "https://www.jobberman.com");
      if (url.hostname !== "www.jobberman.com" || !url.pathname.startsWith("/listings/")) {
        return [];
      }
      link = url.href;
    } catch {
      return [];
    }

    const companyImage = card.match(/<img\b[^>]*\balt=["']([^"']+)["']/i)?.[1] || "";
    const companyText = card.match(
      /<span\b[^>]*class=["'][^"']*truncate text-text-secondary[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    )?.[1] || "";
    const company = decodeHtml(companyImage || stripHtml(companyText));
    const descriptionMarkup = card.match(
      /<div\b(?=[^>]*data-cy=["']description-tile["'])[^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i,
    )?.[1] || "";
    const descriptionText = stripHtml(descriptionMarkup);
    const description = descriptionText.includes(" - ")
      ? descriptionText.slice(descriptionText.indexOf(" - ") + 3)
      : descriptionText;

    const detailsMarkup = card.match(
      /<div\b[^>]*class=["'][^"']*items-end[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    )?.[1] || "";
    const details = [
      ...detailsMarkup.matchAll(
        /<span\b[^>]*class=["']inline-flex items-center gap-1["'][^>]*>([\s\S]*?)<\/span>/gi,
      ),
    ].map((match) => stripHtml(match[1]));
    const cardText = stripHtml(card);

    return [
      makeJob({
        title,
        company,
        location: details[0] || "",
        employmentType: details[1] || "",
        link,
        description,
        source: "jobberman",
        postedAt: parsePostedDate(cardText, now),
      }),
    ];
  });
}

export async function fetchJobberman() {
  const jobs = [];
  for (const url of CATEGORY_URLS) {
    const res = await safeGet(url);
    if (!res) continue;
    jobs.push(...parseJobbermanListings(await res.text()));
  }
  return jobs;
}
