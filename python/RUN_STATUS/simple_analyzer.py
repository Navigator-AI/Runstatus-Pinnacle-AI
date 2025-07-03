#!/usr/bin/env python3
"""
Simple AI-powered data analyzer for flow chart generation
Works without pandas dependency issues
"""

import json
import csv
import sys
import os
import requests
from typing import Dict, List, Any, Optional

# Ollama configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "mistral"  # Using Mistral model specifically

def read_csv_data(file_path: str) -> List[Dict[str, Any]]:
    """Read CSV data without pandas"""
    data = []
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                data.append(dict(row))
        return data
    except Exception as e:
        raise ValueError(f"Error reading CSV file: {str(e)}")

def analyze_data_structure(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze data structure using AI with focus on proper flow chart structure"""
    if not data:
        raise ValueError("No data to analyze")
    
    # Get sample data for analysis
    sample_size = min(20, len(data))
    sample_data = data[:sample_size]
    
    # Get column information
    columns = list(data[0].keys()) if data else []
    
    # Create enhanced AI prompt for proper flow chart analysis
    prompt = f"""
    You are an expert in EDA (Electronic Design Automation) flow analysis. Analyze this data to create a proper flow chart structure.
    
    COLUMNS: {columns}
    
    SAMPLE DATA:
    {json.dumps(sample_data, indent=2)}
    
    TOTAL ROWS: {len(data)}
    
    IMPORTANT FLOW CHART RULES:
    1. Identify USER/RUN/STAGE structure (typical EDA flow has users running multiple runs with stages like synth, floorplan, place, cts, route, drc)
    2. Runs should be connected sequentially (run1 → run2 → run3) for each user
    3. Within each run, stages should connect in logical order (synth → floorplan → place → cts → route → drc)
    4. NEVER connect same stages directly (synth to synth should be separate nodes)
    5. Connect runs by: last_stage_of_run1 → first_stage_of_run2
    6. Each user should have separate flow paths
    7. Group nodes by user and run for proper visualization
    
    Analyze the data and identify:
    - Which column represents USER/OWNER
    - Which column represents RUN/RUN_ID/RUN_NAME
    - Which column represents STAGE/STEP/PHASE
    - Which column represents STATUS/STATE
    - The logical sequence of stages within runs
    - The sequence of runs for each user
    
    Respond with JSON in this exact format:
    {{
        "analysis": {{
            "data_type": "eda_flow",
            "user_column": "column_name_for_user_identification",
            "run_column": "column_name_for_run_identification", 
            "stage_column": "column_name_for_stage_identification",
            "status_column": "column_name_for_status",
            "stage_sequence": ["synth", "floorplan", "place", "cts", "route", "drc"],
            "users_found": ["list_of_unique_users"],
            "runs_per_user": {{"user1": ["run1", "run2"], "user2": ["run1", "run2"]}},
            "stages_found": ["list_of_unique_stages"]
        }},
        "flow_structure": {{
            "nodes": [
                {{
                    "id": "user_run_stage_unique_id",
                    "label": "stage_name",
                    "type": "stage_type",
                    "status": "status_value",
                    "user": "user_name",
                    "run": "run_name",
                    "stage": "stage_name",
                    "run_order": 1,
                    "stage_order": 1
                }}
            ],
            "connections": [
                {{
                    "from": "source_node_id",
                    "to": "target_node_id",
                    "type": "within_run|between_runs",
                    "connection_category": "stage_sequence|run_sequence"
                }}
            ]
        }}
    }}
    """
    
    try:
        print("Attempting AI analysis with Mistral model...", file=sys.stderr)
        response = requests.post(OLLAMA_URL, json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False
        }, timeout=30)  # Reduced timeout
        
        if response.status_code == 200:
            ai_response = response.json().get("response", "")
            print("AI analysis successful, parsing response...", file=sys.stderr)
            return parse_ai_response(ai_response)
        else:
            print(f"AI request failed with status {response.status_code}, using fallback...", file=sys.stderr)
            return create_intelligent_fallback_analysis(data, columns)
    except Exception as e:
        print(f"AI analysis failed: {e}, using intelligent fallback...", file=sys.stderr)
        return create_intelligent_fallback_analysis(data, columns)

def parse_ai_response(response: str) -> Dict[str, Any]:
    """Parse AI response and extract JSON"""
    try:
        # Try direct JSON parsing
        return json.loads(response)
    except:
        # Try to extract JSON from response
        try:
            # Look for JSON block
            if "```json" in response:
                json_part = response.split("```json")[1].split("```")[0]
            elif "{" in response and "}" in response:
                start = response.find("{")
                end = response.rfind("}") + 1
                json_part = response[start:end]
            else:
                raise ValueError("No JSON found in response")
            
            return json.loads(json_part)
        except:
            raise ValueError("Could not parse AI response")

def create_intelligent_fallback_analysis(data: List[Dict[str, Any]], columns: List[str]) -> Dict[str, Any]:
    """Create intelligent fallback analysis with proper EDA flow structure"""
    
    # Intelligent column detection
    user_cols = [col for col in columns if any(keyword in col.lower() for keyword in ['user', 'owner', 'designer', 'engineer'])]
    run_cols = [col for col in columns if any(keyword in col.lower() for keyword in ['run', 'flow', 'job', 'batch', 'iteration'])]
    stage_cols = [col for col in columns if any(keyword in col.lower() for keyword in ['stage', 'step', 'phase', 'task', 'tool', 'process'])]
    status_cols = [col for col in columns if any(keyword in col.lower() for keyword in ['status', 'state', 'result', 'outcome'])]
    
    # Use first match or fallback
    user_col = user_cols[0] if user_cols else columns[0] if columns else "user"
    run_col = run_cols[0] if run_cols else columns[1] if len(columns) > 1 else "run"
    stage_col = stage_cols[0] if stage_cols else columns[2] if len(columns) > 2 else "stage"
    status_col = status_cols[0] if status_cols else columns[3] if len(columns) > 3 else "status"
    
    # Analyze data structure
    users = {}
    stage_sequence = ["synth", "floorplan", "place", "cts", "route", "drc", "verification", "signoff"]
    
    # Group data by user and run
    for row in data:
        user = str(row.get(user_col, "default_user"))
        run = str(row.get(run_col, "default_run"))
        stage = str(row.get(stage_col, "default_stage"))
        status = str(row.get(status_col, "unknown"))
        
        if user not in users:
            users[user] = {}
        if run not in users[user]:
            users[user][run] = []
        
        users[user][run].append({
            "stage": stage,
            "status": status,
            "row_data": row
        })
    
    # Create nodes and connections
    nodes = []
    connections = []
    
    for user, runs in users.items():
        sorted_runs = sorted(runs.keys())  # Sort runs
        
        for run_idx, run in enumerate(sorted_runs):
            stages = runs[run]
            
            # Sort stages by known sequence or alphabetically
            def stage_sort_key(stage_info):
                stage_name = stage_info["stage"].lower()
                for i, known_stage in enumerate(stage_sequence):
                    if known_stage in stage_name:
                        return i
                return 999  # Unknown stages go to end
            
            sorted_stages = sorted(stages, key=stage_sort_key)
            
            # Create nodes for this run
            run_nodes = []
            for stage_idx, stage_info in enumerate(sorted_stages):
                node_id = f"{user}_{run}_{stage_info['stage']}_{stage_idx}"
                
                # Determine status color
                status = stage_info["status"].lower()
                if any(word in status for word in ['complete', 'done', 'success', 'pass']):
                    node_status = "completed"
                elif any(word in status for word in ['fail', 'error', 'abort']):
                    node_status = "failed"
                elif any(word in status for word in ['run', 'active', 'progress']):
                    node_status = "running"
                else:
                    node_status = "pending"
                
                node = {
                    "id": node_id,
                    "label": stage_info["stage"],
                    "type": "stage",
                    "status": node_status,
                    "user": user,
                    "run": run,
                    "stage": stage_info["stage"],
                    "run_order": run_idx,
                    "stage_order": stage_idx
                }
                
                nodes.append(node)
                run_nodes.append(node)
                
                # Connect stages within run
                if stage_idx > 0:
                    connections.append({
                        "from": run_nodes[stage_idx - 1]["id"],
                        "to": node_id,
                        "type": "within_run",
                        "connection_category": "stage_sequence"
                    })
            
            # Connect runs (last stage of prev run to first stage of current run)
            if run_idx > 0 and run_nodes:
                prev_run = sorted_runs[run_idx - 1]
                prev_run_stages = [n for n in nodes if n["user"] == user and n["run"] == prev_run]
                if prev_run_stages:
                    last_prev_stage = max(prev_run_stages, key=lambda x: x["stage_order"])
                    first_current_stage = min(run_nodes, key=lambda x: x["stage_order"])
                    
                    connections.append({
                        "from": last_prev_stage["id"],
                        "to": first_current_stage["id"],
                        "type": "between_runs",
                        "connection_category": "run_sequence"
                    })
    
    return {
        "analysis": {
            "data_type": "eda_flow",
            "user_column": user_col,
            "run_column": run_col,
            "stage_column": stage_col,
            "status_column": status_col,
            "stage_sequence": stage_sequence,
            "users_found": list(users.keys()),
            "runs_per_user": {user: list(runs.keys()) for user, runs in users.items()},
            "stages_found": list(set([stage["stage"] for user_runs in users.values() for run_stages in user_runs.values() for stage in run_stages]))
        },
        "flow_structure": {
            "nodes": nodes,
            "connections": connections
        }
    }

def generate_flow_chart_layout(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Generate proper EDA flow chart layout with user separation and run sequences"""
    
    nodes = analysis["flow_structure"]["nodes"]
    connections = analysis["flow_structure"]["connections"]
    
    if not nodes:
        return create_empty_layout()
    
    # Layout configuration
    node_width = 160
    node_height = 70
    stage_spacing_x = 200  # Horizontal spacing between stages
    run_spacing_y = 150    # Vertical spacing between runs
    user_spacing_y = 300   # Vertical spacing between users
    margin_x = 100
    margin_y = 100
    
    # Group nodes by user and run
    user_runs = {}
    for node in nodes:
        user = node.get("user", "default")
        run = node.get("run", "default")
        
        if user not in user_runs:
            user_runs[user] = {}
        if run not in user_runs[user]:
            user_runs[user][run] = []
        
        user_runs[user][run].append(node)
    
    # Position nodes
    current_y = margin_y
    
    for user_idx, (user, runs) in enumerate(user_runs.items()):
        user_start_y = current_y
        
        # Sort runs for this user
        sorted_runs = sorted(runs.keys(), key=lambda x: str(x))
        
        for run_idx, run in enumerate(sorted_runs):
            run_nodes = runs[run]
            
            # Sort stages within run by stage_order or stage name
            run_nodes.sort(key=lambda x: (x.get("stage_order", 999), x.get("stage", "")))
            
            # Position stages horizontally for this run
            run_y = user_start_y + (run_idx * run_spacing_y)
            
            for stage_idx, node in enumerate(run_nodes):
                x = margin_x + (stage_idx * stage_spacing_x)
                y = run_y
                
                # Determine colors based on stage type and status
                stage_name = node.get("stage", "").lower()
                status = node.get("status", "pending")
                
                # Stage-specific colors
                if "synth" in stage_name:
                    base_color = "#007bff"  # Blue
                elif "floorplan" in stage_name:
                    base_color = "#28a745"  # Green
                elif "place" in stage_name:
                    base_color = "#ffc107"  # Yellow
                elif "cts" in stage_name:
                    base_color = "#6f42c1"  # Purple
                elif "route" in stage_name:
                    base_color = "#fd7e14"  # Orange
                elif "drc" in stage_name:
                    base_color = "#dc3545"  # Red
                elif "verify" in stage_name or "verification" in stage_name:
                    base_color = "#20c997"  # Teal
                elif "signoff" in stage_name:
                    base_color = "#6c757d"  # Gray
                else:
                    base_color = "#17a2b8"  # Info blue
                
                # Status-based modifications
                if status == "completed":
                    fill_color = base_color
                    stroke_color = base_color
                    text_color = "#FFFFFF"
                    opacity = 1.0
                elif status == "failed":
                    fill_color = "#dc3545"
                    stroke_color = "#c82333"
                    text_color = "#FFFFFF"
                    opacity = 1.0
                elif status == "running":
                    fill_color = "#ffc107"
                    stroke_color = "#e0a800"
                    text_color = "#212529"
                    opacity = 1.0
                else:  # pending
                    fill_color = "#f8f9fa"
                    stroke_color = base_color
                    text_color = base_color
                    opacity = 0.7
                
                # Update node with position and styling
                node.update({
                    "x": x,
                    "y": y,
                    "user_idx": user_idx,
                    "run_idx": run_idx,
                    "stage_idx": stage_idx,
                    "style": {
                        "width": node_width,
                        "height": node_height,
                        "fill": fill_color,
                        "stroke": stroke_color,
                        "strokeWidth": 2,
                        "cornerRadius": 8,
                        "fontSize": 12,
                        "textColor": text_color,
                        "fontWeight": "600",
                        "opacity": opacity,
                        "shadow": True,
                        "shadowColor": "rgba(0,0,0,0.2)",
                        "shadowBlur": 4,
                        "shadowOffsetX": 1,
                        "shadowOffsetY": 1
                    }
                })
        
        # Update current_y for next user
        current_y += len(sorted_runs) * run_spacing_y + user_spacing_y
    
    # Enhanced connections with proper styling
    formatted_connections = []
    for conn in connections:
        from_node = next((n for n in nodes if n["id"] == conn["from"]), None)
        to_node = next((n for n in nodes if n["id"] == conn["to"]), None)
        
        if from_node and to_node:
            # Determine connection style and color
            conn_type = conn.get("type", "within_run")
            
            if conn_type == "within_run":
                # Stage to stage within same run
                stroke_color = "#495057"
                stroke_width = 2
                connection_type = "straight"
                dash_array = ""
            else:  # between_runs
                # Run to run connection
                stroke_color = "#007bff"
                stroke_width = 3
                connection_type = "curved"
                dash_array = "5,5"
            
            formatted_connections.append({
                "from": conn["from"],
                "to": conn["to"],
                "type": connection_type,
                "connection_category": conn.get("connection_category", "sequence"),
                "style": {
                    "stroke": stroke_color,
                    "strokeWidth": stroke_width,
                    "arrowSize": 10,
                    "strokeDasharray": dash_array,
                    "opacity": 0.8,
                    "arrowColor": stroke_color
                }
            })
    
    # Calculate layout dimensions
    max_x = max([node["x"] + node["style"]["width"] for node in nodes]) if nodes else 1200
    max_y = max([node["y"] + node["style"]["height"] for node in nodes]) if nodes else 800
    
    return {
        "nodes": nodes,
        "connections": formatted_connections,
        "layout": {
            "width": max(1400, max_x + margin_x),
            "height": max(900, max_y + margin_y),
            "background": {
                "color": "#ffffff",
                "gridSize": 20,
                "gridColor": "#f0f0f0",
                "gridOpacity": 0.5
            },
            "stage_colors": {
                "synth": "#007bff",
                "floorplan": "#28a745",
                "place": "#ffc107",
                "cts": "#6f42c1",
                "route": "#fd7e14",
                "drc": "#dc3545",
                "verification": "#20c997",
                "signoff": "#6c757d"
            }
        },
        "config": {
            "node_width": node_width,
            "node_height": node_height,
            "font_size": 12,
            "grid_size": 20,
            "spacing_x": stage_spacing_x,
            "spacing_y": run_spacing_y,
            "user_spacing": user_spacing_y,
            "dynamic_sizing": True,
            "enhanced_connections": True,
            "eda_flow_layout": True,
            "show_shadows": True
        },
        "metadata": {
            "total_steps": len(nodes),
            "completed_steps": len([n for n in nodes if n["status"] == "completed"]),
            "failed_steps": len([n for n in nodes if n["status"] == "failed"]),
            "running_steps": len([n for n in nodes if n["status"] == "running"]),
            "pending_steps": len([n for n in nodes if n["status"] not in ["completed", "failed", "running"]]),
            "analysis_type": analysis["analysis"]["data_type"],
            "users_count": len(user_runs),
            "total_runs": sum(len(runs) for runs in user_runs.values()),
            "users": list(user_runs.keys())
        }
    }

def create_empty_layout():
    """Create empty layout when no data is available"""
    return {
        "nodes": [],
        "connections": [],
        "layout": {
            "width": 800,
            "height": 600,
            "background": {
                "color": "#ffffff",
                "gridSize": 20,
                "gridColor": "#f0f0f0",
                "gridOpacity": 0.5
            }
        },
        "config": {
            "node_width": 160,
            "node_height": 70,
            "font_size": 12,
            "grid_size": 20
        },
        "metadata": {
            "total_steps": 0,
            "analysis_type": "empty"
        }
    }

def analyze_and_generate_layout(file_path: str) -> Dict[str, Any]:
    """Main function to analyze data and generate flow chart layout"""
    try:
        # Read data
        data = read_csv_data(file_path)
        
        # Analyze structure
        analysis = analyze_data_structure(data)
        
        # Generate layout
        layout = generate_flow_chart_layout(analysis)
        
        return layout
        
    except Exception as e:
        raise ValueError(f"Failed to analyze and generate layout: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python simple_analyzer.py <csv_file_path>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        result = analyze_and_generate_layout(file_path)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)