# sbadmin Installation Guide

Install instructions for the Scarsdale Buzz Admin CLI. Suitable for humans and automated agents (e.g., OpenClaw).

---

## Prerequisites

| Requirement   | Version / Details                                            |
|---------------|--------------------------------------------------------------|
| Node.js       | 18 or later (20 or 22 recommended)                          |
| npm           | 9+ (bundled with Node)                                       |
| Firebase      | Service account JSON with Firestore + Auth admin access      |

---

## Method 1: Install from Scarsdale Buzz repo (recommended)

Use this when you have the scarsdalebuzz repo on disk.

### 1. Clone the repo (if needed)

```bash
git clone https://github.com/taylorlehman/scarsdalebuzz.git
cd scarsdalebuzz
```

### 2. Install CLI dependencies

```bash
cd cli
npm install
```

### 3. Configure Firebase credentials

**Option A: Service account JSON file**

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/your-service-account.json"
```

**Option B: gcloud Application Default Credentials**

```bash
gcloud auth application-default login
```

### 4. Run the CLI

```bash
node bin/sbadmin.js --help
```

Or from the project root:

```bash
npm run admin -- --help
```

---

## Method 2: Global install (system-wide `sbadmin`)

After cloning and `cd cli`:

```bash
npm install -g .
```

Then run anywhere:

```bash
sbadmin auth status
```

---

## Method 3: Install script (agent-friendly)

From the scarsdalebuzz repo root:

```bash
chmod +x cli/scripts/install.sh
./cli/scripts/install.sh
```

Or with explicit repo path:

```bash
./cli/scripts/install.sh /path/to/scarsdalebuzz
```

Success: prints `INSTALL_SBADMIN: success` and exit 0.  
Failure: prints `INSTALL_SBADMIN_ERROR: ...` and exit 2.

---

## Method 4: Agent one-liner (from existing clone)

If the scarsdalebuzz repo is already cloned at `$SCARSDALEBUZZ_ROOT`:

```bash
cd "$SCARSDALEBUZZ_ROOT/cli" && npm install && node bin/sbadmin.js auth status
```

---

## Environment Variables

| Variable                        | Required | Description                                           |
|---------------------------------|----------|-------------------------------------------------------|
| `GOOGLE_APPLICATION_CREDENTIALS`| Yes*     | Absolute path to Firebase service account JSON        |
| `GCLOUD_PROJECT`                | No       | Firebase project ID (auto-detected from credentials)  |
| `ADMIN_PROJECT_ID`              | No       | Same as above, alternate name                         |
| `GEMINI_API_KEY`                | No       | For `sbadmin cleanup search-contact` only             |

\* Not required if using `gcloud auth application-default login`.

---

## Verification

Run after install:

```bash
sbadmin auth status
```

- **Success**: Prints `Connected to Firebase` or JSON `{"ok":true,"message":"Connected"}` with exit code 0.
- **Auth error**: Exit code 2 and message about Project Id or credentials.

---

## Agent-Friendly Notes

1. **Commands are explicit**: Use full paths; no `~` or relative paths in scripts.
2. **Exit codes**: 0 = success, 1 = user error, 2 = auth/config error.
3. **Non-interactive**: Use `-y` or `--yes` to avoid prompts; all input via args/flags.
4. **Machine output**: Use `--json` for parseable output.
5. **Help discovery**: `sbadmin <command> --help` shows options for each command.
6. **Install script output**: `install.sh` prints `INSTALL_SBADMIN: success` or `INSTALL_SBADMIN_ERROR: <reason>` on lines you can grep for.
