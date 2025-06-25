#!/usr/bin/env python3

"""
Demo script showing how new tables can be added to the database
and automatically work with the training system.
"""

import pandas as pd
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus
import numpy as np

# Database configuration
DB_CONFIG = {
    'dbname': 'algodb',
    'user': 'postgres',
    'password': 'Welcom@123',
    'host': 'localhost',
    'port': '5432',
}

def create_sample_tables():
    """Create sample tables to demonstrate dynamic functionality."""
    
    # Required columns for training
    required_columns = [
        'beginpoint', 'endpoint', 'period', 'libsetup', 'checktype', 
        'required', 'arrival', 'slack', 'launchclk', 'captureclk', 
        'skew', 'fanout', 'netdelay', 'netcount', 'instcount', 
        'invdelay', 'bufdelay', 'combodelay', 'seqdelay', 'totaldelay',
        'invcount', 'bufcount', 'combocount', 'seqcount', 'portcount',
        'load', 'wirelength'
    ]
    
    # Generate sample data
    np.random.seed(42)  # For reproducible results
    n_rows = 100
    
    sample_data = {
        'beginpoint': [f'begin_{i}' for i in range(n_rows)],
        'endpoint': [f'endpoint_{i}' for i in range(n_rows)],
        'period': np.random.uniform(1.0, 10.0, n_rows),
        'libsetup': np.random.uniform(0.1, 1.0, n_rows),
        'checktype': ['setup'] * n_rows,
        'required': np.random.uniform(5.0, 15.0, n_rows),
        'arrival': np.random.uniform(4.0, 14.0, n_rows),
        'slack': np.random.uniform(-2.0, 3.0, n_rows),  # Target variable
        'launchclk': np.random.uniform(0.0, 1.0, n_rows),
        'captureclk': np.random.uniform(0.0, 1.0, n_rows),
        'skew': np.random.uniform(-0.5, 0.5, n_rows),
        'fanout': np.random.randint(1, 20, n_rows),
        'netdelay': np.random.uniform(0.1, 2.0, n_rows),
        'netcount': np.random.randint(1, 10, n_rows),
        'instcount': np.random.randint(1, 15, n_rows),
        'invdelay': np.random.uniform(0.05, 0.5, n_rows),
        'bufdelay': np.random.uniform(0.05, 0.5, n_rows),
        'combodelay': np.random.uniform(0.1, 1.0, n_rows),
        'seqdelay': np.random.uniform(0.1, 1.0, n_rows),
        'totaldelay': np.random.uniform(0.5, 3.0, n_rows),
        'invcount': np.random.randint(0, 5, n_rows),
        'bufcount': np.random.randint(0, 5, n_rows),
        'combocount': np.random.randint(1, 10, n_rows),
        'seqcount': np.random.randint(0, 3, n_rows),
        'portcount': np.random.randint(1, 8, n_rows),
        'load': np.random.uniform(0.1, 5.0, n_rows),
        'wirelength': np.random.uniform(10.0, 1000.0, n_rows)
    }
    
    # Create DataFrames
    place_df = pd.DataFrame(sample_data)
    cts_df = pd.DataFrame(sample_data.copy())
    route_df = pd.DataFrame(sample_data.copy())
    
    # Modify slack values slightly for each stage to simulate real differences
    cts_df['slack'] = place_df['slack'] + np.random.normal(0, 0.1, n_rows)
    route_df['slack'] = cts_df['slack'] + np.random.normal(0, 0.1, n_rows)
    
    return place_df, cts_df, route_df

def upload_tables_to_database(place_df, cts_df, route_df, prefix="demo"):
    """Upload sample tables to the database."""
    
    try:
        # Create database engine
        engine = create_engine(
            f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}",
            connect_args={"connect_timeout": 10}
        )
        
        # Table names
        place_table = f"{prefix}_place_csv"
        cts_table = f"{prefix}_cts_csv"
        route_table = f"{prefix}_route_csv"
        
        print(f"📤 Uploading tables with prefix '{prefix}'...")
        
        # Upload tables
        place_df.to_sql(place_table, engine, if_exists='replace', index=False)
        print(f"✅ Uploaded {place_table} ({len(place_df)} rows)")
        
        cts_df.to_sql(cts_table, engine, if_exists='replace', index=False)
        print(f"✅ Uploaded {cts_table} ({len(cts_df)} rows)")
        
        route_df.to_sql(route_table, engine, if_exists='replace', index=False)
        print(f"✅ Uploaded {route_table} ({len(route_df)} rows)")
        
        return place_table, cts_table, route_table
        
    except Exception as e:
        print(f"❌ Error uploading tables: {e}")
        return None, None, None

def test_new_tables_with_api(place_table, cts_table, route_table):
    """Test the new tables with the training API."""
    
    import requests
    
    print(f"\n🧪 Testing new tables with training API...")
    
    # Test table discovery
    try:
        print("1. Testing table discovery...")
        response = requests.get("http://localhost:8000/available-tables", timeout=30)
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Found {result.get('total_tables', 0)} total tables")
            print(f"✅ Found {len(result.get('complete_training_sets', []))} complete training sets")
            
            # Check if our new tables are detected
            for training_set in result.get('complete_training_sets', []):
                if training_set['place_table'] == place_table:
                    print(f"✅ New tables detected as complete training set!")
                    break
        else:
            print(f"❌ Table discovery failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error in table discovery: {e}")
    
    # Test training
    try:
        print("\n2. Testing training with new tables...")
        training_data = {
            "place_table": place_table,
            "cts_table": cts_table,
            "route_table": route_table
        }
        
        response = requests.post(
            "http://localhost:8000/slack-prediction/train",
            json=training_data,
            headers={"Content-Type": "application/json"},
            timeout=300
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Training with new tables successful!")
            print(f"Place to CTS R2: {result.get('place_to_cts', {}).get('r2_score', 'N/A')}")
            if 'combined_to_route' in result:
                print(f"Combined to Route R2: {result.get('combined_to_route', {}).get('r2_score', 'N/A')}")
        else:
            print(f"❌ Training failed: {response.status_code}")
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Error in training: {e}")
    
    # Test prediction
    try:
        print("\n3. Testing prediction with new tables...")
        prediction_data = {
            "place_table": place_table,
            "cts_table": cts_table
        }
        
        response = requests.post(
            "http://localhost:8000/predict",
            json=prediction_data,
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Prediction with new tables successful!")
            print(f"Predictions generated: {len(result.get('data', []))}")
        else:
            print(f"❌ Prediction failed: {response.status_code}")
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Error in prediction: {e}")

def cleanup_demo_tables(prefix="demo"):
    """Remove demo tables from database."""
    
    try:
        engine = create_engine(
            f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}",
            connect_args={"connect_timeout": 10}
        )
        
        tables_to_remove = [f"{prefix}_place_csv", f"{prefix}_cts_csv", f"{prefix}_route_csv"]
        
        with engine.connect() as connection:
            for table in tables_to_remove:
                try:
                    connection.execute(text(f"DROP TABLE IF EXISTS {table}"))
                    print(f"🗑️ Removed {table}")
                except Exception as e:
                    print(f"⚠️ Could not remove {table}: {e}")
            connection.commit()
            
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")

if __name__ == "__main__":
    print("🎯 Demo: Adding New Tables Dynamically")
    print("=" * 50)
    
    # Step 1: Create sample data
    print("1. Creating sample data...")
    place_df, cts_df, route_df = create_sample_tables()
    print(f"✅ Created sample data with {len(place_df)} rows each")
    
    # Step 2: Upload to database
    print("\n2. Uploading to database...")
    place_table, cts_table, route_table = upload_tables_to_database(
        place_df, cts_df, route_df, prefix="demo"
    )
    
    if place_table:
        # Step 3: Test with API
        print("\n3. Testing with API...")
        test_new_tables_with_api(place_table, cts_table, route_table)
        
        # Step 4: Cleanup (optional)
        print("\n4. Cleanup...")
        cleanup_choice = input("Remove demo tables? (y/n): ").lower().strip()
        if cleanup_choice == 'y':
            cleanup_demo_tables("demo")
        else:
            print("Demo tables kept in database")
    
    print("\n" + "=" * 50)
    print("🎉 Demo completed!")
    print("💡 Key takeaways:")
    print("   ✅ New tables are automatically detected")
    print("   ✅ Training works immediately with proper column structure")
    print("   ✅ Prediction works with any trained model")
    print("   ✅ No code changes needed for new data!")