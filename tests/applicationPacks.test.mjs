import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApplicationPack } from "../lib/applicationPacks.js";

const resumeText = `ABDUL GAFAR SONOLA
Nigeria | email@example.test

PROFESSIONAL SUMMARY

Brand and visual designer with experience developing brand strategies, visual identities, and campaign materials.
My interest in identity verification makes YouVerify a compelling place to contribute.

CORE SKILLS

Brand Strategy & Development: Brand research, competitive analysis, brand identity development.

Visual Communication: Typography, layout and composition, visual hierarchy, campaign design.

EXPERIENCE

Fortica
Brand Identity Designer | Jan 2026 – Jul 2026

• Researched African fintech platforms to identify positioning opportunities.

• Developed brand strategy and translated it into naming, visual identity, voice, and narrative.

EDUCATION

Crescent University
Bachelor of Science`;

const job = {
  title: "Junior Brand Designer",
  company: "Example Studio",
  link: "https://example.test/jobs/123",
  employmentType: "Full Time",
  postedAt: "2026-10-28T00:00:00.000Z",
};

test("application pack uses CV evidence, identifies gaps, and avoids employer-specific summary claims", () => {
  const pack = generateApplicationPack({
    job,
    jobDescription:
      "We need a Junior Brand Designer to build brand identity, brand strategy, competitive analysis, and campaign design for our growing team. Familiarity with Figma is required. Salary NGN 200,000 monthly.",
    resumeText,
    now: new Date("2026-11-03T12:00:00.000Z"),
  });

  assert.equal(pack.generationMode, "local-extractive");
  assert.equal(pack.fit.label, "Strong evidence overlap");
  assert.ok(pack.fit.matchedEvidence.includes("brand strategy"));
  assert.ok(pack.fit.evidence.some((item) => item.text.includes("Developed brand strategy")));
  assert.ok(pack.fit.profileGaps.some((gap) => gap.startsWith("Figma is requested")));
  assert.deepEqual(pack.fit.redFlags, []);
  assert.ok(!pack.tailoredCv.includes("YouVerify"));
  assert.ok(pack.tailoredCv.includes("Developed brand strategy"));
  assert.ok(pack.pitch.includes("Example Studio"));
  assert.ok(pack.pitch.includes("ABDUL GAFAR SONOLA"));
  assert.equal(pack.followUps.length, 2);
  assert.match(pack.followUps[0].timing, /4 business days/);
});

test("application pack flags unpaid work, fees, commission-only pay, and senior requirements", () => {
  const pack = generateApplicationPack({
    job: { ...job, title: "Senior Brand Designer", postedAt: "" },
    jobDescription:
      "Senior Brand Designer needed. Minimum of 5 years experience. Complete an unpaid test assignment and pay an application fee. This is commission-only.",
    resumeText,
    now: new Date("2026-11-03T12:00:00.000Z"),
  });

  assert.ok(pack.fit.redFlags.includes("unpaid work or trial"));
  assert.ok(pack.fit.redFlags.includes("application or recruitment fee"));
  assert.ok(pack.fit.redFlags.includes("commission-only compensation"));
  assert.ok(pack.fit.advisories.some((note) => note.includes("5 years")));
  assert.ok(pack.fit.advisories.some((note) => note.includes("junior target")));
  assert.ok(pack.fit.advisories.some((note) => note.includes("date is unverified")));
});

test("pack generation rejects missing or excessively long job descriptions", () => {
  assert.throws(
    () =>
      generateApplicationPack({
        job,
        jobDescription: "Too short.",
        resumeText,
      }),
    /at least 120 characters/,
  );
  assert.throws(
    () =>
      generateApplicationPack({
        job,
        jobDescription: "x".repeat(40001),
        resumeText,
      }),
    /under 40000 characters/,
  );
});
