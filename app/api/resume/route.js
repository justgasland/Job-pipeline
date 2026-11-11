// app/api/resume/route.js
// Static CV downloads remain disabled; use a reviewed per-job application pack.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Static CV downloads are disabled; use a reviewed per-job application pack.",
    },
    { status: 410 },
  );
}
