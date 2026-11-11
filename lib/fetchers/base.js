// base.js
// Shared job shape and a safe fetch wrapper every source fetcher uses.

export function makeJob(fields) {
  const job = {
    title: "",
    company: "",
    location: "",
    employmentType: "",
    link: "",
    description: "",
    source: "",
    postedAt: "",
    ...fields,
  };
  // Keep memory small on the VPS: very long descriptions are cut at 12,000
  // characters, which still covers the text the filters and scorer read.
  job.description = String(job.description || "").slice(0, 12000);
  job.postedAt = normalizeJobDate(job.postedAt);
  return job;
}

export function normalizeJobDate(value) {
  if (value === null || value === undefined || value === "") return "";

  const numeric = typeof value === "number" || /^\d+$/.test(String(value));
  const number = numeric ? Number(value) : NaN;
  const date = Number.isFinite(number)
    ? new Date(number < 1e12 ? number * 1000 : number)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; job-pipeline-bot/1.0; personal use)",
};

export function decodeHtml(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x"
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    }

    return {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
    }[code.toLowerCase()] || entity;
  });
}

export function stripHtml(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export async function safeGet(url, params = {}) {
  try {
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;
    const res = await fetch(fullUrl, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`[fetchers] ${url} returned status ${res.status}`);
      return null;
    }
    return res;
  } catch (err) {
    console.warn(`[fetchers] request to ${url} failed: ${err.message}`);
    return null;
  }
}

export async function safePostJson(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...HEADERS,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[fetchers] ${url} returned status ${res.status}`);
      return null;
    }
    return res;
  } catch (err) {
    console.warn(`[fetchers] request to ${url} failed: ${err.message}`);
    return null;
  }
}
