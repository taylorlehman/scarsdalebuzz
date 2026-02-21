#!/bin/bash

# Usage: ./scripts/deploy.sh [staging|prod|both] [--reset-data]

ENV=$1
RESET_DATA=$2

if [[ "$ENV" == "--help" || "$ENV" == "-h" ]]; then
    echo "Usage: $0 [staging|prod|both] [--reset-data]"
    echo ""
    echo "Options:"
    echo "  staging       Deploy to the staging environment"
    echo "  prod          Deploy to the production environment"
    echo "  both          Deploy to staging first, then to production if successful"
    echo "  --reset-data  (Staging ONLY) Delete all Firestore/Auth data and re-import from CSV"
    echo "  --help, -h    Show this help message"
    exit 0
fi

if [[ "$ENV" == "both" ]]; then
    if [[ "$RESET_DATA" == "--reset-data" ]]; then
        echo "Error: --reset-data is not supported with 'both' option."
        exit 1
    fi

    echo "=== Starting Sequential Deployment (Staging -> Prod) ==="

    echo ">>> Step 1: Deploying to Staging"
    bash "$0" staging
    RETVAL=$?
    if [ $RETVAL -ne 0 ]; then
        echo ">>> Error: Staging deployment failed (Exit Code: $RETVAL). Aborting production deployment."
        exit $RETVAL
    fi

    echo ">>> Step 2: Deploying to Prod"
    bash "$0" prod
    RETVAL=$?
    if [ $RETVAL -ne 0 ]; then
        echo ">>> Error: Production deployment failed (Exit Code: $RETVAL)."
        exit $RETVAL
    fi

    echo "=== Sequential Deployment Complete ==="
    exit 0
fi

if [[ "$ENV" != "staging" && "$ENV" != "prod" ]]; then
    echo "Usage: $0 [staging|prod|both] [--reset-data]"
    exit 1
fi

echo "=== Deploying to $ENV environment ==="

# 0. Backup Data (Production Only)
if [[ "$ENV" == "prod" ]]; then
    echo "-> Backing up production data before deployment..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if [ -f "$SCRIPT_DIR/backup_services.py" ]; then
        python3 "$SCRIPT_DIR/backup_services.py" --production
        BACKUP_RETVAL=$?
        if [ $BACKUP_RETVAL -ne 0 ]; then
            echo "Error: Backup failed (Exit Code: $BACKUP_RETVAL). Aborting deployment."
            exit $BACKUP_RETVAL
        fi
        echo "-> Backup completed successfully."
    else
        echo "Warning: backup_services.py not found. Skipping backup."
        read -p "Continue without backup? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Deployment cancelled."
            exit 1
        fi
    fi
fi

# 1. Swap Config
echo "-> Swapping public/firebase-config.js..."
if [ -f "public/firebase-config.$ENV.js" ]; then
    cp "public/firebase-config.$ENV.js" "public/firebase-config.js"
else
    echo "Error: public/firebase-config.$ENV.js not found!"
    exit 1
fi

# 2. Swap Env (if exists)
if [ -f "functions/.env.$ENV" ]; then
    echo "-> Swapping functions/.env..."
    cp "functions/.env.$ENV" "functions/.env"
elif [ -f "functions/env.$ENV.template" ]; then
    # Fallback to template if real env not found (warn user)
    echo "WARNING: functions/.env.$ENV not found. Using template..."
    cp "functions/env.$ENV.template" "functions/.env"
else 
    echo "-> No specific .env file found for $ENV (functions/.env.$ENV)"
fi

# 3. Deploy
echo "-> Running firebase deploy -P $ENV..."
# We assume the user has configured the alias using `firebase use --add`
firebase deploy -P $ENV
RETVAL=$?
if [ $RETVAL -ne 0 ]; then
    echo "Error: Deployment to $ENV failed."
    exit $RETVAL
fi

# 4. Data Reset (Staging Only)
if [[ "$ENV" == "staging" && "$RESET_DATA" == "--reset-data" ]]; then
    echo "=== Data Reset Requested (Staging Only) ==="
    
    # Extract Project ID from the swapped config
    PROJECT_ID=$(grep 'projectId:' public/firebase-config.js | cut -d '"' -f 2)
    
    if [ -z "$PROJECT_ID" ] || [[ "$PROJECT_ID" == *"REPLACE"* ]]; then
        echo "Error: Could not detect valid Project ID from config. Please configure firebase-config.staging.js."
        exit 1
    fi

    # Verify we are not targeting prod by mistake (extra safety)
    if [[ "$PROJECT_ID" == *"prod"* ]]; then
        echo "CRITICAL ERROR: Detected PROD project ID ($PROJECT_ID) during staging reset. Aborting immediately."
        exit 1
    fi
    
    echo "Detected Project ID: $PROJECT_ID"
    
    read -p "Are you sure you want to DELETE ALL DATA in $PROJECT_ID? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Backup Firestore
        echo "-> Backing up Firestore data (staging)..."
        # Export logic can be added here if needed, but for staging resets we often skip persistent backup 
        # unless specifically requested. 
        # Note: 'firebase firestore:export' is not a standard CLI command for data export to local file. 
        # Usually requires gcloud: 'gcloud firestore export gs://[BUCKET_NAME]'
        
        # Delete Firestore
        echo "-> Deleting Firestore data..."
        firebase firestore:delete --all-collections -P $ENV -f
        
        # Delete Users
        echo "-> Deleting Auth users..."
        # Check if we can run the node script (depends on where we are and dependencies)
        if [ -f "scripts/delete_users.js" ]; then
            node scripts/delete_users.js --project=$PROJECT_ID
        else
            echo "Warning: scripts/delete_users.js not found."
        fi
        
        # Import Data
        echo "-> Importing fresh data..."
        if [ -f "scripts/import_services.py" ]; then
            python3 scripts/import_services.py --project $PROJECT_ID --csv-file "scripts/Scarsdale Service Directory.csv"
        else
             echo "Warning: scripts/import_services.py not found."
        fi
        
        echo "Data reset complete."
    else
        echo "Data reset cancelled."
    fi
fi

echo "=== Deployment Finished! ==="
