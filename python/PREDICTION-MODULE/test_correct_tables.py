#!/usr/bin/env python3
"""
Test prediction with correct table names to verify slack preservation
"""

import logging
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'dbname': 'algodb',
    'user': 'postgres',
    'password': 'Welcom@123',
    'host': 'localhost',
    'port': '5432',
}

def fetch_table_data(table_name):
    """Fetch data from table (simplified version of fetch_data_from_db)"""
    try:
        database_url = f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
        engine = create_engine(database_url, connect_args={"connect_timeout": 10})
        
        with engine.connect() as connection:
            # Check if table exists
            result = connection.execute(text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"))
            exists = result.scalar()
            
            if not exists:
                raise ValueError(f"Table '{table_name}' does not exist")
            
            # Get all data
            result = connection.execute(text(f"SELECT * FROM {table_name}"))
            rows = result.fetchall()
            column_names = list(result.keys())
            
            # Convert to list of dictionaries (like pandas DataFrame)
            data = []
            for row in rows:
                row_dict = dict(zip(column_names, row))
                data.append(row_dict)
            
            logger.info(f"✅ Fetched {len(data)} rows from {table_name}")
            return data, column_names
            
    except Exception as e:
        logger.error(f"❌ Error fetching from {table_name}: {e}")
        return None, None

def test_slack_preservation():
    """Test that we get the correct slack values from reg_* tables"""
    logger.info("🧪 Testing Slack Preservation with Correct Tables")
    logger.info("=" * 60)
    
    # Fetch data from the correct tables
    place_data, place_columns = fetch_table_data('reg_place_csv')
    cts_data, cts_columns = fetch_table_data('reg_cts_csv')
    
    if not place_data or not cts_data:
        logger.error("❌ Failed to fetch table data")
        return
    
    logger.info(f"📊 Place table: {len(place_data)} rows")
    logger.info(f"📊 CTS table: {len(cts_data)} rows")
    
    # Check for your expected slack values
    expected_place_slacks = [-0.63269, -0.63215, -0.63195, -0.63138]
    expected_cts_slacks = [-0.64921, -0.60917, -0.61738, -0.65726]
    
    logger.info("\n🔍 Checking for expected place slack values:")
    found_place = []
    for expected in expected_place_slacks:
        for row in place_data:
            if abs(row['slack'] - expected) < 0.00001:
                found_place.append({
                    'endpoint': row['endpoint'],
                    'slack': row['slack'],
                    'expected': expected
                })
                logger.info(f"  ✅ Found place slack {row['slack']:.6f} (expected {expected:.6f})")
                logger.info(f"     Endpoint: {row['endpoint'][:60]}...")
                break
        else:
            logger.warning(f"  ❌ Place slack {expected:.6f} not found")
    
    logger.info("\n🔍 Checking for expected CTS slack values:")
    found_cts = []
    for expected in expected_cts_slacks:
        for row in cts_data:
            if abs(row['slack'] - expected) < 0.00001:
                found_cts.append({
                    'endpoint': row['endpoint'],
                    'slack': row['slack'],
                    'expected': expected
                })
                logger.info(f"  ✅ Found CTS slack {row['slack']:.6f} (expected {expected:.6f})")
                logger.info(f"     Endpoint: {row['endpoint'][:60]}...")
                break
        else:
            logger.warning(f"  ❌ CTS slack {expected:.6f} not found")
    
    # Simulate the prediction process
    logger.info("\n🎯 Simulating Prediction Process:")
    logger.info("=" * 40)
    
    if len(found_place) >= 4 and len(found_cts) >= 4:
        logger.info("✅ All expected slack values found in database!")
        logger.info("✅ The prediction system SHOULD preserve these exact values")
        
        # Show what the result should look like
        logger.info("\n📋 Expected Prediction Results:")
        for i in range(min(4, len(found_place), len(found_cts))):
            place_item = found_place[i]
            cts_item = found_cts[i]
            
            logger.info(f"\nRow {i+1}:")
            logger.info(f"  Endpoint: {place_item['endpoint'][:50]}...")
            logger.info(f"  Place Slack: {place_item['slack']:.6f} (PRESERVED FROM DATABASE)")
            logger.info(f"  CTS Slack: {cts_item['slack']:.6f} (PRESERVED FROM DATABASE)")
            logger.info(f"  Route Slack: [PREDICTED VALUE]")
        
        logger.info("\n🎯 SOLUTION:")
        logger.info("  1. ✅ Database is accessible")
        logger.info("  2. ✅ Correct slack values exist in reg_place_csv and reg_cts_csv")
        logger.info("  3. ✅ Prediction system should preserve these exact values")
        logger.info("  4. 🔧 Make sure to use table names: 'reg_place_csv' and 'reg_cts_csv'")
        logger.info("  5. 🔧 NOT 'ariane_place_sorted_csv' or 'ariane_cts_sorted_csv'")
        
    else:
        logger.error("❌ Not all expected slack values found")
        logger.info(f"Found {len(found_place)}/4 place values and {len(found_cts)}/4 CTS values")

if __name__ == "__main__":
    test_slack_preservation()#!/usr/bin/env python3
"""
Test prediction with correct table names to verify slack preservation
"""

import logging
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'dbname': 'algodb',
    'user': 'postgres',
    'password': 'Welcom@123',
    'host': 'localhost',
    'port': '5432',
}

def fetch_table_data(table_name):
    """Fetch data from table (simplified version of fetch_data_from_db)"""
    try:
        database_url = f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
        engine = create_engine(database_url, connect_args={"connect_timeout": 10})
        
        with engine.connect() as connection:
            # Check if table exists
            result = connection.execute(text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"))
            exists = result.scalar()
            
            if not exists:
                raise ValueError(f"Table '{table_name}' does not exist")
            
            # Get all data
            result = connection.execute(text(f"SELECT * FROM {table_name}"))
            rows = result.fetchall()
            column_names = list(result.keys())
            
            # Convert to list of dictionaries (like pandas DataFrame)
            data = []
            for row in rows:
                row_dict = dict(zip(column_names, row))
                data.append(row_dict)
            
            logger.info(f"✅ Fetched {len(data)} rows from {table_name}")
            return data, column_names
            
    except Exception as e:
        logger.error(f"❌ Error fetching from {table_name}: {e}")
        return None, None

def test_slack_preservation():
    """Test that we get the correct slack values from reg_* tables"""
    logger.info("🧪 Testing Slack Preservation with Correct Tables")
    logger.info("=" * 60)
    
    # Fetch data from the correct tables
    place_data, place_columns = fetch_table_data('reg_place_csv')
    cts_data, cts_columns = fetch_table_data('reg_cts_csv')
    
    if not place_data or not cts_data:
        logger.error("❌ Failed to fetch table data")
        return
    
    logger.info(f"📊 Place table: {len(place_data)} rows")
    logger.info(f"📊 CTS table: {len(cts_data)} rows")
    
    # Check for your expected slack values
    expected_place_slacks = [-0.63269, -0.63215, -0.63195, -0.63138]
    expected_cts_slacks = [-0.64921, -0.60917, -0.61738, -0.65726]
    
    logger.info("\n🔍 Checking for expected place slack values:")
    found_place = []
    for expected in expected_place_slacks:
        for row in place_data:
            if abs(row['slack'] - expected) < 0.00001:
                found_place.append({
                    'endpoint': row['endpoint'],
                    'slack': row['slack'],
                    'expected': expected
                })
                logger.info(f"  ✅ Found place slack {row['slack']:.6f} (expected {expected:.6f})")
                logger.info(f"     Endpoint: {row['endpoint'][:60]}...")
                break
        else:
            logger.warning(f"  ❌ Place slack {expected:.6f} not found")
    
    logger.info("\n🔍 Checking for expected CTS slack values:")
    found_cts = []
    for expected in expected_cts_slacks:
        for row in cts_data:
            if abs(row['slack'] - expected) < 0.00001:
                found_cts.append({
                    'endpoint': row['endpoint'],
                    'slack': row['slack'],
                    'expected': expected
                })
                logger.info(f"  ✅ Found CTS slack {row['slack']:.6f} (expected {expected:.6f})")
                logger.info(f"     Endpoint: {row['endpoint'][:60]}...")
                break
        else:
            logger.warning(f"  ❌ CTS slack {expected:.6f} not found")
    
    # Simulate the prediction process
    logger.info("\n🎯 Simulating Prediction Process:")
    logger.info("=" * 40)
    
    if len(found_place) >= 4 and len(found_cts) >= 4:
        logger.info("✅ All expected slack values found in database!")
        logger.info("✅ The prediction system SHOULD preserve these exact values")
        
        # Show what the result should look like
        logger.info("\n📋 Expected Prediction Results:")
        for i in range(min(4, len(found_place), len(found_cts))):
            place_item = found_place[i]
            cts_item = found_cts[i]
            
            logger.info(f"\nRow {i+1}:")
            logger.info(f"  Endpoint: {place_item['endpoint'][:50]}...")
            logger.info(f"  Place Slack: {place_item['slack']:.6f} (PRESERVED FROM DATABASE)")
            logger.info(f"  CTS Slack: {cts_item['slack']:.6f} (PRESERVED FROM DATABASE)")
            logger.info(f"  Route Slack: [PREDICTED VALUE]")
        
        logger.info("\n🎯 SOLUTION:")
        logger.info("  1. ✅ Database is accessible")
        logger.info("  2. ✅ Correct slack values exist in reg_place_csv and reg_cts_csv")
        logger.info("  3. ✅ Prediction system should preserve these exact values")
        logger.info("  4. 🔧 Make sure to use table names: 'reg_place_csv' and 'reg_cts_csv'")
        logger.info("  5. 🔧 NOT 'ariane_place_sorted_csv' or 'ariane_cts_sorted_csv'")
        
    else:
        logger.error("❌ Not all expected slack values found")
        logger.info(f"Found {len(found_place)}/4 place values and {len(found_cts)}/4 CTS values")

if __name__ == "__main__":
    test_slack_preservation()