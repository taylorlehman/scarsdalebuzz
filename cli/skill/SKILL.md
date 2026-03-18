---
name: sbadmin
description: Use the Scarsdale Buzz admin CLI safely and deterministically.
version: 1.0.0
entrypoint: cli/bin/sbadmin.js
requires:
  - node>=18
  - GOOGLE_APPLICATION_CREDENTIALS
recommended:
  - jq
output:
  mode: json_preferred
  exit_codes:
    "0": success
    "1": user_error
    "2": auth_or_config_error
---

# Skill: sbadmin (Scarsdale Buzz Admin CLI)

This skill enables an agent (Claude coworker/OpenClaw-style) to safely install and operate `sbadmin` for all admin actions supported by the Scarsdale Buzz admin dashboard.

## High-level contract

- **Preferred execution mode (agent)**: always pass `--json` and parse stdout as JSON.
- **Exit codes**:
  - **0**: success
  - **1**: user error (bad args, not found)
  - **2**: auth/config error (credentials/project/permissions)
- **Non-interactive**:
  - destructive actions must include `--yes` **only after** verifying the target exists.

## Preflight (must run once per environment)

### A. Locate repo + install

Assume the Scarsdale Buzz repo exists at `$REPO_ROOT`.

Preferred install:

```bash
cd "$REPO_ROOT" && chmod +x cli/scripts/install.sh && ./cli/scripts/install.sh
```

Fallback install:

```bash
cd "$REPO_ROOT/cli" && npm install
```

### B. Verify CLI is callable

Repo-local run:

```bash
cd "$REPO_ROOT/cli" && node bin/sbadmin.js --help
```

Global run (only if installed with `npm install -g .`):

```bash
sbadmin --help
```

## Authentication (required)

This skill uses **Firebase Admin SDK** credentials.

### Required environment variable

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

### Recommended (reduce mis-targeting)

Set the project explicitly from the JSON:

```bash
export GCLOUD_PROJECT="$(jq -r .project_id "$GOOGLE_APPLICATION_CREDENTIALS")"
```

### Credential validation (agent should run)

```bash
# 1) file exists
[ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]

# 2) JSON has required fields
jq -e '.project_id and .client_email' "$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null

# 3) project env matches JSON (optional but recommended)
PID_JSON="$(jq -r .project_id "$GOOGLE_APPLICATION_CREDENTIALS")"
[ -z "$GCLOUD_PROJECT" ] || [ "$GCLOUD_PROJECT" = "$PID_JSON" ]
```

### Connection check

```bash
sbadmin auth status --json
```

If you see permission errors (e.g. `PERMISSION_DENIED`), the service account lacks roles for that project. Minimal roles typically needed:
- **Cloud Datastore User** (Firestore)
- **Firebase Authentication Admin** (user/admin operations)

## Safety rails (mandatory)

### Read-before-write

For any write action, do a read/list first:

- Example: before deleting a service, run `services get`.
- Example: before approving a suggestion, run `suggestions list` and ensure the ID exists.

### Confirmations

- Use `--yes` only after the target has been verified.
- Use `--json` for the real action so output is parseable.

### Logging

For each action, log:
- timestamp
- command
- target identifiers
- stdout JSON
- exit code

## Invocation templates (agent mode)

**Preferred**: repo-local execution to avoid PATH/global drift.

```bash
cd "$REPO_ROOT/cli" && node bin/sbadmin.js <command> <subcommand> [args...] --json
```

If `sbadmin` is globally installed, you may use:

```bash
sbadmin <command> <subcommand> [args...] --json
```

## Recipes (admin dashboard parity)

### Users

- List pending first (recommended filter):

```bash
sbadmin users list --json
```

- Approve user:

```bash
sbadmin users approve <uid> --json --yes
```

- Reject/delete user:

```bash
sbadmin users reject <uid> --json --yes
```

- Make admin:

```bash
sbadmin users make-admin <uid> --json --yes
```

### Sunny Beta

```bash
sbadmin beta list --json
sbadmin beta admit <uid> --json --yes
sbadmin beta kick <uid> --json --yes
```

### Services

```bash
sbadmin services list --json
sbadmin services list --json --search "<query>"
sbadmin services list --json --category "<Category>"

sbadmin services get <serviceId> --json

sbadmin services add --json --name "<Business>" --categories "Plumbing" --phone "..." --email "..."

sbadmin services edit <serviceId> --json --phone "..."

sbadmin services delete <serviceId> --json --yes
```

### Suggestions

```bash
sbadmin suggestions list --json
sbadmin suggestions approve <suggestionId> --json --yes
sbadmin suggestions reject <suggestionId> --json --yes
```

### Categories & Groups

```bash
sbadmin categories list --json
sbadmin categories add "<Category>" --json
sbadmin categories edit "<Old>" "<New>" --json
sbadmin categories delete "<Category>" --json --yes
sbadmin categories merge --source "<Source>" --dest "<Dest>" --json --yes

sbadmin groups list --json
sbadmin groups add "<Group>" --json --categories "Cat1,Cat2"
sbadmin groups edit "<Group>" --json --categories "Cat1,Cat2"
sbadmin groups delete "<Group>" --json --yes
```

### Quality dashboard

```bash
sbadmin quality dashboard --json
```

### Cleanup

- List services missing phone:

```bash
sbadmin cleanup list --json
```

- Search contact info (requires `GEMINI_API_KEY`):

```bash
export GEMINI_API_KEY="..."
sbadmin cleanup search-contact <serviceId> --json
```

- Accept (save) contact info:

```bash
sbadmin cleanup accept-contact <serviceId> phone "+19145551234" --json --yes
sbadmin cleanup accept-contact <serviceId> email "hello@example.com" --json --yes
```

## Failure modes and how the agent should respond

- **Exit 2 + “Firebase credentials not found”**: set `GOOGLE_APPLICATION_CREDENTIALS` to an absolute JSON path.
- **Exit 2 + “Project ID not set”**: export `GCLOUD_PROJECT` to the correct Firebase project id.
- **`PERMISSION_DENIED`**: credentials lack IAM roles; request/assign roles listed above.
- **Non-JSON stdout while `--json` was passed**: treat as error; capture raw output and stop.

## References

- Install details: `cli/INSTALL.md`
- Agent install script: `cli/scripts/install.sh`
- CLI help: `node cli/bin/sbadmin.js --help`
