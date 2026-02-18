#!/usr/bin/env python3
"""
Backup services from Firestore to CSV file.

Exports data from the Firestore database to a CSV file matching the format
of the original Scarsdale Service Directory.csv import file.

Usage:
  python3 scripts/backup_services.py --production
  python3 scripts/backup_services.py --staging
  python3 scripts/backup_services.py --staging --dry-run

Output:
  scripts/backups/data_backup_<YYYY-MM-DD_HH-MM>_<environment>.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore


def format_date(dt) -> str:
    """
    Format a Firestore timestamp or datetime to the CSV date format (M/D/YYYY).
    """
    if dt is None:
        return ''
    
    # Handle Firestore Timestamp objects
    if hasattr(dt, 'to_datetime'):
        dt = dt.to_datetime()
    elif hasattr(dt, '_seconds'):
        # Firestore DatetimeWithNanoseconds
        dt = datetime.fromtimestamp(dt._seconds)
    
    if isinstance(dt, datetime):
        return dt.strftime('%-m/%-d/%Y')  # Use %-m and %-d to avoid zero-padding
    
    return str(dt)


def get_category_to_group_mapping(client) -> Dict[str, str]:
    """
    Fetch category groups from Firestore config and create a reverse mapping
    from category -> group name.
    """
    category_to_group = {}
    
    try:
        config_doc = client.collection('config').document('categoryGroups').get()
        if config_doc.exists:
            groups_data = config_doc.to_dict().get('groups', {})
            for group_name, categories in groups_data.items():
                for category in categories:
                    category_to_group[category] = group_name
    except Exception as e:
        print(f"Warning: Could not fetch category groups: {e}")
    
    return category_to_group


def fetch_all_services(client, collection_name: str = 'services') -> List[Dict]:
    """
    Fetch all services from Firestore.
    """
    services = []
    
    docs = client.collection(collection_name).stream()
    
    for doc in docs:
        data = doc.to_dict()
        data['_id'] = doc.id  # Include document ID for reference
        services.append(data)
    
    return services


def export_to_csv(
    services: List[Dict], 
    category_to_group: Dict[str, str],
    output_path: str
) -> None:
    """
    Export services to CSV in the standard format.
    
    CSV columns:
    - Service Name
    - First Name
    - Last Name
    - Group
    - Category
    - Phone Number
    - Email
    - Last Recommended Date
    - Recommendations
    """
    fieldnames = [
        'Service Name',
        'First Name', 
        'Last Name',
        'Group',
        'Category',
        'Phone Number',
        'Email',
        'Last Recommended Date',
        'Recommendations'
    ]
    
    # Ensure the output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        # Sort services by Group, then Category, then recommendations (descending)
        sorted_services = sorted(
            services,
            key=lambda s: (
                category_to_group.get(s.get('category', ''), 'ZZZ'),  # Group
                s.get('category', ''),  # Category
                -(s.get('recommendations', 0))  # Recommendations (descending)
            )
        )
        
        for service in sorted_services:
            category = service.get('category', '')
            group = category_to_group.get(category, '')
            
            row = {
                'Service Name': service.get('businessName') or '',
                'First Name': service.get('firstName') or '',
                'Last Name': service.get('lastName') or '',
                'Group': group,
                'Category': category,
                'Phone Number': service.get('phone') or '',
                'Email': service.get('email') or '',
                'Last Recommended Date': format_date(service.get('lastRecommended')),
                'Recommendations': service.get('recommendations', 0)
            }
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(
        description='Backup services from Firestore to CSV',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 scripts/backup_services.py --production
  python3 scripts/backup_services.py --staging
  python3 scripts/backup_services.py --staging --dry-run
        """
    )
    
    # Environment selection (mutually exclusive, one required)
    env_group = parser.add_mutually_exclusive_group(required=True)
    env_group.add_argument('--staging', action='store_true', 
                          help='Backup from staging environment')
    env_group.add_argument('--production', action='store_true', 
                          help='Backup from production environment')
    
    parser.add_argument('--collection', default='services',
                       help='Firestore collection to backup (default: services)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be exported without writing file')
    parser.add_argument('--output', type=str, default=None,
                       help='Custom output path (overrides default naming)')
    
    args = parser.parse_args()
    
    # Determine environment
    if args.staging:
        environment = 'staging'
        sa_key_file = 'serviceAccountKey.staging.json'
    else:
        environment = 'production'
        sa_key_file = 'serviceAccountKey.json'
    
    # Locate service account key
    script_dir = os.path.dirname(os.path.abspath(__file__))
    sa_path = os.path.join(script_dir, sa_key_file)
    
    if not os.path.exists(sa_path):
        print(f"❌ Service account key not found: {sa_path}")
        print(f"\nPlease ensure the {sa_key_file} file exists in the scripts directory.")
        sys.exit(1)
    
    # Generate output filename
    date_str = datetime.now().strftime('%Y-%m-%d_%H-%M')
    
    if args.output:
        output_path = args.output
    else:
        backups_dir = os.path.join(script_dir, 'backups')
        output_filename = f'data_backup_{date_str}_{environment}.csv'
        output_path = os.path.join(backups_dir, output_filename)
    
    try:
        # Initialize Firebase Admin
        print(f"🔐 Connecting to {environment} environment...")
        print(f"   Using credentials: {sa_path}")
        
        if not firebase_admin._apps:
            cred = credentials.Certificate(sa_path)
            firebase_admin.initialize_app(cred)
        
        client = firestore.client()
        
        # Fetch category groups for Group column mapping
        print(f"📂 Fetching category group configuration...")
        category_to_group = get_category_to_group_mapping(client)
        print(f"   Found {len(category_to_group)} category-to-group mappings")
        
        # Fetch all services
        print(f"📥 Fetching services from '{args.collection}' collection...")
        services = fetch_all_services(client, args.collection)
        print(f"   Found {len(services)} services")
        
        if not services:
            print("\n⚠️  No services found in the database.")
            sys.exit(0)
        
        # Dry run mode
        if args.dry_run:
            print(f"\n=== DRY RUN MODE ===")
            print(f"Would export {len(services)} services to: {output_path}")
            print(f"\nSample service:")
            if services:
                sample = services[0]
                for key, value in sample.items():
                    if key != '_id':
                        print(f"  {key}: {value}")
            
            print(f"\nCategory groups found:")
            groups_by_name = {}
            for cat, group in category_to_group.items():
                if group not in groups_by_name:
                    groups_by_name[group] = []
                groups_by_name[group].append(cat)
            for group, cats in sorted(groups_by_name.items()):
                print(f"  {group}: {cats}")
            return
        
        # Export to CSV
        print(f"\n📤 Exporting to CSV...")
        export_to_csv(services, category_to_group, output_path)
        
        print(f"\n✅ Backup completed successfully!")
        print(f"   Environment: {environment}")
        print(f"   Services exported: {len(services)}")
        print(f"   Output file: {output_path}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
