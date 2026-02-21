# AI Agent Workflow Rules

**CRITICAL INSTRUCTION: Agents operating in this codebase MUST adhere strictly to these rules regarding testing.**

## Core Testing Philosophy
- **DO NOT** chase 100% test coverage.
- **DO** focus testing efforts exclusively on the largest risks (e.g., authentication paths, database writes, critical business logic).

## Agent Responsibilities
1. **Mandatory Test Evaluation:** As part of making *any* change to the codebase, you must evaluate the risk impact.
2. **Mandatory Test Updates:** You must write or update the necessary tests to validate your specific feature changes.
3. **Staging & Validation Lifecycle:** Before you conclude your task or notify the user of completion, you must automatically:
   - Complete your desired coding tasks.
   - Deploy the application to the `staging` environment.
   - Execute the appropriate unit tests and E2E integration tests against the deployed staging environment to validate your changes work in an integrated system.

## Testing Frameworks
### Backend / Functions (Jest)
- **Location:** `functions/tests/`
- **Command:** `./scripts/run_tests.sh --type unit` (or append `--category <name>`) from the root directory.

### Web Application E2E (Playwright)
- **Location:** `tests/`
- **Command:** `./scripts/run_tests.sh --type e2e` (or append `--category <name>`) from the root directory.
- *Tip:* Before running E2E tests, you **MUST** deploy to staging via `./scripts/deploy.sh staging` to test the integrated changes. You can run all tests together using `./scripts/run_tests.sh`.
