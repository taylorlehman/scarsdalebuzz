# Scarsdale Buzz Admin CLI

CLI for admin operations—users, services, categories, suggestions, and more. Agent-friendly design with `--json` and `--yes` flags.

## Setup

See **[INSTALL.md](INSTALL.md)** for full install instructions.

**Quick start:**
```bash
cd cli && npm install
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
node bin/sbadmin.js --help
```

**Agent install script:**
```bash
./cli/scripts/install.sh
```

## Commands

```
sbadmin auth status          # Verify Firebase connection
sbadmin users list           # List users
sbadmin users approve <uid>  # Approve pending user
sbadmin users reject <uid>   # Reject and delete user
sbadmin users delete <uid>   # Delete user
sbadmin users make-admin <uid>

sbadmin beta list            # List beta applicants
sbadmin beta admit <uid>     # Admit to Sunny Beta
sbadmin beta kick <uid>      # Remove from beta

sbadmin services list        # List services
sbadmin services get <id>    # Get one service
sbadmin services add         # Add service (see --help)
sbadmin services edit <id>   # Edit service
sbadmin services delete <id>

sbadmin suggestions list     # List pending suggestions
sbadmin suggestions approve <id>  # Approve as new service
sbadmin suggestions reject <id>

sbadmin categories list
sbadmin categories add <name>
sbadmin categories edit <old> <new>
sbadmin categories delete <name>
sbadmin categories merge --source X --dest Y

sbadmin groups list
sbadmin groups add <name>
sbadmin groups edit <name>
sbadmin groups delete <name>

sbadmin quality dashboard    # Data quality stats

sbadmin cleanup list         # Services missing phone
sbadmin cleanup search-contact <serviceId>  # Requires GEMINI_API_KEY
sbadmin cleanup accept-contact <serviceId> <phone|email> <value>
```

## Agent-Friendly Usage

- `--json` – structured output for parsing
- `-y, --yes` – skip confirmations
- Exit codes: 0 success, 1 user error, 2 auth/config error
