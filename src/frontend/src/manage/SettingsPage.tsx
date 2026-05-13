import { useEffect, useRef, useState } from "react";
import { getSetting, upsertSetting } from "./api";
import { Field } from "../shared/Field";
import { LoadingState } from "../shared/LoadingState";
import { StatusBanner } from "../shared/StatusBanner";
import styles from "./SettingsPage.module.css";

const RADAR_LOGO_KEY = "radar.center_logo_url";

const ORG_NAME_KEY = "org.name";
const ORG_SLUG_KEY = "org.slug";
const ORG_URL_KEY = "org.url";
const ORG_CONTACT_EMAIL_KEY = "org.contact_email";
const ORG_ADDRESS_KEY = "org.address";

const DEMO_ENABLED_KEY = "demo.enabled";
const DEMO_SECONDS_PER_STEP_KEY = "demo.seconds_per_step";
const DEMO_SECONDS_DEFAULT = 10;
const DEMO_SECONDS_MIN = 1;
const DEMO_SECONDS_MAX = 60;

function parseDemoSeconds(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEMO_SECONDS_DEFAULT;
  return Math.min(DEMO_SECONDS_MAX, Math.max(DEMO_SECONDS_MIN, n));
}

const NODUS_LOGO_SENTINEL = "nodus";

// Custom logos are stored inline in the setting value as data: URLs so we
// don't depend on the hero-image upload pipeline (which centre-crops to
// 1200×630). 512 KB is comfortably above any reasonable logo size; the
// base64 expansion (~33%) still leaves headroom in the TEXT column.
const LOGO_ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];
const LOGO_MAX_BYTES = 512 * 1024;

type LogoMode = "nodus" | "custom";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export function SettingsPage() {
  const [logoMode, setLogoMode] = useState<LogoMode>("nodus");
  const [customLogo, setCustomLogo] = useState<string>("");
  const [savedUrl, setSavedUrl] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [savedOrgName, setSavedOrgName] = useState<string>("");
  const [orgSlug, setOrgSlug] = useState<string>("");
  const [savedOrgSlug, setSavedOrgSlug] = useState<string>("");
  const [orgUrl, setOrgUrl] = useState<string>("");
  const [savedOrgUrl, setSavedOrgUrl] = useState<string>("");
  const [orgContactEmail, setOrgContactEmail] = useState<string>("");
  const [savedOrgContactEmail, setSavedOrgContactEmail] = useState<string>("");
  const [orgAddress, setOrgAddress] = useState<string>("");
  const [savedOrgAddress, setSavedOrgAddress] = useState<string>("");
  const [demoEnabled, setDemoEnabled] = useState<boolean>(false);
  const [savedDemoEnabled, setSavedDemoEnabled] = useState<boolean>(false);
  const [demoSeconds, setDemoSeconds] = useState<number>(DEMO_SECONDS_DEFAULT);
  const [savedDemoSeconds, setSavedDemoSeconds] =
    useState<number>(DEMO_SECONDS_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingDemo, setSavingDemo] = useState(false);
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  const [orgStatus, setOrgStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);
  const [demoStatus, setDemoStatus] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSetting(RADAR_LOGO_KEY).catch(() => ({
        key: RADAR_LOGO_KEY,
        value: "",
      })),
      getSetting(ORG_NAME_KEY).catch(() => ({ key: ORG_NAME_KEY, value: "" })),
      getSetting(ORG_SLUG_KEY).catch(() => ({ key: ORG_SLUG_KEY, value: "" })),
      getSetting(ORG_URL_KEY).catch(() => ({ key: ORG_URL_KEY, value: "" })),
      getSetting(ORG_CONTACT_EMAIL_KEY).catch(() => ({
        key: ORG_CONTACT_EMAIL_KEY,
        value: "",
      })),
      getSetting(ORG_ADDRESS_KEY).catch(() => ({
        key: ORG_ADDRESS_KEY,
        value: "",
      })),
      getSetting(DEMO_ENABLED_KEY).catch(() => ({
        key: DEMO_ENABLED_KEY,
        value: "false",
      })),
      getSetting(DEMO_SECONDS_PER_STEP_KEY).catch(() => ({
        key: DEMO_SECONDS_PER_STEP_KEY,
        value: String(DEMO_SECONDS_DEFAULT),
      })),
    ])
      .then(([logo, name, slug, url, email, address, demoOn, demoSec]) => {
        if (cancelled) return;
        if (logo.value === NODUS_LOGO_SENTINEL) {
          setLogoMode("nodus");
          setCustomLogo("");
        } else {
          // Empty or legacy URL/data: value → Custom mode with the existing
          // value carried over (so the preview shows what's currently saved).
          setLogoMode("custom");
          setCustomLogo(logo.value);
        }
        setSavedUrl(logo.value);
        setOrgName(name.value);
        setSavedOrgName(name.value);
        setOrgSlug(slug.value);
        setSavedOrgSlug(slug.value);
        setOrgUrl(url.value);
        setSavedOrgUrl(url.value);
        setOrgContactEmail(email.value);
        setSavedOrgContactEmail(email.value);
        setOrgAddress(address.value);
        setSavedOrgAddress(address.value);
        const enabled = demoOn.value === "true";
        setDemoEnabled(enabled);
        setSavedDemoEnabled(enabled);
        const sec = parseDemoSeconds(demoSec.value);
        setDemoSeconds(sec);
        setSavedDemoSeconds(sec);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus({
          kind: "err",
          msg: e instanceof Error ? e.message : "Failed to load",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const valueToSave = logoMode === "nodus" ? NODUS_LOGO_SENTINEL : customLogo;
  const dirty = valueToSave !== savedUrl;

  async function handleLogoFile(file: File) {
    setFileError(null);
    if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
      setFileError(
        `Unsupported file type: ${file.type || "unknown"}. Accepted: PNG, JPEG, WebP, SVG.`,
      );
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setFileError(
        `File too large: ${(file.size / 1024).toFixed(0)} KB. Max ${
          LOGO_MAX_BYTES / 1024
        } KB.`,
      );
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCustomLogo(dataUrl);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Failed to read file");
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const result = await upsertSetting(RADAR_LOGO_KEY, valueToSave);
      setSavedUrl(result.value);
      if (result.value === NODUS_LOGO_SENTINEL) {
        setLogoMode("nodus");
        setCustomLogo("");
      } else {
        setLogoMode("custom");
        setCustomLogo(result.value);
      }
      setStatus({ kind: "ok", msg: "Saved." });
    } catch (e) {
      setStatus({
        kind: "err",
        msg: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  const orgDirty =
    orgName !== savedOrgName ||
    orgSlug !== savedOrgSlug ||
    orgUrl !== savedOrgUrl ||
    orgContactEmail !== savedOrgContactEmail ||
    orgAddress !== savedOrgAddress;

  async function handleSaveOrg() {
    setSavingOrg(true);
    setOrgStatus(null);
    try {
      const [nameRow, slugRow, urlRow, emailRow, addressRow] =
        await Promise.all([
          upsertSetting(ORG_NAME_KEY, orgName.trim()),
          upsertSetting(ORG_SLUG_KEY, orgSlug.trim()),
          upsertSetting(ORG_URL_KEY, orgUrl.trim()),
          upsertSetting(ORG_CONTACT_EMAIL_KEY, orgContactEmail.trim()),
          upsertSetting(ORG_ADDRESS_KEY, orgAddress),
        ]);
      setOrgName(nameRow.value);
      setSavedOrgName(nameRow.value);
      setOrgSlug(slugRow.value);
      setSavedOrgSlug(slugRow.value);
      setOrgUrl(urlRow.value);
      setSavedOrgUrl(urlRow.value);
      setOrgContactEmail(emailRow.value);
      setSavedOrgContactEmail(emailRow.value);
      setOrgAddress(addressRow.value);
      setSavedOrgAddress(addressRow.value);
      setOrgStatus({ kind: "ok", msg: "Saved." });
    } catch (e) {
      setOrgStatus({
        kind: "err",
        msg: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSavingOrg(false);
    }
  }

  const demoDirty =
    demoEnabled !== savedDemoEnabled || demoSeconds !== savedDemoSeconds;

  async function handleSaveDemo() {
    setSavingDemo(true);
    setDemoStatus(null);
    try {
      const clamped = parseDemoSeconds(String(demoSeconds));
      const [enabledRow, secRow] = await Promise.all([
        upsertSetting(DEMO_ENABLED_KEY, demoEnabled ? "true" : "false"),
        upsertSetting(DEMO_SECONDS_PER_STEP_KEY, String(clamped)),
      ]);
      const enabled = enabledRow.value === "true";
      setDemoEnabled(enabled);
      setSavedDemoEnabled(enabled);
      const sec = parseDemoSeconds(secRow.value);
      setDemoSeconds(sec);
      setSavedDemoSeconds(sec);
      setDemoStatus({ kind: "ok", msg: "Saved." });
    } catch (e) {
      setDemoStatus({
        kind: "err",
        msg: e instanceof Error ? e.message : "Save failed",
      });
    } finally {
      setSavingDemo(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <LoadingState>Loading settings…</LoadingState>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Settings</h1>
        <p>Global configuration for the radar.</p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Organization details</h2>
        <p className={styles.sectionDesc}>
          Identity of this radar's owning organization. Used as default values
          for peer-reference exports and shown on other surfaces (e.g. exports,
          shared payloads) where an authoritative organization identity is
          needed.
        </p>

        <div className={styles.field}>
          <Field label="Organization name" helper="Display name, e.g. Acme Co.">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className={styles.input}
                value={orgName}
                placeholder="e.g. Acme Co"
                onChange={(e) => setOrgName(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className={styles.field}>
          <Field
            label="Slug"
            helper="Short, URL-safe identifier, e.g. acme-co."
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className={styles.input}
                value={orgSlug}
                placeholder="e.g. acme-co"
                onChange={(e) => setOrgSlug(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className={styles.field}>
          <Field label="Website" helper="Public organization URL.">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className={styles.input}
                type="url"
                value={orgUrl}
                placeholder="https://example.org/"
                onChange={(e) => setOrgUrl(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className={styles.field}>
          <Field
            label="Contact email"
            helper="Inbox other parties can reach about this radar."
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className={styles.input}
                type="email"
                value={orgContactEmail}
                placeholder="scouting@example.org"
                onChange={(e) => setOrgContactEmail(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className={styles.field}>
          <Field
            label="Address"
            helper="Postal address (optional, multi-line)."
          >
            {({ id, describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                className={styles.textarea}
                value={orgAddress}
                rows={3}
                placeholder="Street, city, country"
                onChange={(e) => setOrgAddress(e.target.value)}
              />
            )}
          </Field>
        </div>

        <StatusBanner
          variant={orgStatus?.kind === "ok" ? "success" : "error"}
          message={orgStatus ? orgStatus.msg : null}
          onDismiss={() => setOrgStatus(null)}
        />
        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleSaveOrg}
            disabled={savingOrg || !orgDirty}
          >
            {savingOrg ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Radar center logo</h2>
        <p className={styles.sectionDesc}>
          Image shown in the empty space at the bottom-center of the radar
          half-circle. <em>Nodus</em> uses the bundled mark + wordmark and
          suppresses the corner watermark on exports (otherwise the logo would
          appear twice). <em>Custom</em> lets you upload your own image.
        </p>

        <div
          className={styles.field}
          role="radiogroup"
          aria-label="Center logo source"
        >
          <span className={styles.label}>Logo</span>
          <div className={styles.radioGroup}>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="logo-mode"
                value="nodus"
                checked={logoMode === "nodus"}
                onChange={() => {
                  setLogoMode("nodus");
                  setFileError(null);
                }}
              />
              <span>Nodus logo + text (default)</span>
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="logo-mode"
                value="custom"
                checked={logoMode === "custom"}
                onChange={() => setLogoMode("custom")}
              />
              <span>Custom</span>
            </label>
          </div>
        </div>

        {logoMode === "custom" && (
          <div className={styles.field}>
            <span className={styles.label}>Upload image</span>
            <div className={styles.uploadRow}>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                {customLogo ? "Replace image…" : "Choose image…"}
              </button>
              {customLogo && (
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => {
                    setCustomLogo("");
                    setFileError(null);
                  }}
                >
                  Remove
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={LOGO_ACCEPTED_TYPES.join(",")}
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clear the input so re-selecting the same file fires
                  // onChange again.
                  e.target.value = "";
                  if (file) void handleLogoFile(file);
                }}
                aria-label="Custom logo file"
              />
            </div>
            <p className={styles.uploadHint}>
              PNG, JPEG, WebP, or SVG — max {LOGO_MAX_BYTES / 1024} KB.
            </p>
            {fileError && <p className={styles.uploadError}>{fileError}</p>}
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>Preview</span>
          <div className={styles.previewBox}>
            {logoMode === "nodus" ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <img
                  src="/nodus_mark.svg"
                  alt=""
                  style={{ width: 32, height: 32 }}
                />
                <span
                  style={{
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#161616",
                  }}
                >
                  Nodus
                </span>
              </div>
            ) : customLogo ? (
              <img
                src={customLogo}
                alt="Custom logo preview"
                className={styles.previewImg}
              />
            ) : (
              <span className={styles.previewEmpty}>
                No custom image yet — choose a file above.
              </span>
            )}
          </div>
        </div>

        <StatusBanner
          variant={status?.kind === "ok" ? "success" : "error"}
          message={status ? status.msg : null}
          onDismiss={() => setStatus(null)}
        />
        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Presentation mode</h2>
        <p className={styles.sectionDesc}>
          Self-running tour of the radar — a simulated cursor visits dots and
          labels at random, opens their detail panels, and occasionally expands
          the full detail view. Useful for demos and unattended displays. When
          enabled, a ▶ button appears in the top-right of the radar. Any real
          mouse or keyboard activity stops the tour.
        </p>

        <div className={styles.field}>
          <Field
            label="Enable presentation mode"
            helper="Shows the ▶ button on the radar so anyone can start the tour."
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="checkbox"
                checked={demoEnabled}
                onChange={(e) => setDemoEnabled(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
            )}
          </Field>
        </div>

        <div className={styles.field}>
          <Field
            label="Seconds per step"
            helper={`How long each detail panel stays open before moving on. ${DEMO_SECONDS_MIN}–${DEMO_SECONDS_MAX} seconds.`}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className={styles.input}
                type="number"
                min={DEMO_SECONDS_MIN}
                max={DEMO_SECONDS_MAX}
                step={1}
                value={demoSeconds}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setDemoSeconds(
                    Number.isFinite(parsed) ? parsed : DEMO_SECONDS_DEFAULT,
                  );
                }}
                onBlur={() =>
                  setDemoSeconds((s) => parseDemoSeconds(String(s)))
                }
              />
            )}
          </Field>
        </div>

        <StatusBanner
          variant={demoStatus?.kind === "ok" ? "success" : "error"}
          message={demoStatus ? demoStatus.msg : null}
          onDismiss={() => setDemoStatus(null)}
        />
        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleSaveDemo}
            disabled={savingDemo || !demoDirty}
          >
            {savingDemo ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}
