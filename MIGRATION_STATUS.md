# Innosite migration status

This branch is a source snapshot from Lovable commit `8e5cfe922e88fbb92fe195ab43bcf4b8a692bb49`.

- `supabase/config.toml` targets the new Innosite project `ybmrqcymhxqvjektejeo`.
- No SQL migrations or business data have been applied to the new project.
- The historical migration set includes demo data, account-specific identifiers, and legacy integrations. It must be reviewed before deployment.
- Legacy webhook schedules and integration settings are disabled in this snapshot. Configure new endpoints and secrets only after the new application is deployed.
- `.env`, binary assets, and generated files are not included.
- This is not a verified parity claim or a complete runnable copy.
