import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocationEligible,
  isLocationRestricted,
  isRemoteJob,
  filterJobs,
  filterFreshJobs,
  isWithinMaxAge,
  missingListingDetails,
  deduplicate,
} from "../lib/filters.js";

test("eligible countries are accepted, abbreviations included", () => {
  for (const place of [
    "Berlin, Germany",
    "Dubai, UAE",
    "UK",
    "Remote - USA",
    "Singapore",
    "Lagos, Nigeria",
    "Lagos",
    "Abuja",
    "Port Harcourt",
  ]) {
    assert.equal(isLocationEligible(place).ok, true, place);
  }
});

test("countries outside the target list are rejected", () => {
  for (const place of [
    "Mumbai, India",
    "Manila, Philippines",
  ]) {
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("remote and worldwide jobs are accepted, and so is a blank location", () => {
  for (const place of ["Remote", "Worldwide", "Remote, EMEA", "Anywhere", ""]) {
    assert.equal(isLocationEligible(place).ok, true, place || "(blank)");
  }
});

test("jobs tied to specific countries or regions are flagged, open ones are not", () => {
  for (const place of [
    "Remote - USA",
    "Remote, AMER",
    "Remote - Canada",
    "Remote - UK",
  ]) {
    assert.equal(isLocationRestricted(place), true, place);
  }
  for (const place of [
    "Remote",
    "Remote, EMEA",
    "Remote, Global",
    "Worldwide",
    "Lagos, Nigeria",
  ]) {
    assert.equal(isLocationRestricted(place), false, place);
  }
});

test("remote-only boards are always remote, even with just a country name", () => {
  assert.equal(
    isRemoteJob({
      source: "himalayas",
      location: "United States",
      title: "Dev",
    }),
    true,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "Berlin, Germany",
      title: "Dev",
      description: "",
    }),
    false,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "",
      title: "Dev",
      description: "This is a fully remote role.",
    }),
    true,
  );
});

test("filterJobs drops ineligible countries and adds the restricted flag", () => {
  const out = filterJobs([
    { source: "ashby", title: "Dev", location: "Remote - USA" },
    { source: "ashby", title: "Dev", location: "Mumbai, India" },
    { source: "ashby", title: "Dev", location: "Remote, EMEA" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].locationRestricted, true);
  assert.equal(out[1].locationRestricted, false);
});

test("freshness filter excludes old dated jobs but keeps unknown dates flagged", () => {
  const now = new Date("2026-11-03T12:00:00.000Z");
  const result = filterFreshJobs(
    [
      { title: "Recent", postedAt: "2026-10-25T12:00:00.000Z" },
      { title: "Stale", postedAt: "2026-10-01T12:00:00.000Z" },
      { title: "Unknown", postedAt: "" },
    ],
    14,
    now,
  );
  assert.deepEqual(result.map((job) => job.title), ["Recent", "Unknown"]);
  assert.equal(result[0].postedAt, "2026-10-25");
  assert.equal(result[0].postingDateStatus, "Recent");
  assert.equal(result[1].postingDateStatus, "Date unverified");
});

test("future posting dates are retained as unverified, not trusted as fresh", () => {
  const now = new Date("2026-11-03T12:00:00.000Z");
  const result = filterFreshJobs(
    [{ title: "Future", postedAt: "2026-11-05T12:00:00.000Z" }],
    14,
    now,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].postedAt, "");
  assert.equal(result[0].postingDateStatus, "Date unverified");
});

test("freshness helper retains undated listings", () => {
  assert.equal(isWithinMaxAge({ postedAt: "" }, 14), true);
});

test("missing listing details are labeled for dashboard review", () => {
  assert.deepEqual(
    missingListingDetails({
      description: "",
      location: "",
      employmentType: "",
      link: "https://example.com/job",
      postingDateStatus: "Date unverified",
    }),
    ["Description", "Location", "Employment type", "Posting date unverified"],
  );
});

test("deduplicate removes known links, repeats and jobs with no link", () => {
  const out = deduplicate(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    new Set(["a"]),
  );
  assert.deepEqual(
    out.map((j) => j.link),
    ["b", "c"],
  );
});
