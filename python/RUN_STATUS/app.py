from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
import os
import logging
import numpy as np
from enhanced_layout_generator import analyze_and_generate_advanced_layout
from branch_analyzer import analyze_branch_view

# Set up logginghh
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def convert_to_json_serializable(obj):
    """Convert numpy/pandas types to JSON serializable types"""
    if isinstance(obj, dict):
        return {key: convert_to_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_json_serializable(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj):
        return None
    else:
        return obj

def read_data_file(file_path):
    """Read data from either CSV or Excel file based on extension - Model-based approach"""
    try:
        file_ext = os.path.splitext(file_path)[1].lower()
        logger.info(f"Reading file with extension: {file_ext}")
        
        if file_ext == '.csv':
            df = pd.read_csv(file_path)
        elif file_ext in ['.xls', '.xlsx']:
            df = pd.read_excel(file_path)
        else:
            raise ValueError("Unsupported file format. Please upload a CSV or Excel file.")
        
        # Clean up column names - remove whitespace and make consistent
        df.columns = [col.strip() for col in df.columns]
        
        # Basic validation - ensure we have at least 3 columns
        if len(df.columns) < 3:
            raise ValueError("Data must have at least 3 columns for analysis")
        
        # Clean up data - remove whitespace from all string columns
        for col in df.columns:
            if df[col].dtype == 'object':
                df[col] = df[col].astype(str).str.strip()
        
        # Check for completely empty data
        if df.empty:
            raise ValueError("File contains no data")
        
        # Check for null values in all columns
        null_columns = df.columns[df.isnull().any()].tolist()
        if null_columns:
            logger.warning(f"Found null values in columns: {null_columns}")
            # Fill null values with empty string for analysis
            df = df.fillna('')
        
        logger.info(f"Successfully read file with {len(df)} rows and {len(df.columns)} columns")
        logger.info(f"Columns: {list(df.columns)}")
        return df
        
    except Exception as e:
        logger.error(f"Error reading file: {str(e)}")
        raise

@app.route('/')
def serve_frontend():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            logger.error("No file part in request")
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if not file.filename:
            logger.error("No file selected")
            return jsonify({'error': 'No file selected'}), 400
            
        logger.info(f"Processing file: {file.filename}")
        
        # Save file
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(file_path)
        logger.info(f"File saved to: {file_path}")

        try:
            # Generate visualization using advanced model-based analysis
            logger.info("Analyzing multi-sheet data structure and generating advanced visualization layout...")
            layout_data = analyze_and_generate_advanced_layout(file_path)
            
            if not layout_data or not layout_data.get("nodes"):
                logger.error("Failed to generate valid layout")
                return jsonify({
                    'error': 'Failed to generate visualization',
                    'details': 'No valid layout data generated'
                }), 500
            
            # Convert numpy/pandas types to JSON serializable types
            layout_data = convert_to_json_serializable(layout_data)
            
            logger.info(f"Successfully generated layout with {len(layout_data['nodes'])} nodes")
            return jsonify(layout_data)

        except ValueError as ve:
            logger.error(f"Validation error: {str(ve)}")
            return jsonify({'error': str(ve)}), 400
        except Exception as e:
            logger.error(f"Processing error: {str(e)}")
            return jsonify({
                'error': 'Error processing file',
                'details': str(e)
            }), 500
        finally:
            # Clean up uploaded file
            try:
                os.remove(file_path)
                logger.info(f"Cleaned up file: {file_path}")
            except:
                pass

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@app.route('/upload-branch', methods=['POST'])
def upload_file_branch():
    """Upload and analyze file for branch view"""
    try:
        if 'file' not in request.files:
            logger.error("No file part in request")
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if not file.filename:
            logger.error("No file selected")
            return jsonify({'error': 'No file selected'}), 400
            
        logger.info(f"Processing file for branch view: {file.filename}")
        
        # Save file
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(file_path)
        logger.info(f"File saved to: {file_path}")

        try:
            # Generate branch visualization
            logger.info("Analyzing data for branch view patterns...")
            layout_data = analyze_branch_view(file_path)
            
            if not layout_data or not layout_data.get("nodes"):
                logger.error("Failed to generate valid branch layout")
                return jsonify({
                    'error': 'Failed to generate branch visualization',
                    'details': 'No valid branch layout data generated'
                }), 500
            
            # Convert numpy/pandas types to JSON serializable types
            layout_data = convert_to_json_serializable(layout_data)
            
            logger.info(f"Successfully generated branch layout with {len(layout_data['nodes'])} nodes")
            return jsonify(layout_data)

        except ValueError as ve:
            logger.error(f"Branch analysis validation error: {str(ve)}")
            return jsonify({'error': str(ve)}), 400
        except Exception as e:
            logger.error(f"Branch analysis processing error: {str(e)}")
            return jsonify({
                'error': 'Error processing file for branch view',
                'details': str(e)
            }), 500
        finally:
            # Clean up uploaded file
            try:
                os.remove(file_path)
                logger.info(f"Cleaned up file: {file_path}")
            except:
                pass

    except Exception as e:
        logger.error(f"Unexpected error in branch upload: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5008)
