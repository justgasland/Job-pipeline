import { test } from "node:test";
import assert from "node:assert/strict";
import { makeJob, normalizeJobDate } from "../lib/fetchers/base.js";
import { formatBambooHRLocation } from "../lib/fetchers/bamboohr.js";
import { parseJobbermanListings } from "../lib/fetchers/jobberman.js";
import { normalizeWorkableJob } from "../lib/fetchers/workable.js";

test("job dates normalize ISO values and epoch seconds", () => {
  assert.equal(
    normalizeJobDate("2026-11-03T08:00:00.000Z"),
    "2026-11-03T08:00:00.000Z",
  );
  assert.equal(normalizeJobDate(1735689600), "2025-01-01T00:00:00.000Z");
});

test("missing and invalid source dates remain unknown", () => {
  assert.equal(normalizeJobDate(""), "");
  assert.equal(normalizeJobDate("not-a-date"), "");
  assert.equal(makeJob({ postedAt: "not-a-date" }).postedAt, "");
});

test("BambooHR locations identify Nigerian states without mislabeling other countries", () => {
  assert.equal(
    formatBambooHRLocation({ city: "Lekki", state: "Lagos" }),
    "Lekki, Lagos, Nigeria",
  );
  assert.equal(
    formatBambooHRLocation({ city: "Wuse", state: "Abuja" }),
    "Wuse, Abuja, Nigeria",
  );
  assert.equal(
    formatBambooHRLocation({ city: "Lusaka", state: "." }),
    "Lusaka",
  );
});

test("Jobberman cards produce normalized listings with dates and location details", () => {
  const html = `
    <article data-cy="listing-cards-components">
      <img alt="Example Studio" />
      <h3><a data-cy="listing-title-link" title="Junior Brand Designer"
        href="https://www.jobberman.com/listings/junior-brand-designer-123">
        Junior Brand Designer</a></h3>
      <span class="truncate text-text-secondary">Example Studio</span>
      <span>Posted 2 days ago</span>
      <div data-cy="description-tile"><p>
        <a>Creative &amp; design</a> - Create brand identities &amp; campaigns.
      </p></div>
      <div class="flex flex-wrap items-end gap-4">
        <span class="inline-flex items-center gap-1"><svg></svg>Lagos</span>
        <span class="inline-flex items-center gap-1"><svg></svg>Full Time</span>
        <span class="inline-flex items-center gap-1"><svg></svg>NGN 100,000</span>
      </div>
    </article>`;
  const now = new Date("2026-11-03T12:00:00.000Z");
  const [job] = parseJobbermanListings(html, now);

  assert.equal(job.title, "Junior Brand Designer");
  assert.equal(job.company, "Example Studio");
  assert.equal(job.location, "Lagos");
  assert.equal(job.employmentType, "Full Time");
  assert.equal(job.description, "Create brand identities & campaigns.");
  assert.equal(job.postedAt, "2026-11-01T12:00:00.000Z");
  assert.equal(job.source, "jobberman");
});

test("Workable listings combine public details and format Nigerian locations", () => {
  const job = normalizeWorkableJob(
    {
      shortcode: "ABCD1234",
      title: "Product Designer",
      location: { city: "Lagos", country: "Nigeria", region: "Lagos" },
      published: "2026-11-02T00:00:00.000Z",
    },
    {
      title: "Product Designer",
      location: { city: "Lagos", country: "Nigeria", region: "Lagos" },
      description: "<p>Design useful product flows &amp; prototypes.</p>",
      requirements: "<p>Bring a strong portfolio.</p>",
    },
    "kuda",
  );

  assert.equal(job.company, "Kuda");
  assert.equal(job.location, "Lagos, Nigeria");
  assert.equal(
    job.description,
    "Design useful product flows & prototypes.\n\nBring a strong portfolio.",
  );
  assert.equal(job.link, "https://apply.workable.com/kuda/j/ABCD1234/");
  assert.equal(job.postedAt, "2026-11-02T00:00:00.000Z");
  assert.equal(job.source, "workable");
});
