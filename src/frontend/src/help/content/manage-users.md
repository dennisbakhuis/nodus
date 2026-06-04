# Users

Application accounts that can sign in. Each user has one role.

## Roles

| Role       | Can do                                                    |
| ---------- | --------------------------------------------------------- |
| **Reader** | See the full radar and topic detail.                      |
| **Writer** | Reader + add/edit technologies, cycles, groups, people.   |
| **Admin**  | Writer + manage users, segments, visibility, and backups. |

Anonymous visitors are "public readers" and see only public fields — that role
isn't assigned to accounts.

## Adding a user

Click **Add user** and set a **username**, **role**, **first/last name**, and an
**initial password** you type. Leave **Force password change on first login**
ticked so they choose their own. If the name matches an existing person, you're
offered to **link** that profile or **create a new** one.

## Managing users

- **Change role** — the dropdown in each row.
- **Edit** — username and name.
- **Reset password** — type a new one; the user must change it next sign-in.
- **Deactivate / Reactivate** — block sign-in without deleting history.
- **Delete** — permanently removes the account, its sessions, and API keys. You
  choose whether to keep or also delete the linked person, and must unlink them
  from any technologies first.

Row **flags** mark **Entra** (single sign-on), **MFA** enabled, or a pending
password reset.

## Single sign-on (Entra)

When Entra is enabled, those users are created and role-synced automatically from
their group membership and are read-only here; the role → group mapping is shown
for reference.
