# Application roles and owner bootstrap

TechVera stores application access in `users.app_role`: `owner`, `admin`, `reviewer`, or `user`. The forward-only migration `012_admin_rbac.sql` defaults existing accounts to `user`, then preserves enabled human reviewer accounts that already have a linked `ingestion_reviewers.user_id`. It never chooses an owner automatically. Reviewer identities are disabled on access removal and retained so their prior review history remains attributable.

## Initial owner

After deploying migration 012, an operator who has verified the target account should run the one-time bootstrap command from `backend/`:

```sh
npm run build
npm run admin:bootstrap-owner -- --email account@example.com --confirm-email account@example.com --apply
```

The account must already exist and must still have the `user` role. The confirmation value must match the email. The operation is serialized, permits only one owner, and writes an append-only role audit entry. The command requires an explicit `--apply`; it prints the assigned address and role only. Do not run it against the configured production database during local testing.

## Ongoing administration

The authenticated API exposes `GET /api/admin/me`, `GET /api/admin/team`, `PATCH /api/admin/team/:userId/role`, and owner-only `POST /api/admin/owner/transfer`. Owners can assign `admin`, `reviewer`, or `user`; admins can assign or remove reviewer access only. Ownership can move only through the explicit transfer endpoint, which makes the former owner an admin. Every effective role change and both sides of an ownership transfer are recorded in `user_role_audit`; audit rows are immutable.

`/admin/team` is the protected team access page. Server checks remain authoritative even when a role-specific control is absent from the page. Interview and session endpoints continue to use their existing per-user ownership checks.
