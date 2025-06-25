#!/usr/bin/env python3
"""
Database inspection script to check actual slack values
"""

import os
import sys
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_database_connection():
    """Get database connection using environment variables"""
    try:
        # Try to get database URL from environment
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            # Fallback to individual components
            db_host = os.getenv('DB_HOST', 'localhost')
            db_port = os.getenv('DB_PORT', '5432')
            db_name = os.getenv('DB_NAME', 'slack_prediction')
            db_user = os.getenv('DB_USER', 'postgres')
            db_password = os.getenv('DB_PASSWORD', 'password')
            
            database_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        
        logger.info(f"Connecting to database: {database_url.split('@')[1] if '@' in database_url else 'local'}")
        engine = create_engine(database_url)
        return engine
    except Exception as e:
        logger.error(f"Failed to create database connection: {e}")
        return None

def inspect_tables(engine):
    """Inspect available tables and their data"""
    try:
        with engine.connect() as conn:
            # Get all table names
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """))
            
            tables = [row[0] for row in result]
            logger.info(f"Found {len(tables)} tables: {tables}")
            
            # Check each table for slack data
            for table_name in tables:
                if any(keyword in table_name.lower() for keyword in ['place', 'cts', 'route']):
                    logger.info(f"\n=== Inspecting table: {table_name} ===")
                    
                    # Get table structure
                    result = conn.execute(text(f"""
                        SELECT column_name, data_type 
                        FROM information_schema.columns 
                        WHERE table_name = '{table_name}'
                        ORDER BY ordinal_position;
                    """))
                    
                    columns = [(row[0], row[1]) for row in result]
                    logger.info(f"Columns: {columns}")
                    
                    # Get sample data
                    result = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 5;"))
                    rows = result.fetchall()
                    column_names = result.keys()
                    
                    logger.info(f"Sample data ({len(rows)} rows):")
                    for i, row in enumerate(rows):
                        row_dict = dict(zip(column_names, row))
                        logger.info(f"  Row {i+1}: {row_dict}")
                        
                        # Check for slack values
                        if 'slack' in row_dict:
                            logger.info(f"    -> Slack value: {row_dict['slack']}")
            
    except Exception as e:
        logger.error(f"Error inspecting tables: {e}")

def main():
    """Main inspection function"""
    logger.info("🔍 Database Inspection Tool")
    logger.info("=" * 50)
    
    # Try to connect to database
    engine = get_database_connection()
    if not engine:
        logger.error("❌ Could not connect to database")
        logger.info("💡 This explains why you're seeing different slack values!")
        logger.info("💡 The system might be using cached/mock data instead of real database values")
        return
    
    try:
        # Test connection
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1;"))
            logger.info("✅ Database connection successful")
        
        # Inspect tables
        inspect_tables(engine)
        
    except OperationalError as e:
        logger.error(f"❌ Database connection failed: {e}")
        logger.info("💡 This explains the issue - database is not accessible!")
        logger.info("💡 The system is likely using fallback/mock data")
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
    finally:
        if engine:
            engine.dispose()

if __name__ == "__main__":
    main()