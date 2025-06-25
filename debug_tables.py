#!/usr/bin/env python3
"""
Debug script to check table data
"""
import sys
import os
import importlib.util

# Direct import of the prediction.py module
prediction_path = '/home/prasannasai/Desktop/workspace/productdemo/python/PREDICTION-MODULE/prediction.py'
spec = importlib.util.spec_from_file_location("prediction", prediction_path)
prediction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prediction)

# Get the required functions
fetch_data_from_db = prediction.fetch_data_from_db
normalize_endpoint = prediction.normalize_endpoint

def debug_tables():
    print("=== DEBUGGING TABLE DATA ===")
    
    try:
        # Fetch place data
        print("\n1. PLACE TABLE DATA:")
        place_data = fetch_data_from_db("reg_place_csv")
        print(f"   Total rows: {len(place_data)}")
        print(f"   Columns: {list(place_data.columns)}")
        print(f"   Sample data:")
        print(place_data[['beginpoint', 'endpoint', 'slack']].head(10).to_string())
        
        # Fetch CTS data
        print("\n2. CTS TABLE DATA:")
        cts_data = fetch_data_from_db("reg_cts_csv")
        print(f"   Total rows: {len(cts_data)}")
        print(f"   Columns: {list(cts_data.columns)}")
        print(f"   Sample data:")
        print(cts_data[['beginpoint', 'endpoint', 'slack']].head(10).to_string())
        
        # Check endpoint normalization and overlap
        print("\n3. ENDPOINT ANALYSIS:")
        place_data['normalized_endpoint'] = place_data['endpoint'].apply(normalize_endpoint)
        cts_data['normalized_endpoint'] = cts_data['endpoint'].apply(normalize_endpoint)
        
        place_endpoints = set(place_data['normalized_endpoint'])
        cts_endpoints = set(cts_data['normalized_endpoint'])
        common_endpoints = place_endpoints.intersection(cts_endpoints)
        
        print(f"   Place unique endpoints: {len(place_endpoints)}")
        print(f"   CTS unique endpoints: {len(cts_endpoints)}")
        print(f"   Common endpoints: {len(common_endpoints)}")
        
        # Check if slack values are different
        print("\n4. SLACK VALUE ANALYSIS:")
        place_slack_stats = place_data['slack'].describe()
        cts_slack_stats = cts_data['slack'].describe()
        
        print("   Place slack statistics:")
        print(f"     Min: {place_slack_stats['min']:.4f}")
        print(f"     Max: {place_slack_stats['max']:.4f}")
        print(f"     Mean: {place_slack_stats['mean']:.4f}")
        print(f"     Std: {place_slack_stats['std']:.4f}")
        
        print("   CTS slack statistics:")
        print(f"     Min: {cts_slack_stats['min']:.4f}")
        print(f"     Max: {cts_slack_stats['max']:.4f}")
        print(f"     Mean: {cts_slack_stats['mean']:.4f}")
        print(f"     Std: {cts_slack_stats['std']:.4f}")
        
        # Check data alignment for common endpoints
        print("\n5. DATA ALIGNMENT CHECK:")
        place_filtered = place_data[place_data['normalized_endpoint'].isin(common_endpoints)].sort_values('normalized_endpoint').reset_index(drop=True)
        cts_filtered = cts_data[cts_data['normalized_endpoint'].isin(common_endpoints)].sort_values('normalized_endpoint').reset_index(drop=True)
        
        print(f"   Place filtered rows: {len(place_filtered)}")
        print(f"   CTS filtered rows: {len(cts_filtered)}")
        
        # Check if endpoints match after filtering
        if len(place_filtered) > 0 and len(cts_filtered) > 0:
            print("\n   Sample aligned data:")
            for i in range(min(5, len(place_filtered), len(cts_filtered))):
                place_ep = place_filtered.iloc[i]['normalized_endpoint']
                cts_ep = cts_filtered.iloc[i]['normalized_endpoint']
                place_slack = place_filtered.iloc[i]['slack']
                cts_slack = cts_filtered.iloc[i]['slack']
                
                print(f"   Row {i}: Place EP='{place_ep}' Slack={place_slack:.4f} | CTS EP='{cts_ep}' Slack={cts_slack:.4f} | Match: {place_ep == cts_ep}")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_tables()