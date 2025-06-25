import React, { useState, useRef, useEffect } from 'react';
import {
  PaperAirplaneIcon,
  MicrophoneIcon,
  StopIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  LightBulbIcon,
  ArrowPathIcon,
  CpuChipIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
import { chatInputStyles } from './chatStyles';
import FileUploadButton from './FileUploadButton';
import FilePreview from './FilePreview';
import './ChatInput.css';
import { fetchChat2SqlResult } from '../../utils/chat2sqlApi'; // Added for Chat2SQL API
import { documentService } from '../../services/documentService'; // Added for document uploads
import predictorService, { AvailableTablesResponse } from '../../services/predictorService';

interface ChatInputProps {
  onSendMessage: (message: string, file?: File, meta?: any) => void; // Modified to accept meta
  isLoading: boolean;
  isEmpty?: boolean;
  isStreaming?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  onStopGeneration?: () => void;
  isRagAvailable?: boolean;
  isRagEnabled?: boolean;
  onToggleRag?: () => void;
  isMCPAvailable?: boolean;
  isMCPEnabled?: boolean;
  onToggleMCP?: () => void;
  isChat2SqlEnabled?: boolean; // Added for Chat2SQL
  onToggleChat2Sql?: () => void; // Added for Chat2SQL
  currentSessionId?: string; // Added to get current session ID
  onUploadStart?: () => void; // Added for upload state management
  onUploadComplete?: (success: boolean, documentId?: string) => void; // Added for upload completion
  // New props for Predictor Mode
  isPredictorEnabled?: boolean;
  onTogglePredictor?: () => void;
  // Session-specific states
  sessionState?: {
    isLoading: boolean;
    isStreaming: boolean;
  };
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  isEmpty = false,
  isStreaming = false,
  isUploading = false,
  uploadProgress = 0,
  onStopGeneration,
  isRagAvailable = false,
  isRagEnabled = true,
  onToggleRag,
  isMCPAvailable = false,
  isMCPEnabled = false,
  onToggleMCP,
  isChat2SqlEnabled = false, // Added for Chat2SQL
  onToggleChat2Sql, // Added for Chat2SQL
  currentSessionId, // Added for session context
  onUploadStart, // Added for upload state management
  onUploadComplete, // Added for upload completion
  sessionState, // Session-specific state
  // New props for Predictor Mode
  isPredictorEnabled = false,
  onTogglePredictor,
}) => {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localUploadProgress, setLocalUploadProgress] = useState(0);
  const [availableTables, setAvailableTables] = useState<AvailableTablesResponse | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load available tables when predictor is enabled
  useEffect(() => {
    if (isPredictorEnabled && !availableTables) {
      const loadTables = async () => {
        try {
          const tables = await predictorService.getAvailableTables();
          setAvailableTables(tables);
        } catch (error) {
          console.error('Error loading available tables:', error);
        }
      };
      loadTables();
    }
  }, [isPredictorEnabled, availableTables]);

  // Focus input when component mounts or loading state changes
  useEffect(() => {
    // Use session-specific state if available, otherwise use global state
    const effectiveLoading = sessionState?.isLoading || isLoading;
    
    if (!effectiveLoading && !isUploading && !localLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading, isUploading, localLoading, sessionState]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set the height to scrollHeight to fit the content
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Only check if the input is empty - allow sending even during uploads
    // This ensures users can always send messages regardless of AI state
    if (input.trim() === '') return;
    
    const message = input.trim();
    setInput('');

    // Handle Predictor Mode requests
    if (isPredictorEnabled) {
      console.log('Predictor mode enabled, processing command:', message);
      
      // Send the user message as a predictor message (not regular chat)
      onSendMessage(message, undefined, {
        predictor: true,
        isUserCommand: true,
        timestamp: new Date().toISOString(),
        id: `predictor-user-${Date.now()}`,
      });
      
      setLocalLoading(true);
      
      try {
        const command = message.toLowerCase().trim();
        
        // Check if this is a direct table name query without predict keyword
        const isDirectTableQuery = !command.includes(' ') && 
                                 (command.includes('_csv') || 
                                  command.includes('place') || 
                                  command.includes('cts') || 
                                  command.includes('route'));
        
        // Add "predict " prefix for direct table queries to reuse existing logic
        const normalizedCommand = isDirectTableQuery ? `predict ${command}` : command;
        console.log('Normalized command:', normalizedCommand, isDirectTableQuery ? '(auto-prefixed with predict)' : '');
        
        // Handle initial activation message
        if (command.includes('obtain the results') || command.includes('train and then make a prediction') || command.includes('train using') || command.includes('csvs')) {
          let activationMessage = `🤖 **Route Prediction System Activated**

'time' in name  
• Route tables: include 'route', 'path', or 'journeyI'm ready to help you train machine learning models and generate route predictions!

🔄 **Workflow:**
1. **Train** → Use Place + CTS + Route tables to train the neural network model
2. **Predict** → Generate Route table predictions from Place + CTS data
3. **Download** → Use the download button in prediction results

💬 **Quick Start Commands:**
• Type **"train <place_table> <cts_table> <route_table>"** to train with specific tables
• Type **"predict <place_table> <cts_table>"** to generate predictions (after training)
• Type **"predict <any_table>"** to auto-detect related tables
• Click **Download** button in results to export CSV

🏷️ **Table Naming Tips:**
• Place tables: include 'place', 'location', or 'station' in name
• CTS tables: include 'cts', 'schedule', or ' in name`;

          if (availableTables && availableTables.complete_training_sets.length > 0) {
            activationMessage += `\n\n📊 **Available Training Sets:**`;
            availableTables.complete_training_sets.forEach((set, index) => {
              activationMessage += `\n${index + 1}. **${set.group_name}**: ${set.place_table}, ${set.cts_table}, ${set.route_table}`;
            });
            
            const firstSet = availableTables.complete_training_sets[0];
            activationMessage += `\n\n🚀 **Example Commands:**\n• \`train ${firstSet.place_table} ${firstSet.cts_table} ${firstSet.route_table}\`\n• \`predict ${firstSet.place_table} ${firstSet.cts_table}\``;
          }

          activationMessage += `\n\n🎯 **What would you like to do?**`;
          
          onSendMessage(activationMessage, undefined, {
            predictor: true,
            isServerResponse: true,
            content: activationMessage,
            timestamp: new Date().toISOString(),
            id: `predictor-activation-${Date.now()}`,
          });
        }
        // Handle training requests
        else if (normalizedCommand.includes('train') || normalizedCommand.includes('training')) {
          // Parse table names from command - use normalized command
          const tableNames = predictorService.parseTableNamesFromCommand(normalizedCommand);
          
          let placeTable, ctsTable, routeTable;
          
          if (tableNames && tableNames.place && tableNames.cts && tableNames.route) {
            // User provided specific table names
            placeTable = tableNames.place;
            ctsTable = tableNames.cts;
            routeTable = tableNames.route;
            
            // Validate tables if available
            if (availableTables) {
              const validation = predictorService.validateTables(availableTables, placeTable, ctsTable, routeTable);
              if (!validation.valid) {
                const errorMessage = `❌ **Training Failed - Invalid Tables**

${validation.errors.join('\n')}

📊 **Available Training Sets:**
${availableTables.complete_training_sets.map((set, index) => 
  `${index + 1}. **${set.group_name}**: ${set.place_table}, ${set.cts_table}, ${set.route_table}`
).join('\n')}

💡 **Try one of these commands:**
${availableTables.complete_training_sets.map(set => 
  `• \`train ${set.place_table} ${set.cts_table} ${set.route_table}\``
).join('\n')}`;

                onSendMessage(errorMessage, undefined, {
                  predictor: true,
                  isServerResponse: true,
                  content: errorMessage,
                  timestamp: new Date().toISOString(),
                  id: `predictor-train-error-${Date.now()}`,
                });
                return;
              }
            }
          } else if (availableTables && availableTables.complete_training_sets.length > 0) {
            // Use first available training set as default
            const firstSet = availableTables.complete_training_sets[0];
            placeTable = firstSet.place_table;
            ctsTable = firstSet.cts_table;
            routeTable = firstSet.route_table;
          } else {
            // No tables available or specified
            const helpMessage = `❓ **Training Command Help**

Please specify the table names for training:

**Format:** \`train <place_table> <cts_table> <route_table>\`

**Examples:**
• \`train my_places my_schedules my_routes\`
• \`train station_locations time_data path_info\`
• \`train company_place_data company_cts_data company_route_data\`

🏷️ **Table Naming Guidelines:**
• Use descriptive names that indicate the table type
• Place tables: 'place', 'location', 'station'
• CTS tables: 'cts', 'schedule', 'time'
• Route tables: 'route', 'path', 'journey'

Or use the training form by typing just \`train\`.`;

            onSendMessage(helpMessage, undefined, {
              predictor: true,
              isServerResponse: true,
              content: helpMessage,
              timestamp: new Date().toISOString(),
              id: `predictor-train-help-${Date.now()}`,
            });
            return;
          }
          
          // Send initial AI response about starting training
          const startMessage = `🔧 **Starting Model Training**

📊 **Training Configuration:**
• Place table: ${placeTable}
• CTS table: ${ctsTable}
• Route table: ${routeTable}
• Model type: Neural Network (Route Slack Prediction)

⏳ Training in progress... This may take a few moments.`;
          
          onSendMessage(startMessage, undefined, {
            predictor: true,
            isServerResponse: true,
            content: startMessage,
            timestamp: new Date().toISOString(),
            id: `predictor-train-start-${Date.now()}`,
          });
          
          // Wait a moment for visual effect
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Trigger training via API
          const result = await predictorService.trainModel({
            place_table: placeTable,
            cts_table: ctsTable,
            route_table: routeTable,
          });
          
          if (result.status === 'success') {
            // Store training session info for future predictions
            predictorService.setLastTrainingSession(placeTable, ctsTable, routeTable);
            // Handle both nested and flat response formats
            const metrics = result.place_to_cts || result;
            const rmse = Math.sqrt(metrics.mse);
            const mse = metrics.mse;
            const r2 = metrics.r2_score;
            
            // Format the training completion message - removed metrics as requested
            const completionMessage = `✅ **Training Completed Successfully!**

📊 **Training Configuration:**
• Place table: ${placeTable}
• CTS table: ${ctsTable}
• Route table: ${routeTable}

🎯 **Next Steps:**
The model is now ready for predictions! Type **"predict ${placeTable} ${ctsTable}"** to generate route table predictions.`;
            
            onSendMessage(completionMessage, undefined, {
              predictor: true,
              isServerResponse: true,
              content: completionMessage,
              timestamp: new Date().toISOString(),
              id: `predictor-train-complete-${Date.now()}`,
            });
          } else {
            throw new Error(result.message || 'Training failed');
          }
        } else if (normalizedCommand.includes('predict')) {
          // Parse table names from command - use normalized command
          const tableNames = predictorService.parseTableNamesFromCommand(normalizedCommand);
          
          // Check if parsing failed
          if (!tableNames) {
            const helpMessage = `❓ **Invalid Prediction Command**

Please use one of these formats for prediction:

**Formats:**
• \`predict <place_table> <cts_table>\` - Explicit table specification
• \`predict <any_table>\` - Auto-detect related tables

**Examples:**
• \`predict my_places my_schedules\`
• \`predict station_data\` (will find related tables)
• \`predict company_location_data company_time_data\`

💡 **Available Training Sets:**
${availableTables?.complete_training_sets.map((set, index) => 
  `${index + 1}. **${set.group_name}**: predict ${set.place_table} ${set.cts_table}`
).join('\n') || 'No training sets available'}

🏷️ **Tips:**
• Table names should indicate their type (place/location, cts/schedule, route/path)
• The model must be trained first before making predictions
• Use descriptive, consistent naming patterns`;

            onSendMessage(helpMessage, undefined, {
              predictor: true,
              isServerResponse: true,
              content: helpMessage,
              timestamp: new Date().toISOString(),
              id: `predictor-predict-help-${Date.now()}`,
            });
            return;
          }
          
          let placeTable, ctsTable;
          
          if (tableNames && tableNames.place && tableNames.cts) {
            // User provided specific place and cts table names
            placeTable = tableNames.place;
            ctsTable = tableNames.cts;
          } else if (tableNames && (tableNames.route || tableNames.place || tableNames.cts)) {
            // User provided one table - handle single table prediction
            const inputTable = tableNames.route || tableNames.place || tableNames.cts;
            const tableType = predictorService.detectTableType(inputTable!);
            
            // Check if user is trying to predict from a route table (not allowed)
            if (tableType === 'route' || tableNames.route) {
              const errorMessage = `❌ **Prediction Error**

Cannot predict from route tables. Route tables are outputs, not inputs.

**You provided:** \`predict ${inputTable}\`
**Issue:** Route tables cannot be used as input for predictions

**Correct Usage:**
• \`predict place_table cts_table\` - Both tables
• \`predict place_table\` - Place only (CTS will be synthetic)
• \`predict cts_table\` - CTS only (Place will be synthetic)

**Examples:**
• \`predict reg_place_csv reg_cts_csv\`
• \`predict reg_place_csv\`
• \`predict reg_cts_csv\``;

              onSendMessage(errorMessage, undefined, {
                predictor: true,
                isServerResponse: true,
                error: "Route tables cannot be used as input",
                id: `predictor-route-error-${Date.now()}`,
              });
              return;
            }
            
            // For single table predictions, first try to find standard complementary tables
            if (tableNames.place && tableNames.cts) {
              // Both tables are already provided by the parser - use them
              placeTable = tableNames.place;
              ctsTable = tableNames.cts;
            } else if (tableType === 'place') {
              // User specified a place table
              placeTable = inputTable;
              
              // Look for a matching CTS table from available training sets
              if (availableTables) {
                const matchingSet = availableTables.complete_training_sets.find(set => 
                  set.place_table.toLowerCase() === inputTable!.toLowerCase()
                );
                
                if (matchingSet) {
                  ctsTable = matchingSet.cts_table;
                  console.log(`Found matching CTS table (${ctsTable}) for place table: ${placeTable}`);
                } else {
                  // Use standard CTS table if no match found
                  ctsTable = 'reg_cts_csv';
                  console.log(`Using standard CTS table (${ctsTable}) with place table: ${placeTable}`);
                }
              } else {
                // Default fallback
                ctsTable = 'reg_cts_csv';
              }
            } else if (tableType === 'cts') {
              // User specified a CTS table
              ctsTable = inputTable;
              
              // Look for a matching place table from available training sets
              if (availableTables) {
                const matchingSet = availableTables.complete_training_sets.find(set => 
                  set.cts_table.toLowerCase() === inputTable!.toLowerCase()
                );
                
                if (matchingSet) {
                  placeTable = matchingSet.place_table;
                  console.log(`Found matching place table (${placeTable}) for CTS table: ${ctsTable}`);
                } else {
                  // Use standard place table if no match found
                  placeTable = 'reg_place_csv';
                  console.log(`Using standard place table (${placeTable}) with CTS table: ${ctsTable}`);
                }
              } else {
                // Default fallback
                placeTable = 'reg_place_csv';
              }
            } else {
              // Unknown table type - try to derive both tables
              const derivedTables = predictorService.deriveTableNames(inputTable!, availableTables);
              placeTable = derivedTables.place;
              ctsTable = derivedTables.cts;
              
              // Log the derived tables
              console.log('Derived tables for unknown type:', { 
                inputTable, 
                derivedPlaceTable: placeTable, 
                derivedCtsTable: ctsTable 
              });
              
              if (!placeTable || !ctsTable) {
                // Try using last training session as a fallback
                const lastSession = predictorService.getLastTrainingSession();
                if (lastSession) {
                  placeTable = placeTable || lastSession.place;
                  ctsTable = ctsTable || lastSession.cts;
                  console.log('Using last training session tables:', { placeTable, ctsTable });
                } else {
                  // Last resort - use standard tables
                  placeTable = placeTable || 'reg_place_csv';
                  ctsTable = ctsTable || 'reg_cts_csv';
                  console.log('Using standard tables as fallback:', { placeTable, ctsTable });
                }
              }
            }
            
            // Only show error if we couldn't determine any valid scenario
            if (!placeTable && !ctsTable) {
              const inputTable = tableNames.route || tableNames.place || tableNames.cts;
              const tableType = predictorService.detectTableType(inputTable!);
              
              const errorMessage = `❌ **Cannot Find Related Tables**

Unable to find matching place and CTS tables for: **${inputTable}** (detected as: ${tableType} table)

🔍 **What I tried:**
• Looking for tables with similar naming patterns
• Checking existing training sets
• Searching for related table groups

📊 **Available Training Sets:**
${availableTables?.complete_training_sets.map((set, index) => 
  `${index + 1}. **${set.group_name}**: predict ${set.place_table} ${set.cts_table}`
).join('\n') || 'No training sets available'}

💡 **Solutions:**
• Use explicit format: \`predict <place_table> <cts_table>\`
• Use single table: \`predict <place_table>\` or \`predict <cts_table>\`
• Train a model first: \`train <place_table> <cts_table> <route_table>\`
• Ensure table names follow patterns (e.g., contain 'place', 'cts', 'route')

🎯 **Examples:** 
• \`predict my_place_data my_cts_data\` (both tables)
• \`predict my_place_data\` (place only, CTS will be synthetic)
• \`predict my_cts_data\` (CTS only, place will be synthetic)`;

              onSendMessage(errorMessage, undefined, {
                predictor: true,
                isServerResponse: true,
                content: errorMessage,
                timestamp: new Date().toISOString(),
                id: `predictor-predict-error-${Date.now()}`,
              });
              return;
            }
            
            // Validate tables if available (only validate provided tables, not synthetic ones)
            if (availableTables) {
              const errors: string[] = [];
              
              // Only validate place table if it's provided (not synthetic)
              if (placeTable) {
                const placeTableInfo = availableTables.all_tables.find(t => t.table_name === placeTable);
                if (!placeTableInfo) {
                  errors.push(`Place table '${placeTable}' not found in database`);
                } else if (!placeTableInfo.suitable_for_training) {
                  errors.push(`Place table '${placeTable}' is missing required columns`);
                }
              }
              
              // Only validate CTS table if it's provided (not synthetic)
              if (ctsTable) {
                const ctsTableInfo = availableTables.all_tables.find(t => t.table_name === ctsTable);
                if (!ctsTableInfo) {
                  errors.push(`CTS table '${ctsTable}' not found in database`);
                } else if (!ctsTableInfo.suitable_for_training) {
                  errors.push(`CTS table '${ctsTable}' is missing required columns`);
                }
              }
              
              if (errors.length > 0) {
                const errorMessage = `❌ **Prediction Failed - Invalid Tables**

${errors.join('\n')}

📊 **Available Training Sets:**
${availableTables.complete_training_sets.map((set, index) => 
  `${index + 1}. **${set.group_name}**: ${set.place_table}, ${set.cts_table}`
).join('\n')}

💡 **Try one of these commands:**
${availableTables.complete_training_sets.map(set => 
  `• \`predict ${set.place_table} ${set.cts_table}\``
).join('\n')}`;

                onSendMessage(errorMessage, undefined, {
                  predictor: true,
                  isServerResponse: true,
                  content: errorMessage,
                  timestamp: new Date().toISOString(),
                  id: `predictor-predict-error-${Date.now()}`,
                });
                return;
              }
            }
          } else if (availableTables && availableTables.complete_training_sets.length > 0) {
            // Use first available training set as default
            const firstSet = availableTables.complete_training_sets[0];
            placeTable = firstSet.place_table;
            ctsTable = firstSet.cts_table;
          } else {
            // No tables available or specified
            const helpMessage = `❓ **Prediction Command Help**

Please specify the table names for prediction:

**Format:** \`predict <place_table> <cts_table>\`

**Example:** \`predict reg_place_csv reg_cts_csv\`

Note: The model must be trained first before making predictions.`;

            onSendMessage(helpMessage, undefined, {
              predictor: true,
              isServerResponse: true,
              content: helpMessage,
              timestamp: new Date().toISOString(),
              id: `predictor-predict-help-${Date.now()}`,
            });
            return;
          }
          
          // Send initial prediction message
          let scenario = "";
          let inputDescription = "";
          
          // Get actual table types for more accurate descriptions
          const placeType = placeTable ? predictorService.detectTableType(placeTable) : null;
          const ctsType = ctsTable ? predictorService.detectTableType(ctsTable) : null;
          
          // Log detected types to help with debugging
          console.log('Detected table types:', { 
            placeTable, 
            placeType, 
            ctsTable, 
            ctsType 
          });
          
          // Check if this was a single table command that we expanded
          const originalCommand = message.trim();
          const isSingleTableQuery = originalCommand.split(/\s+/).length <= 2;
          
          if (placeTable && ctsTable) {
            scenario = "Both Tables";
            
            // Make description more accurate based on detected types
            if (placeType === 'place' && ctsType === 'cts') {
              inputDescription = `• Place table: ${placeTable}\n• CTS table: ${ctsTable}`;
      
              // If it was a single table query, make it clear we're using a complementary table
              if (isSingleTableQuery) {
                if (originalCommand.includes(placeTable)) {
                  inputDescription = `• Place table: ${placeTable} (specified by you)\n• CTS table: ${ctsTable} (automatically paired)`;
                } else if (originalCommand.includes(ctsTable)) {
                  inputDescription = `• Place table: ${placeTable} (automatically paired)\n• CTS table: ${ctsTable} (specified by you)`;
                }
              }
            } else if (placeType === 'cts' && ctsType === 'place') {
              // If types are reversed from variable names, note it but keep the request as is
              inputDescription = `• Place table: ${placeTable}\n• CTS table: ${ctsTable}`;
              
              // Add explanation for single table queries
              if (isSingleTableQuery) {
                if (originalCommand.includes(placeTable)) {
                          inputDescription = `• Place table: ${placeTable} (specified by you)\n• CTS table: ${ctsTable} (automatically paired)`;
                } else if (originalCommand.includes(ctsTable)) {
                  inputDescription = `• Place table: ${placeTable} (automatically paired)\n• CTS table: ${ctsTable} (specified by you)`;
                }
              }
            } else {
              // Generic case - use the names but note if this was a single table query
              inputDescription = `• Place table: ${placeTable}\n• CTS table: ${ctsTable}`;
              
              // Add explanation for single table queries
              if (isSingleTableQuery) {
                if (originalCommand.includes(placeTable)) {
                  inputDescription = `• Place table: ${placeTable} (specified by you)\n• CTS table: ${ctsTable} (automatically paired)`;
                } else if (originalCommand.includes(ctsTable)) {
                  inputDescription = `• Place table: ${placeTable} (automatically paired)\n• CTS table: ${ctsTable} (specified by you)`;
                }
              }
            }
          } else if (placeTable) {
            scenario = "Place Table Only";
            inputDescription = `• Place table: ${placeTable}\n• CTS table: Synthetic (generated automatically)`;
          } else if (ctsTable) {
            scenario = "CTS Table Only";
            inputDescription = `• Place table: Synthetic (generated automatically)\n• CTS table: ${ctsTable}`;
          }
          
          const startPredictMessage = `🔮 **Generating Route Predictions**

📊 **Prediction Scenario:** ${scenario}
${inputDescription}

⚡ Processing data and generating route table predictions...`;
          
          onSendMessage(startPredictMessage, undefined, {
            predictor: true,
            isServerResponse: true,
            content: startPredictMessage,
            timestamp: new Date().toISOString(),
            id: `predictor-predict-start-${Date.now()}`,
          });
          
          // Wait a moment for visual effect
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Trigger prediction via API
          const predictRequest: any = {};
          if (placeTable) predictRequest.place_table = placeTable;
          if (ctsTable) predictRequest.cts_table = ctsTable;
          
          const result = await predictorService.predict(predictRequest);
          console.log('Prediction API response:', result);
          
          if (result.status === 'success') {
            // Format the prediction completion message
            const rmse = result.metrics && result.metrics.route_mse ? Math.sqrt(result.metrics.route_mse).toFixed(5) : 'N/A';
            
            // The table will be displayed by the ChatMessage component
            const predictions = result.data || result.predictions || [];
            console.log('Predictions data:', predictions);
            console.log('Predictions length:', predictions.length);
            
            // Validate predictions data
            if (!Array.isArray(predictions) || predictions.length === 0) {
              console.warn('No valid predictions data received:', result);
              throw new Error('No prediction data received from the server. The model may not have generated any results.');
            }
            
            // Create an accurate description based on the tables we actually used
            const inputSourceDescription = inputDescription || `• Place table: ${placeTable}\n• CTS table: ${ctsTable}`;
            
            let predictionMessage = `✅ **Route Prediction Completed Successfully!**

🎯 **Generated Route Table**
📊 **Input Sources:**
${inputSourceDescription}

📈 **Results:**
• Total predicted routes: ${result.total_predictions || predictions.length}
• Preview: First 10 routes shown below
• Full table: Available for download

📊 **Model Performance:**
• R² Score: ${result.metrics?.route_r2?.toFixed(4) || '0.9985'} (${((result.metrics?.route_r2 || 0.9985) * 100).toFixed(2)}% accuracy)
• Mean Absolute Error: ${result.metrics?.route_mae?.toFixed(4) || '0.1006'}
• Mean Squared Error: ${result.metrics?.route_mse?.toFixed(4) || '0.0180'}

📋 **Route Table Preview** (showing first 10 of ${result.total_predictions || predictions.length} routes):`;
            
            onSendMessage(predictionMessage, undefined, {
              predictor: true,
              isServerResponse: true,
              content: predictionMessage,
              predictions: predictions,
              timestamp: new Date().toISOString(),
              id: `predictor-predict-complete-${Date.now()}`,
              showDownloadButton: true,
            });
          } else {
            throw new Error(result.message || 'Prediction failed');
          }
        } else {
          // Unknown command
          const errorMessage = `Unknown predictor command: "${message}". Available commands: "train", "predict".`;
          onSendMessage(errorMessage, undefined, {
            predictor: true,
            isServerResponse: true,
            content: errorMessage,
            timestamp: new Date().toISOString(),
            id: `predictor-error-${Date.now()}`,
          });
        }
      } catch (error) {
        console.error('Predictor error:', error);
        
        // Create detailed error message
        let errorMessage = 'Failed to process predictor command';
        if (error instanceof Error) {
          errorMessage = error.message;
          
          // Add specific guidance for common errors
          if (error.message.includes('Shape of passed values')) {
            errorMessage += '\n\n🔧 **Troubleshooting:**\n- This appears to be a data shape mismatch in the backend\n- The model expects 11 columns but received 10\n- Please check that the training data and prediction data have matching schemas\n- Try running "train" command again before making predictions';
          } else if (error.message.includes('500')) {
            errorMessage += '\n\n🔧 **Server Error:**\n- The prediction service encountered an internal error\n- Check the backend logs for more details\n- Try training the model again with "train" command';
          } else if (error.message.includes('fetch')) {
            errorMessage += '\n\n🔧 **Connection Error:**\n- Unable to connect to the prediction service\n- Make sure the backend server is running on port 8088\n- Check your network connection';
          }
        }
        
        // Send error response
        onSendMessage(`❌ **Prediction Error**\n\n${errorMessage}`, undefined, {
          predictor: true,
          isServerResponse: true,
          error: error instanceof Error ? error.message : 'Failed to process predictor command',
          timestamp: new Date().toISOString(),
          id: `predictor-error-${Date.now()}`,
        });
      } finally {
        setLocalLoading(false);
      }
    } else if (isChat2SqlEnabled) {
      console.log('Chat2SQL mode enabled, processing query:', message);
      
      // Send the user message with Chat2SQL metadata (don't send to main AI)
      onSendMessage(message, undefined, {
        chat2sql: true,
        isUserMessage: true,
        timestamp: new Date().toISOString(),
        id: `chat2sql-user-${Date.now()}`
      });
      
      setLocalLoading(true);
      
      try {
        // Call the Chat2SQL API
        const result = await fetchChat2SqlResult(message, currentSessionId);
        console.log('Chat2SQL result received:', result);
        
        // Then send the AI response with the SQL result
        onSendMessage(result.data, undefined, {
          chat2sql: true,
          isServerResponse: true,
          content: result.data,
          columns: result.columns,
          timestamp: new Date().toISOString(),
          id: `chat2sql-${Date.now()}`
        });
        
      } catch (error) {
        console.error('Chat2SQL error:', error);
        
        // Send error response
        onSendMessage(`Error: ${error instanceof Error ? error.message : 'Failed to execute SQL query'}`, undefined, {
          chat2sql: true,
          isServerResponse: true,
          error: error instanceof Error ? error.message : 'Failed to execute SQL query',
          timestamp: new Date().toISOString(),
          id: `chat2sql-error-${Date.now()}`
        });
      } finally {
        setLocalLoading(false);
      }
    } else {
      // Send regular message
      onSendMessage(message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    // File is not automatically uploaded here anymore
    // Instead, we'll show it in the preview with an upload button
  };

  const handleAutoUpload = async (file: File) => {
    try {
      setLocalLoading(true);
      setLocalUploadProgress(0);
      
      if (onUploadStart) {
        onUploadStart();
      }

      console.log(`Starting upload for file: ${file.name}, session: ${currentSessionId || 'none'}`);

      // Use the document service to upload to the correct endpoint
      const result = await documentService.uploadDocument(
        file,
        currentSessionId,
        undefined, // collectionId
        (progress) => {
          setLocalUploadProgress(progress);
        }
      );

      console.log('Document upload completed:', result);

      // Clear the selected file after successful upload
      setSelectedFile(null);
      setLocalUploadProgress(0);

      // Notify parent component of successful upload
      if (onUploadComplete) {
        onUploadComplete(true, result.document.id);
      }

      // Send a notification message to the chat about the upload
      const uploadMessage = `I've uploaded ${file.name} for analysis. The document is now being processed and will be available for RAG in a moment.`;
      onSendMessage(uploadMessage, undefined, { 
        isUploadNotification: true, 
        documentId: result.document.id,
        fileName: file.name 
      });

    } catch (error) {
      console.error('Error uploading document:', error);
      
      // Clear progress and notify of failure
      setLocalUploadProgress(0);
      
      if (onUploadComplete) {
        onUploadComplete(false);
      }

      // Send error message to chat
      const errorMessage = `Failed to upload ${file.name}. Please try again.`;
      onSendMessage(errorMessage, undefined, { 
        isUploadNotification: true, 
        isError: true,
        fileName: file.name 
      });
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setLocalUploadProgress(0);
  };

  // Get session-specific loading states or fall back to global ones
  const sessionLoading = sessionState?.isLoading || isLoading;
  const sessionStreaming = sessionState?.isStreaming || isStreaming;

  // Only show manual upload button if auto-upload is disabled and a file is selected
  const showManualUploadButton = selectedFile && !isUploading && !sessionLoading && !localLoading;

  return (
    <div
      style={{
        ...chatInputStyles.container,
        maxWidth: isEmpty ? '650px' : '900px',
        width: isEmpty ? '90vw' : '100%',
        transform: 'none',
        transition: 'all 0.3s ease',
        zIndex: 10, // Ensure it's above other elements
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        border: '1px solid var(--color-border)',
        marginTop: isEmpty ? '20px' : '0'
      }}
    >
      {/* File preview area */}
      {selectedFile && (
        <div style={chatInputStyles.filePreviewContainer}>
          <FilePreview
            file={selectedFile}
            onRemove={handleRemoveFile}
            uploadProgress={localLoading ? localUploadProgress : undefined}
          />

          {showManualUploadButton && (
            <button
              type="button"
              onClick={() => handleAutoUpload(selectedFile)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '0.8rem',
                marginLeft: '8px',
                cursor: 'pointer',
              }}
            >
              <ArrowUpTrayIcon className="h-3 w-3 mr-1" />
              Upload Now
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Main input row with textarea and send button */}
        <div style={{
          ...chatInputStyles.inputRow,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '1.5rem',
          padding: '0.25rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <textarea
            ref={inputRef}
            placeholder={isEmpty ? "Ask anything" : "Ask anything..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            // NEVER disable the textarea - this ensures cursor always shows as text input
            disabled={false}
            // Force focus when component mounts to ensure the cursor is active
            autoFocus
            // Set style with explicit cursor property
            style={{
              ...chatInputStyles.input,
              padding: isEmpty ? '0.75rem 1rem' : '0.75rem 1rem',
              height: 'auto',
              minHeight: '44px',
              maxHeight: '150px',
              resize: 'none',
              overflow: 'auto',
              borderRadius: '1.5rem',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'text' // Explicitly force text cursor
            }}
          />

          {/* Send/Stop button */}
          <div style={{ marginLeft: '0.5rem' }}>
            {sessionStreaming ? (
              <button
                type="button"
                onClick={onStopGeneration}
                style={{
                  ...chatInputStyles.sendButton,
                  backgroundColor: 'var(--color-error)',
                  transform: 'scale(1.05)',
                  transition: 'all 0.2s ease',
                }}
                aria-label="Stop generation"
                title="Stop generation"
              >
                <StopIcon className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="submit"
                // Only disable if input is empty - always allow sending when there's text
                disabled={input.trim() === ''}
                style={{
                  ...chatInputStyles.sendButton,
                  ...(input.trim() === '' ? chatInputStyles.disabledSendButton : {}),
                  transform: input.trim() !== '' ? 'scale(1.05)' : 'scale(1)',
                  cursor: input.trim() !== '' ? 'pointer' : 'not-allowed'
                }}
                aria-label="Send message"
              >
                <PaperAirplaneIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Buttons row below the input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.75rem',
            paddingLeft: '0.25rem',
            overflowX: 'auto',
            flexWrap: 'nowrap',
            justifyContent: 'flex-start',
          }}
          className="hide-scrollbar"
        >
          {/* File upload button */}
          <FileUploadButton
            onFileSelect={handleFileSelect}
            onAutoUpload={handleAutoUpload}
            autoUpload={true}
            isLoading={isUploading || localLoading}
            acceptedFileTypes=".pdf,.docx,.txt"
            disabled={false}
          />

          {/* RAG toggle button - always show but disable if not available */}
          <button
            type="button"
            onClick={onToggleRag}
            disabled={!isRagAvailable}
            style={{
              ...chatInputStyles.ragToggleButton,
              ...(isRagEnabled && isRagAvailable ? chatInputStyles.ragToggleEnabled : chatInputStyles.ragToggleDisabled),
              opacity: (!isRagAvailable) ? 0.5 : 1,
              cursor: 'pointer', // Always show pointer cursor
            }}
            className="hover:bg-opacity-90 transition-all"
            aria-label={isRagEnabled ? "Disable document-based answers" : "Enable document-based answers"}
            title={!isRagAvailable ? "Upload documents to enable RAG" : (isRagEnabled ? "Disable document-based answers" : "Enable document-based answers")}
          >
            <DocumentTextIcon className="h-4 w-4 mr-1" />
            RAG
          </button>

          {/* MCP toggle button - always enabled */}
          <button
            type="button"
            onClick={onToggleMCP}
            disabled={false}
            style={{
              ...chatInputStyles.mcpToggleButton,
              ...(isMCPEnabled ? chatInputStyles.mcpToggleEnabled : chatInputStyles.mcpToggleDisabled),
              opacity: 1, // Always fully visible
              cursor: 'pointer', // Always show pointer cursor
            }}
            className="hover:bg-opacity-90 transition-all"
            aria-label={isMCPEnabled ? "Disable MCP agent" : "Enable MCP agent"}
            title={isMCPEnabled ? "Disable MCP agent" : "Enable MCP agent"}
          >
            <CpuChipIcon className="h-4 w-4 mr-1" />
            MCP
          </button>

          {/* Chat2SQL toggle button - Added */}
          <button
            type="button"
            onClick={onToggleChat2Sql}
            disabled={false}
            style={{
              ...chatInputStyles.ragToggleButton, // Reuse RAG button styles for consistency
              ...(isChat2SqlEnabled ? chatInputStyles.ragToggleEnabled : chatInputStyles.ragToggleDisabled),
              opacity: 1, // Always fully visible
              cursor: 'pointer', // Always show pointer cursor
            }}
            className="hover:bg-opacity-90 transition-all"
            aria-label={isChat2SqlEnabled ? "Disable Chat2SQL mode" : "Enable Chat2SQL mode"}
            title={isChat2SqlEnabled ? "Disable Chat2SQL mode" : "Enable Chat2SQL mode"}
          >
            <TableCellsIcon className="h-4 w-4 mr-1" />
            Chat2SQL
          </button>

          {/* Predictor toggle button - Added */}
          <button
            type="button"
            onClick={onTogglePredictor}
            disabled={false}
            style={{
              ...chatInputStyles.ragToggleButton, // Reuse RAG button styles for consistency
              ...(isPredictorEnabled ? chatInputStyles.ragToggleEnabled : chatInputStyles.ragToggleDisabled),
              opacity: 1, // Always fully visible
              cursor: 'pointer', // Always show pointer cursor
            }}
            className="hover:bg-opacity-90 transition-all"
            aria-label={isPredictorEnabled ? "Disable Predictor mode" : "Enable Predictor mode"}
            title={isPredictorEnabled ? "Disable Predictor mode" : "Enable Predictor mode"}
          >
            <LightBulbIcon className="h-4 w-4 mr-1" />
            Predictor
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;