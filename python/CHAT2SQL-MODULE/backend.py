from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from typing import List, Dict, Any, Optional
import uvicorn
import asyncio
import logging
import re
import requests
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database Configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'copilot',
    'user': 'postgres',
    'password': 'Welcom@123',
    'port': '5432'
}

# Ollama Configuration
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral"

# FastAPI App Setup
app = FastAPI(
    title="SQL Executor API",
    description="API for executing SQL queries using Ollama for natural language understanding",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]  # Expose all headers
)

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming request: {request.method} {request.url}")
    try:
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Request failed: {str(e)}")
        raise

# Pydantic Models
class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    sql: str
    data: List[Dict[str, Any]]
    columns: List[str]

def get_connection():
    """Create and return a database connection"""
    try:
        logger.info("Attempting to connect to database...")
        conn = psycopg2.connect(
            host=DB_CONFIG['host'],
            database=DB_CONFIG['database'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            port=DB_CONFIG['port']
        )
        logger.info("Database connection successful")
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")
        raise Exception(f"Database connection failed: {str(e)}")

def execute_sql(query: str) -> pd.DataFrame:
    """Execute SQL query and return results as pandas DataFrame"""
    conn = None
    try:
        logger.info(f"Executing query: {query}")
        conn = get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query)
        results = cursor.fetchall()
        df = pd.DataFrame(results)
        logger.info(f"Query executed successfully. Found {len(df)} rows")
        return df
    except Exception as e:
        logger.error(f"Failed to execute query: {str(e)}")
        raise Exception(f"Failed to execute query: {str(e)}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed")

def format_table_list_with_copy(table_names: List[str]) -> str:
    """Format a list of table names with copy option for the frontend.
    
    Args:
        table_names: List of table names to format
        
    Returns:
        Formatted string with special marker for the frontend to parse
    """
    # Create a JSON structure for the frontend to render with copy options
    table_list_data = []
    for name in table_names:
        table_list_data.append({
            "name": name,
            "copyable": True
        })
    
    # Convert to JSON string for the frontend
    formatted_data = json.dumps(table_list_data)
    
    # Add a special marker to indicate this is a table list with copy option
    return "table_list_with_copy\n" + formatted_data

def get_database_schema() -> Dict[str, Any]:
    """Get complete database schema information"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("""
            SELECT 
                t.table_name,
                obj_description(pgc.oid) as table_description,
                pgc.reltuples as row_count
            FROM information_schema.tables t
            JOIN pg_class pgc ON pgc.relname = t.table_name
            WHERE t.table_schema = 'public'
        """)
        tables = [{
            "name": row[0],
            "description": row[1],
            "row_count": row[2]
        } for row in cursor.fetchall()]
        
        # Get columns for each table
        for table in tables:
            cursor.execute("""
                SELECT 
                    column_name,
                    data_type,
                    column_default,
                    is_nullable
                FROM information_schema.columns 
                WHERE table_name = %s 
                AND table_schema = 'public'
            """, (table["name"],))
            table["columns"] = [{
                "name": row[0],
                "type": row[1],
                "default": row[2],
                "nullable": row[3]
            } for row in cursor.fetchall()]
        
        conn.close()
        return {"tables": tables}
    except Exception as e:
        logger.error(f"Error getting database schema: {str(e)}")
        return {"tables": []}

def generate_sql_with_ollama(query: str, schema: Dict[str, Any]) -> str:
    """Generate SQL query from natural language using Ollama."""
    try:
        # Check for table listing queries
        query_lower = query.lower()
        if any(phrase in query_lower for phrase in ["list tables", "show tables", "all tables", "list all tables", "show all tables", "database"]):
            logger.info("Table listing query detected - using direct SQL")
            return """
                SELECT 
                    table_name
                FROM 
                    information_schema.tables
                WHERE 
                    table_schema = 'public'
                    AND table_type = 'BASE TABLE'
                ORDER BY 
                    table_name;
            """
        
        # Prepare the prompt for Ollama
        prompt = f"""Given the following database schema:
{json.dumps(schema, indent=2)}

Generate a valid PostgreSQL SQL query for this question: {query}

Rules:
1. Only use tables that exist in the schema
2. Return valid PostgreSQL syntax
3. Do not include any explanations, only the SQL query
4. Do not use backticks or any special characters
5. Use proper table names from the schema
6. If asking about users, use the correct table name from the schema

SQL Query:"""

        # Call Ollama API
        response = requests.post(
            OLLAMA_API_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False
            }
        )
        
        if response.status_code != 200:
            logger.error(f"Ollama API error: {response.text}")
            raise Exception("Failed to generate SQL query")
            
        result = response.json()
        sql_query = result.get('response', '').strip()
        
        # Clean up the SQL query
        # Remove any markdown code blocks
        sql_query = re.sub(r'```sql|```', '', sql_query)
        # Remove any explanatory text
        sql_query = sql_query.split(';')[0] + ';'
        # Remove any backticks
        sql_query = sql_query.replace('`', '')
        
        logger.info(f"Generated SQL query: {sql_query}")
        return sql_query
        
    except Exception as e:
        logger.error(f"Error generating SQL: {str(e)}")
        raise Exception(f"Failed to generate SQL query: {str(e)}")

@app.post("/chat2sql/execute")
async def execute_query_endpoint(request: Request):
    """Execute a natural language query and return the results."""
    try:
        # Parse request body
        body = await request.json()
        query = body.get('query')
        
        if not query:
            logger.error("No query provided in request")
            return JSONResponse(
                status_code=400,
                content={"detail": "Query parameter is required"},
                headers={"Content-Type": "application/json"}
            )

        logger.info(f"Received natural language query: {query}")
        
        # Get database schema
        schema = get_database_schema()
        
        # Generate SQL using Ollama
        sql_query = generate_sql_with_ollama(query, schema)
        logger.info(f"Generated SQL: {sql_query}")
        
        # Execute query
        df = execute_sql(sql_query)
        
        # Special formatting for table listing queries
        if "table_name" in df.columns and any(phrase in query.lower() for phrase in ["list tables", "show tables", "all tables", "list all tables", "show all tables", "database"]):
            df = df.sort_values("table_name")
            
            # Format table list with copy option for the frontend to parse
            if not df.empty:
                # Get the list of table names and format them with copy option
                table_names = df["table_name"].tolist()
                table = format_table_list_with_copy(table_names)
            else:
                table = "No tables found."
        else:
            # Standard formatting for other queries as markdown table
            if not df.empty:
                # Create table header
                table = "| " + " | ".join(df.columns) + " |\n"
                table += "| " + " | ".join(["---"] * len(df.columns)) + " |\n"
                
                # Add table rows
                for _, row in df.iterrows():
                    table += "| " + " | ".join(str(val) for val in row) + " |\n"
            else:
                table = "No data found."
        
        # Prepare response
        # For table listing queries, use a special format
        if "table_name" in df.columns and any(phrase in query.lower() for phrase in ["list tables", "show tables", "all tables", "list all tables", "show all tables", "database"]):
            response_data = {
                "data": table,
                "columns": ["table_name"],
                "is_table_list": True,
                "has_copy_option": True,
                "table_count": len(df) if not df.empty else 0
            }
        else:
            response_data = {
                "data": table,
                "columns": df.columns.tolist(),
                "is_table_list": False,
                "has_copy_option": False
            }
        
        logger.info(f"Returning response with {len(df)} rows")
        return JSONResponse(
            content=jsonable_encoder(response_data),
            headers={"Content-Type": "application/json"}
        )
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
            headers={"Content-Type": "application/json"}
        )

@app.get("/")
async def root():
    """Health check endpoint"""
    try:
        # Test database connection
        conn = get_connection()
        conn.close()
        return JSONResponse(
            content={"status": "healthy", "service": "sql-executor", "database": "connected"},
            headers={"Content-Type": "application/json"}
        )
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            content={"status": "unhealthy", "service": "sql-executor", "error": str(e)},
            headers={"Content-Type": "application/json"}
        )

if __name__ == "__main__":
    logger.info("Starting SQL Executor API server...")
    uvicorn.run(app, host="0.0.0.0", port=5000)        