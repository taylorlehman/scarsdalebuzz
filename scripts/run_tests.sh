#!/bin/bash

# Default values
ENV="staging"
CATEGORY=""
TEST_TYPE="both"

# Display Help
show_help() {
    cat << EOF
Usage: ./scripts/run_tests.sh [OPTIONS]

Options:
  --help          Display this help message
  --env           Target environment: 'staging' (default) or 'prod'. Sets the BASE_URL.
  --type          Type of tests to run: 'unit', 'e2e', or 'both' (default)
  --category      Specific test category to run. Omit to run all available tests.

Categories:
  Backend Unit Tests (Jest):
    - index       (Auth Token Verification)
    - admin       (Admin Role Management)
    - core        (Business Logic & Request Submission)
    - destructive (User / Service Deletion)
    
  Frontend E2E Tests (Playwright):
    - auth               (Google/FB Sign in flows)
    - account            (Profile address/phone updates)
    - directory          (Search, Filtering, Liking, Suggesting)
    - my_recommendations (User Dashboard list)
    - admin              (Admin approve beta / grant roles)

Examples:
  ./scripts/run_tests.sh                           # Run everything against staging
  ./scripts/run_tests.sh --env prod                # Run everything against prod
  ./scripts/run_tests.sh --type e2e --category directory # Run directory E2E tests on staging
EOF
}

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --help|-h) show_help; exit 0 ;;
        --env) ENV="$2"; shift ;;
        --category) CATEGORY="$2"; shift ;;
        --type) TEST_TYPE="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; show_help; exit 1 ;;
    esac
    shift
done

echo "=== Running Tests ==="
echo "Environment: $ENV"
echo "Category: ${CATEGORY:-all}"
echo "Type: $TEST_TYPE"
echo "====================="

SUMMARY_UNIT=""
SUMMARY_E2E=""

# Map env to BASE_URL for Playwright Configuration
if [ "$ENV" == "prod" ]; then
    export BASE_URL="https://scarsdale-buzz.web.app" # Expected prod url
else
    export BASE_URL="https://scarsdale-buzz-staging.web.app"
fi

if [[ "$TEST_TYPE" == "both" || "$TEST_TYPE" == "unit" ]]; then
    echo ">>> Running Backend Unit Tests (Jest) <<<"
    cd functions
    
    JEST_CMD="npm test"
    if [ -n "$CATEGORY" ]; then
        JEST_CMD="$JEST_CMD -- tests/${CATEGORY}.test.js"
    fi
    
    $JEST_CMD
    UNIT_EXIT_CODE=$?
    cd ..
    
    if [ $UNIT_EXIT_CODE -eq 0 ]; then
        SUMMARY_UNIT="Backend Unit Tests: PASSED ✅"
    else
        SUMMARY_UNIT="Backend Unit Tests: FAILED ❌"
    fi
fi

echo ""

if [[ "$TEST_TYPE" == "both" || "$TEST_TYPE" == "e2e" ]]; then
    echo ">>> Running Frontend E2E Tests (Playwright) <<<"
    
    PW_CMD="npx playwright test"
    if [ -n "$CATEGORY" ]; then
        PW_CMD="$PW_CMD tests/${CATEGORY}.spec.ts"
    fi
    
    $PW_CMD
    E2E_EXIT_CODE=$?
    
    if [ $E2E_EXIT_CODE -eq 0 ]; then
        SUMMARY_E2E="Frontend E2E Tests: PASSED ✅"
    else
        SUMMARY_E2E="Frontend E2E Tests: FAILED ❌"
    fi
fi

echo ""
echo "=== Consolidated Test Summary ==="
if [ -n "$SUMMARY_UNIT" ]; then echo "$SUMMARY_UNIT"; fi
if [ -n "$SUMMARY_E2E" ]; then echo "$SUMMARY_E2E"; fi
echo "================================="

if [[ "$SUMMARY_UNIT" == *"FAILED"* || "$SUMMARY_E2E" == *"FAILED"* ]]; then
    exit 1
fi

exit 0
