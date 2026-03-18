# sbadmin Agent Quickstart

Assume the Scarsdale Buzz repo is already present at `$REPO_ROOT`.

## 1) Install

```bash
cd "$REPO_ROOT" && chmod +x cli/scripts/install.sh && ./cli/scripts/install.sh
```

## 2) Authenticate (service account)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
export GCLOUD_PROJECT="$(jq -r .project_id "$GOOGLE_APPLICATION_CREDENTIALS")"
```

## 3) Verify connectivity

```bash
cd "$REPO_ROOT/cli" && node bin/sbadmin.js auth status --json
```

## 4) Use JSON-first

```bash
cd "$REPO_ROOT/cli" && node bin/sbadmin.js users list --json
```

## If Firestore gRPC is blocked (restricted VM)

Use REST transport:

```bash
cd "$REPO_ROOT/cli" && node bin/sbadmin.js auth status --json --transport rest
cd "$REPO_ROOT/cli" && node bin/sbadmin.js users list --json --transport rest
```
