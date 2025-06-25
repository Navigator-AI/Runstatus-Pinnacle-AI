#!/usr/bin/env python3
"""
Test database connection from Python
"""

import sys
import logging
from urllib.parse import quote_plus

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration (same as prediction.py)
DB_CONFIG = {
    'dbname': 'algodb',
    'user': 'postgres',
    'password': 'Welcom@123',
    'host': 'localhost',
    'port': '5432',
}

def test_sqlalchemy_connection():
    """Test SQLAlchemy connection"""
    try:
        from sqlalchemy import create_engine, text
        
        # Create database engine with URL-encoded password (same as prediction.py)
        database_url = f"postgresql://{DB_CONFIG['user']}:{quote_plus(DB_CONFIG['password'])}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
        logger.info(f"Testing connection to: {database_url}")
        
        engine = create_engine(
            database_url,
            connect_args={"connect_timeout": 10}
        )
        
        # Test connection
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1 as test"))
            row = result.fetchone()
            logger.info(f"✅ SQLAlchemy connection successful: {row}")
            
            # Check available tables
            result = connection.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name LIKE '%place%' OR table_name LIKE '%cts%' OR table_name LIKE '%route%'
                ORDER BY table_name
            """))
            
            tables = [row[0] for row in result]
            logger.info(f"📊 Found relevant tables: {tables}")
            
            # Check a specific table if it exists
            if tables:
                table_name = tables[0]
                result = connection.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                count = result.scalar()
                logger.info(f"📈 Table '{table_name}' has {count} rows")
                
                # Get sample data
                result = connection.execute(text(f"SELECT * FROM {table_name} LIMIT 3"))
                rows = result.fetchall()
                column_names = result.keys()
                
                logger.info(f"🔍 Sample data from '{table_name}':")
                for i, row in enumerate(rows):
                    row_dict = dict(zip(column_names, row))
                    logger.info(f"  Row {i+1}: {row_dict}")
        
        return True
        
    except ImportError as e:
        logger.error(f"❌ SQLAlchemy not available: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ SQLAlchemy connection failed: {e}")
        return False

def test_psycopg2_connection():
    """Test direct psycopg2 connection"""
    try:
        import psycopg2
        
        # Create connection string
        conn_string = f"host={DB_CONFIG['host']} port={DB_CONFIG['port']} dbname={DB_CONFIG['dbname']} user={DB_CONFIG['user']} password={DB_CONFIG['password']}"
        logger.info(f"Testing psycopg2 connection...")
        
        # Connect
        conn = psycopg2.connect(conn_string)
        cursor = conn.cursor()
        
        # Test query
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        logger.info(f"✅ psycopg2 connection successful: {result}")
        
        cursor.close()
        conn.close()
        return True
        
    except ImportError as e:
        logger.error(f"❌ psycopg2 not available: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ psycopg2 connection failed: {e}")
        return False

def main():
    """Main test function"""
    logger.info("🧪 Testing Database Connection")
    logger.info("=" * 50)
    
    # Test both connection methods
    sqlalchemy_ok = test_sqlalchemy_connection()
    psycopg2_ok = test_psycopg2_connection()
    
    if sqlalchemy_ok:
        logger.info("✅ Database is accessible via SQLAlchemy")
    else:
        logger.error("❌ Database not accessible via SQLAlchemy")
    
    if psycopg2_ok:
        logger.info("✅ Database is accessible via psycopg2")
    else:
        logger.error("❌ Database not accessible via psycopg2")
    
    if not (sqlalchemy_ok or psycopg2_ok):
        logger.error("💥 Database connection completely failed!")
        logger.info("💡 This explains why the prediction server can't access the database")
    else:
        logger.info("🎯 Database connection is working - the issue might be elsewhere")

if __name__ == "__main__":
    main()