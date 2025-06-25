-- Create sample FlowTrack database schema and data
CREATE TABLE IF NOT EXISTS flow_runs (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size VARCHAR(20) NOT NULL,
    run_status VARCHAR(50) NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_steps (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES flow_runs(id),
    step_name VARCHAR(255) NOT NULL,
    step_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    dependencies TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO flow_runs (filename, file_type, file_size, run_status) VALUES
('design_flow_1.tcl', 'TCL Script', '2.5 MB', 'completed'),
('timing_analysis.sdc', 'SDC File', '1.2 MB', 'running'),
('placement_flow.def', 'DEF File', '15.8 MB', 'completed'),
('routing_config.cfg', 'Config File', '0.8 MB', 'failed');

INSERT INTO flow_steps (run_id, step_name, step_type, status, duration_seconds, dependencies) VALUES
(1, 'Synthesis', 'Logic Synthesis', 'completed', 1200, ''),
(1, 'Floorplan', 'Physical Design', 'completed', 800, 'Synthesis'),
(1, 'Placement', 'Physical Design', 'completed', 1500, 'Floorplan'),
(1, 'CTS', 'Clock Tree Synthesis', 'completed', 600, 'Placement'),
(1, 'Routing', 'Physical Design', 'completed', 2400, 'CTS'),
(1, 'DRC Check', 'Verification', 'completed', 300, 'Routing'),
(2, 'Synthesis', 'Logic Synthesis', 'completed', 1100, ''),
(2, 'Floorplan', 'Physical Design', 'running', NULL, 'Synthesis'),
(3, 'Synthesis', 'Logic Synthesis', 'completed', 1300, ''),
(3, 'Floorplan', 'Physical Design', 'completed', 900, 'Synthesis'),
(3, 'Placement', 'Physical Design', 'completed', 1600, 'Floorplan'),
(3, 'CTS', 'Clock Tree Synthesis', 'completed', 650, 'Placement'),
(3, 'Routing', 'Physical Design', 'completed', 2200, 'CTS'),
(4, 'Synthesis', 'Logic Synthesis', 'failed', 200, '');