from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import logging
import re
import requests
import os
import time
from consistent_query_handler import ConsistentQueryHandler

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database Configuration
DB_CONFIG = {
    'host': '172.16.16.54',
    'database': 'qor',
    'user': 'postgres',
    'password': 'root',
    'port': '5432'
}

# Ollama Configuration
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mistral"

# Create the consistent query handler
query_handler = ConsistentQueryHandler()

# FastAPI App Setup
app = FastAPI(
    title="Consistent QOR SQL Executor API",
    description="API for executing consistent SQL queries on QOR database using natural language",
    version="1.1.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

def get_connection_with_retry(max_retries=3, retry_delay=2):
    """Get database connection with retry logic"""
    retries = 0
    last_error = None
    
    while retries < max_retries:
        try:
            logger.info(f"Connection attempt {retries+1}/{max_retries}")
            conn = psycopg2.connect(
                host=DB_CONFIG['host'],
                database=DB_CONFIG['database'],
                user=DB_CONFIG['user'],
                password=DB_CONFIG['password'],
                port=DB_CONFIG['port'],
                connect_timeout=10  # Timeout after 10 seconds
            )
            logger.info("Database connection successful")
            return conn
        except Exception as e:
            last_error = e
            logger.warning(f"Connection attempt failed: {str(e)}")
            retries += 1
            time.sleep(retry_delay)
    
    logger.error(f"All connection attempts failed: {str(last_error)}")
    raise last_error

def execute_sql(query: str) -> pd.DataFrame:
    """Execute SQL query and return results as pandas DataFrame"""
    conn = None
    try:
        logger.info(f"Executing query: {query}")
        conn = get_connection_with_retry()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query)
        results = cursor.fetchall()
        
        # Convert to DataFrame
        df = pd.DataFrame(results) if results else pd.DataFrame()
        if not df.empty:
            logger.info(f"Query returned {len(df)} rows with columns: {list(df.columns)}")
            logger.info(f"First row sample: {df.iloc[0].to_dict() if len(df) > 0 else 'No data'}")
        else:
            logger.warning("Query returned no results")
        
        return df
    except Exception as e:
        logger.error(f"Failed to execute query: {str(e)}")
        raise Exception(f"Failed to execute query: {str(e)}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed")

def process_natural_language_query(query_text):
    """Process natural language query to generate consistent SQL"""
    # First check if it's a direct SQL query
    if query_text.strip().lower().startswith("select "):
        logger.info("Direct SQL query detected")
        return query_text
    
    # Use the consistent query handler
    query_type = query_handler.get_query_type(query_text)
    logger.info(f"Query type detected: {query_type}")
    
    # Generate SQL based on query type
    if query_type == "prediction":
        # Special handling for prediction queries
        metrics = query_handler.extract_metrics(query_text)
        logger.info(f"Prediction query for metrics: {metrics}")
        
        # For prediction queries, always use the same column selection regardless of order
        # This ensures consistent results
        sql = "SELECT design, stage, "
        
        # Always include these metrics in the same order for prediction queries
        if 'place' in metrics or 'cts' in metrics or 'route' in metrics:
            sql += "place_setup_WNS, place_hold_WNS, "
            sql += "cts_setup_WNS, cts_hold_WNS, "
            sql += "route_setup_WNS, route_hold_WNS "
        else:
            sql += "* "
            
        sql += f"FROM {query_handler.DEFAULT_TABLE} "
        sql += "ORDER BY design, stage LIMIT 100;"
        
        logger.info(f"Generated prediction SQL: {sql}")
        return sql
    else:
        # Use the standard consistent SQL generator
        return query_handler.generate_consistent_sql(query_text)

def format_dataframe_as_markdown(df: pd.DataFrame) -> str:
    """Format DataFrame as a markdown table"""
    if df.empty:
        return "No data found."
    
    # Create table header
    table = "| " + " | ".join(df.columns) + " |\n"
    table += "| " + " | ".join(["---"] * len(df.columns)) + " |\n"
    
    # Add table rows
    for _, row in df.iterrows():
        values = []
        for col in df.columns:
            val = row[col]
            if val is None:
                values.append("NULL")
            elif isinstance(val, (dict, list)):
                values.append(str(val).replace("|", "\\|"))
            else:
                values.append(str(val).replace("|", "\\|"))
        table += "| " + " | ".join(values) + " |\n"
    
    return table

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
            )
            
        logger.info(f"Received natural language query: {query}")
        
        # Process natural language query to generate consistent SQL
        sql_query = process_natural_language_query(query)
        logger.info(f"Generated SQL: {sql_query}")
        
        # Execute query
        df = execute_sql(sql_query)
        
        # Format as markdown table
        if df.empty:
            logger.warning(f"No data found for query: {query}")
            markdown_table = "No data found."
        else:
            markdown_table = format_dataframe_as_markdown(df)
        
        # Add query information
        markdown_table += f"\n\n*Executed query: `{sql_query}`*"
        markdown_table += f"\n*Query returned {len(df)} rows*"
        
        # Prepare response
        response_data = {
            "data": markdown_table,
            "columns": df.columns.tolist() if not df.empty else [],
            "rowCount": len(df),
            "executedQuery": sql_query
        }
        
        logger.info(f"Returning response for query '{query}' with {len(df)} rows")
        return JSONResponse(
            content=jsonable_encoder(response_data),
        )
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "data": f"Error: {str(e)}"},
        )

@app.get("/")
async def root():
    """Health check endpoint"""
    try:
        conn = get_connection_with_retry(max_retries=1)
        conn.close()
        return JSONResponse(
            content={"status": "healthy", "service": "consistent-qor-chat2sql", "database": "connected"},
        )
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"status": "unhealthy", "service": "consistent-qor-chat2sql", "error": str(e)},
        )

if __name__ == "__main__":
    logger.info("Starting Consistent QOR Chat2SQL API server...")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)