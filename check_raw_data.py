#!/usr/bin/env python3
"""
Check raw database data to understand the issue
"""
import requests

def check_raw_data():
    print("🔍 Checking raw database data...")
    
    # Get available tables
    response = requests.get("http://127.0.0.1:8088/available-tables")
    if response.status_code != 200:
        print(f"❌ Failed to get tables: {response.text}")
        return
    
    tables_data = response.json()
    
    print(f"📊 Available tables: {len(tables_data.get('all_tables', []))}")
    
    # Find reg tables
    reg_tables = [t for t in tables_data.get('all_tables', []) if t['table_name'].startswith('reg_')]
    
    for table in reg_tables:
        print(f"\n📋 Table: {table['table_name']}")
        print(f"   Rows: {table.get('row_count', 'Unknown')}")
        print(f"   All keys: {list(table.keys())}")
        
        # Try to get column info
        columns = table.get('all_columns', [])
        has_slack = table.get('has_slack', False)
        print(f"   All columns: {columns}")
        print(f"   Has slack flag: {has_slack}")
        
        # Check if it has slack column
        if has_slack or (isinstance(columns, list) and 'slack' in columns):
            print(f"   ✅ Has slack column")
        else:
            print(f"   ❌ No slack column found")

if __name__ == "__main__":
    check_raw_data()