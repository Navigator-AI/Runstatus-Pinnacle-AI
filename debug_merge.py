#!/usr/bin/env python3
"""
Debug the merge process to understand why slack values are identical
"""
import sys
import os
sys.path.append('/home/prasannasai/Desktop/workspace/productdemo/python/PREDICTION-MODULE')

try:
    from prediction import fetch_data_from_db, normalize_endpoint
    import pandas as pd
    
    def debug_merge_process():
        print("🔍 Debugging merge process...")
        
        # Fetch raw data
        print("\n1. Fetching raw data...")
        place_data = fetch_data_from_db("reg_place_csv")
        cts_data = fetch_data_from_db("reg_cts_csv")
        
        print(f"   Place data: {len(place_data)} rows")
        print(f"   CTS data: {len(cts_data)} rows")
        
        # Add normalized endpoints
        print("\n2. Adding normalized endpoints...")
        place_data['normalized_endpoint'] = place_data['endpoint'].apply(normalize_endpoint)
        cts_data['normalized_endpoint'] = cts_data['endpoint'].apply(normalize_endpoint)
        
        # Check first few rows
        print("\n3. First 3 rows of each table:")
        print("   Place table:")
        for i in range(min(3, len(place_data))):
            row = place_data.iloc[i]
            print(f"     Row {i}: endpoint='{row['endpoint'][:30]}...', slack={row['slack']:.5f}")
        
        print("   CTS table:")
        for i in range(min(3, len(cts_data))):
            row = cts_data.iloc[i]
            print(f"     Row {i}: endpoint='{row['endpoint'][:30]}...', slack={row['slack']:.5f}")
        
        # Find common endpoints
        print("\n4. Finding common endpoints...")
        place_endpoints = set(place_data['normalized_endpoint'])
        cts_endpoints = set(cts_data['normalized_endpoint'])
        common_endpoints = place_endpoints.intersection(cts_endpoints)
        
        print(f"   Place unique endpoints: {len(place_endpoints)}")
        print(f"   CTS unique endpoints: {len(cts_endpoints)}")
        print(f"   Common endpoints: {len(common_endpoints)}")
        
        # Filter to common endpoints
        print("\n5. Filtering to common endpoints...")
        place_filtered = place_data[place_data['normalized_endpoint'].isin(common_endpoints)].copy()
        cts_filtered = cts_data[cts_data['normalized_endpoint'].isin(common_endpoints)].copy()
        
        print(f"   Place filtered: {len(place_filtered)} rows")
        print(f"   CTS filtered: {len(cts_filtered)} rows")
        
        # Remove duplicates
        print("\n6. Removing duplicates...")
        place_filtered = place_filtered.drop_duplicates(subset=['normalized_endpoint'], keep='first')
        cts_filtered = cts_filtered.drop_duplicates(subset=['normalized_endpoint'], keep='first')
        
        print(f"   Place after dedup: {len(place_filtered)} rows")
        print(f"   CTS after dedup: {len(cts_filtered)} rows")
        
        # Check first few rows after filtering
        print("\n7. First 3 rows after filtering:")
        print("   Place filtered:")
        for i in range(min(3, len(place_filtered))):
            row = place_filtered.iloc[i]
            print(f"     Row {i}: normalized_endpoint='{row['normalized_endpoint'][:30]}...', slack={row['slack']:.5f}")
        
        print("   CTS filtered:")
        for i in range(min(3, len(cts_filtered))):
            row = cts_filtered.iloc[i]
            print(f"     Row {i}: normalized_endpoint='{row['normalized_endpoint'][:30]}...', slack={row['slack']:.5f}")
        
        # Perform merge
        print("\n8. Performing merge...")
        merged_data = place_filtered.merge(
            cts_filtered, 
            on='normalized_endpoint', 
            how='inner',
            suffixes=('_place', '_cts')
        )
        
        print(f"   Merged data: {len(merged_data)} rows")
        print(f"   Merged columns: {list(merged_data.columns)}")
        
        # Check first few rows of merged data
        print("\n9. First 3 rows of merged data:")
        for i in range(min(3, len(merged_data))):
            row = merged_data.iloc[i]
            place_slack = row.get('slack_place', 'N/A')
            cts_slack = row.get('slack_cts', 'N/A')
            print(f"     Row {i}: place_slack={place_slack}, cts_slack={cts_slack}")
        
        # Extract place and CTS data
        print("\n10. Extracting place and CTS data...")
        place_columns = [col for col in place_filtered.columns if col != 'normalized_endpoint']
        cts_columns = [col for col in cts_filtered.columns if col != 'normalized_endpoint']
        
        print(f"   Place columns: {place_columns}")
        print(f"   CTS columns: {cts_columns}")
        
        # Check what columns exist in merged data
        place_cols_in_merged = [f'{col}_place' if f'{col}_place' in merged_data.columns else col for col in place_columns]
        cts_cols_in_merged = [f'{col}_cts' if f'{col}_cts' in merged_data.columns else col for col in cts_columns]
        
        print(f"   Place columns in merged: {place_cols_in_merged}")
        print(f"   CTS columns in merged: {cts_cols_in_merged}")
        
        # Extract final data
        final_place_data = merged_data[['normalized_endpoint'] + place_cols_in_merged].copy()
        final_cts_data = merged_data[['normalized_endpoint'] + cts_cols_in_merged].copy()
        
        print("\n11. Final extracted data:")
        print(f"   Final place data columns: {list(final_place_data.columns)}")
        print(f"   Final CTS data columns: {list(final_cts_data.columns)}")
        
        # Check slack values in final data
        if 'slack_place' in final_place_data.columns and 'slack_cts' in final_cts_data.columns:
            print(f"   First place slack: {final_place_data.iloc[0]['slack_place']:.5f}")
            print(f"   First CTS slack: {final_cts_data.iloc[0]['slack_cts']:.5f}")
        elif 'slack' in final_place_data.columns and 'slack' in final_cts_data.columns:
            print(f"   First place slack: {final_place_data.iloc[0]['slack']:.5f}")
            print(f"   First CTS slack: {final_cts_data.iloc[0]['slack']:.5f}")
        else:
            print("   ❌ No slack columns found in final data!")
            
    if __name__ == "__main__":
        debug_merge_process()
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()