/**
 * Profile editor for a group.
 *
 * A group is not a technology, so this is deliberately not the technology
 * editor with fields removed. There is no ring, no TRL, no assessment — a
 * family has no maturity of its own. What a family does have is a remit
 * (what it covers), a boundary (what belongs in it, and what does not), and
 * someone who looks after it. Those three are the whole form.
 *
 * The two text fields live on the Topic as `group_description` / `group_scope`
 * rather than on a factsheet, because a *technology group* has both a
 * factsheet about the technology and a remit as a parent, and conflating them
 * would lose one of the two.
 */

import { useCallback, useEffect, useState } from "react";
import {
  addPersonToTopic,
  listTopicPersons,
  removePersonFromTopic,
} from "../api/persons";
import { updateTopic } from "../api/topics";
import { Modal } from "../shared/Modal";
import { PersonPicker } from "../shared/PersonPicker";
import { StatusBanner } from "../shared/StatusBanner";
import {
  PERSON_LINK_ROLE_DISPLAY,
  type PersonLinkRole,
  type TopicPersonLinkManagementRead,
  type TopicRead,
} from "./types";
import styles from "./ManagePage.module.css";

/**
 * The roles that mean something for a family.
 *
 * `Author` and `ProjectLead` belong to a piece of work, not to a taxonomy
 * branch, so they are left out rather than offered and ignored.
 */
const GROUP_PERSON_ROLES: PersonLinkRole[] = [
  "Owner",
  "SubjectMatterExpert",
  "Contact",
];

type Props = {
  topic: TopicRead;
  onClose: () => void;
  /** Called after a save so the page can pick up the new name/flags. */
  onSaved: () => void;
};

export function GroupProfileModal({ topic, onClose, onSaved }: Props) {
  const [description, setDescription] = useState(topic.group_description ?? "");
  const [scope, setScope] = useState(topic.group_scope ?? "");
  const [priv, setPriv] = useState(topic.not_for_external_publication);
  const [links, setLinks] = useState<TopicPersonLinkManagementRead[]>([]);
  const [linkRole, setLinkRole] = useState<PersonLinkRole>("Owner");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeople = useCallback(() => {
    listTopicPersons(topic.id)
      .then(setLinks)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load people"),
      );
  }, [topic.id]);

  useEffect(loadPeople, [loadPeople]);

  const dirty =
    description !== (topic.group_description ?? "") ||
    scope !== (topic.group_scope ?? "") ||
    priv !== topic.not_for_external_publication;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateTopic(topic.id, {
        group_description: description,
        group_scope: scope,
        not_for_external_publication: priv,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // People are saved as they are added or removed rather than on Save: they
  // are their own records, and a half-filled form is no reason to lose one.
  async function handleAdd(personId: string) {
    setPickerOpen(false);
    try {
      await addPersonToTopic(topic.id, {
        person_id: personId,
        link_role: linkRole,
      });
      loadPeople();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that person");
    }
  }

  async function handleRemove(linkId: string) {
    try {
      await removePersonFromTopic(topic.id, linkId);
      loadPeople();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that person");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Group profile — ${topic.canonical_name}`}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          minWidth: 0,
          width: "100%",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-sm)",
            color: "var(--color-muted-text)",
          }}
        >
          This describes the <strong>family</strong>, not a technology
          {topic.technology_id
            ? " — the technology's own factsheet is edited from its detail page."
            : "."}
        </p>

        <StatusBanner
          variant="error"
          message={error}
          onDismiss={() => setError(null)}
        />

        <Field
          label="What this family covers"
          hint="A sentence or two a newcomer could read to know what they are looking at."
        >
          <textarea
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="e.g. Techniques that generate new content — text, image, audio, code."
            style={{ width: "100%", resize: "vertical", font: "inherit" }}
          />
        </Field>

        <Field
          label="What belongs here"
          hint="The boundary. Saying what does not belong is usually the useful half."
        >
          <textarea
            className={styles.input}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={3}
            placeholder="e.g. Model families and the tooling around them. Not the applications built on top — those sit under their own business area."
            style={{ width: "100%", resize: "vertical", font: "inherit" }}
          />
        </Field>

        <Field label="People" hint="Who to ask about this family.">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-1)",
              alignItems: "center",
            }}
          >
            {links.length === 0 && !pickerOpen && (
              <span
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-muted-text)",
                  fontStyle: "italic",
                }}
              >
                Nobody linked yet.
              </span>
            )}
            {links.map((link) => (
              <span key={link.id} className={styles.chip}>
                {link.person.full_name}
                <span
                  style={{
                    marginLeft: 6,
                    color: "var(--color-muted-text)",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  {PERSON_LINK_ROLE_DISPLAY[link.link_role as PersonLinkRole] ??
                    link.link_role}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRemove(link.id)}
                  aria-label={`Remove ${link.person.full_name}`}
                  style={{
                    marginLeft: 6,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: "var(--color-muted-text)",
                    padding: 0,
                    font: "inherit",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {!pickerOpen && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setPickerOpen(true)}
              >
                + Add person
              </button>
            )}
          </div>

          {pickerOpen && (
            <div
              style={{
                marginTop: "var(--space-2)",
                padding: "var(--space-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-page-background)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              <label
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-muted-text)",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                Role
                <select
                  className={styles.input}
                  value={linkRole}
                  onChange={(e) =>
                    setLinkRole(e.target.value as PersonLinkRole)
                  }
                >
                  {GROUP_PERSON_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {PERSON_LINK_ROLE_DISPLAY[r]}
                    </option>
                  ))}
                </select>
              </label>
              <PersonPicker
                onSelect={(person) => void handleAdd(person.id)}
                onCancel={() => setPickerOpen(false)}
              />
            </div>
          )}
        </Field>

        <Field
          label="Visibility"
          hint="A private group is dropped from the public view; its public children are lifted to the nearest public ancestor rather than hidden with it."
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              fontSize: "var(--font-size-body)",
            }}
          >
            <input
              type="checkbox"
              checked={priv}
              onChange={(e) => setPriv(e.target.checked)}
            />
            Not for external publication
          </label>
        </Field>

        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-bold)",
          color: "var(--color-dark-text)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--font-size-xs)",
          color: "var(--color-muted-text)",
        }}
      >
        {hint}
      </span>
      {children}
    </div>
  );
}
