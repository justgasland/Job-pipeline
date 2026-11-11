import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const STORE_PATH = path.join(process.cwd(), "data", "application-packs.json");
const MAX_DESCRIPTION_LENGTH = 40000;
const MAX_CV_LENGTH = 30000;
const EVIDENCE_TERMS = [
  "brand strategy",
  "brand research",
  "competitive analysis",
  "brand positioning",
  "brand identity",
  "brand voice",
  "visual identity",
  "typography",
  "layout and composition",
  "visual hierarchy",
  "campaign design",
  "digital and print design",
  "presentation design",
  "merchandise design",
  "creative direction",
  "design systems",
  "ui/ux design",
  "user flows",
  "interface design",
  "cross-functional collaboration",
  "creative project coordination",
  "stakeholder communication",
  "social campaigns",
  "product design",
  "design execution",
  "market research",
  "fintech",
];
const DESIGN_TOOLS = [
  "Figma",
  "Adobe Illustrator",
  "Adobe Photoshop",
  "Adobe InDesign",
  "Sketch",
  "Canva",
  "FigJam",
];
const CV_SECTIONS = new Set([
  "PROFESSIONAL SUMMARY",
  "EDUCATION",
  "CORE SKILLS",
  "EXPERIENCE",
  "SELECTED PROJECT",
  "SELECTED PROJECTS",
  "VOLUNTEERING & COMMUNITY",
  "LEADERSHIP & MENTORING",
]);
const CV_SECTION_ORDER = [
  "PROFESSIONAL SUMMARY",
  "CORE SKILLS",
  "EXPERIENCE",
  "SELECTED PROJECT",
  "SELECTED PROJECTS",
  "EDUCATION",
  "VOLUNTEERING & COMMUNITY",
  "LEADERSHIP & MENTORING",
];

function hasPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function parseResume(resumeText) {
  const sections = new Map();
  let current = "HEADER";
  sections.set(current, []);

  for (const rawLine of normalizeText(resumeText).split("\n")) {
    const line = rawLine.trim();
    const heading = line.toUpperCase().replace(/\s+/g, " ");
    if (CV_SECTIONS.has(heading)) {
      current = heading;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current).push(rawLine.trimEnd());
  }

  return new Map(
    [...sections].map(([heading, lines]) => [
      heading,
      lines
        .join("\n")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.split("\n").map((line) => line.trim()).filter(Boolean).join(" "))
        .filter(Boolean),
    ]),
  );
}

function dedupePhrases(phrases) {
  return [...new Set(phrases)];
}

function extractProfileName(sections) {
  return sections.get("HEADER")?.[0] || "";
}

function collectRelevantEvidence(sections, jobText, resumeText) {
  const candidateEvidence = EVIDENCE_TERMS.filter((term) =>
    hasPhrase(resumeText, term),
  );
  const matchedEvidence = candidateEvidence.filter((term) =>
    hasPhrase(jobText, term),
  );

  const paragraphs = [...sections]
    .filter(([heading]) => heading !== "HEADER")
    .flatMap(([heading, content]) =>
      content.map((text) => ({ heading, text })),
    );
  const experienceParagraphs = paragraphs.filter(({ heading }) =>
    [
      "EXPERIENCE",
      "SELECTED PROJECT",
      "SELECTED PROJECTS",
      "VOLUNTEERING & COMMUNITY",
      "LEADERSHIP & MENTORING",
    ].includes(heading),
  );
  const evidence = (experienceParagraphs.length ? experienceParagraphs : paragraphs)
    .map((paragraph) => ({
      ...paragraph,
      matchedTerms: matchedEvidence.filter((term) =>
        hasPhrase(paragraph.text, term),
      ),
    }))
    .filter((paragraph) => paragraph.matchedTerms.length)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length)
    .slice(0, 5)
    .map(({ heading, text, matchedTerms }) => ({
      section: heading,
      text,
      matchedTerms,
    }));

  return { matchedEvidence, evidence };
}

function findRedFlags(job, description, now) {
  const text = `${job.title || ""} ${description}`.toLowerCase();
  const redFlags = [];
  const advisories = [];

  const highRiskSignals = [
    ["unpaid work or trial", /\b(unpaid (?:test|trial|assignment|work)|work for free)\b/i],
    ["application or recruitment fee", /\b(application|recruitment|processing) fee\b/i],
    ["commission-only compensation", /\bcommission[- ]only\b/i],
  ];
  for (const [label, pattern] of highRiskSignals) {
    if (pattern.test(text)) {
      redFlags.push(label);
    }
  }

  const requiredYears = [
    ...description.matchAll(
      /\b(?:minimum(?: of)?\s*)?(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:relevant\s+)?experience)?\b/gi,
    ),
  ].map((match) => Number(match[1]));
  const maxRequestedYears = requiredYears.length ? Math.max(...requiredYears) : 0;
  if (maxRequestedYears > 2) {
    advisories.push(
      `The posting mentions up to ${maxRequestedYears} years of experience; compare this with your experience before applying.`,
    );
  }
  if (/\b(senior|lead|principal|head of|director|manager)\b/i.test(job.title || "")) {
    advisories.push("The title may indicate a role above your current junior target.");
  }
  if (!/\b(?:ngn|₦|\$|salary|compensation|pay range|per month|per annum)\b/i.test(description)) {
    advisories.push("The posting does not state compensation; confirm the range before proceeding.");
  }
  if (!job.postedAt) {
    advisories.push("The posting date is unverified.");
  } else {
    const postedAt = Date.parse(job.postedAt);
    if (!Number.isNaN(postedAt) && now.getTime() - postedAt > 14 * 86400000) {
      advisories.push("The posting appears to be more than 14 days old; verify it is still open.");
    }
  }

  return { redFlags, advisories };
}

function buildTailoredCv({ sections, job, matchedEvidence }) {
  const lines = [];
  const header = sections.get("HEADER") || [];
  lines.push(...header, "", "APPLICATION CV DRAFT", `Target role: ${job.title}`);
  if (job.company) lines.push(`Company: ${job.company}`);
  lines.push("", "PROFILE SUMMARY");

  const summary = (sections.get("PROFESSIONAL SUMMARY") || [])
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      if (/compelling place to contribute/i.test(sentence)) {
        return /\byouverify\b/i.test(job.company || "");
      }
      return sentence.length > 25;
    });
  if (summary.length) {
    lines.push(...summary, "");
  } else {
    lines.push("Review and add a role-specific summary using only your confirmed experience.", "");
  }

  const skills = [...(sections.get("CORE SKILLS") || [])].sort((a, b) => {
    const relevance = (text) =>
      matchedEvidence.filter((term) => hasPhrase(text, term)).length;
    return relevance(b) - relevance(a);
  });
  if (skills.length) {
    lines.push("CORE SKILLS");
    lines.push(...skills, "");
  }

  for (const heading of CV_SECTION_ORDER.slice(2)) {
    const content = sections.get(heading);
    if (!content?.length) continue;
    lines.push(heading, ...content, "");
  }
  lines.push("Review, edit, and format this draft before using it.");
  return lines.join("\n").trim();
}

function buildPitch(job, candidateName, evidence) {
  const example = evidence[0]?.text;
  const exampleText = example
    ? `A relevant example from my experience is: “${example}”`
    : "My CV and portfolio provide examples of my design work.";

  return [
    `Hello ${job.company || "Hiring Team"},`,
    "",
    `I’m interested in the ${job.title || "design"} role. ${exampleText}`,
    "I’d welcome the opportunity to discuss how my background could support your team.",
    "",
    "Best,",
    candidateName || "[Your name]",
  ].join("\n");
}

export function generateApplicationPack({ job, jobDescription, resumeText, now = new Date() }) {
  const description = normalizeText(jobDescription);
  if (description.length < 120) {
    throw new Error("Paste the full job description (at least 120 characters) before generating a pack.");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`The job description must be under ${MAX_DESCRIPTION_LENGTH} characters.`);
  }
  if (!normalizeText(resumeText)) {
    throw new Error("The source CV contains no extractable text.");
  }

  const sections = parseResume(resumeText);
  const candidateName = extractProfileName(sections);
  const jobText = `${job.title || ""} ${description}`;
  const { matchedEvidence, evidence } = collectRelevantEvidence(
    sections,
    jobText,
    resumeText,
  );
  const toolGaps = DESIGN_TOOLS.filter(
    (tool) =>
      hasPhrase(description, tool) && !hasPhrase(resumeText, tool),
  ).map((tool) => `${tool} is requested but not listed in the source CV; confirm before claiming it.`);
  const { redFlags, advisories } = findRedFlags(job, description, now);
  const fit =
    matchedEvidence.length >= 4
      ? "Strong evidence overlap"
      : matchedEvidence.length > 0
        ? "Some evidence overlap"
        : "Limited evidence overlap";

  const followUps = [
    {
      timing: "After 4 business days",
      text: `Hello ${job.company || "Hiring Team"},\n\nI’m following up on my application for the ${job.title || "design"} role. I’d be glad to share any additional information that would help with your review.\n\nBest,\n${candidateName || "[Your name]"}`,
    },
    {
      timing: "After 8 business days",
      text: `Hello ${job.company || "Hiring Team"},\n\nI wanted to check once more on my application for the ${job.title || "design"} role. I remain interested and would welcome an update when convenient. Thank you for your time.\n\nBest,\n${candidateName || "[Your name]"}`,
    },
  ];

  return {
    jobLink: job.link,
    jobTitle: job.title || "",
    company: job.company || "",
    jobDescription: description,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    generationMode: "local-extractive",
    fit: {
      label: fit,
      matchedEvidence,
      evidence,
      redFlags,
      advisories,
      profileGaps: dedupePhrases(toolGaps),
    },
    tailoredCv: buildTailoredCv({ sections, job, matchedEvidence }),
    pitch: buildPitch(job, candidateName, evidence),
    followUps,
  };
}

let sourceCvCache = null;

export async function readSourceCvText() {
  const cvPath = process.env.SOURCE_CV_PATH;
  if (!cvPath) {
    throw new Error("Set SOURCE_CV_PATH in .env.local to your source CV PDF.");
  }
  if (!path.isAbsolute(cvPath)) {
    throw new Error("SOURCE_CV_PATH must be an absolute file path.");
  }

  const stats = await fs.stat(cvPath);
  if (!stats.isFile() || path.extname(cvPath).toLowerCase() !== ".pdf") {
    throw new Error("SOURCE_CV_PATH must point to a readable PDF file.");
  }
  if (
    sourceCvCache?.path === cvPath &&
    sourceCvCache.modifiedAt === stats.mtimeMs
  ) {
    return sourceCvCache.text;
  }

  let result;
  try {
    result = await execFileAsync("pdftotext", ["-layout", cvPath, "-"], {
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error("PDF text extraction needs Poppler (pdftotext). Install it with `brew install poppler` on macOS.");
    }
    throw new Error(`Could not extract text from the source CV: ${err.message}`);
  }

  const text = normalizeText(result.stdout).slice(0, MAX_CV_LENGTH);
  if (text.length < 80) {
    throw new Error("The source CV has too little extractable text. Use a text-based PDF.");
  }
  sourceCvCache = { path: cvPath, modifiedAt: stats.mtimeMs, text };
  return text;
}

async function readStore() {
  try {
    const text = await fs.readFile(STORE_PATH, "utf8");
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Application pack storage has an invalid format.");
    }
    return data;
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

let storeQueue = Promise.resolve();

function updateStore(mutator) {
  const operation = storeQueue.then(async () => {
    const data = await readStore();
    const result = mutator(data);
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(STORE_PATH), 0o700);
    const temporaryPath = `${STORE_PATH}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.chmod(temporaryPath, 0o600);
      await fs.rename(temporaryPath, STORE_PATH);
    } catch (err) {
      await fs.rm(temporaryPath, { force: true });
      throw err;
    }
    return result;
  });
  storeQueue = operation.catch(() => {});
  return operation;
}

export async function getSavedApplicationPack(jobLink) {
  if (!jobLink) return null;
  const data = await readStore();
  return data[jobLink] || null;
}

export async function saveApplicationPack(pack) {
  if (!pack?.jobLink) {
    throw new Error("A job application link is required to save this pack.");
  }
  return updateStore((data) => {
    data[pack.jobLink] = pack;
    return pack;
  });
}
