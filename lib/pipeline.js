// lib/pipeline.js
// The daily pipeline in one place. Two things run it:
//   - scripts/run-pipeline.mjs (the VPS cron job, plain Node, no web server)
//   - app/api/run/route.js (manual runs on your own PC)
//
// fetch -> filter -> dedup -> score -> write to sheet -> queue approvals ->
// follow-ups -> daily digest. Email applications are paused until per-job CV
// tailoring is implemented.

import { fetchAllJobs } from "./fetchers/index.js";
import {
  filterJobs,
  filterFreshJobs,
  isWithinMaxAge,
  missingListingDetails,
  deduplicate,
} from "./filters.js";
import { scoreAll, computeMatchScore, pickCvVersion } from "./scorer.js";
import { loadJson } from "./loadJson.js";
import { findApplyEmail } from "./emailApply.js";
import {
  addJobs,
  getExistingLinks,
  getJobsByStatus,
  updateStatus,
  getDueFollowUps,
  STATUS,
} from "./sheets.js";
import { sendDailyDigest, sendFollowUpReminder } from "./mailer.js";

const MAX_NEW_ROWS_PER_RUN = 50;
const targetRoles = loadJson(import.meta.url, "../config/targetRoles.json");
const ACTIVE_TARGET_TRACKS = new Set(targetRoles.activeTracks || []);

// Returns { success, log } or { success: false, error, log }. Never throws.
export async function runPipeline() {
  // Settings are read when the run starts, so changes to .env.local apply.
  const minimumScore = Number(process.env.MINIMUM_MATCH_SCORE || 55);
  const autoApproveMin = Number(process.env.AUTO_APPROVE_MIN_SCORE || 80);
  const log = [];
  const pushLog = (msg) => {
    console.log(msg);
    log.push(msg);
  };

  try {
    const maxJobAgeDays = Number(process.env.MAX_JOB_AGE_DAYS || 14);
    if (!Number.isInteger(maxJobAgeDays) || maxJobAgeDays < 1) {
      throw new Error("MAX_JOB_AGE_DAYS must be a positive whole number");
    }
    if (process.env.AUTO_SEND_EMAILS === "true") {
      throw new Error(
        "Automatic applications are disabled; review and submit applications manually.",
      );
    }

    // --- fetch, filter, dedup ---
    pushLog("=== Fetching jobs from all sources ===");
    // Every source's jobs get a quick check (country and score) the moment
    // they arrive, so thousands of jobs that could never pass never pile up
    // in memory. The full checks below still run on what is kept.
    const keepCandidate = (job) =>
      ACTIVE_TARGET_TRACKS.has(pickCvVersion(job).roleTrack) &&
      filterJobs([job]).length === 1 &&
      isWithinMaxAge(job, maxJobAgeDays) &&
      computeMatchScore(job) >= minimumScore;
    const fetched = await fetchAllJobs(keepCandidate);
    pushLog(
      `Jobs seen: ${fetched.total}, kept after location, freshness, and fit checks: ${fetched.jobs.length}`,
    );

    const freshJobs = filterFreshJobs(fetched.jobs, maxJobAgeDays);
    pushLog(
      `Posting date verified: ${freshJobs.filter((job) => job.postingDateStatus === "Recent").length}; unverified: ${freshJobs.filter((job) => job.postingDateStatus === "Date unverified").length}`,
    );

    const eligibleJobs = filterJobs(freshJobs);
    pushLog(`After country filter: ${eligibleJobs.length}`);

    const existingLinks = await getExistingLinks();
    const newJobs = deduplicate(eligibleJobs, existingLinks);
    pushLog(`After removing duplicates already in sheet: ${newJobs.length}`);

    // --- score ---
    const scoredJobs = scoreAll(newJobs, minimumScore);
    pushLog(
      `After minimum match score (${minimumScore}): ${scoredJobs.length}`,
    );

    // --- write best matches in one batch ---
    const toAdd = [...scoredJobs]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_NEW_ROWS_PER_RUN);

    const autoApproved = [];
    let emailJobs = 0;
    const rowsToAdd = toAdd.map((job) => {
      const applyEmail = findApplyEmail(job.description);
      if (applyEmail) emailJobs++;

      const strong = job.matchScore >= autoApproveMin && !job.needsManualReview;

      // Email applications stay pending review; web-form applications are
      // queued for manual submission.
      let status = STATUS.AWAITING_APPROVAL;
      if (strong && !applyEmail) {
        status = STATUS.NEEDS_MANUAL;
      }
      if (status === STATUS.NEEDS_MANUAL) autoApproved.push(job);

      return {
        company: job.company || "",
        roleTitle: job.title || "",
        employmentType: job.employmentType || "Not specified",
        countryRemote: job.location || "",
        estSalary: "Not listed",
        matchScore: job.matchScore,
        cvVersion: job.cvVersion,
        link: job.link || "",
        source: job.source || "",
        postedAt: job.postedAt || "",
        postingDateStatus: job.postingDateStatus || "Date unverified",
        missingListingDetails: missingListingDetails(job).join(", "),
        matchProfile: targetRoles.matchProfile,
        submissionMethod: applyEmail ? "Email" : "Unknown (check posting)",
        status,
        notes: [
          status !== STATUS.AWAITING_APPROVAL
            ? `Auto-approved (score ${job.matchScore})`
            : "",
          job.needsManualReview ? "Flagged for manual CV review" : "",
          job.cvVersion === "custom_per_job"
            ? "Per-job CV tailoring required before applying"
            : "",
          job.locationRestricted
            ? "Check location eligibility before applying"
            : "",
          applyEmail ? `Apply by email: ${applyEmail}` : "",
        ]
          .filter(Boolean)
          .join(". "),
      };
    });
    await addJobs(rowsToAdd);
    pushLog(
      `Added ${rowsToAdd.length} new rows (${autoApproved.length} auto-approved, ${emailJobs} with an application email).`,
    );

    // --- process approved jobs: send email applications, queue the rest ---
    const approved = await getJobsByStatus(STATUS.APPROVED);
    const autoAppliedToday = [];
    const needsManualApply = [];

    for (const row of approved) {
      const method = (row["Submission Method"] || "").trim().toLowerCase();
      const emailMatch = (row.Notes || "").match(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );

      if (method === "email" && emailMatch) {
        await updateStatus(row._row, STATUS.NEEDS_MANUAL);
        needsManualApply.push(row);
        continue;
      }

      await updateStatus(row._row, STATUS.NEEDS_MANUAL);
      needsManualApply.push(row);
    }
    pushLog(
      `Emails sent: ${autoAppliedToday.length}, Needs manual: ${needsManualApply.length}`,
    );

    // --- follow-ups due today ---
    const dueFollowUps = await getDueFollowUps();
    if (dueFollowUps.length) {
      await sendFollowUpReminder(dueFollowUps);
      for (const row of dueFollowUps) {
        await updateStatus(row._row, STATUS.FOLLOWUP_SENT);
      }
    }
    pushLog(`Follow-ups sent: ${dueFollowUps.length}`);

    // --- daily digest ---
    const stillAwaiting = await getJobsByStatus(STATUS.AWAITING_APPROVAL);
    await sendDailyDigest({
      needsApproval: stillAwaiting,
      needsManualApply: [...autoApproved, ...needsManualApply],
      autoAppliedToday,
    });
    pushLog("Daily digest sent.");

    return { success: true, log };
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    return { success: false, error: err.message, log };
  }
}
