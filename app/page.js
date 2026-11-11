"use client";

import { useEffect, useState, useMemo } from "react";
import { linkedinLinks } from "../lib/linkedin.js";

const STATUS_COLOR = {
  "Awaiting Your Approval": "var(--status-awaiting)",
  Approved: "var(--status-approved)",
  Applied: "var(--status-applied)",
  "Applied (Auto)": "var(--status-applied)",
  "Needs Manual Apply": "var(--status-manual)",
  Interview: "var(--status-interview)",
  Rejected: "var(--status-rejected)",
  "No Response": "var(--status-none)",
  "Follow-up Sent": "var(--status-approved)",
};

const CV_LABEL = {
  frontend_engineer: "Previous profile CV (disabled)",
  react_native: "Previous profile CV (disabled)",
  product_engineer: "Previous profile CV (disabled)",
  custom_per_job: "Custom CV required",
};

const TABS = [
  { key: "all", label: "All", match: () => true },
  {
    key: "awaiting",
    label: "Awaiting approval",
    match: (s) => s === "Awaiting Your Approval",
  },
  {
    key: "manual",
    label: "Needs manual apply",
    match: (s) => s === "Needs Manual Apply",
  },
  { key: "applied", label: "Applied", match: (s) => s.startsWith("Applied") },
  { key: "interview", label: "Interview", match: (s) => s === "Interview" },
  { key: "rejected", label: "Rejected", match: (s) => s === "Rejected" },
];

const KIT_STATUSES = [
  "Awaiting Your Approval",
  "Needs Manual Apply",
  "Approved",
];
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// The address an email-apply job will be sent to, or null for web-form jobs.
function applyEmailOf(job) {
  const method = (job["Submission Method"] || "").trim().toLowerCase();
  if (method !== "email") return null;
  const match = (job.Notes || "").match(EMAIL_RE);
  return match ? match[0] : null;
}

function KitPanel({ job, kit, copied, onCopy }) {
  const cvKey = job["CV Version Used"] || "frontend_engineer";
  const summary = kit.summaries ? kit.summaries[cvKey] : null;
  const summaryKey = `${job._row}-summary`;

  if (!kit.profileReady) {
    return (
      <div className="kitPanel">
        <div className="kitTitle">Application setup incomplete</div>
        <p>
          The previous profile did not belong to you and has been removed.
          Job-specific CV tailoring is not set up yet, so no CV will be
          downloaded or emailed. You can still open the original application.
        </p>
        <div className="kitLinks">
          <a
            className="actionBtn"
            href={job.Link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open application
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="kitPanel">
      <div className="kitTitle">Your details</div>
      <div className="kitChips">
        {kit.profile.map((f) => {
          const key = `${job._row}-p-${f.label}`;
          return (
            <button
              key={key}
              className="chip"
              onClick={() => onCopy(f.value, key)}
            >
              {copied === key ? "Copied" : `Copy ${f.label}`}
            </button>
          );
        })}
      </div>

      <div className="kitTitle">Saved answers</div>
      {kit.answers.map((a) => {
        const key = `${job._row}-a-${a.label}`;
        const needsEdit = a.value.startsWith("EDIT ME");
        return (
          <div className="answerRow" key={key}>
            <div className={needsEdit ? "answerText needsEdit" : "answerText"}>
              <span className="answerLabel">{a.label}</span>
              <span>{a.value}</span>
            </div>
            <button className="actionBtn" onClick={() => onCopy(a.value, key)}>
              {copied === key ? "Copied" : "Copy"}
            </button>
          </div>
        );
      })}

      {summary && (
        <>
          <div className="kitTitle">
            Short summary ({CV_LABEL[cvKey] || "CV"})
          </div>
          <div className="answerRow">
            <div className="answerText">
              <span>{summary}</span>
            </div>
            <button
              className="actionBtn"
              onClick={() => onCopy(summary, summaryKey)}
            >
              {copied === summaryKey ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      <div className="kitLinks">
        <span className="location">Job-specific CV tailoring required</span>
        <a
          className="actionBtn"
          href={job.Link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open application
        </a>
      </div>
    </div>
  );
}

function ApplicationPackPanel({ job }) {
  const [pack, setPack] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/application-packs?row=${encodeURIComponent(job._row)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the application pack.");
        if (active) {
          setPack(data.pack || null);
          setJobDescription(data.pack?.jobDescription || "");
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [job._row]);

  async function generate() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/application-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: job._row, jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate the application pack.");
      setPack(data.pack);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!pack) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/application-packs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row: job._row,
          tailoredCv: pack.tailoredCv,
          pitch: pack.pitch,
          followUps: pack.followUps.map((followUp) => followUp.text),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your edits.");
      setPack(data.pack);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadCv() {
    if (!pack?.tailoredCv) return;
    const safeName = `${job.Company || "job"}-${job["Role Title"] || "cv"}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const blob = new Blob([pack.tailoredCv], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName || "application"}-cv-draft.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="applicationPackPanel" aria-label="Reviewable application pack">
      <div className="applicationPackIntro">
        <strong>Reviewable application pack</strong>
        <span>
          Local draft only. Your CV and job description are not sent to an AI
          provider, and nothing is sent to the employer.
        </span>
      </div>

      {loading ? (
        <p>Loading saved pack…</p>
      ) : !pack ? (
        <div className="packSection">
          <label className="packLabel" htmlFor={`job-description-${job._row}`}>
            Paste the complete job description
          </label>
          <textarea
            id={`job-description-${job._row}`}
            className="packTextarea"
            rows={10}
            maxLength={40000}
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="Include responsibilities, requirements, experience level, compensation, and application details when available."
          />
          <p className="packHint">
            The sheet stores the job link and title, not its full description.
            Paste the listing text so the fit check and drafts use the actual
            requirements.
          </p>
          <button
            className="actionBtn primary"
            disabled={busy || jobDescription.trim().length < 120}
            onClick={generate}
          >
            {busy ? "Building pack…" : "Build local draft"}
          </button>
        </div>
      ) : (
        <>
          <div className="packSection">
            <strong>Fit and risk check</strong>
            <p className="packFit">{pack.fit.label}</p>
            {pack.fit.matchedEvidence.length > 0 ? (
              <p>
                Evidence in both the job post and your CV:{" "}
                {pack.fit.matchedEvidence.join(", ")}.
              </p>
            ) : (
              <p>
                No exact overlap was found between the checked design terms in
                this job post and your source CV.
              </p>
            )}
            {pack.fit.evidence.length > 0 && (
              <ul className="packList">
                {pack.fit.evidence.map((item, index) => (
                  <li key={`${item.section}-${index}`}>
                    <span>{item.text}</span>
                    <small>Source CV · {item.section}</small>
                  </li>
                ))}
              </ul>
            )}
            {pack.fit.redFlags.length > 0 && (
              <>
                <strong className="packWarningTitle">Potential red flags</strong>
                <ul className="packList packRedFlags">
                  {pack.fit.redFlags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </>
            )}
            {(pack.fit.advisories.length > 0 ||
              pack.fit.profileGaps.length > 0) && (
              <>
                <strong className="packWarningTitle">Check before applying</strong>
                <ul className="packList">
                  {[...pack.fit.advisories, ...pack.fit.profileGaps].map(
                    (item) => (
                      <li key={item}>{item}</li>
                    ),
                  )}
                </ul>
              </>
            )}
          </div>

          <div className="packSection">
            <label className="packLabel" htmlFor={`tailored-cv-${job._row}`}>
              Tailored CV draft
            </label>
            <p className="packHint">
              This local draft only reorders your source CV and preserves its
              wording; it does not invent experience or tools. Review and
              format it before applying.
            </p>
            <textarea
              id={`tailored-cv-${job._row}`}
              className="packTextarea"
              rows={18}
              maxLength={30000}
              value={pack.tailoredCv}
              onChange={(event) =>
                setPack({ ...pack, tailoredCv: event.target.value })
              }
            />
            <button className="actionBtn" onClick={downloadCv}>
              Download CV draft (.txt)
            </button>
          </div>

          <div className="packSection">
            <label className="packLabel" htmlFor={`pitch-${job._row}`}>
              Outreach pitch
            </label>
            <textarea
              id={`pitch-${job._row}`}
              className="packTextarea"
              rows={8}
              maxLength={8000}
              value={pack.pitch}
              onChange={(event) => setPack({ ...pack, pitch: event.target.value })}
            />
          </div>

          {pack.followUps.map((followUp, index) => (
            <div className="packSection" key={followUp.timing}>
              <label
                className="packLabel"
                htmlFor={`follow-up-${job._row}-${index}`}
              >
                Follow-up {index + 1} · {followUp.timing}
              </label>
              <textarea
                id={`follow-up-${job._row}-${index}`}
                className="packTextarea"
                rows={6}
                maxLength={8000}
                value={followUp.text}
                onChange={(event) => {
                  const followUps = pack.followUps.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, text: event.target.value }
                      : item,
                  );
                  setPack({ ...pack, followUps });
                }}
              />
            </div>
          ))}

          <div className="packActions">
            <button
              className="actionBtn primary"
              disabled={busy}
              onClick={save}
            >
              {busy ? "Saving…" : "Save reviewed edits"}
            </button>
            {saved && <span className="packSaved">Saved on this server</span>}
          </div>
        </>
      )}

      {error && <div className="errorBanner packError">{error}</div>}
      <p className="packHint">
        CV, pitch, and follow-ups are drafts only. The app does not schedule or
        send applications or messages.
      </p>
    </section>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [busyRow, setBusyRow] = useState(null);
  const [kit, setKit] = useState(null);
  const [openKit, setOpenKit] = useState(null);
  const [openPack, setOpenPack] = useState(null);
  const [copied, setCopied] = useState(null);
  const [loadError, setLoadError] = useState("");

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
        setLoadError("");
      } else {
        setLoadError(data.error || "The server could not read the sheet.");
      }
    } catch (err) {
      console.error("Failed to load jobs", err);
      setLoadError("Could not reach the server.");
    }
    setLoading(false);
  }

  async function loadKit() {
    try {
      const res = await fetch("/api/kit");
      const data = await res.json();
      if (data.success) setKit(data.kit);
    } catch (err) {
      console.error("Failed to load apply kit", err);
    }
  }

  useEffect(() => {
    loadJobs();
    loadKit();
  }, []);

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch (err) {
      window.alert("Could not copy. Select the text and copy it by hand.");
    }
  }

  async function updateStatus(row, status) {
    setBusyRow(row);
    let data = null;
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row, status }),
      });
      data = await res.json();
      if (!res.ok) window.alert(data.error || "Could not update the job.");
      await loadJobs();
    } catch (err) {
      console.error("Failed to update status", err);
    }
    setBusyRow(null);
    return data;
  }

  // Approve sends the application right away for email jobs, so confirm first.
  async function approve(job) {
    const email = applyEmailOf(job);
    if (
      email &&
      !window.confirm(
        "Email applications are paused until your job-specific CV is ready. This will move the job to manual application without sending anything. Continue?",
      )
    ) {
      return;
    }
    const data = await updateStatus(job._row, "Approved");
    if (data?.needsManual) {
      window.alert(data.message);
      return;
    }
    if (email && data && data.sent === false && !data.needsManual) {
      window.alert(
        "The email could not be sent. The job stays Approved and the next run will retry. Check the email settings in .env.local.",
      );
    }
  }

  async function clearAll() {
    if (
      !window.confirm("Delete every job row from the sheet? The header stays.")
    )
      return;
    const res = await fetch("/api/clear", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || "Could not clear the sheet.");
      return;
    }
    await loadJobs();
  }

  const counts = useMemo(() => {
    const c = {};
    for (const tab of TABS) {
      c[tab.key] = jobs.filter((j) => tab.match(j.Status || "")).length;
    }
    return c;
  }, [jobs]);

  const hasUnverifiedScores = useMemo(
    () => jobs.some((job) => !job["Match Profile"]),
    [jobs],
  );

  const visible = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab) || TABS[0];
    return jobs
      .filter((j) => tab.match(j.Status || ""))
      .sort(
        (a, b) => Number(b["Match Score"] || 0) - Number(a["Match Score"] || 0),
      );
  }, [jobs, activeTab]);

  return (
    <div className="wrap">
      <header className="siteNav">
        <a className="brandLink" href="/" aria-label="Job Pipeline home">
          <span className="brandMark" aria-hidden="true">jp</span>
          <span className="wordmark">job pipeline</span>
          <span className="brandBadge">Nigeria</span>
        </a>
        <div className="headActions">
          <button className="ghostBtn refreshBtn" onClick={loadJobs}>
            <span aria-hidden="true">↻</span>
            Refresh
          </button>
          <button className="ghostBtn danger" onClick={clearAll}>
            Clear all
          </button>
        </div>
      </header>

      <section className="dashboardIntro">
        <div>
          <span className="introEyebrow">YOUR JOB SEARCH</span>
          <h1>Find your next role.</h1>
          <p>Design opportunities, gathered in one place.</p>
        </div>
        <span className="updatedNote">Refresh to check for updates</span>
      </section>
      <div className="statRow" aria-label="Application pipeline overview">
        <div className="stat statFeatured">
          <span className="statNumber">{counts.all || 0}</span>
          <span className="statLabel">All roles</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.awaiting || 0}</span>
          <span className="statLabel">To review</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.manual || 0}</span>
          <span className="statLabel">Ready to apply</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.applied || 0}</span>
          <span className="statLabel">Applied</span>
        </div>
        <div className="stat">
          <span className="statNumber">{counts.interview || 0}</span>
          <span className="statLabel">Interviews</span>
        </div>
      </div>

      {hasUnverifiedScores && (
        <div className="noticeBanner">
          Some existing rows were scored against the previous profile. Treat
          their scores and CV suggestions as unverified; new design matches use
          Abdul&rsquo;s design profile.
        </div>
      )}

      <div className="resultsHeader">
        <div>
          <span className="resultsEyebrow">DISCOVER</span>
          <h2>Roles for you</h2>
        </div>
        <span className="resultCount">
          {visible.length} {visible.length === 1 ? "role" : "roles"}
        </span>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="errorBanner">Could not load your jobs: {loadError}</div>
      )}

      {loading ? (
        <div className="loading">Loading jobs...</div>
      ) : loadError ? null : visible.length === 0 ? (
        <div className="empty">
          Nothing here yet. The next daily run will add new matches.
        </div>
      ) : (
        <div className="panel">
          {visible.map((job) => {
            const applyEmail = applyEmailOf(job);
            const links = linkedinLinks(job.Company);
            const kitOpen = openKit === job._row;
            const packOpen = openPack === job._row;
            const canBuildPack = job["CV Version Used"] === "custom_per_job";
            return (
              <div className="jobRow" key={job._row}>
                <div className="jobMain">
                  <div className="jobCardHeading">
                    <div className="jobIdentity">
                      <p className="jobTitle">
                        <a
                          href={job.Link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {job["Role Title"] || "Untitled role"}
                        </a>
                      </p>
                      <div className="jobCompany">
                        <span className="company">
                          {job.Company || "Unknown company"}
                        </span>
                        {job["Country/Remote"] && (
                          <span className="location">
                            {job["Country/Remote"]}
                          </span>
                        )}
                        {job["Employment Type"] &&
                          job["Employment Type"] !== "Not specified" && (
                            <span className="location">
                              {job["Employment Type"]}
                            </span>
                          )}
                      </div>
                    </div>
                    <span
                      className="statusPill"
                      style={{
                        color: STATUS_COLOR[job.Status] || "var(--status-none)",
                      }}
                    >
                      {job.Status}
                    </span>
                  </div>
                  {job["Match Score"] && (
                    <div className="jobMetaLine">
                      <span className="scoreTag">
                        {job["Match Profile"]
                          ? `Match ${job["Match Score"]}`
                          : `Unverified score ${job["Match Score"]}`}
                      </span>
                    </div>
                  )}
                  <details className="jobDetails">
                    <summary>Listing details and research</summary>
                    <div className="listingMeta">
                      {job.Source && <span>Source: {job.Source}</span>}
                      <span>
                        {job["Posted Date"]
                          ? `Posted ${job["Posted Date"]}`
                          : "Posting date unverified"}
                      </span>
                      {job["Missing Listing Details"] && (
                        <span>
                          Check listing details: {job["Missing Listing Details"]}
                        </span>
                      )}
                    </div>
                    {applyEmail && (
                      <div className="applyEmail">
                        Applies by email to {applyEmail}
                      </div>
                    )}
                    <div className="liLinks">
                      <a
                        href={links.company}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Company on LinkedIn
                      </a>
                      <a
                        href={links.recruiters}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Find recruiters
                      </a>
                      <a
                        href={links.engineers}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Find engineers
                      </a>
                    </div>
                  </details>
                  {kitOpen && kit && (
                    <KitPanel
                      job={job}
                      kit={kit}
                      copied={copied}
                      onCopy={copy}
                    />
                  )}
                  {packOpen && <ApplicationPackPanel job={job} />}
                </div>
                <div className="jobActions">
                  <a
                    className="actionBtn openRoleBtn"
                    href={job.Link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open role
                    <span aria-hidden="true">↗</span>
                  </a>
                  {job.Status === "Awaiting Your Approval" && (
                    <>
                      <button
                        className="actionBtn primary"
                        disabled={busyRow === job._row}
                        onClick={() => approve(job)}
                      >
                        Approve
                      </button>
                      <button
                        className="actionBtn"
                        disabled={busyRow === job._row}
                        onClick={() => updateStatus(job._row, "Rejected")}
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {job.Status === "Needs Manual Apply" && (
                    <button
                      className="actionBtn primary"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Applied")}
                    >
                      Mark Applied
                    </button>
                  )}
                  {(job.Status === "Applied" ||
                    job.Status === "Applied (Auto)") && (
                    <button
                      className="actionBtn"
                      disabled={busyRow === job._row}
                      onClick={() => updateStatus(job._row, "Interview")}
                    >
                      Got Interview
                    </button>
                  )}
                  {KIT_STATUSES.includes(job.Status) && (
                    <button
                      className="actionBtn"
                      onClick={() => {
                        if (canBuildPack) {
                          setOpenPack(packOpen ? null : job._row);
                          setOpenKit(null);
                        } else {
                          setOpenKit(kitOpen ? null : job._row);
                          setOpenPack(null);
                        }
                      }}
                    >
                      {canBuildPack
                        ? packOpen
                          ? "Hide pack"
                          : "Application pack"
                        : kitOpen
                          ? "Hide kit"
                          : "Apply kit"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
