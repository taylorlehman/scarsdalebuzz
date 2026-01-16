#!/usr/bin/env python3
"""
Import services from CSV file into Firestore.

Prereqs:
- Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON, or run `gcloud auth application-default login`.
- pip install -r scripts/requirements.txt

Usage:
  python3 scripts/import_services.py --project your-project-id \
      --csv-file "scripts/Scarsdale Service Directory.csv" --collection services
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Set

import firebase_admin
from firebase_admin import credentials, firestore


class DataValidationError(Exception):
    """Raised when CSV data has issues that would break the website."""
    pass


def validate_csv_data(services: List[Dict], groups: Dict[str, List[str]]) -> None:
    """
    Validate CSV data for issues that would break the website.
    Raises DataValidationError with clear instructions if problems found.
    """
    errors = []
    
    # Check for services without any name
    for i, service in enumerate(services, 1):
        has_business_name = bool((service.get('businessName') or '').strip())
        has_person_name = bool((service.get('firstName') or '').strip() or (service.get('lastName') or '').strip())
        
        if not has_business_name and not has_person_name:
            errors.append(f"Row {i}: Service has no business name or person name. At least one is required.")
    
    # Check for invalid recommendation counts
    for i, service in enumerate(services, 1):
        recs = service.get('recommendations', 0)
        if not isinstance(recs, int) or recs < 0:
            errors.append(f"Row {i}: Invalid recommendation count '{recs}'. Must be a non-negative integer.")
    
    # Check for missing categories
    for i, service in enumerate(services, 1):
        category = (service.get('category') or '').strip()
        if not category:
            errors.append(f"Row {i}: Missing category. Every service must have a category.")
    
    # Check for invalid date formats
    for i, service in enumerate(services, 1):
        date_str = (service.get('lastRecommended') or '').strip()
        if date_str:
            try:
                parse_date(date_str)
            except ValueError as e:
                errors.append(f"Row {i}: Invalid date format '{date_str}'. {str(e)}")
    
    # Check for duplicate service entries (same business name + person name combination)
    seen_services = set()
    for i, service in enumerate(services, 1):
        business_name = (service.get('businessName') or '').strip().lower()
        first_name = (service.get('firstName') or '').strip().lower()
        last_name = (service.get('lastName') or '').strip().lower()
        
        service_key = (business_name, first_name, last_name)
        if service_key in seen_services:
            display_name = business_name or f'{first_name} {last_name}'.strip()
            errors.append(f"Row {i}: Duplicate service entry for '{display_name}'.")
        seen_services.add(service_key)
    
    if errors:
        error_msg = "CSV data validation failed. Please fix the following issues:\n\n"
        error_msg += "\n".join(f"• {error}" for error in errors)
        error_msg += "\n\nFix these issues in your CSV file and try again."
        raise DataValidationError(error_msg)


def parse_csv_data(csv_path: str) -> tuple[List[Dict], Dict[str, List[str]]]:
    """
    Parse CSV file and return (services, category_groups).
    
    Expected CSV columns:
    - Service Name (maps to businessName)
    - First Name (maps to firstName) 
    - Last Name (maps to lastName)
    - Group (maps to category group)
    - Category (maps to category)
    - Phone Number (maps to phone)
    - Email (maps to email)
    - Last Recommended Date (maps to lastRecommended)
    - Recommendations (maps to recommendations)
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    
    services = []
    category_groups = {}
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        # Validate required columns exist
        required_columns = ['Service Name', 'Group', 'Category', 'Recommendations']
        missing_columns = [col for col in required_columns if col not in reader.fieldnames]
        if missing_columns:
            raise DataValidationError(f"Missing required CSV columns: {', '.join(missing_columns)}")
        
        for row_num, row in enumerate(reader, 2):  # Start at 2 since row 1 is headers
            # Skip completely empty rows
            if not any(row.values()):
                continue
                
            # Parse service data with null safety
            service = {
                'businessName': (row.get('Service Name') or '').strip() or None,
                'firstName': (row.get('First Name') or '').strip() or None,
                'lastName': (row.get('Last Name') or '').strip() or None,
                'phone': (row.get('Phone Number') or '').strip() or None,
                'email': (row.get('Email') or '').strip() or None,
                'category': (row.get('Category') or '').strip() or None,
                'recommendations': int(row.get('Recommendations') or 0),
            }
            
            # Parse date
            date_str = (row.get('Last Recommended Date') or '').strip()
            if date_str:
                service['lastRecommended'] = date_str
            
            services.append(service)
            
            # Build category groups
            group_name = (row.get('Group') or '').strip()
            category = (row.get('Category') or '').strip()
            
            if group_name and category:
                if group_name not in category_groups:
                    category_groups[group_name] = []
                if category not in category_groups[group_name]:
                    category_groups[group_name].append(category)
    
    return services, category_groups


def parse_date(date_str: str) -> datetime:
    """
    Parse date string in various formats to datetime.
    Supports: YYYY-MM-DD, MM/DD/YYYY, MM/DD/YY, MM/DD
    """
    if not date_str:
        return None
        
    date_str = date_str.strip()
    
    # Try different date formats
    formats = [
        "%Y-%m-%d",      # 2025-01-15
        "%m/%d/%Y",      # 1/15/2025
        "%m/%d/%y",      # 1/15/25
        "%m/%d",         # 1/15 (assume current year)
    ]
    
    for fmt in formats:
        try:
            if fmt == "%m/%d":
                # For MM/DD format, assume current year
                dt = datetime.strptime(date_str, fmt).replace(year=datetime.now().year)
            else:
                dt = datetime.strptime(date_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    
    raise ValueError(f"Unable to parse date '{date_str}'. Expected formats: YYYY-MM-DD, MM/DD/YYYY, MM/DD/YY, or MM/DD")

def clear_datastore(client, collections_to_clear: List[str]) -> None:
    """Clear all documents from specified collections."""
    print("Clearing existing data from datastore...")
    
    for collection_name in collections_to_clear:
        # Get all documents in the collection
        docs = client.collection(collection_name).stream()
        
        # Delete in batches
        batch = client.batch()
        count = 0
        
        for doc in docs:
            batch.delete(doc.reference)
            count += 1
            
            if count % 400 == 0:
                batch.commit()
                batch = client.batch()
        
        # Commit remaining deletes
        if count % 400 != 0:
            batch.commit()
        
        if count > 0:
            print(f"Deleted {count} documents from '{collection_name}' collection.")


def generate_import_key(service: Dict) -> str:
    """Generate deterministic import key from service data."""
    key_parts = [
        (service.get('businessName') or '').strip().lower().replace(' ', '-'),
        (service.get('firstName') or '').strip().lower(),
        (service.get('lastName') or '').strip().lower(),
        (service.get('phone') or '').strip().replace('+', '').replace(' ', '').replace('-', ''),
    ]
    doc_id = '-'.join([p for p in key_parts if p])
    return doc_id if doc_id else None


def main():
    parser = argparse.ArgumentParser(description='Import services from CSV file into Firestore')
    parser.add_argument('--project', required=False, help='GCP project ID (optional)')
    parser.add_argument('--csv-file', default='Scarsdale Service Directory.csv', 
                       help='Path to CSV file')
    parser.add_argument('--collection', default='services', 
                       help='Target Firestore collection name')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Validate and preview data only, no writes to datastore')
    parser.add_argument('--skip-validation', action='store_true',
                       help='Skip data validation (not recommended)')
    args = parser.parse_args()

    try:
        # Parse CSV data
        print(f"Reading CSV file: {args.csv_file}")
        services, category_groups = parse_csv_data(args.csv_file)
        print(f"Parsed {len(services)} services and {len(category_groups)} category groups from CSV")

        # Validate data unless skipped
        if not args.skip_validation:
            print("Validating CSV data...")
            validate_csv_data(services, category_groups)
            print("✓ Data validation passed")

        # Preview mode
        if args.dry_run:
            print("\n=== DRY RUN MODE - NO DATA WILL BE WRITTEN ===")
            print(f"\nFirst service example:")
            if services:
                print(services[0])
            
            print(f"\nCategory groups found:")
            for group_name, categories in category_groups.items():
                print(f"  {group_name}: {categories}")
            
            # Show categories that would be created
            all_categories = set()
            for service in services:
                if service.get('category'):
                    all_categories.add(service['category'])
            print(f"\nAll categories found: {sorted(all_categories)}")
            return

        # Initialize Firebase Admin
        if not firebase_admin._apps:
            if args.project:
                # Try to load environment-specific service account key if it exists
                script_dir = os.path.dirname(__file__)
                # Map project ID to key file suffix? Or just check if there is a file matching the project ID
                # Simple convention: serviceAccountKey.{project_id}.json or just check known ones.
                
                # Check for staging key specifically
                if "staging" in args.project:
                    sa_path = os.path.join(script_dir, "serviceAccountKey.staging.json")
                else:
                    sa_path = os.path.join(script_dir, "serviceAccountKey.json")

                if os.path.exists(sa_path):
                    print(f"Using service account key: {sa_path}")
                    cred = credentials.Certificate(sa_path)
                    firebase_admin.initialize_app(cred)
                else:
                    print(f"Using Application Default Credentials for {args.project}")
                    cred = credentials.ApplicationDefault()
                    firebase_admin.initialize_app(cred, {'projectId': args.project})
            else:
                script_dir = os.path.dirname(__file__)
                sa_path = os.path.join(script_dir, "serviceAccountKey.json")
                if os.path.exists(sa_path):
                    cred = credentials.Certificate(sa_path)
                    firebase_admin.initialize_app(cred)
                else:
                    firebase_admin.initialize_app()

        client = firestore.client()

        # Clear existing data
        collections_to_clear = [args.collection, 'config']
        clear_datastore(client, collections_to_clear)

        # Import services
        print(f"Importing {len(services)} services...")
        batch = client.batch()
        count = 0
        
        for service in services:
            # Prepare document data
            doc = {
                'businessName': service.get('businessName'),
                'firstName': service.get('firstName'),
                'lastName': service.get('lastName'),
                'phone': service.get('phone'),
                'email': service.get('email'),
                'category': service.get('category'),
                'recommendations': service.get('recommendations', 0),
            }
            
            # Handle date conversion
            date_str = service.get('lastRecommended')
            if date_str:
                try:
                    doc['lastRecommended'] = parse_date(date_str)
                except ValueError as e:
                    print(f"Warning: Skipping invalid date for service {service}: {e}")

            # Generate import key and add to doc
            import_key = generate_import_key(service)
            if import_key:
                doc['importKey'] = import_key
            
            # Create new document reference with auto-generated ID
            ref = client.collection(args.collection).document()
            
            batch.set(ref, doc)
            count += 1
            
            # Commit in batches of 400
            if count % 400 == 0:
                batch.commit()
                batch = client.batch()

        # Commit remaining services
        if count % 400 != 0:
            batch.commit()

        print(f"✓ Imported {count} services into '{args.collection}' collection")

        # Import category groups
        if category_groups:
            client.collection('config').document('categoryGroups').set({'groups': category_groups})
            print(f"✓ Imported {len(category_groups)} category groups")

        # Generate and import categories list
        all_categories = set()
        for service in services:
            if service.get('category'):
                all_categories.add(service['category'])
        
        categories_list = sorted(all_categories)
        if categories_list:
            client.collection('config').document('categories').set({'list': categories_list})
            print(f"✓ Imported {len(categories_list)} categories")

        print("\n🎉 Import completed successfully!")

    except DataValidationError as e:
        print(f"\n❌ {e}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"\n❌ {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
