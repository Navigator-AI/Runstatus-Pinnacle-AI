#!/usr/bin/env python3
"""
Direct database test to check if tables have different data
"""
import sys
import os

# Add the prediction module to path
sys.path.append('/home/prasannasai/Desktop/workspace/productdemo/python/PREDICTION-MODULE')

# Import required modules
try:
    from sqlalchemy import create_engine, text
    from urllib.parse import quote_plus
    import logging
    
    # Database configuration
    DB_CONFIG = {
        'host': 'localhost',
        'port': 5432,
        'dbname': 'algodb',
        'user': 'postgres',
        'password': 'postgres123'
    }
    
    def test_database_directly():
        print("🔍 Testing database directly...")
        
        # Create database engine
        engine = create_engine(
            f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}",
            connect_args={"connect_timeout": 10}
        )
        
        with engine.connect() as connection:
            # Test place table
            print("\n📋 Testing reg_place_csv:")
            place_query = text("SELECT beginpoint, endpoint, slack FROM reg_place_csv LIMIT 5")
            place_result = connection.execute(place_query)
            place_rows = place_result.fetchall()
            
            for i, row in enumerate(place_rows):
                print(f"   Row {i+1}: beginpoint={row[0][:30]}..., endpoint={row[1][:30]}..., slack={row[2]}")
            
            # Test CTS table
            print("\n📋 Testing reg_cts_csv:")
            cts_query = text("SELECT beginpoint, endpoint, slack FROM reg_cts_csv LIMIT 5")
            cts_result = connection.execute(cts_query)
            cts_rows = cts_result.fetchall()
            
            for i, row in enumerate(cts_rows):
                print(f"   Row {i+1}: beginpoint={row[0][:30]}..., endpoint={row[1][:30]}..., slack={row[2]}")
            
            # Compare first rows
            print("\n🔍 Comparison:")
            if place_rows and cts_rows:
                place_first = place_rows[0]
                cts_first = cts_rows[0]
                
                print(f"   Place first slack: {place_first[2]}")
                print(f"   CTS first slack: {cts_first[2]}")
                print(f"   Are they identical? {place_first[2] == cts_first[2]}")
                
                # Check if endpoints are the same
                print(f"   Place first endpoint: {place_first[1]}")
                print(f"   CTS first endpoint: {cts_first[1]}")
                print(f"   Are endpoints identical? {place_first[1] == cts_first[1]}")
            
            # Check unique slack values in each table
            print("\n📊 Unique slack value counts:")
            place_unique_query = text("SELECT COUNT(DISTINCT slack) FROM reg_place_csv")
            cts_unique_query = text("SELECT COUNT(DISTINCT slack) FROM reg_cts_csv")
            
            place_unique = connection.execute(place_unique_query).scalar()
            cts_unique = connection.execute(cts_unique_query).scalar()
            
            print(f"   Place table unique slack values: {place_unique}")
            print(f"   CTS table unique slack values: {cts_unique}")
            
    if __name__ == "__main__":
        test_database_directly()
        
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("This might be due to missing dependencies or pandas issues")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()