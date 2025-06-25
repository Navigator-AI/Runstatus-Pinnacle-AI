#!/usr/bin/env python3
"""
Check actual data in place and CTS tables
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

def check_table_data():
    """Check actual slack values in place and CTS tables"""
    try:
        # Create database connection
        database_url = f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
        engine = create_engine(database_url, connect_args={"connect_timeout": 10})
        
        with engine.connect() as connection:
            # Check place tables
            place_tables = ['reg_place_csv', 'ariane_place_sorted_csv']
            cts_tables = ['reg_cts_csv', 'ariane_cts_sorted_csv']
            
            for table_name in place_tables:
                logger.info(f"\n=== PLACE TABLE: {table_name} ===")
                
                # Check if table exists
                result = connection.execute(text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"))
                exists = result.scalar()
                
                if not exists:
                    logger.warning(f"❌ Table {table_name} does not exist")
                    continue
                
                # Get row count
                result = connection.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                count = result.scalar()
                logger.info(f"📊 Table has {count} rows")
                
                # Get sample slack values
                result = connection.execute(text(f"SELECT endpoint, slack FROM {table_name} ORDER BY slack DESC LIMIT 10"))
                rows = result.fetchall()
                
                logger.info(f"🔍 Top 10 slack values:")
                for i, (endpoint, slack) in enumerate(rows):
                    logger.info(f"  {i+1}. Endpoint: {endpoint[:60]}... | Slack: {slack:.6f}")
                
                # Check for your expected values
                expected_slacks = [-0.63269, -0.63215, -0.63195, -0.63138]
                for expected in expected_slacks:
                    result = connection.execute(text(f"SELECT COUNT(*) FROM {table_name} WHERE ABS(slack - {expected}) < 0.00001"))
                    matches = result.scalar()
                    if matches > 0:
                        logger.info(f"✅ Found {matches} rows with slack ≈ {expected}")
                        # Get the actual matching rows
                        result = connection.execute(text(f"SELECT endpoint, slack FROM {table_name} WHERE ABS(slack - {expected}) < 0.00001 LIMIT 3"))
                        matching_rows = result.fetchall()
                        for endpoint, slack in matching_rows:
                            logger.info(f"    Match: {endpoint[:50]}... | Slack: {slack:.6f}")
                    else:
                        logger.warning(f"❌ No rows found with slack ≈ {expected}")
            
            for table_name in cts_tables:
                logger.info(f"\n=== CTS TABLE: {table_name} ===")
                
                # Check if table exists
                result = connection.execute(text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"))
                exists = result.scalar()
                
                if not exists:
                    logger.warning(f"❌ Table {table_name} does not exist")
                    continue
                
                # Get row count
                result = connection.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                count = result.scalar()
                logger.info(f"📊 Table has {count} rows")
                
                # Get sample slack values
                result = connection.execute(text(f"SELECT endpoint, slack FROM {table_name} ORDER BY slack DESC LIMIT 10"))
                rows = result.fetchall()
                
                logger.info(f"🔍 Top 10 slack values:")
                for i, (endpoint, slack) in enumerate(rows):
                    logger.info(f"  {i+1}. Endpoint: {endpoint[:60]}... | Slack: {slack:.6f}")
                
                # Check for your expected values
                expected_slacks = [-0.64921, -0.60917, -0.61738, -0.65726]
                for expected in expected_slacks:
                    result = connection.execute(text(f"SELECT COUNT(*) FROM {table_name} WHERE ABS(slack - {expected}) < 0.00001"))
                    matches = result.scalar()
                    if matches > 0:
                        logger.info(f"✅ Found {matches} rows with slack ≈ {expected}")
                        # Get the actual matching rows
                        result = connection.execute(text(f"SELECT endpoint, slack FROM {table_name} WHERE ABS(slack - {expected}) < 0.00001 LIMIT 3"))
                        matching_rows = result.fetchall()
                        for endpoint, slack in matching_rows:
                            logger.info(f"    Match: {endpoint[:50]}... | Slack: {slack:.6f}")
                    else:
                        logger.warning(f"❌ No rows found with slack ≈ {expected}")
        
    except Exception as e:
        logger.error(f"❌ Error checking table data: {e}")

if __name__ == "__main__":
    logger.info("🔍 Checking Actual Table Data")
    logger.info("=" * 60)
    check_table_data()