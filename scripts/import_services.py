#!/usr/bin/env python3
"""
Import services from public/data.js into Firestore.

Prereqs:
- Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON, or run `gcloud auth application-default login`.
- pip install -r scripts/requirements.txt

Usage:
  python3 scripts/import_services.py --project your-project-id \
      --data-file public/data.js --collection services
"""
from __future__ import annotations

import argparse
import os
import re
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore 
import json5


def parse_service_data(js_path: str) -> list[dict]:
    with open(js_path, 'r', encoding='utf-8') as f:
        js = f.read()

    # Extract the serviceData array using a permissive regex
    # Matches: const serviceData = [ ... ];
    m = re.search(r"const\s+serviceData\s*=\s*(\[.*?\])\s*;", js, flags=re.S)
    if not m:
        raise RuntimeError("Could not find serviceData array in data.js")

    array_text = m.group(1)
    # json5 allows comments and trailing commas
    data = json5.loads(array_text)
    if not isinstance(data, list):
        raise RuntimeError("Parsed serviceData is not a list")
    return data


def parse_category_groups(js_path: str) -> dict | None:
    """Parse a const categoryGroups = { ... } object from a JS file.
    Returns a dict mapping groupName -> [categories]."""
    with open(js_path, 'r', encoding='utf-8') as f:
        js = f.read()

    m = re.search(r"const\s+categoryGroups\s*=\s*(\{.*?\})\s*;", js, flags=re.S)
    if not m:
        return None
    obj_text = m.group(1)
    groups = json5.loads(obj_text)
    if not isinstance(groups, dict):
        return None
    return groups

def to_timestamp(date_str: str | None):
    if not date_str:
        return None
    # Expect YYYY-MM-DD
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return dt
    except Exception as e:
        raise ValueError(f"Invalid date format for lastRecommended: {date_str}") from e


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=False, help='GCP project ID (optional)')
    parser.add_argument('--data-file', default='data.js', help='Path to data.js')
    parser.add_argument('--collection', default='services', help='Target Firestore collection name')
    parser.add_argument('--dry-run', action='store_true', help='Parse only, print sample, no writes')
    args = parser.parse_args()

    # Init Firebase Admin
    # Use ADC or service account from env var
    if not firebase_admin._apps:
        # Load service account from the scripts directory by default
        script_dir = os.path.dirname(__file__)
        sa_path = os.path.join(script_dir, "serviceAccountKey.json")
        if os.path.exists(sa_path):
            cred = credentials.Certificate(sa_path)
            firebase_admin.initialize_app(cred)
        else:
            # Fallback to ADC if no local service account
            if args.project:
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred, {'projectId': args.project})
            else:
                firebase_admin.initialize_app()

    client = firestore.client()

    services = parse_service_data(args.data_file)

    # Preview
    print(f"Parsed {len(services)} services from {args.data_file}")
    if args.dry_run:
        print("First item:")
        if services:
            print(services[0])
        # Try category groups as well (for preview)
        groups = parse_category_groups(args.data_file)
        if groups:
            print("Category groups keys:", list(groups.keys()))
        return

    # Batch write
    batch = client.batch()
    count = 0
    for svc in services:
        doc = {
            # Keep field names aligned with main.js usage
            'businessName': svc.get('businessName') or None,
            'firstName': svc.get('firstName') or None,
            'lastName': svc.get('lastName') or None,
            'phone': svc.get('phone'),
            'category': svc.get('category'),
            'recommendations': int(svc.get('recommendations') or 0),
        }
        lr = svc.get('lastRecommended')
        ts = to_timestamp(lr) if lr else None
        if ts is not None:
            doc['lastRecommended'] = ts

        # Use deterministic doc IDs: businessName or name + phone
        key_parts = [
            (doc.get('businessName') or '').strip().lower().replace(' ', '-'),
            (doc.get('firstName') or '').strip().lower(),
            (doc.get('lastName') or '').strip().lower(),
            (doc.get('phone') or '').strip().replace('+', '').replace(' ', '').replace('-', ''),
        ]
        doc_id = '-'.join([p for p in key_parts if p]) or None
        ref = client.collection(args.collection).document(doc_id) if doc_id else client.collection(args.collection).document()
        batch.set(ref, doc)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = client.batch()

    if count % 400 != 0:
        batch.commit()

    print(f"Imported {count} documents into '{args.collection}' collection.")

    # Import category groups into config/categoryGroups if present
    groups = parse_category_groups(args.data_file)
    if groups:
        client.collection('config').document('categoryGroups').set({ 'groups': groups })
        print("Upserted categoryGroups config document.")
        # Also compute categories list from groups
        cat_set = set()
        for arr in groups.values():
            for c in arr:
                if isinstance(c, str) and c.strip():
                    cat_set.add(c.strip())
        categories = sorted(cat_set)
    else:
        # Fallback: derive categories from imported services
        categories = sorted({ (s.get('category') or '').strip() for s in services if s.get('category') })

    if categories:
        client.collection('config').document('categories').set({ 'list': categories })
        print(f"Upserted categories config document with {len(categories)} categories.")


if __name__ == '__main__':
    main()
