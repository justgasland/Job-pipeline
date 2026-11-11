# Job Pipeline

A Next.js job-discovery dashboard that fetches public remote listings and
configured company ATS boards, filters and scores roles, and tracks matches in
a Google Sheet. It is being adapted for entry-level and junior roles in Nigeria,
including design roles. Runs locally for testing or on a VPS for scheduled
checks.

## How it works

```
cron (7am daily)  ->  POST /api/run
                         |
   1. lib/fetchers/      pull jobs from public sources, job boards and configured ATS boards
   2. lib/filters.js     keep eligible countries, reject stale dates, deduplicate
   3. lib/scorer.js      score engineering and design roles separately
   4. lib/sheets.js      write the best new matches to the sheet
   5. lib/emailApply.js  find application emails in descriptions
   6. approvals          queue applications for review
   7. lib/mailer.js      follow-up reminders and one daily digest

Dashboard (app/page.js) reads and updates the same sheet.
```

## Your day

1. Open the dashboard. Jobs are sorted by match score.
2. For a design match, choose **Application pack**, paste the complete job
   description, and review the fit signals, red flags, tailored CV draft,
   outreach pitch, and two follow-up drafts. Edit and save the drafts before
   using them.
3. Open the original listing and apply manually. Nothing is sent or scheduled
   by the application-pack feature.
4. Click **Mark Applied**. The existing tracker sets a follow-up reminder for
   7 days later.

The first application-pack version runs locally: it extracts text from the
configured source CV, preserves candidate wording, and reorders sections and
skills for the job. The fit check compares only evidence found in both the
source CV and pasted job description. It does not invent experience, skills,
or company research. Downloaded CVs are editable text drafts and need review
and formatting. External AI is not configured; no CV or job description is
sent to an AI provider. Application emails and follow-up messages remain
disabled; the existing tracker may still send a follow-up reminder email.

Listings older than `MAX_JOB_AGE_DAYS` are excluded when a source date is
available. Listings without a verifiable posting date remain visible and are
flagged for review.

## Project layout

### Root

| File                 | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `middleware.js`      | Password login for the dashboard and API (HTTP Basic Auth).    |
| `package.json`       | Dependencies: next, react, googleapis, nodemailer, rss-parser. |
| `.env.local.example` | Template for every setting. Copy to `.env.local`.              |

### `config/` (edit these, no code changes)

| File             | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `countries.json` | Countries to include in job discovery, including Nigeria.                         |
| `companies.json` | Company names checked on Greenhouse, Lever, Ashby, BambooHR, and Workable.     |
| `cvMapping.json` | Legacy engineering CV mapping; static CV use is disabled by default.              |
| `targetRoles.json` | Role tracks and the active match-profile version.                                |
| `applyKit.json`  | Your details and saved answers. Replace the `EDIT ME` lines before use.            |

### `app/`

| File                   | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `page.js`              | The dashboard: job tracking, reviewable packs, and LinkedIn links. |
| `api/run/route.js`     | The daily pipeline. Protected by `CRON_SECRET`.                 |
| `api/approve/route.js` | Approve and status changes; applications remain manual.          |
| `api/jobs/route.js`    | Reads the sheet for the dashboard.                              |
| `api/application-packs/route.js` | Generates, retrieves, and saves local review drafts.     |
| `api/kit/route.js`     | Serves `applyKit.json` to the dashboard.                        |
| `api/resume/route.js`  | Serves legacy CVs only when explicitly enabled.                  |
| `api/clear/route.js`   | Clear all (only works when `ALLOW_CLEAR=true`).                 |
| `api/format/route.js`  | One-time sheet styling. Run it once.                            |

### `lib/`

| File            | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| `sheets.js`     | All Google Sheet reads and writes.                             |
| `filters.js`    | Country filter, remote check, duplicate removal.               |
| `scorer.js`     | Match score and CV choice. Word lists at the top are editable. |
| `applicationPacks.js` | Local CV extraction, evidence checks, draft generation, private storage. |
| `emailApply.js` | Finds an application email in a job description.               |
| `linkedin.js`   | Builds LinkedIn search links per company.                      |
| `mailer.js`     | Daily digest and follow-up emails.                             |
| `autoApply.js`  | Application sending is disabled; packs require manual review.   |
| `loadJson.js`   | Loads the config files.                                        |
| `fetchers/`     | One file per job source, plus `index.js` that runs them all.   |

### `scripts/`

| File                  | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `check-companies.mjs` | Tests every company in `companies.json`, removes dead ones, adds new ones. |

### Other

`resumes/` holds your 3 CV PDFs. `cron/` holds the scripts that call `/api/run`
daily. `logs/` holds the daily run log. Generated packs are stored in the
gitignored `data/` directory with owner-only file permissions.

## Settings (`.env.local`)

| Setting                                                                                 | What it does                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`          | Connect to your sheet.                                                     |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD`, `SMTP_SERVER`, `SMTP_PORT`, `DIGEST_RECIPIENT_EMAIL` | Sending email. Gmail needs an App Password.                                |
| `MINIMUM_MATCH_SCORE`                                                                   | Jobs below this never reach the sheet. Default 55.                         |
| `AUTO_APPROVE_MIN_SCORE`                                                                | Threshold for high-match jobs to enter the manual-apply queue. Default 80. |
| `REQUIRE_REMOTE`                                                                        | `true` drops career-page jobs that don't look remote. Default false.       |
| `AUTO_SEND_EMAILS`                                                                      | Must remain false; application packs are drafts and are never sent.         |
| `MAX_EMAILS_PER_RUN`                                                                    | Reserved for the future email-application flow; currently inactive.       |
| `MAX_JOB_AGE_DAYS`                                                                      | Excludes dated listings older than this; default 14.                        |
| `SOURCE_CV_PATH`                                                                        | Absolute path to the local PDF used for application-pack drafts.            |
| `CRON_SECRET`                                                                           | Protects `/api/run`.                                                       |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD`                                                  | Switch on the dashboard login.                                             |
| `ALLOW_CLEAR`                                                                           | Enables Clear all. Keep false on the VPS.                                  |

## Setup on your PC

```bash
pnpm install
cp .env.local.example .env.local     # then fill it in
pnpm dev                             # open http://localhost:3000
```

Install Poppler (`brew install poppler` on macOS) and set `SOURCE_CV_PATH` in
`.env.local` to the absolute path of your source PDF. Keep the CV outside Git.
On a VPS, install Poppler and place the CV in a private, backed-up location;
generated packs contain personal information and remain in the ignored
`data/` directory.

Google setup: create a Google Cloud project, enable the Sheets and Drive APIs,
make a service account, download its JSON key into `credentials/`, create the
sheet, and share it with the service account's email as Editor. Then run once:

```bash
curl -X POST http://localhost:3000/api/format
curl -X POST http://localhost:3000/api/run -H "x-cron-secret: YOUR_CRON_SECRET"
```

(If you set a dashboard login, add `-u USER:PASSWORD` to the `format` call.)

Keep the project in a plain folder such as `C:\Users\YOU\job-pipeline`. Do not
put it in OneDrive: syncing breaks `node_modules`.

## Keeping the company list healthy

```bash
node scripts/check-companies.mjs                 # report
node scripts/check-companies.mjs --fix           # remove dead names
node scripts/check-companies.mjs --add=greenhouse:dropbox,ashby:retool
```

Restart `pnpm dev` after changing the list, because the fetchers read it at startup.

The verified BambooHR pilot is Flutterwave (`flutterwavego`), linked from
Flutterwave's [official vacancies page](https://flutterwave.com/ng/careers/vacancies).
Its public feed provides titles, locations, and application links, but not
posting dates or full descriptions; those fields remain marked for manual review.

Kuda's [official careers page](https://www.kuda.com/careers/) links to its
Workable board. The verified public Workable listing and detail endpoints are
configured for Kuda only.

Jobberman's [Creative & Design](https://www.jobberman.com/jobs/creative-design)
and [Product & Project Management](https://www.jobberman.com/jobs/product-project-management)
listing pages add Nigerian job-board coverage. Jobberman is limited to those
public category pages; its robots-disallowed API and job routes are not fetched.
MyJobMag publishes a [detailed XML feed](https://www.myjobmag.com/feeds/), but a
live check found mismatched job/employer fields and descriptions, so it is not
ingested until the records can be cross-checked reliably. HotNigerianJobs
publishes RSS too, but its robots content signal limits use to reference; it is
not used for automated matching.

## Putting it on the VPS

1. Install Node 20 and pnpm, upload the project, run `pnpm install` and
   `pnpm build`.
2. Fill in `.env.local` with Linux paths. Set `ALLOW_CLEAR=false` and set a
   dashboard login.
3. Start it with PM2: `pm2 start "pnpm start" --name job-pipeline`, then
   `pm2 save` and `pm2 startup`.
4. Fix Windows line endings in the scripts, then install the daily job:
   `sed -i 's/\r$//' cron/*.sh && chmod +x cron/*.sh && ./cron/setup_cron.sh`.
5. Block everything except SSH with the firewall and reach the dashboard
   through an SSH tunnel: `ssh -L 3000:localhost:3000 user@your-vps-ip`.

## Security

- `.env.local` and `credentials/` must never be committed. Check with
  `git check-ignore -v .env.local credentials/keys.json`.
- The dashboard login uses Basic Auth, which is readable on plain `http://`.
  Use the SSH tunnel or HTTPS.
- `config/applyKit.json` holds your saved answers. Do not commit a real salary
  number to a public repo.
- Rotate the service account key, app password, and `CRON_SECRET` if they are
  ever pasted somewhere public.

## Known limits

- Applications are not sent automatically. Review packs and submit email or
  web-form applications yourself.
- Scoring is a keyword-based first pass. Read the posting before applying.
- Country matching is text based and can miss unusual wording. Extend
  `SYNONYMS` in `lib/filters.js` when it does.
- Salaries are not read from postings, so the sheet shows "Not listed".
- Email detection can pick the wrong address. Verify any address on the
  original listing before applying.
- LinkedIn and Indeed are not sources: neither offers individual API access.

## Next steps

1. Watch a few real runs and tune the word lists in `lib/scorer.js` and
   `MINIMUM_MATCH_SCORE`.
2. Run `check-companies.mjs` every month and add companies from your target list.
3. Deploy to the VPS (section above).
4. Build the LinkedIn alert-email reader.
5. Build an assisted-apply script if submitting forms takes too long.
6. More sources: NaukriGulf for UAE and Qatar, StepStone for Germany.
7. Revisit `config/countries.json` every few months. Salaries change.
