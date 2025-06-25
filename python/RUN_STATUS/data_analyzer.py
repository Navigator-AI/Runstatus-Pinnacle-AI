"""
Data Analyzer Module - Model-based approach for analyzing data structure
This module uses LLM to analyze header columns and data patterns to generate tree structures
"""

import pandas as pd
import json
import logging
import re
from typing import Dict, List, Any, Optional, Tuple
import requests

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "mistral"

class DataStructureAnalyzer:
    """Analyzes data structure using LLM to identify patterns and relationships"""
    
    def __init__(self):
        self.column_mappings = {}
        self.stage_order = []
        self.stage_colors = {}
        self.data_patterns = {}
    
    def analyze_headers(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Analyze header columns to identify data structure patterns"""
        try:
            headers = list(df.columns)
            sample_data = df.head(10).to_dict('records')
            
            # Create prompt for LLM to analyze the data structure
            prompt = f"""
            Analyze the following dataset headers and sample data to identify the data structure pattern:
            
            Headers: {headers}
            
            Sample Data (first 10 rows):
            {json.dumps(sample_data, indent=2)}
            
            Based on this data, identify:
            1. Which column represents the user/entity identifier
            2. Which column represents the run/iteration identifier  
            3. Which column represents the stage/process step
            4. What are the unique stages and their logical order
            5. What are the unique runs and their pattern
            6. How do the stages flow from one to another
            
            Respond with a JSON object in this exact format:
            {{
                "user_column": "column_name_for_user",
                "run_column": "column_name_for_run", 
                "stage_column": "column_name_for_stage",
                "stages": [
                    {{
                        "name": "stage_name",
                        "order": 0,
                        "color": "#hex_color",
                        "description": "stage description"
                    }}
                ],
                "run_pattern": {{
                    "prefix": "r",
                    "format": "r1, r2, r3...",
                    "description": "run naming pattern"
                }},
                "flow_logic": {{
                    "description": "how stages connect to each other",
                    "rules": [
                        "rule1: description",
                        "rule2: description"
                    ]
                }}
            }}
            """
            
            response = self._get_model_response(prompt)
            if not response:
                return self._fallback_analysis(df)
            
            try:
                analysis = self._clean_json_response(response)
                return self._validate_analysis(analysis, df)
            except Exception as e:
                logger.warning(f"Failed to parse LLM response: {e}")
                return self._fallback_analysis(df)
                
        except Exception as e:
            logger.error(f"Error in header analysis: {e}")
            return self._fallback_analysis(df)
    
    def _get_model_response(self, prompt: str) -> Optional[str]:
        """Get response from Ollama model"""
        try:
            logger.info("Sending request to Ollama model for data analysis...")
            response = requests.post(OLLAMA_URL, json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False
            }, timeout=60)
            
            response.raise_for_status()
            result = response.json().get("response", "")
            logger.info("Received response from model")
            return result
        except requests.exceptions.Timeout:
            logger.error("Model request timed out")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling Ollama API: {str(e)}")
            return None
    
    def _clean_json_response(self, response: str) -> Dict[str, Any]:
        """Clean and extract JSON from model response"""
        try:
            # First try direct JSON parsing
            return json.loads(response)
        except json.JSONDecodeError:
            # Clean up the response
            cleaned = response
            
            # Remove markdown code blocks
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1]
            if "```" in cleaned:
                cleaned = cleaned.split("```")[0]
                
            # Remove any comments (both // and /* */ style)
            cleaned = re.sub(r'//.*?\n|/\*.*?\*/', '', cleaned, flags=re.DOTALL)
            
            # Remove any leading/trailing whitespace and newlines
            cleaned = cleaned.strip()
            
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                # If still failing, try to extract just the JSON object
                try:
                    start = cleaned.find('{')
                    end = cleaned.rfind('}') + 1
                    if start >= 0 and end > start:
                        json_str = cleaned[start:end]
                        return json.loads(json_str)
                except:
                    pass
                raise ValueError("Could not extract valid JSON from response")
    
    def _validate_analysis(self, analysis: Dict[str, Any], df: pd.DataFrame) -> Dict[str, Any]:
        """Validate the analysis results against actual data"""
        try:
            # Check if identified columns exist
            user_col = analysis.get("user_column")
            run_col = analysis.get("run_column") 
            stage_col = analysis.get("stage_column")
            
            if not all(col in df.columns for col in [user_col, run_col, stage_col]):
                logger.warning("LLM identified columns not found in data, using fallback")
                return self._fallback_analysis(df)
            
            # Validate stages exist in data
            identified_stages = [s["name"] for s in analysis.get("stages", [])]
            actual_stages = set(df[stage_col].unique())
            
            if not set(identified_stages).issubset(actual_stages):
                logger.warning("LLM identified stages don't match data, adjusting...")
                # Update stages to match actual data
                missing_stages = actual_stages - set(identified_stages)
                for i, stage in enumerate(missing_stages):
                    analysis["stages"].append({
                        "name": stage,
                        "order": len(analysis["stages"]),
                        "color": self._generate_color(len(analysis["stages"])),
                        "description": f"Auto-detected stage: {stage}"
                    })
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error validating analysis: {e}")
            return self._fallback_analysis(df)
    
    def _fallback_analysis(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Fallback analysis when LLM fails"""
        logger.info("Using fallback analysis...")
        
        # Try to identify columns by common patterns
        columns = df.columns.tolist()
        user_col = None
        run_col = None
        stage_col = None
        
        # Look for user column (common names)
        user_patterns = ['user', 'name', 'person', 'entity', 'id']
        for col in columns:
            if any(pattern in col.lower() for pattern in user_patterns):
                user_col = col
                break
        
        # Look for run column (contains 'run' or has r1, r2 pattern)
        for col in columns:
            if 'run' in col.lower():
                run_col = col
                break
            # Check if column values match run pattern
            sample_values = df[col].astype(str).str.lower().unique()[:5]
            if any(re.match(r'^r\d+', val) for val in sample_values):
                run_col = col
                break
        
        # Look for stage column (remaining column or contains 'stage')
        for col in columns:
            if col not in [user_col, run_col]:
                if 'stage' in col.lower() or 'step' in col.lower() or 'phase' in col.lower():
                    stage_col = col
                    break
        
        # If still not found, use remaining column
        if not stage_col:
            remaining_cols = [col for col in columns if col not in [user_col, run_col]]
            if remaining_cols:
                stage_col = remaining_cols[0]
        
        # Default fallback if nothing found
        if not all([user_col, run_col, stage_col]):
            if len(columns) >= 3:
                user_col, run_col, stage_col = columns[:3]
            else:
                raise ValueError("Cannot identify required columns in data")
        
        # Get unique stages and assign colors
        unique_stages = df[stage_col].unique()
        stages = []
        for i, stage in enumerate(unique_stages):
            stages.append({
                "name": stage,
                "order": i,
                "color": self._generate_color(i),
                "description": f"Stage: {stage}"
            })
        
        return {
            "user_column": user_col,
            "run_column": run_col,
            "stage_column": stage_col,
            "stages": stages,
            "run_pattern": {
                "prefix": "r",
                "format": "r1, r2, r3...",
                "description": "Sequential run pattern"
            },
            "flow_logic": {
                "description": "Sequential stage flow within runs, with cross-run connections",
                "rules": [
                    "Stages flow sequentially within each run",
                    "Later runs connect back to earlier stages of previous runs"
                ]
            }
        }
    
    def _generate_color(self, index: int) -> str:
        """Generate color for stage based on index"""
        colors = [
            "#4A90E2",  # Blue
            "#50C878",  # Emerald Green  
            "#FFD700",  # Gold
            "#FF6B6B",  # Coral Red
            "#9B59B6",  # Purple
            "#FF8C00",  # Dark Orange
            "#20B2AA",  # Light Sea Green
            "#DC143C",  # Crimson
            "#4169E1",  # Royal Blue
            "#32CD32"   # Lime Green
        ]
        return colors[index % len(colors)]
    
    def generate_layout_structure(self, df: pd.DataFrame, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Generate layout structure based on analysis"""
        try:
            user_col = analysis["user_column"]
            run_col = analysis["run_column"] 
            stage_col = analysis["stage_column"]
            stages_config = {s["name"]: s for s in analysis["stages"]}
            
            # Calculate layout parameters
            num_users = len(df[user_col].unique())
            max_runs_per_user = df.groupby(user_col)[run_col].nunique().max()
            
            layout_width = max(2000, (len(stages_config) + 1) * 250 * 1.2)
            layout_height = max(1500, (num_users * max_runs_per_user * 200) * 1.2)
            
            layout_data = {
                "nodes": [],
                "connections": [],
                "layout": {
                    "width": layout_width,
                    "height": layout_height,
                    "background": {
                        "color": "black",
                        "gridSize": 50,
                        "gridColor": "gray", 
                        "gridOpacity": 0.3
                    },
                    "stage_colors": {stage: config["color"] for stage, config in stages_config.items()}
                },
                "analysis": analysis  # Include analysis for reference
            }
            
            # Process each user's data
            y_offset = 100
            for user in sorted(df[user_col].unique()):
                user_data = df[df[user_col] == user]
                
                # Get runs data
                runs_data = {}
                for _, row in user_data.iterrows():
                    run = str(row[run_col])
                    stage = str(row[stage_col])
                    
                    if stage not in stages_config:
                        logger.warning(f"Unknown stage '{stage}' found, skipping...")
                        continue
                    
                    if run not in runs_data:
                        runs_data[run] = {'stages': set(), 'first_stage': None, 'last_stage': None}
                    
                    runs_data[run]['stages'].add(stage)
                    
                    # Track first and last stage
                    stage_order = stages_config[stage]['order']
                    if runs_data[run]['first_stage'] is None or stage_order < stages_config[runs_data[run]['first_stage']]['order']:
                        runs_data[run]['first_stage'] = stage
                    if runs_data[run]['last_stage'] is None or stage_order > stages_config[runs_data[run]['last_stage']]['order']:
                        runs_data[run]['last_stage'] = stage
                
                # Sort runs (try numeric sort if possible)
                try:
                    sorted_runs = sorted(runs_data.keys(), key=lambda x: int(re.findall(r'\d+', x)[0]) if re.findall(r'\d+', x) else 0)
                except:
                    sorted_runs = sorted(runs_data.keys())
                
                # Add Synth/Start node (use first stage name as start)
                first_stage_name = min(stages_config.keys(), key=lambda x: stages_config[x]['order'])
                synth_node = {
                    "id": f"start_{user}",
                    "label": first_stage_name,
                    "x": 50,
                    "y": y_offset + (len(sorted_runs) * 200) / 2,
                    "type": "synth",
                    "user": user,
                    "tree_id": f"tree_{user}",
                    "style": {
                        "width": 140,
                        "height": 50,
                        "fill": stages_config[first_stage_name]["color"],
                        "stroke": "white",
                        "strokeWidth": 2,
                        "cornerRadius": 5,
                        "fontSize": 12,
                        "textColor": "white"
                    }
                }
                layout_data["nodes"].append(synth_node)
                
                # Process each run
                node_map = {}
                for run_idx, run in enumerate(sorted_runs):
                    current_y = y_offset + (run_idx * 200)
                    run_data = runs_data[run]
                    stages = sorted(run_data['stages'], key=lambda x: stages_config[x]['order'])
                    
                    # Add nodes for each stage
                    prev_node = None
                    for stage in stages:
                        stage_config = stages_config[stage]
                        node_id = f"{run}_{stage}_{user}"
                        
                        x_pos = 250 + (stage_config['order'] * 250)
                        
                        node = {
                            "id": node_id,
                            "label": node_id,
                            "x": x_pos,
                            "y": current_y,
                            "type": "stage",
                            "stage": stage,
                            "user": user,
                            "tree_id": f"tree_{user}",
                            "style": {
                                "width": 140,
                                "height": 50,
                                "fill": stage_config["color"],
                                "stroke": "white",
                                "strokeWidth": 2,
                                "cornerRadius": 5,
                                "fontSize": 12,
                                "textColor": "white"
                            }
                        }
                        layout_data["nodes"].append(node)
                        node_map[node_id] = node
                        
                        # Connect to previous stage in same run
                        if prev_node:
                            layout_data["connections"].append({
                                "from": prev_node["id"],
                                "to": node["id"],
                                "type": "straight",
                                "tree_id": f"tree_{user}",
                                "style": {
                                    "stroke": "white",
                                    "strokeWidth": 2,
                                    "arrowSize": 8
                                }
                            })
                        elif self._is_first_run(run, sorted_runs):
                            # Connect first stage of first run to start node
                            layout_data["connections"].append({
                                "from": synth_node["id"],
                                "to": node["id"],
                                "type": "straight",
                                "tree_id": f"tree_{user}",
                                "style": {
                                    "stroke": "white",
                                    "strokeWidth": 2,
                                    "arrowSize": 8
                                }
                            })
                        
                        prev_node = node
                    
                    # Connect to previous run if not first run
                    if not self._is_first_run(run, sorted_runs) and run_idx > 0:
                        prev_run = sorted_runs[run_idx - 1]
                        prev_run_data = runs_data[prev_run]
                        
                        # Find connection point
                        current_first_stage_order = stages_config[run_data['first_stage']]['order']
                        connection_stage = None
                        
                        # Find stage in previous run that comes before current run's first stage
                        for stage in prev_run_data['stages']:
                            if stages_config[stage]['order'] < current_first_stage_order:
                                if not connection_stage or stages_config[stage]['order'] > stages_config[connection_stage]['order']:
                                    connection_stage = stage
                        
                        if connection_stage:
                            from_node_id = f"{prev_run}_{connection_stage}_{user}"
                            to_node_id = f"{run}_{run_data['first_stage']}_{user}"
                            
                            layout_data["connections"].append({
                                "from": from_node_id,
                                "to": to_node_id,
                                "type": "curved",
                                "tree_id": f"tree_{user}",
                                "style": {
                                    "stroke": "white",
                                    "strokeWidth": 2,
                                    "arrowSize": 8
                                }
                            })
                
                # Update y_offset for next user
                y_offset += (len(sorted_runs) * 200) + 400
            
            return layout_data
            
        except Exception as e:
            logger.error(f"Error generating layout structure: {e}")
            raise ValueError(f"Failed to generate layout: {str(e)}")
    
    def _is_first_run(self, run: str, sorted_runs: List[str]) -> bool:
        """Check if this is the first run"""
        return run == sorted_runs[0] if sorted_runs else False

# Main function to be called from app.py
def analyze_and_generate_layout(df: pd.DataFrame) -> Dict[str, Any]:
    """Main function to analyze data and generate layout"""
    try:
        analyzer = DataStructureAnalyzer()
        
        # Analyze the data structure
        logger.info("Analyzing data structure...")
        analysis = analyzer.analyze_headers(df)
        
        # Generate layout based on analysis
        logger.info("Generating layout structure...")
        layout_data = analyzer.generate_layout_structure(df, analysis)
        
        logger.info(f"Successfully generated layout with {len(layout_data['nodes'])} nodes")
        return layout_data
        
    except Exception as e:
        logger.error(f"Error in analyze_and_generate_layout: {e}")
        raise ValueError(f"Failed to analyze and generate layout: {str(e)}")