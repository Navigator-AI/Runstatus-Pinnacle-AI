import psycopg2

# Database Configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'copilot',
    'user': 'postgres',
    'password': 'Welcom@123',
    'port': '5432'
}

def get_connection():
    """Create and return a database connection"""
    try:
        print("Attempting to connect to database...")
        conn = psycopg2.connect(
            host=DB_CONFIG['host'],
            database=DB_CONFIG['database'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            port=DB_CONFIG['port']
        )
        print("Database connection successful")
        return conn
    except Exception as e:
        print(f"Database connection failed: {str(e)}")
        raise Exception(f"Database connection failed: {str(e)}")

def main():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get all tables
        print("Getting list of all tables...")
        tables_query = """
            SELECT 
                table_name 
            FROM 
                information_schema.tables 
            WHERE 
                table_schema = 'public'
        """
        cursor.execute(tables_query)
        tables = cursor.fetchall()
        
        if not tables:
            print("No tables found in the database.")
            return
        
        table_names = [table[0] for table in tables]
        print(f"\nFound {len(table_names)} tables in the database:")
        for i, table in enumerate(table_names, 1):
            print(f"{i}. {table}")
        
        # Show sample data from each table (up to 20 rows per table)
        print("\n" + "="*50)
        print("SAMPLE DATA FROM EACH TABLE")
        print("="*50)
        
        for table in table_names:
            print(f"\nTable: {table}")
            print("-" * 30)
            
            try:
                # Get column information
                columns_query = f"""
                    SELECT 
                        column_name, data_type
                    FROM 
                        information_schema.columns
                    WHERE 
                        table_schema = 'public' AND table_name = '{table}'
                """
                cursor.execute(columns_query)
                columns = cursor.fetchall()
                
                print("Columns:")
                for column in columns:
                    print(f"  - {column[0]} ({column[1]})")
                
                # Get sample data
                sample_query = f"SELECT * FROM {table} LIMIT 20"
                cursor.execute(sample_query)
                rows = cursor.fetchall()
                
                if rows:
                    print("\nSample data (up to 20 rows):")
                    # Get column names for this query
                    col_names = [desc[0] for desc in cursor.description]
                    print("| " + " | ".join(col_names) + " |")
                    print("| " + " | ".join(["---" for _ in col_names]) + " |")
                    
                    # Print each row
                    for row in rows:
                        print("| " + " | ".join(str(val) for val in row) + " |")
                    
                    # Get row count
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cursor.fetchone()[0]
                    print(f"\nTotal rows in table: {count}")
                else:
                    print("\nNo data in this table.")
            except Exception as e:
                print(f"Error getting data for table {table}: {str(e)}")
            
            print("\n" + "="*50)
        
        cursor.close()
        conn.close()
    
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()