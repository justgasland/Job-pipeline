import { NextResponse } from "next/server";
import { getAllJobs } from "../../../lib/sheets.js";
import {
  generateApplicationPack,
  getSavedApplicationPack,
  readSourceCvText,
  saveApplicationPack,
} from "../../../lib/applicationPacks.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseRow(value) {
  const row = Number(value);
  return Number.isInteger(row) && row > 1 ? row : null;
}

async function findJob(row) {
  const jobs = await getAllJobs();
  return jobs.find((job) => job._row === row) || null;
}

function normalizeJob(row) {
  return {
    title: row["Role Title"] || "",
    company: row.Company || "",
    location: row["Country/Remote"] || "",
    employmentType: row["Employment Type"] || "",
    link: row.Link || "",
    postedAt: row["Posted Date"] || "",
    postingDateStatus: row["Posting Date Check"] || "",
  };
}

function errorResponse(err) {
  return NextResponse.json(
    { success: false, error: err.message || "Application pack request failed." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request) {
  const row = parseRow(new URL(request.url).searchParams.get("row"));
  if (!row) {
    return NextResponse.json(
      { success: false, error: "A valid sheet row is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const sheetJob = await findJob(row);
    if (!sheetJob?.Link) {
      return NextResponse.json(
        { success: false, error: "That job could not be found in the sheet." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const pack = await getSavedApplicationPack(sheetJob.Link);
    return NextResponse.json(
      { success: true, pack },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const row = parseRow(body.row);
  if (!row) {
    return NextResponse.json(
      { success: false, error: "A valid sheet row is required." },
      { status: 400 },
    );
  }
  if (typeof body.jobDescription !== "string") {
    return NextResponse.json(
      { success: false, error: "Paste the complete job description to continue." },
      { status: 400 },
    );
  }
  if (body.jobDescription.length > 40000) {
    return NextResponse.json(
      { success: false, error: "The job description must be under 40,000 characters." },
      { status: 400 },
    );
  }

  try {
    const sheetJob = await findJob(row);
    if (!sheetJob?.Link) {
      return NextResponse.json(
        { success: false, error: "That job could not be found in the sheet." },
        { status: 404 },
      );
    }
    if (sheetJob["CV Version Used"] !== "custom_per_job") {
      return NextResponse.json(
        { success: false, error: "Application packs are enabled only for jobs matched to the configured per-job CV profile." },
        { status: 409 },
      );
    }

    const pack = generateApplicationPack({
      job: normalizeJob(sheetJob),
      jobDescription: body.jobDescription,
      resumeText: await readSourceCvText(),
    });
    await saveApplicationPack(pack);
    return NextResponse.json(
      { success: true, pack },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (/at least 120 characters|must be under 40000 characters/i.test(err.message)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }
    return errorResponse(err);
  }
}

export async function PUT(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const row = parseRow(body.row);
  if (!row) {
    return NextResponse.json(
      { success: false, error: "A valid sheet row is required." },
      { status: 400 },
    );
  }
  if (
    typeof body.tailoredCv !== "string" ||
    body.tailoredCv.length > 30000 ||
    typeof body.pitch !== "string" ||
    body.pitch.length > 8000 ||
    !Array.isArray(body.followUps) ||
    body.followUps.length !== 2 ||
    body.followUps.some((text) => typeof text !== "string" || text.length > 8000)
  ) {
    return NextResponse.json(
      { success: false, error: "CV, pitch, or follow-up draft is invalid or too long." },
      { status: 400 },
    );
  }

  try {
    const sheetJob = await findJob(row);
    if (!sheetJob?.Link) {
      return NextResponse.json(
        { success: false, error: "That job could not be found in the sheet." },
        { status: 404 },
      );
    }
    const existing = await getSavedApplicationPack(sheetJob.Link);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Generate an application pack before saving edits." },
        { status: 404 },
      );
    }

    const pack = {
      ...existing,
      tailoredCv: body.tailoredCv,
      pitch: body.pitch,
      followUps: existing.followUps.map((followUp, index) => ({
        ...followUp,
        text: body.followUps[index],
      })),
      updatedAt: new Date().toISOString(),
    };
    await saveApplicationPack(pack);
    return NextResponse.json(
      { success: true, pack },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
