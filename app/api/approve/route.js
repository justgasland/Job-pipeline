// app/api/approve/route.js
// Updates a row's Status when you click a button on the dashboard.
// Body: { row: 5, status: "Approved" }
//
// Approval only moves a job to the manual-apply queue; nothing is sent.
// Marking a job Applied sets a 7-day follow-up reminder.

import { NextResponse } from "next/server";
import {
  getAllJobs,
  updateStatus,
  setFollowUpDate,
  STATUS,
} from "../../../lib/sheets.js";

export const maxDuration = 30;
const ALLOWED_STATUSES = new Set(Object.values(STATUS));
const FOLLOW_UP_STATUSES = new Set([STATUS.APPLIED, STATUS.APPLIED_AUTO]);

export async function POST(request) {
  try {
    const { row, status } = await request.json();

    if (!row || !status) {
      return NextResponse.json(
        { error: "row and status are required" },
        { status: 400 },
      );
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}` },
        { status: 400 },
      );
    }

    const rowNumber = Number(row);

    if (status === STATUS.APPROVED) {
      const all = await getAllJobs();
      const job = all.find((j) => j._row === rowNumber);
      const method = (job?.["Submission Method"] || "").trim().toLowerCase();
      const emailMatch = (job?.Notes || "").match(
        /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
      );

      if (job && method === "email" && emailMatch) {
        await updateStatus(rowNumber, STATUS.NEEDS_MANUAL);
        return NextResponse.json({
          success: true,
          sent: false,
          needsManual: true,
          message:
            "Email applications are paused until your job-specific CV is ready. This job was moved to Needs Manual Apply.",
        });
      }

      // Web-form job: nothing to send, go straight to the manual queue.
      await updateStatus(rowNumber, STATUS.NEEDS_MANUAL);
      return NextResponse.json({ success: true, sent: false });
    }

    await updateStatus(rowNumber, status);
    if (FOLLOW_UP_STATUSES.has(status)) {
      await setFollowUpDate(rowNumber, 7);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
