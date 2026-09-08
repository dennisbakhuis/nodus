import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTopic,
  deleteTopic,
  listGroupsTree,
  listTopics,
  updateTopic,
} from "../api/topics";
import { GroupProfileModal } from "./GroupProfileModal";
import { useConfirm } from "../shared/ConfirmDialog";
import { LoadingState } from "../shared/LoadingState";
import { StatusBanner } from "../shared/StatusBanner";
import type { GroupTreeNode, TopicRead } from "./types";
import styles from "./ManagePage.module.css";

type FlatNode = { node: GroupTreeNode; depth: number };

function flatten(nodes: GroupTreeNode[], depth = 0): FlatNode[] {
  const out: FlatNode[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children && node.children.length > 0) {
      out.push(...flatten(node.children, depth + 1));
    }
  }
  return out;
}

/** Collect a node's own id plus all descendant ids (for reparent exclusion). */
function selfAndDescendants(node: GroupTreeNode): Set<string> {
  const ids = new Set<string>([node.topic_id]);
  const walk = (n: GroupTreeNode) => {
    for (const c of n.children ?? []) {
      ids.add(c.topic_id);
      walk(c);
    }
  };
  walk(node);
  return ids;
}

export function GroupsPage() {
  const confirm = useConfirm();
  const [tree, setTree] = useState<GroupTreeNode[]>([]);
  const [topics, setTopics] = useState<TopicRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [existingTopic, setExistingTopic] = useState("");
  const [existingParent, setExistingParent] = useState("");
  const [profileTopicId, setProfileTopicId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, tops] = await Promise.all([
        listGroupsTree(),
        listTopics({ limit: 200 }),
      ]);
      setTree(t);
      setTopics(tops);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => flatten(tree), [tree]);
  const profileTopic = useMemo(
    () => topics.find((t) => t.id === profileTopicId) ?? null,
    [topics, profileTopicId],
  );
  const topicsByName = useMemo(
    () =>
      [...topics].sort((a, b) =>
        a.canonical_name.localeCompare(b.canonical_name),
      ),
    [topics],
  );

  async function handleRename(id: string) {
    const value = renameValue.trim();
    if (!value) {
      setRenamingId(null);
      return;
    }
    try {
      await updateTopic(id, { canonical_name: value });
      setRenamingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    }
  }

  async function reparent(topicId: string, parentId: string) {
    try {
      if (parentId === "") {
        await updateTopic(topicId, { clear_parent: true });
      } else {
        await updateTopic(topicId, { parent_topic_id: parentId });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    }
  }

  async function handleDelete(node: GroupTreeNode) {
    const ok = await confirm({
      title: "Delete group",
      body: `Delete "${node.canonical_name}"? Its subgroups will move up to its parent. Topics that are on the radar cannot be deleted here — archive them instead.`,
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTopic(node.topic_id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await createTopic({
        canonical_name: name,
        force_create: true,
        parent_topic_id: newParent || null,
      });
      if (!res.topic) {
        setError("Could not create group (name may already exist).");
        return;
      }
      setNewName("");
      setNewParent("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function handleAddExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!existingTopic || !existingParent) return;
    await reparent(existingTopic, existingParent);
    setExistingTopic("");
    setExistingParent("");
  }

  if (loading) return <LoadingState>Loading groups…</LoadingState>;

  return (
    <div className={styles.subPage}>
      <div className={styles.header}>
        <h1>Groups</h1>
        <p>
          Organise technologies into a multi-level taxonomy (e.g. Generative AI
          ▸ Agentic AI). Groups are a metadata layer distinct from segments —
          they never change a dot&apos;s radar position; selecting a group in
          the sidebar highlights its members. A group can be a pure label or an
          on-radar technology that also acts as a parent.
        </p>
      </div>

      <StatusBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Add a group</h2>
        <form
          onSubmit={(e) => void handleAddGroup(e)}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "var(--space-3)",
            alignItems: "end",
            marginBottom: "var(--space-4)",
          }}
        >
          <label>
            New group name
            <input
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Agentic AI"
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label>
            Parent (optional)
            <select
              className={styles.input}
              value={newParent}
              onChange={(e) => setNewParent(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">— Top level —</option>
              {topicsByName.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.canonical_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={styles.btnPrimary}>
            Add group
          </button>
        </form>

        <h2 className={styles.sectionTitle}>
          Add an existing technology to a group
        </h2>
        <form
          onSubmit={(e) => void handleAddExisting(e)}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "var(--space-3)",
            alignItems: "end",
          }}
        >
          <label>
            Technology
            <select
              className={styles.input}
              value={existingTopic}
              onChange={(e) => setExistingTopic(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">— Select —</option>
              {topicsByName.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.canonical_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Parent group
            <select
              className={styles.input}
              value={existingParent}
              onChange={(e) => setExistingParent(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">— Select —</option>
              {topicsByName
                .filter((t) => t.id !== existingTopic)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.canonical_name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={!existingTopic || !existingParent}
          >
            Assign
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Hierarchy</h2>
        {rows.length === 0 ? (
          <p style={{ color: "var(--color-muted-text)" }}>
            No groups yet. Create one above, or assign a parent to a technology.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Group</th>
                <th style={{ width: 240 }}>Move under</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => {
                const isRenaming = renamingId === node.topic_id;
                const excluded = selfAndDescendants(node);
                return (
                  <tr key={node.topic_id}>
                    <td style={{ paddingLeft: `calc(${depth} * 20px + 8px)` }}>
                      {isRenaming ? (
                        <input
                          className={styles.input}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void handleRename(node.topic_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void handleRename(node.topic_id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          style={{ width: "100%" }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(node.topic_id);
                            setRenameValue(node.canonical_name);
                          }}
                          title="Click to rename"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            color: "var(--color-dark-text)",
                            fontSize: "var(--font-size-body)",
                            cursor: "text",
                            textAlign: "left",
                            fontWeight: "var(--font-weight-bold)",
                          }}
                        >
                          {node.canonical_name}
                          {node.has_profile && (
                            <span
                              title="Has a group profile"
                              aria-label="Has a group profile"
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                color: "var(--color-muted-text)",
                              }}
                            >
                              ✎
                            </span>
                          )}
                          {node.on_radar && (
                            <span
                              title="On radar"
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                color: "var(--color-bright-blue)",
                              }}
                            >
                              ● on radar
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td>
                      <select
                        className={styles.input}
                        value="__placeholder__"
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__placeholder__") return;
                          void reparent(
                            node.topic_id,
                            v === "__top__" ? "" : v,
                          );
                        }}
                        style={{ width: "100%" }}
                      >
                        <option value="__placeholder__" disabled>
                          Move under…
                        </option>
                        <option value="__top__">— Top level —</option>
                        {topicsByName
                          .filter((t) => !excluded.has(t.id))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.canonical_name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td style={{ display: "flex", gap: "var(--space-2)" }}>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => setProfileTopicId(node.topic_id)}
                        title="Describe this family, and say who looks after it"
                      >
                        Profile
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => void handleDelete(node)}
                        title="Delete group (label topics only)"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {profileTopic && (
        <GroupProfileModal
          topic={profileTopic}
          onClose={() => setProfileTopicId(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
