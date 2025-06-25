import re
import logging
import pandas as pd
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DynamicQueryHandler:
    """
    Dynamic query handler that ensures consistent results regardless of query order.
    This class dynamically discovers database schema and adapts to available tables and columns.
    """
    
    def __init__(self, db_config):
        """
        Initialize the query handler with database configuration
        
        Args:
            db_config: Dictionary with database connection parameters
        """
        self.db_config = db_config
        self.metric_mappings = {}
        self.metric_columns = {}
        self.default_table = None
        self.discovered_tables = []
        self.discovered_schema = {}
        
        # Initialize schema
        self._discover_schema()
    
    def _get_connection(self, max_retries=3):
        """Get database connection with retry logic"""
        retries = 0
        last_error = None
        
        while retries < max_retries:
            try:
                conn = psycopg2.connect(
                    host=self.db_config['host'],
                    database=self.db_config['database'],
                    user=self.db_config['user'],
                    password=self.db_config['password'],
                    port=self.db_config['port'],
                    connect_timeout=5
                )
                return conn
            except Exception as e:
                last_error = e
                logger.warning(f"Connection attempt {retries+1} failed: {str(e)}")
                retries += 1
                time.sleep(2)
        
        raise last_error

    def _discover_schema(self):
        """Discover database schema dynamically"""
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get list of tables
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """)
            
            tables = [row['table_name'] for row in cursor.fetchall()]
            self.discovered_tables = tables
            
            # If no tables found, log warning
            if not tables:
                logger.warning("No tables found in database schema")
                return
            
            # Set default table to the first QOR-related table if exists
            qor_tables = [t for t in tables if 'qor' in t.lower()]
            self.default_table = qor_tables[0] if qor_tables else tables[0]
            logger.info(f"Using default table: {self.default_table}")
            
            # Build schema for each table
            for table in tables:
                # Get columns for this table
                cursor.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s
                    ORDER BY ordinal_position
                """, (table,))
                
                columns = [row['column_name'] for row in cursor.fetchall()]
                self.discovered_schema[table] = columns
                
                # Analyze columns to detect metrics
                self._analyze_table_metrics(table, columns)
            
            conn.close()
            logger.info(f"Schema discovery complete. Found {len(tables)} tables.")
            
        except Exception as e:
            logger.error(f"Error discovering schema: {str(e)}")
            # Set minimal defaults
            self.default_table = "qor_metrics"
    
    def _analyze_table_metrics(self, table, columns):
        """
        Analyze table columns to discover metrics and build mappings
        
        Args:
            table: Table name
            columns: List of column names
        """
        # Look for timing/slack related columns
        timing_columns = [col for col in columns if any(term in col.lower() for term in 
                          ['wns', 'tns', 'slack', 'setup', 'hold', 'timing'])]
        
        if not timing_columns:
            return
        
        # Extract metric prefixes (e.g., place, cts, route)
        metric_prefixes = set()
        for col in timing_columns:
            # Try to extract prefix before underscores or known terms
            match = re.match(r'^([a-z_]+?)_(setup|hold|wns|tns|slack)', col.lower())
            if match:
                prefix = match.group(1)
                metric_prefixes.add(prefix)
        
        # For each identified prefix, create mappings and collect columns
        for prefix in metric_prefixes:
            # Add to metric mappings
            variations = [prefix, f"{prefix}_slack", f"{prefix}_timing"]
            self.metric_mappings[prefix] = variations
            
            # Collect columns for this metric
            metric_cols = ['design', 'stage'] if 'design' in columns and 'stage' in columns else []
            metric_cols.extend([col for col in columns if col.lower().startswith(f"{prefix}_")])
            
            if metric_cols:
                self.metric_columns[prefix] = metric_cols
                logger.info(f"Discovered metric '{prefix}' with columns: {metric_cols}")
    
    def execute_query(self, query):
        """Execute an SQL query and return the results as DataFrame"""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            logger.info(f"Executing query: {query}")
            cursor.execute(query)
            results = cursor.fetchall()
            df = pd.DataFrame(results) if results else pd.DataFrame()
            return df
        except Exception as e:
            logger.error(f"Error executing query: {str(e)}")
            raise e
        finally:
            if conn:
                conn.close()
    
    def extract_metrics(self, query_text):
        """Extract mentioned metrics from query text"""
        query_lower = query_text.lower()
        found_metrics = set()
        
        # Check for each known metric and its variations
        for metric, variations in self.metric_mappings.items():
            for variation in variations:
                if variation in query_lower or f"{variation}s" in query_lower:
                    found_metrics.add(metric)
                    break
        
        # Also check for any direct mentions of column names
        for table, columns in self.discovered_schema.items():
            for column in columns:
                # Check if column name is directly mentioned
                if column.lower() in query_lower:
                    # Try to extract the metric prefix
                    match = re.match(r'^([a-z_]+?)_', column.lower())
                    if match and match.group(1) in self.metric_mappings:
                        found_metrics.add(match.group(1))
        
        logger.info(f"Extracted metrics from query: {found_metrics}")
        return list(found_metrics)
    
    def get_query_type(self, query_text):
        """Determine the type of query"""
        query_lower = query_text.lower()
        
        if re.search(r'predict|prediction|forecast|estimate', query_lower):
            return "prediction"
        elif re.search(r'compare|comparison|versus|vs', query_lower):
            return "comparison"
        elif re.search(r'trend|history|historical|over time', query_lower):
            return "trend"
        else:
            return "data_retrieval"
    
    def generate_consistent_sql(self, query_text):
        """Generate consistent SQL query based on natural language input"""
        metrics = self.extract_metrics(query_text)
        query_type = self.get_query_type(query_text)
        
        # If no metrics found, return a generic query
        if not metrics and query_type != "prediction":
            return f"SELECT * FROM {self.default_table} LIMIT 50;"
        
        # For prediction queries, always include all relevant metrics
        if query_type == "prediction":
            # Determine which table has the most metrics
            if not self.metric_columns:
                return f"SELECT * FROM {self.default_table} LIMIT 50;"
            
            # Find the table with the most metrics coverage
            table_scores = {}
            for table in self.discovered_tables:
                # Skip tables without our metrics
                if table not in self.discovered_schema:
                    continue
                
                table_columns = self.discovered_schema[table]
                score = 0
                for metric in metrics:
                    for col in table_columns:
                        if col.lower().startswith(f"{metric}_"):
                            score += 1
                table_scores[table] = score
            
            # Choose the table with the highest score
            target_table = max(table_scores.items(), key=lambda x: x[1])[0] if table_scores else self.default_table
            
            # For prediction, include ALL metric columns for consistency
            all_columns = []
            
            # Always include identifying columns if they exist
            if 'design' in self.discovered_schema.get(target_table, []):
                all_columns.append('design')
            if 'stage' in self.discovered_schema.get(target_table, []):
                all_columns.append('stage')
            
            # Include all columns for the requested metrics
            for metric in self.metric_mappings:
                if metric in metrics or not metrics:  # Include all if no specific metrics requested
                    metric_cols = [col for col in self.discovered_schema.get(target_table, []) 
                                  if col.lower().startswith(f"{metric}_")]
                    all_columns.extend(metric_cols)
            
            # If no specific columns found, return all columns
            if len(all_columns) <= 2:  # Only design and stage or less
                return f"SELECT * FROM {target_table} LIMIT 100;"
            
            # Generate query with consistent column ordering
            query = f"SELECT {', '.join(all_columns)} FROM {target_table}"
            
            # Add ordering for consistency
            if 'design' in all_columns:
                query += " ORDER BY design"
                if 'stage' in all_columns:
                    query += ", stage"
            
            query += " LIMIT 100;"
            return query
        
        # For regular queries, handle based on the metrics
        else:
            # Build columns list
            columns = []
            if metrics:
                # Always include identifying columns if available
                for common_col in ['design', 'stage', 'id', 'name']:
                    for table in self.discovered_schema.values():
                        if common_col in table and common_col not in columns:
                            columns.append(common_col)
                
                # Add columns for each requested metric
                for metric in metrics:
                    if metric in self.metric_columns:
                        for col in self.metric_columns[metric]:
                            if col not in columns:
                                columns.append(col)
            
            # If no specific columns, return all
            if not columns:
                return f"SELECT * FROM {self.default_table} LIMIT 50;"
            
            # Generate SQL
            query = f"SELECT {', '.join(columns)} FROM {self.default_table}"
            
            # Add filtering if needed
            if 'stage' in columns and len(metrics) > 0:
                stages = [f"'{metric}'" for metric in metrics if metric in ['place', 'cts', 'route']]
                if stages:
                    query += f" WHERE stage IN ({', '.join(stages)})"
            
            # Add ordering
            if 'design' in columns:
                query += " ORDER BY design"
                if 'stage' in columns:
                    query += ", stage"
            
            query += " LIMIT 100;"
            return query
    
    def process_query(self, query_text):
        """
        Process a natural language query and return the appropriate SQL
        
        Args:
            query_text: Natural language query from the user
        
        Returns:
            SQL query string
        """
        # Check if it's a direct SQL query
        if query_text.strip().lower().startswith("select "):
            return query_text
        
        # Get query type and metrics
        query_type = self.get_query_type(query_text)
        metrics = self.extract_metrics(query_text)
        
        logger.info(f"Processing query: '{query_text}'")
        logger.info(f"Query type: {query_type}, Metrics: {metrics}")
        
        # Generate SQL using our consistent logic
        sql = self.generate_consistent_sql(query_text)
        logger.info(f"Generated SQL: {sql}")
        
        return sql