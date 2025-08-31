document.addEventListener('DOMContentLoaded', function() {
    const getClientListBtn = document.getElementById('getClientListBtn');
    const status = document.getElementById('status');
    const resultsCard = document.getElementById('resultsCard');
    const clientCount = document.getElementById('clientCount');
    const clientList = document.getElementById('clientList');
    const exportBtn = document.getElementById('exportBtn');
    const copyBtn = document.getElementById('copyBtn');

    let extractedData = [];

    // Update status display
    function updateStatus(message, type = 'info') {
        status.textContent = message;
        status.className = `status ${type}`;
    }

    // Show loading state
    function setLoading(isLoading) {
        const btnText = getClientListBtn.querySelector('.btn-text');
        const btnLoader = getClientListBtn.querySelector('.btn-loader');
        
        if (isLoading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline';
            getClientListBtn.disabled = true;
        } else {
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            getClientListBtn.disabled = false;
        }
    }

    // Display extracted client data
    function displayResults(data) {
        extractedData = data;
        clientCount.textContent = `Found ${data.length} clients`;
        
        // Persist client data to storage
        chrome.storage.local.set({
            'clientList': data,
            'clientListTimestamp': new Date().toISOString()
        });
        
        renderClientList(data);
        resultsCard.style.display = 'block';
    }





    // Main button click handler
    getClientListBtn.addEventListener('click', async function() {
        setLoading(true);
        updateStatus('Navigating to Kipu...', 'info');

        try {
            // Create new tab and navigate to Kipu
            const tab = await chrome.tabs.create({
                url: 'https://foundrytreatmentcenter.kipuworks.com/occupancy?p_building=6'
            });

            // Wait for tab to load
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });

            updateStatus('Injecting extraction script...', 'info');

            // Inject the KipuAssigned script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: injectKipuAssignedScript
            });

            updateStatus('Extracting client data...', 'info');

            // Wait a moment for script to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Execute the extraction
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractClientData
            });

            const clientData = results[0].result;

            if (clientData && clientData.length > 0) {
                updateStatus(`Successfully extracted ${clientData.length} clients!`, 'success');
                displayResults(clientData);
            } else {
                updateStatus('No client data found. Make sure you are logged into Kipu.', 'error');
            }

            // Close the Kipu tab
            await chrome.tabs.remove(tab.id);

        } catch (error) {
            console.error('Error:', error);
            updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    });

    // Export to JSON
    exportBtn.addEventListener('click', function() {
        const dataStr = JSON.stringify(extractedData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `kipu-clients-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        updateStatus('Data exported successfully!', 'success');
    });

    // Copy to clipboard
    copyBtn.addEventListener('click', async function() {
        try {
            const dataStr = JSON.stringify(extractedData, null, 2);
            await navigator.clipboard.writeText(dataStr);
            updateStatus('Data copied to clipboard!', 'success');
        } catch (error) {
            updateStatus('Failed to copy to clipboard', 'error');
        }
    });

    // Initialize
    updateStatus('Ready to extract client data', 'info');
    
    // Load persisted client list on startup
    loadPersistedClientList();
});

// Render client list in the UI (global function)
function renderClientList(data, clientListElement = null) {
    const listElement = clientListElement || document.getElementById('clientList');
    if (!listElement) {
        console.error('Client list element not found');
        return;
    }
    
    // Load completion status for all clients
    loadClientCompletionStatus(data, (completionStatus) => {
        listElement.innerHTML = '';
        data.forEach(client => {
            const isCompleted = completionStatus[client.patientId] || false;
            
            const clientDiv = document.createElement('div');
            clientDiv.className = `client-item clickable ${isCompleted ? 'completed' : ''}`;
            clientDiv.innerHTML = `
                <div class="client-completion">
                    <input type="checkbox" 
                           id="complete_${client.patientId}" 
                           class="completion-checkbox" 
                           ${isCompleted ? 'checked' : ''}
                           data-patient-id="${client.patientId}">
                    <label for="complete_${client.patientId}" class="completion-label">✓</label>
                </div>
                <div class="client-info">
                    <div class="client-name">${client.name}</div>
                    <div class="client-details">ID: ${client.patientId} | P: ${client.p || 'N/A'}</div>
                </div>
                <div class="client-arrow">→</div>
            `;
            
            // Add click handler to show evaluation form (but not on checkbox)
            clientDiv.addEventListener('click', (e) => {
                // Don't open form if clicking on checkbox or label
                if (e.target.classList.contains('completion-checkbox') || 
                    e.target.classList.contains('completion-label')) {
                    return;
                }
                showEvaluationForm(client);
            });
            
            // Add completion checkbox handler
            const checkbox = clientDiv.querySelector('.completion-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation(); // Prevent triggering the client click
                updateClientCompletionStatus(client.patientId, e.target.checked);
                
                // Update visual state
                if (e.target.checked) {
                    clientDiv.classList.add('completed');
                } else {
                    clientDiv.classList.remove('completed');
                }
            });
            
            listElement.appendChild(clientDiv);
        });
        
        console.log(`Rendered ${data.length} clients to the list`); // Debug log
    });
}

// Show evaluation form for selected client (global function)
function showEvaluationForm(client) {
    console.log('Opening evaluation form for client:', client); // Debug log
    
    // Hide main interface
    document.querySelector('main').style.display = 'none';
    
    // Load existing evaluation data for this client
    loadExistingEvaluation(client);
}

// Load existing evaluation data for a client
function loadExistingEvaluation(client) {
    chrome.storage.local.get(null, function(result) {
        // Find the most recent evaluation for this client
        const evaluationKeys = Object.keys(result).filter(key => 
            key.startsWith(`evaluation_${client.patientId}_`)
        );
        
        let mostRecentEvaluation = null;
        let mostRecentTimestamp = 0;
        
        evaluationKeys.forEach(key => {
            const evaluation = result[key];
            if (evaluation && evaluation.client && evaluation.client.patientId === client.patientId) {
                const timestamp = new Date(evaluation.timestamp).getTime();
                if (timestamp > mostRecentTimestamp) {
                    mostRecentTimestamp = timestamp;
                    mostRecentEvaluation = evaluation;
                }
            }
        });
        
        console.log('Most recent evaluation found:', mostRecentEvaluation); // Debug log
        
        // Create and show evaluation form with existing data
        createEvaluationForm(client, mostRecentEvaluation);
    });
}

// Create evaluation form for selected client
function createEvaluationForm(client, existingEvaluation = null) {
    const container = document.querySelector('.container');
    
    console.log('Creating form with existing data:', existingEvaluation); // Debug log
    
    const formHTML = `
        <div id="evaluationForm" class="evaluation-form">
            <div class="form-header">
                <button id="backBtn" class="btn secondary back-btn">← Back to Client List</button>
                <h2>Patient Evaluation - ${client.name}</h2>
                <div class="client-info">
                    <span>Patient ID: ${client.patientId}</span>
                    <span>P: ${client.p || 'N/A'}</span>
                    ${existingEvaluation ? `<span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">📝 Editing Saved Evaluation</span>` : ''}
                </div>
            </div>
            
            <form id="patientEvaluationForm" class="form-wrap">
                <!-- Physical Health Section -->
                <div class="form-section">
                    <h3 class="section-title">PHYSICAL HEALTH</h3>
                    
                    <div class="form-item">
                        <label class="form-label">Client Compliant with Meds:</label>
                        <div class="checkbox-item">
                            <input type="checkbox" id="med_compliant" name="med_compliant">
                            <label for="med_compliant">Yes</label>
                        </div>
                        <textarea id="med_compliant_textarea" class="form-textarea" placeholder="If not, explain:"></textarea>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Client Voiced the Following Medical Concerns:</label>
                        <div class="checkbox-item">
                            <input type="checkbox" id="no_concerns" name="medical_concerns">
                            <label for="no_concerns">None</label>
                        </div>
                        <textarea id="no_concerns_textarea" class="form-textarea" placeholder="Additional details..."></textarea>
                    </div>
                </div>

                <!-- Presentation Section -->
                <div class="form-section">
                    <h3 class="section-title">PRESENTATION</h3>
                    
                    <div class="form-item">
                        <label class="form-label">ADLS:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Bathing', 'Not Bathing', 'Grooming', 'Not Grooming', 'Neat', 'Disheveled', 'Clean'], 'adls')}
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Appetite:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Excessive', 'Within Normal Limits', 'Poor', 'Fair', 'Stress Eating'], 'appetite')}
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Behavior:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Hostile', 'Cooperative', 'Restless', 'Passive', 'Aggressive', 'Passive-Aggressive', 'Confrontational', 'Disengaged', 'Avoidant', 'Manipulative', 'Judgmental', 'Disrespectful', 'Impatient'], 'behavior')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="behavior_other" name="behavior">
                                <label for="behavior_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Thinking:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Black & White Thinking', 'Blaming', 'Personalizing', 'Irrational Decision Making', 'Self-Obsession', 'Minimizing', 'Externalizing Problems', 'Superficial Cooperation', 'Catastrophizing', 'Romanticizing', 'Emotionally Shut Down', 'Justifying', 'Victim Stance', 'Entitlement', 'Negativity', 'Delusional', 'Paranoia', 'Shame', 'Remorse', 'Superior', 'Judgmental'], 'thinking')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="thinking_other" name="thinking">
                                <label for="thinking_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Eye Contact:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Avoidant', 'Appropriate', 'Intermittent', 'Eyes Looking Downward', 'Tearful'], 'eye_contact')}
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Affect:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Labile', 'Constricted', 'Appropriate', 'Broad', 'Restricted', 'Blunted', 'Flat'], 'affect')}
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Mood:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Depressed', 'Anxious', 'Irritable', 'Agitated', 'Lethargic', 'Apathetic', 'Distraught', 'Euphoric', 'Dysphoric', 'Euthymic', 'Manic', 'Hypo-Manic'], 'mood')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="mood_other" name="mood">
                                <label for="mood_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Speech:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Flat', 'Pressured', 'Appropriate', 'Rambling', 'Slurred', 'Hesitant', 'Excessive'], 'speech')}
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Orientation:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Time, Person, Place, and Situation', 'Oriented x 2', 'Oriented only to self'], 'orientation')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="orientation_other" name="orientation">
                                <label for="orientation_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Insight:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['Poor', 'Fair', 'Good', 'Excellent', 'Improving'], 'insight')}
                        </div>
                    </div>
                </div>

                <!-- Risk Assessment Section -->
                <div class="form-section">
                    <h2 class="section-title major">RISK TO SELF OR OTHERS</h2>
                    
                    <div class="form-item">
                        <label class="form-label">Risk Thoughts/Behaviors:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['None Reported', 'Suicidal Ideation with Safety Plan in Place', 'Suicidal Ideation therapist notified', 'Suicidal Ideation clinical-on-call notified', 'Homicidal Ideation therapist notified', 'Homicidal Ideation clinical-on-call notified', 'Self-Harm Thoughts', 'Self-Harm Behavior'], 'risk_behaviors')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="risk_other" name="risk_behaviors">
                                <label for="risk_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Additional Information about Risk Thoughts and Behaviors:</label>
                        <div class="checkbox-item">
                            <input type="checkbox" id="no_additional_risk" name="additional_risk">
                            <label for="no_additional_risk">None</label>
                        </div>
                        <textarea id="no_additional_risk_textarea" class="form-textarea" placeholder="Additional details..."></textarea>
                    </div>
                </div>

                <!-- Addiction Symptoms Section -->
                <div class="form-section">
                    <h3 class="section-title">ADDICTION SYMPTOMS</h3>
                    
                    <div class="form-item">
                        <label class="form-label">Withdrawal and Detox Symptoms:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['None', 'Nausea', 'Tremor', 'Visual Disturbances', 'Elevated Pulse', 'Bone or Joint Aches', 'Yawning', 'Agitation', 'Depression', 'Difficulty Concentrating', 'Headaches', 'Unrestful Sleep', 'Future Tripping', 'Mood Swings', 'Vomiting', 'Auditory Disturbances', 'Anxiety', 'Restlessness', 'Runny Nose', 'Irritability', 'Paranoia', 'Fatigued', 'Loss of Appetite', 'Muscle Aches', 'Not Getting Enough Sleep', 'Trouble Sitting Still', 'Tactile Disturbance', 'Paroxysmal Sweats', 'Disorientation', 'Dilated Pupils', 'GI upset', 'Piloerection of Skin', 'Cravings', 'Tense', 'Palpitations', 'Feel Weak', 'Fearful', 'Lack of Energy'], 'withdrawal')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="withdrawal_other" name="withdrawal">
                                <label for="withdrawal_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">PAW Symptoms:</label>
                        <div class="checkbox-grid">
                            ${createCheckboxGroup(['None', 'Agitation', 'Depression', 'Difficulty Concentrating', 'Unrestful Sleep', 'Future Tripping', 'Mood Swings', 'Irritability', 'Paranoia', 'Fatigued', 'Not Getting Enough Sleep', 'Restless Sleep', 'Trouble Sitting Still', 'Disorientation', 'Cravings', 'Lack of Energy', 'Foggy', 'Issues with Fine Motor Skills', 'Stress Sensitivity', 'Anxiety or Panic', 'Anhedonia', 'Inability to Focus'], 'paw_symptoms')}
                            <div class="checkbox-item other-field">
                                <input type="checkbox" id="paw_other" name="paw_symptoms">
                                <label for="paw_other">Other:</label>
                                <input type="text" class="form-input inline" placeholder="Specify...">
                            </div>
                        </div>
                    </div>

                    <div class="form-item">
                        <label class="form-label">Current Craving Level:</label>
                        <div class="rating-scale">
                            ${createRatingScale(1, 10, 'craving_level')}
                        </div>
                    </div>
                </div>

                <!-- Data from the Day Section -->
                <div class="form-section">
                    <h3 class="section-title">DATA FROM THE DAY</h3>
                    
                    <div class="form-item">
                        <label class="form-label">Milieu Engagement:</label>
                        <textarea class="form-textarea large" placeholder="How the client showed up in the milieu. Were they hanging out with their peers, helping out with chores, isolating, aggressive with peers or staff, etc..."></textarea>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn secondary" id="cancelForm">Cancel</button>
                    <button type="submit" class="btn primary">Save Evaluation</button>
                </div>
            </form>
        </div>
    `;
    
    container.innerHTML = formHTML;
    
    // Add event listeners
    document.getElementById('backBtn').addEventListener('click', () => {
        restoreMainInterface();
    });
    
    document.getElementById('cancelForm').addEventListener('click', () => {
        restoreMainInterface();
    });
    
    document.getElementById('patientEvaluationForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmission(client);
    });
    
    // Add conditional logic for hiding/showing textareas
    setupConditionalTextareas();
    
    // Populate form with existing data if available
    if (existingEvaluation && existingEvaluation.data) {
        populateFormWithExistingData(existingEvaluation.data);
    }
}

// Setup conditional logic for textareas based on checkbox state
function setupConditionalTextareas() {
    // Medical compliance checkbox
    const medCompliantCheckbox = document.getElementById('med_compliant');
    const medCompliantTextarea = document.getElementById('med_compliant_textarea');
    
    medCompliantCheckbox.addEventListener('change', function() {
        if (this.checked) {
            medCompliantTextarea.style.display = 'none';
            medCompliantTextarea.value = ''; // Clear the value when hidden
        } else {
            medCompliantTextarea.style.display = 'block';
        }
    });
    
    // Initialize state
    if (medCompliantCheckbox.checked) {
        medCompliantTextarea.style.display = 'none';
    }
    
    // Medical concerns checkbox
    const noConcernsCheckbox = document.getElementById('no_concerns');
    const noConcernsTextarea = document.getElementById('no_concerns_textarea');
    
    noConcernsCheckbox.addEventListener('change', function() {
        if (this.checked) {
            noConcernsTextarea.style.display = 'none';
            noConcernsTextarea.value = ''; // Clear the value when hidden
        } else {
            noConcernsTextarea.style.display = 'block';
        }
    });
    
    // Initialize state
    if (noConcernsCheckbox.checked) {
        noConcernsTextarea.style.display = 'none';
    }
    
    // Additional risk information checkbox
    const noAdditionalRiskCheckbox = document.getElementById('no_additional_risk');
    const noAdditionalRiskTextarea = document.getElementById('no_additional_risk_textarea');
    
    noAdditionalRiskCheckbox.addEventListener('change', function() {
        if (this.checked) {
            noAdditionalRiskTextarea.style.display = 'none';
            noAdditionalRiskTextarea.value = ''; // Clear the value when hidden
        } else {
            noAdditionalRiskTextarea.style.display = 'block';
        }
    });
    
    // Initialize state
    if (noAdditionalRiskCheckbox.checked) {
        noAdditionalRiskTextarea.style.display = 'none';
    }
}

// Populate form with existing evaluation data
function populateFormWithExistingData(formData) {
    console.log('Populating form with data:', formData); // Debug log
    
    // Iterate through all form data
    for (const [name, value] of Object.entries(formData)) {
        if (!value) continue; // Skip empty values
        
        // Handle different input types
        const elements = document.querySelectorAll(`[name="${name}"]`);
        
        elements.forEach(element => {
            if (element.type === 'checkbox') {
                if (Array.isArray(value)) {
                    // Multiple checkboxes with same name
                    element.checked = value.includes(element.value);
                } else {
                    // Single checkbox
                    element.checked = value === element.value || value === 'on' || value === true;
                }
            } else if (element.type === 'radio') {
                element.checked = element.value === value;
            } else if (element.type === 'textarea' || element.tagName === 'TEXTAREA') {
                element.value = value;
            } else if (element.type === 'text' || element.type === 'date') {
                element.value = value;
            }
        });
        
        // Handle elements by ID (for specific cases)
        const elementById = document.getElementById(name);
        if (elementById) {
            if (elementById.type === 'checkbox') {
                elementById.checked = value === 'on' || value === true || value === elementById.value;
            } else if (elementById.type === 'radio') {
                elementById.checked = elementById.value === value;
            } else if (elementById.tagName === 'TEXTAREA') {
                elementById.value = value;
            } else if (elementById.type === 'text' || elementById.type === 'date') {
                elementById.value = value;
            }
        }
    }
    
    // After populating, reapply conditional logic
    setTimeout(() => {
        setupConditionalTextareas();
    }, 100);
    
    console.log('Form populated successfully'); // Debug log
}

// Load client completion status from storage
function loadClientCompletionStatus(clients, callback) {
    chrome.storage.local.get(['clientCompletionStatus'], function(result) {
        const completionStatus = result.clientCompletionStatus || {};
        callback(completionStatus);
    });
}

// Update client completion status in storage
function updateClientCompletionStatus(patientId, isCompleted) {
    chrome.storage.local.get(['clientCompletionStatus'], function(result) {
        const completionStatus = result.clientCompletionStatus || {};
        
        if (isCompleted) {
            completionStatus[patientId] = true;
        } else {
            delete completionStatus[patientId];
        }
        
        chrome.storage.local.set({
            'clientCompletionStatus': completionStatus
        });
        
        console.log(`Updated completion status for patient ${patientId}: ${isCompleted}`);
    });
}

// Helper function to create checkbox groups
function createCheckboxGroup(options, groupName) {
    return options.map((option, index) => `
        <div class="checkbox-item">
            <input type="checkbox" id="${groupName}_${index}" name="${groupName}" value="${option}">
            <label for="${groupName}_${index}">${option}</label>
        </div>
    `).join('');
}

// Helper function to create rating scale
function createRatingScale(min, max, name) {
    const options = [];
    for (let i = min; i <= max; i++) {
        options.push(`
            <div class="radio-item">
                <input type="radio" id="${name}_${i}" name="${name}" value="${i}">
                <label for="${name}_${i}">${i}</label>
            </div>
        `);
    }
    return options.join('');
}

// Handle form submission
function handleFormSubmission(client) {
    const formData = new FormData(document.getElementById('patientEvaluationForm'));
    const evaluationData = {
        client: client,
        timestamp: new Date().toISOString(),
        data: Object.fromEntries(formData)
    };
    
    // Store evaluation data
    chrome.storage.local.set({
        [`evaluation_${client.patientId}_${Date.now()}`]: evaluationData
    });
    
    alert('Evaluation saved successfully!');
    
    // Return to main view by restoring the original content
    restoreMainInterface();
}

// Restore the main interface
function restoreMainInterface() {
    const container = document.querySelector('.container');
    
    // Recreate the main interface HTML
    container.innerHTML = `
        <header>
            <h1>🏥 KipuSucks Client Data Extractor</h1>
            <p>Extract client data from Kipu occupancy reports</p>
        </header>

        <main>
            <div class="card">
                <h2>Client List Extraction</h2>
                <p>Click the button below to navigate to Kipu and extract the client list from the occupancy board.</p>
                
                <button id="getClientListBtn" class="btn primary">
                    <span class="btn-text">Get Client List</span>
                    <span class="btn-loader" style="display: none;">⏳</span>
                </button>

                <div id="status" class="status"></div>
            </div>

            <div class="card results-card" id="resultsCard" style="display: none;">
                <h3>Extracted Client Data</h3>
                <div id="clientCount" class="client-count"></div>
                <div id="clientList" class="client-list"></div>
                <button id="exportBtn" class="btn secondary">Export as JSON</button>
                <button id="copyBtn" class="btn secondary">Copy to Clipboard</button>
            </div>
        </main>
    `;
    
    // Re-initialize event listeners
    initializeMainInterface();
    
    // Load persisted data after a small delay to ensure DOM is ready
    setTimeout(() => {
        loadPersistedClientList();
    }, 100);
}

// Load persisted client list from storage
function loadPersistedClientList() {
    chrome.storage.local.get(['clientList', 'clientListTimestamp'], function(result) {
        console.log('Loading persisted client list:', result); // Debug log
        
        if (result.clientList && result.clientList.length > 0) {
            extractedData = result.clientList;
            
            // Update UI elements
            const clientCount = document.getElementById('clientCount');
            const clientListElement = document.getElementById('clientList');
            const resultsCard = document.getElementById('resultsCard');
            const status = document.getElementById('status');
            
            console.log('DOM elements found:', { clientCount: !!clientCount, clientList: !!clientListElement, resultsCard: !!resultsCard, status: !!status }); // Debug log
            
            if (clientCount && clientListElement && resultsCard && status) {
                clientCount.textContent = `Found ${result.clientList.length} clients`;
                renderClientList(result.clientList, clientListElement);
                resultsCard.style.display = 'block';
                
                // Show when the list was last updated
                const timestamp = new Date(result.clientListTimestamp);
                status.textContent = `Client list loaded (last updated: ${timestamp.toLocaleString()})`;
                status.className = 'status success';
                
                console.log('Client list restored successfully'); // Debug log
            } else {
                console.log('Some DOM elements not found, retrying in 200ms'); // Debug log
                // Retry after a longer delay if elements aren't ready
                setTimeout(() => loadPersistedClientList(), 200);
            }
        } else {
            console.log('No persisted client list found'); // Debug log
        }
    });
}

// Initialize main interface event listeners
function initializeMainInterface() {
    const getClientListBtn = document.getElementById('getClientListBtn');
    const exportBtn = document.getElementById('exportBtn');
    const copyBtn = document.getElementById('copyBtn');
    const status = document.getElementById('status');
    
    if (!getClientListBtn || !exportBtn || !copyBtn || !status) return;
    
    // Get client list button
    getClientListBtn.addEventListener('click', async function() {
        setLoadingState(true, getClientListBtn, status);
        updateStatusMessage('Navigating to Kipu...', 'info', status);

        try {
            // Create new tab and navigate to Kipu
            const tab = await chrome.tabs.create({
                url: 'https://foundrytreatmentcenter.kipuworks.com/occupancy?p_building=6'
            });

            // Wait for tab to load
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo) => {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });

            updateStatusMessage('Injecting extraction script...', 'info', status);

            // Inject the KipuAssigned script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: injectKipuAssignedScript
            });

            updateStatusMessage('Extracting client data...', 'info', status);

            // Wait a moment for script to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Execute the extraction
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractClientData
            });

            const clientData = results[0].result;

            if (clientData && clientData.length > 0) {
                updateStatusMessage(`Successfully extracted ${clientData.length} clients!`, 'success', status);
                displayResults(clientData);
            } else {
                updateStatusMessage('No client data found. Make sure you are logged into Kipu.', 'error', status);
            }

            // Close the Kipu tab
            await chrome.tabs.remove(tab.id);

        } catch (error) {
            console.error('Error:', error);
            updateStatusMessage(`Error: ${error.message}`, 'error', status);
        } finally {
            setLoadingState(false, getClientListBtn, status);
        }
    });

    // Export to JSON
    exportBtn.addEventListener('click', function() {
        const dataStr = JSON.stringify(extractedData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `kipu-clients-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        updateStatusMessage('Data exported successfully!', 'success', status);
    });

    // Copy to clipboard
    copyBtn.addEventListener('click', async function() {
        try {
            const dataStr = JSON.stringify(extractedData, null, 2);
            await navigator.clipboard.writeText(dataStr);
            updateStatusMessage('Data copied to clipboard!', 'success', status);
        } catch (error) {
            updateStatusMessage('Failed to copy to clipboard', 'error', status);
        }
    });
    
    // Initialize status
    updateStatusMessage('Ready to extract client data', 'info', status);
}

// Helper functions for UI updates
function setLoadingState(isLoading, button, status) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline';
        button.disabled = true;
    } else {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        button.disabled = false;
    }
}

function updateStatusMessage(message, type, statusElement) {
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
}

// Function to inject the KipuAssigned script
function injectKipuAssignedScript() {
    /* Kipu Assigned-only extractor (name, p, patientId), header-mapped + optional pagination */
    (() => {
      const api = window.KipuAssigned || {};

      // --- utils ---
      const clean = s => (s ?? "").toString().replace(/\s+/g, " ").trim();
      const lower = s => clean(s).toLowerCase();
      const cellsOfRow = row => Array.from(row.querySelectorAll("td"));
      const text = el => (el ? clean(el.textContent) : null);

      function anchorIn(cell) {
        return cell?.querySelector('a[href^="/patients/"]') || null;
      }
      function patientIdFromHref(href) {
        const m = href?.match(/\/patients\/(\d+)/);
        return m ? m[1] : null;
      }

      function headerIndexMap(table) {
        const ths = Array.from(table.querySelectorAll("thead th"));
        const names = ths.map(th => lower(th.textContent));
        const idx = (aliases) => {
          const i = names.findIndex(h => aliases.some(a => h === a || h.includes(a)));
          return i >= 0 ? i : null;
        };
        return {
          person: idx(["person in service","person","client","name"]),
          pFlag: idx(["p"])
        };
      }

      function parseAssignedMinimal(doc) {
        const table = doc.querySelector("#assigned_beds.occupancy_board");
        if (!table) return [];
        const idx = headerIndexMap(table);

        const rows = Array.from(table.querySelectorAll("tbody > tr")).filter(r => {
          const cls = r.className || "";
          if (/border_bottom_thick/.test(cls)) return false; // spacer
          if (/no_border/.test(cls)) return false;           // room label
          return r.querySelector('a[href^="/patients/"]');
        });

        return rows.map(r => {
          const tds = cellsOfRow(r);
          const personCell = idx.person != null ? tds[idx.person] : null;
          const link = anchorIn(personCell);
          const name = link ? clean(link.textContent) : text(personCell);
          const patientId = patientIdFromHref(link?.getAttribute("href"));
          const p = idx.pFlag != null ? text(tds[idx.pFlag]) : null;

          return (name && patientId) ? { name, p, patientId } : null;
        }).filter(Boolean);
      }

      // --- pagination (optional) ---
      async function fetchHtml(url) {
        const res = await fetch(url, { credentials: "include" });
        const html = await res.text();
        return new DOMParser().parseFromString(html, "text/html");
      }
      function nextPageUrl(doc) {
        const next = doc.querySelector('#pagination-nav a[rel="next"]') || doc.querySelector('#pagination-nav .next a');
        const href = next?.getAttribute("href");
        if (!href) return null;
        try { return new URL(href, location.href).href; } catch { return null; }
      }
      async function crawlAllPages(startUrl) {
        const all = [];
        let url = startUrl;
        let guard = 0;
        while (url && guard < 20) {
          const doc = await fetchHtml(url);
          all.push(...parseAssignedMinimal(doc));
          url = nextPageUrl(doc);
          guard++;
        }
        return all;
      }

      // --- public API ---
      api.extract = async ({ pages = "current" } = {}) => {
        let results = [];
        if (pages === "all") {
          results = await crawlAllPages(location.href);
        } else {
          results = parseAssignedMinimal(document);
        }
        // dedupe by patientId
        const seen = new Set();
        const out = results.filter(r => (seen.has(r.patientId) ? false : (seen.add(r.patientId), true)));
        console.log(`✅ Assigned-only: ${out.length} clients (${pages === "all" ? "all pages" : "this page"})`);
        return out;
      };

      window.KipuAssigned = api;
    })();
}

// Function to extract client data using the injected script
async function extractClientData() {
    if (typeof window.KipuAssigned === 'undefined') {
        throw new Error('KipuAssigned script not found');
    }
    
    return await window.KipuAssigned.extract({ pages: "current" });
}
