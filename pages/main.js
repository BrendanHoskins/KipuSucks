document.addEventListener('DOMContentLoaded', function() {
    const getClientListBtn = document.getElementById('getClientListBtn');
    const status = document.getElementById('status');
    const resultsCard = document.getElementById('resultsCard');
    const clientCount = document.getElementById('clientCount');
    const clientList = document.getElementById('clientList');
    // Note: Export/Copy buttons removed in favor of AI enhancement

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
        
        // Set up AI button event listeners now that results card is visible
        setupAIButtonListeners();
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

            // Wait for tab to reach the final occupancy page (handling potential sign-in redirect)
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo, tabInfo) => {
                    if (tabId === tab.id) {
                        // Check if we're on the sign-in page
                        if (tabInfo.url && tabInfo.url.includes('/users/sign_in')) {
                            updateStatus('Please sign in to Kipu in the opened tab...', 'info');
                        }
                        // Check if we've reached the occupancy page and it's fully loaded
                        else if (tabInfo.url && tabInfo.url.includes('/occupancy?p_building=6') && changeInfo.status === 'complete') {
                            updateStatus('Occupancy page loaded, preparing extraction...', 'info');
                            chrome.tabs.onUpdated.removeListener(listener);
                            // Add a small delay to ensure page is fully rendered
                            setTimeout(resolve, 2000);
                        }
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
                // Close the Kipu tab only on success
                await chrome.tabs.remove(tab.id);
            } else {
                updateStatus('No client data found. The page may still be loading or you may need to sign in. Check the opened tab.', 'error');
                // Don't close the tab so user can check what's wrong
                console.log('No client data extracted. Tab left open for debugging.');
            }

        } catch (error) {
            console.error('Error:', error);
            updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    });

    // Export/Copy functionality removed in favor of AI enhancement

    // Set up Import Cravings button (available on initial load)
    const importCravingsBtn = document.getElementById('importCravingsBtn');
    const importShiftNotesBtn = document.getElementById('importShiftNotesBtn');
    if (importCravingsBtn) {
        console.log('Setting up Import Cravings button in DOMContentLoaded');
        importCravingsBtn.addEventListener('click', function() {
            console.log('Import Cravings button clicked (from DOMContentLoaded)');
            showCravingsModal();
        });
    } else {
        console.log('Import Cravings button not found in DOMContentLoaded');
    }

    if (importShiftNotesBtn) {
        importShiftNotesBtn.addEventListener('click', function() {
            showShiftNotesModal();
        });
    }

    // Also bind delete button here if present on initial load
    const deleteDataBtn = document.getElementById('deleteDataBtn');
    if (deleteDataBtn) {
        deleteDataBtn.addEventListener('click', async function() {
            if (!confirm('Delete all client list and evaluation data? This cannot be undone.')) return;
            try {
                updateStatus('Deleting all client data...', 'info');
                await wipeAllClientData();
                updateStatus('All client data deleted.', 'success');
                // Reset UI
                clientList.innerHTML = '';
                clientCount.textContent = '';
                resultsCard.style.display = 'none';
                document.querySelectorAll('.ai-status-badge').forEach(b => { b.textContent = 'AI: Not enhanced'; b.classList.remove('done'); });
            } catch (e) {
                console.error('Delete data error:', e);
                updateStatus('Failed to delete data.', 'error');
            }
        });
    }

    // Also bind Save in Kipu here if present on initial load
    const saveInKipuBtn = document.getElementById('saveInKipuBtn');
    if (saveInKipuBtn) {
        console.log('Binding Save in Kipu (DOMContentLoaded)');
        saveInKipuBtn.addEventListener('click', async function() {
            console.log('Save in Kipu clicked');
            try {
                updateStatus('Opening Kipu to save completed clients...', 'info');
                const completed = await getCompletedClientIds();
                if (completed.length === 0) {
                    updateStatus('No completed clients checked. Please check clients to save.', 'error');
                    return;
                }
                await saveCompletedClientsInKipu(completed);
                updateStatus('Save in Kipu initiated for completed clients.', 'success');
            } catch (e) {
                console.error('Save in Kipu error:', e);
                updateStatus(`Save in Kipu failed: ${e.message}`, 'error');
            }
        });
    } else {
        console.log('Save in Kipu button not found at DOMContentLoaded');
    }

    // Initialize
    updateStatus('Ready to extract client data', 'info');
    
    // Load persisted client list on startup
    loadPersistedClientList();
});

// Set up AI button event listeners (called when results are displayed)
function setupAIButtonListeners() {
    const enhanceBtn = document.getElementById('enhanceBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const deleteDataBtn = document.getElementById('deleteDataBtn');
    const saveInKipuBtn = document.getElementById('saveInKipuBtn');
    const tooltip = document.getElementById('aiTooltip');
    const status = document.getElementById('status');
    
    console.log('Setting up AI button listeners:', {
        enhanceBtn: !!enhanceBtn,
        settingsBtn: !!settingsBtn,
        tooltip: !!tooltip,
        status: !!status
    });
    
    // Settings toggle
    if (settingsBtn) {
        // Remove any existing listeners by cloning the node
        const newSettingsBtn = settingsBtn.cloneNode(true);
        settingsBtn.parentNode.replaceChild(newSettingsBtn, settingsBtn);
        
        newSettingsBtn.addEventListener('click', async function() {
            const panel = document.getElementById('settingsPanel');
            const isHidden = panel.style.display === 'none' || panel.style.display === '';
            panel.style.display = isHidden ? 'block' : 'none';
            if (isHidden) {
                await loadAISettingsIntoPanel();
            }
        });
    }
    
    // Save settings
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        // Remove any existing listeners by cloning the node
        const newSaveBtn = saveSettingsBtn.cloneNode(true);
        saveSettingsBtn.parentNode.replaceChild(newSaveBtn, saveSettingsBtn);
        
        newSaveBtn.addEventListener('click', async function() {
            const apiKey = document.getElementById('apiKeyInput').value.trim();
            const model = document.getElementById('modelSelect').value;
            await chrome.storage.local.set({ openai_api_key: apiKey, openai_model: model });
            updateStatusMessage('Settings saved', 'success', status);
            document.getElementById('settingsPanel').style.display = 'none';
        });
    }
    
    // Enhance with AI
    if (enhanceBtn) {
        // Remove any existing listeners by cloning the node
        const newEnhanceBtn = enhanceBtn.cloneNode(true);
        enhanceBtn.parentNode.replaceChild(newEnhanceBtn, enhanceBtn);
        
        newEnhanceBtn.addEventListener('click', async function() {
            // Hide tooltip if it's showing
            if (tooltip) {
                tooltip.style.display = 'none';
            }
            
            const apiKey = await getOpenAIApiKey();
            if (!apiKey) {
                // Show tooltip near button
                if (tooltip) {
                    tooltip.style.display = 'inline-block';
                    setTimeout(() => { tooltip.style.display = 'none'; }, 3000);
                }
                return;
            }
            await handleAIEnhancement(newEnhanceBtn, status);
        });
    }
}

// Render client list in the UI (global function)
function renderClientList(data, clientListElement = null) {
    const listElement = clientListElement || document.getElementById('clientList');
    if (!listElement) {
        console.error('Client list element not found');
        return;
    }
    
    // Load completion status for all clients
    loadClientCompletionStatus(data, (completionStatus) => {
        chrome.storage.local.get(['aiEnhancedStatus'], function(r) {
            const aiStatus = r.aiEnhancedStatus || {};
            listElement.innerHTML = '';
            data.forEach(client => {
            const isCompleted = completionStatus[client.patientId] || false;
            const isAiDone = !!aiStatus[String(client.patientId)];
            
            const clientDiv = document.createElement('div');
            clientDiv.className = `client-item clickable ${isCompleted ? 'completed' : ''}`;
            const aiBadgeHtml = `<span class=\"ai-status-badge ${isAiDone ? 'done' : ''}\" data-patient-id=\"${client.patientId}\">${isAiDone ? 'AI: Enhanced' : 'AI: Not enhanced'}</span>`;
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
                    <div class="client-name">${client.name} ${aiBadgeHtml}</div>
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
                    
                    <div class="day-swing-wrap">
                        <div class="form-item">
                            <label class="form-label">Day Shift Notes:</label>
                            <textarea id="day_shift_notes" name="day_shift_notes" class="form-textarea" placeholder="Imported or manual entry for day shift..."></textarea>
                        </div>
                        <div class="form-item">
                            <label class="form-label">Swing Shift Notes:</label>
                            <textarea id="swing_shift_notes" name="swing_shift_notes" class="form-textarea" placeholder="Imported or manual entry for swing shift..."></textarea>
                        </div>
                    </div>
                    <div class="form-item">
                        <label class="form-label">Milieu Engagement (final narrative):</label>
                        <textarea id="milieu_engagement" name="milieu_engagement" class="form-textarea large" placeholder="How the client showed up in the milieu. Were they hanging out with their peers, helping out with chores, isolating, aggressive with peers or staff, etc..."></textarea>
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
    
    // Auto-populate craving level from imported data if available
    autoPopulateCravingLevel(client);
    
    // Auto-populate Day/Swing if imported shift notes exist
    chrome.storage.local.get(['shiftNotesByFfr'], function(result) {
        const notes = result.shiftNotesByFfr || {};
        // derive ffrKey from client's p field
        const m = String(client.p || '').toUpperCase().match(/FFR[\s-]*(\d{4})[\s-]*(\d{2,3})/);
        if (m) {
            const key = `FFR${m[1]}${m[2].padStart(3,'0')}`;
            const entry = notes[key];
            if (entry) {
                const dayEl = document.getElementById('day_shift_notes');
                const swingEl = document.getElementById('swing_shift_notes');
                if (dayEl && entry.day) dayEl.value = entry.day;
                if (swingEl && entry.swing) swingEl.value = entry.swing;
            }
        }
    });

    // Populate form with existing data if available (this will override craving auto-population if evaluation exists)
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

// Handle AI Enhancement for completed clients
async function handleAIEnhancement(button, statusElement) {
    try {
        const apiKey = await getOpenAIApiKey();
        if (!apiKey) {
            updateStatusMessage('OpenAI API key required for AI enhancement', 'error', statusElement);
            return;
        }

        // Loading state
        setLoadingState(true, button, statusElement);
        updateStatusMessage('Finding completed clients...', 'info', statusElement);

        const completedClients = await getCompletedClientsWithEvaluations();
        if (completedClients.length === 0) {
            updateStatusMessage('No completed clients found. Please check off clients you want to enhance.', 'error', statusElement);
            setLoadingState(false, button, statusElement);
            return;
        }

        updateStatusMessage(`Enhancing ${completedClients.length} clients...`, 'info', statusElement);

        // Enhance one-by-one and update stored evaluations' milieu_engagement
        for (let i = 0; i < completedClients.length; i++) {
            const client = completedClients[i];
            updateStatusMessage(`Enhancing ${client.name} (${i + 1}/${completedClients.length})...`, 'info', statusElement);
            try {
                const shiftNote = await generateShiftNote(client);
                await persistMilieuEngagementReplacement(client.patientId, shiftNote);
                markClientAiEnhanced(client.patientId);
            } catch (err) {
                console.error('Enhancement error for client', client, err);
            }
        }

        updateStatusMessage('AI enhancement completed.', 'success', statusElement);
    } catch (error) {
        console.error('AI Enhancement error:', error);
        updateStatusMessage(`AI Enhancement failed: ${error.message}`, 'error', statusElement);
    } finally {
        setLoadingState(false, button, statusElement);
    }
}

// Get completed clients with their most recent evaluation data
async function getCompletedClientsWithEvaluations() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, function(result) {
            const completionStatus = result.clientCompletionStatus || {};
            const completedClientIds = Object.keys(completionStatus).filter(id => completionStatus[id]);

            const completedClients = [];
            completedClientIds.forEach(patientId => {
                const client = (Array.isArray(extractedData) ? extractedData : []).find(c => String(c.patientId) === String(patientId));
                if (!client) return;

                const evaluationKeys = Object.keys(result).filter(key => key.startsWith(`evaluation_${patientId}_`));
                let mostRecentEvaluation = null;
                let mostRecentTimestamp = 0;
                evaluationKeys.forEach(key => {
                    const evaluation = result[key];
                    if (evaluation && evaluation.client && String(evaluation.client.patientId) === String(patientId)) {
                        const ts = new Date(evaluation.timestamp).getTime();
                        if (ts > mostRecentTimestamp) {
                            mostRecentTimestamp = ts;
                            mostRecentEvaluation = evaluation;
                        }
                    }
                });

                if (mostRecentEvaluation) {
                    completedClients.push({
                        ...client,
                        evaluationData: mostRecentEvaluation.data
                    });
                }
            });

            resolve(completedClients);
        });
    });
}

// Get just the completed client ids
async function getCompletedClientIds() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['clientCompletionStatus'], function(result) {
            const completionStatus = result.clientCompletionStatus || {};
            const ids = Object.keys(completionStatus).filter(id => completionStatus[id]).map(id => String(id));
            resolve(ids);
        });
    });
}

// Save flow in Kipu: open each patient's records page and add a New Shift Note
async function saveCompletedClientsInKipu(patientIds) {
    for (let i = 0; i < patientIds.length; i++) {
        const pid = patientIds[i];
        const evaluationData = await getMostRecentEvaluationData(pid);
        await openAndPrepareKipuShiftNote(pid, evaluationData || {});
    }
}

async function getMostRecentEvaluationData(patientId) {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, function(result) {
            const keys = Object.keys(result).filter(k => k.startsWith(`evaluation_${patientId}_`));
            let latest = null, ts = 0;
            keys.forEach(k => {
                const ev = result[k];
                const t = new Date(ev.timestamp).getTime();
                if (t > ts) { ts = t; latest = ev; }
            });
            resolve(latest ? (latest.data || {}) : null);
        });
    });
}

async function openAndPrepareKipuShiftNote(patientId, evaluationData) {
    // Open records page
    const url = `https://foundrytreatmentcenter.kipuworks.com/patients/${patientId}/records?process=88`;
    const tab = await chrome.tabs.create({ url });

    // Wait for load
    await new Promise((resolve) => {
        const listener = (tabId, changeInfo, tabInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });

    // Click the robust Add form button
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            function tryClickAddForm() {
                // Prefer exact name match element
                const byName = document.querySelector('div.open-modal-cancel[name="addform"]');
                if (byName) { byName.click(); return true; }
                // Fallbacks by text and role
                const candidates = Array.from(document.querySelectorAll('div,button,a')).filter(el => {
                    const txt = (el.textContent || '').toLowerCase();
                    return txt.includes('add form') || txt.trim() === 'add form';
                });
                if (candidates.length) { candidates[0].click(); return true; }
                return false;
            }
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                if (tryClickAddForm() || attempts > 15) clearInterval(timer);
            }, 300);
        }
    });

    // Wait, then click Add for "New Shift Note"
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            function clickAddForNewShiftNote() {
                const dialog = document.querySelector('.ui-dialog .ui-dialog-content');
                if (!dialog) return false;
                const rows = Array.from(dialog.querySelectorAll('table.grid_index tr'));
                for (const row of rows) {
                    const label = (row.querySelector('td a.forms_app__add_patient_evaluation_link') || row.querySelector('td a'));
                    if (!label) continue;
                    const text = (label.textContent || '').toLowerCase();
                    if (text.includes('new shift note')) {
                        const addLink = row.querySelector('td a[href*="add_evaluation"]:not(.forms_app__add_patient_evaluation_link)') || row.querySelector('td a[href*="add_evaluation"]');
                        if (addLink) { (addLink).click(); return true; }
                    }
                }
                return false;
            }
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                if (clickAddForNewShiftNote() || attempts > 20) clearInterval(timer);
            }, 300);
        }
    });

    // Finally, click the top open, undated New Shift Note link (with grace delay and retries)
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            function findAndClickUndated() {
                const table = document.querySelector('table.grid_index');
                if (!table) return false;
                const links = Array.from(table.querySelectorAll('a.forms_app__edit_patient_evaluation_link'));
                for (const a of links) {
                    const label = (a.textContent || '').trim();
                    if (label !== 'New Shift Note') continue;
                    const row = a.closest('tr');
                    if (!row) continue;
                    const wrap = row.querySelector('[id^="patient_evaluation_status_"] .wrap');
                    const smalls = wrap ? Array.from(wrap.querySelectorAll('.small')) : [];
                    const status = (smalls[0] && smalls[0].textContent || '').trim().toLowerCase();
                    const dateText = (smalls[1] && smalls[1].textContent || '').trim();
                    const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(dateText);
                    if ((status === 'open' || status === '') && !hasDate) {
                        a.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Try robust click variants
                        try {
                            a.click();
                        } catch {}
                        try {
                            const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                            a.dispatchEvent(evt);
                        } catch {}
                        // As a final fallback, navigate directly
                        try {
                            const href = a.getAttribute('href');
                            if (href) {
                                const abs = new URL(href, location.origin).href;
                                setTimeout(() => { window.location.assign(abs); }, 150);
                            }
                        } catch {}
                        return true;
                    }
                }
                return false;
            }

            function tryClickAddInDialog() {
                const dialog = document.querySelector('.ui-dialog .ui-dialog-content');
                if (!dialog) return false;
                const rows = Array.from(dialog.querySelectorAll('table.grid_index tr'));
                for (const row of rows) {
                    const nameLink = row.querySelector('td a.forms_app__add_patient_evaluation_link, td a');
                    if (!nameLink) continue;
                    const text = (nameLink.textContent || '').toLowerCase();
                    if (text.includes('new shift note')) {
                        const addLink = row.querySelector('td a[href*="add_evaluation"]');
                        if (addLink) { addLink.click(); return true; }
                    }
                }
                return false;
            }

            const start = Date.now();
            const graceMs = 3000; // allow extra time for backend to create row
            const maxMs = 45000;
            const interval = setInterval(() => {
                const elapsed = Date.now() - start;
                if (elapsed < graceMs) return; // initial grace period

                if (findAndClickUndated()) { clearInterval(interval); return; }

                // If dialog still present, re-attempt clicking Add in the dialog
                tryClickAddInDialog();

                if (elapsed > maxMs) {
                    clearInterval(interval);
                }
            }, 400);
        }
    });

    // External fallback: poll from extension context, grab href and force navigate
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        const [{ result: href }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const table = document.querySelector('table.grid_index');
                if (!table) return null;
                const links = Array.from(table.querySelectorAll('a.forms_app__edit_patient_evaluation_link'));
                for (const a of links) {
                    const label = (a.textContent || '').trim();
                    if (label !== 'New Shift Note') continue;
                    const row = a.closest('tr');
                    if (!row) continue;
                    const wrap = row.querySelector('[id^="patient_evaluation_status_"] .wrap');
                    const smalls = wrap ? Array.from(wrap.querySelectorAll('.small')) : [];
                    const status = (smalls[0] && smalls[0].textContent || '').trim().toLowerCase();
                    const dateText = (smalls[1] && smalls[1].textContent || '').trim();
                    const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(dateText);
                    if ((status === 'open' || status === '') && !hasDate) {
                        const rel = a.getAttribute('href');
                        if (rel) {
                            try { return new URL(rel, location.origin).href; } catch { return rel; }
                        }
                    }
                }
                return null;
            }
        });
        if (href) {
            await chrome.tabs.update(tab.id, { url: href });
            break;
        }
        await new Promise(r => setTimeout(r, 800));
    }

    // After page navigates to edit, inject evaluation data into the form and submit
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [evaluationData],
        func: (evalData) => {
            function qs(sel) { return document.querySelector(sel); }
            function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
            function caseEq(a,b){ return (a||'').trim().toLowerCase() === (b||'').trim().toLowerCase(); }
            function norm(s){ return (s||'').toString().replace(/\s+/g,' ').trim().toLowerCase(); }

            // Find the form section container by its visible title text
            function findItemByTitleContains(titleText) {
                const tNorm = norm(titleText);
                const items = qsa('.patient_evaluation_item');
                for (const item of items) {
                    const t = item.querySelector('.item_title');
                    if (t && norm(t.textContent).includes(tNorm)) return item;
                }
                return null;
            }

            function setCheckboxByLabel(groupContainer, wantedLabels) {
                if (!groupContainer || !Array.isArray(wantedLabels)) return;
                const wraps = Array.from(groupContainer.querySelectorAll('.checkbox_list_wrap .wrap, .wrap'));
                wraps.forEach(w => {
                    const labelEl = w.querySelector('label');
                    const input = w.querySelector('input[type="checkbox"]');
                    if (!labelEl || !input) return;
                    const text = (labelEl.textContent || '').replace(/\s+/g,' ').trim();
                    if (wantedLabels.some(x => caseEq(x, text))) {
                        if (!input.checked) {
                            // Prefer click to trigger Kipu handlers
                            try { input.click(); } catch { input.checked = true; }
                        }
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }

            function setSingleCheckbox(container, value) {
                if (!container) return;
                const cb = container.querySelector('input[type="checkbox"]');
                if (cb) {
                    const desired = !!value;
                    if (cb.checked !== desired) {
                        try { cb.click(); } catch { cb.checked = desired; }
                    }
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }

            function setNoneCheckbox(container, shouldCheck) {
                if (!container) return;
                // Prefer the specific item_value checkbox within this item
                const direct = container.querySelector('input[type="checkbox"][name*="patient_evaluation[patient_evaluation_items_attributes]"][name$="[item_value]"]');
                if (direct) {
                    const desired = !!shouldCheck;
                    if (direct.checked !== desired) {
                        try { direct.click(); } catch { direct.checked = desired; }
                    }
                    direct.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
                // Fallback: find by label text containing "None"
                const wraps = Array.from(container.querySelectorAll('.wrap, .mtop04'));
                for (const w of wraps) {
                    const label = w.querySelector('label');
                    const input = w.querySelector('input[type="checkbox"]');
                    if (!label || !input) continue;
                    const text = (label.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
                    if (text.includes('none')) {
                        const desired = !!shouldCheck;
                        if (input.checked !== desired) {
                            try { input.click(); } catch { input.checked = desired; }
                        }
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        return;
                    }
                }
            }

            function setItemSubTextarea(container, text) {
                if (!container || !text) return;
                const sub = container.querySelector('[id^="patient_evaluation_item_sub_"]') || container;
                const inline = sub.querySelector('[id$="_description_inline_target"]');
                if (inline) inline.innerHTML = `<p>${String(text).replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>`;
                const ta = sub.querySelector('textarea[name$="[description]"]');
                if (ta) {
                    ta.value = text;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            function setTextareaByInlineTarget(inlineTargetId, textareaId, text) {
                if (!text) return;
                const inline = qs('#' + inlineTargetId);
                if (inline) inline.innerHTML = `<p>${String(text).replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>`;
                const ta = qs('#' + textareaId);
                if (ta) {
                    ta.value = text;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            // PHYSICAL HEALTH: Med compliant
            const medContainer = findItemByTitleContains('Client Compliant with Meds');
            setSingleCheckbox(medContainer, !!evalData.med_compliant);
            if (!evalData.med_compliant && evalData.med_compliant_textarea) {
                setTextareaByInlineTarget('patient_evaluation_eval_texts_attributes_0_description_inline_target','patient_evaluation_eval_texts_attributes_0_description', evalData.med_compliant_textarea);
            }

            // Medical concerns
            const concernsContainer = findItemByTitleContains('Client Voiced the Following Medical Concerns');
            const noneConcerns = Array.isArray(evalData.medical_concerns) ? evalData.medical_concerns.includes('None') : !evalData.medical_concerns;
            setNoneCheckbox(concernsContainer, noneConcerns);
            if (!noneConcerns && evalData.no_concerns_textarea) {
                setItemSubTextarea(concernsContainer, evalData.no_concerns_textarea);
            }

            // PRESENTATION groups
            const mapGroups = [
                { key: 'adls', title: 'adls' },
                { key: 'appetite', title: 'appetite' },
                { key: 'behavior', title: 'behavior' },
                { key: 'thinking', title: 'thinking' },
                { key: 'eye_contact', title: 'eye contact' },
                { key: 'affect', title: 'affect' },
                { key: 'mood', title: 'mood' },
                { key: 'speech', title: 'speech' },
                { key: 'orientation', title: 'orientation' },
                { key: 'insight', title: 'insight' }
            ];
            mapGroups.forEach(g => {
                const container = findItemByTitleContains(g.title);
                const vals = evalData[g.key];
                if (container && (Array.isArray(vals) || typeof vals === 'string')) {
                    setCheckboxByLabel(container, Array.isArray(vals) ? vals : [vals]);
                }
            });

            // RISK BEHAVIORS
            const riskContainer = findItemByTitleContains('risk thoughts/behaviors');
            if (riskContainer && evalData.risk_behaviors) setCheckboxByLabel(riskContainer, Array.isArray(evalData.risk_behaviors) ? evalData.risk_behaviors : [evalData.risk_behaviors]);
            const addRiskContainer = findItemByTitleContains('additional information about risk thoughts');
            const noneAddRisk = Array.isArray(evalData.additional_risk) ? evalData.additional_risk.includes('None') : !evalData.additional_risk;
            setNoneCheckbox(addRiskContainer, noneAddRisk);
            if (!noneAddRisk && evalData.no_additional_risk_textarea) {
                setItemSubTextarea(addRiskContainer, evalData.no_additional_risk_textarea);
            }

            // WITHDRAWAL / PAW
            const withdrawalContainer = findItemByTitleContains('withdrawal and detox symptoms');
            if (withdrawalContainer && evalData.withdrawal) setCheckboxByLabel(withdrawalContainer, Array.isArray(evalData.withdrawal) ? evalData.withdrawal : [evalData.withdrawal]);
            const pawContainer = findItemByTitleContains('paw symptoms');
            if (pawContainer && evalData.paw_symptoms) setCheckboxByLabel(pawContainer, Array.isArray(evalData.paw_symptoms) ? evalData.paw_symptoms : [evalData.paw_symptoms]);

            // Craving Level (1..10)
            if (evalData.craving_level) {
                const craveContainer = findItemByTitleContains('current craving level');
                if (craveContainer) setCheckboxByLabel(craveContainer, [String(evalData.craving_level)]);
            }

            // Milieu engagement
            if (evalData.milieu_engagement) {
                setTextareaByInlineTarget('patient_evaluation_eval_texts_attributes_3_description_inline_target','patient_evaluation_eval_texts_attributes_3_description', evalData.milieu_engagement);
            }

            // Optionally pre-fill day/swing text areas for user reference (local form only)
            // Note: These fields are not in Kipu form; they help build final narrative.

            // Submit (optional: leave open for review) – for now just leave open
            const submitBtn = document.getElementById('form_submit');
            if (submitBtn) {
                // Do not auto-submit to allow review; uncomment to submit automatically
                // submitBtn.click();
            }
        }
    });
}

// Replace the stored milieu_engagement text with AI-generated shift note
async function persistMilieuEngagementReplacement(patientId, shiftNote) {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, function(result) {
            const evaluationKeys = Object.keys(result).filter(key => key.startsWith(`evaluation_${patientId}_`));
            if (evaluationKeys.length === 0) return resolve();
            // Update the most recent evaluation
            let mostRecentKey = null; let mostRecentTs = 0;
            evaluationKeys.forEach(key => {
                const ev = result[key];
                const ts = new Date(ev.timestamp).getTime();
                if (ts > mostRecentTs) { mostRecentTs = ts; mostRecentKey = key; }
            });
            if (!mostRecentKey) return resolve();
            const ev = result[mostRecentKey];
            ev.data = ev.data || {};
            ev.data.milieu_engagement = shiftNote;
            chrome.storage.local.set({ [mostRecentKey]: ev }, resolve);
        });
    });
}

// Generate shift note using OpenAI
async function generateShiftNote(client) {
    const apiKey = await getOpenAIApiKey();
    const model = await getOpenAIModel();

    const evaluationSummary = formatEvaluationDataForAI(client.evaluationData);
    const prompt = `Based on the following patient evaluation data, write a highly polished, concise clinical shift note in ONE paragraph. Do your best to make connections between all of the evaluation data; do your best to not merely restate the evaluation data.\n\n` +
`Guidelines:\n` +
`- Do not include the date or time - just include clinical data\n` +
`- Write in professional clinical language\n` +
`- Be concise but comprehensive\n` +
`- Focus on behavioral observations, engagement, and safety\n` +
`- Include relevant medical compliance and concerns\n` +
`- NEVER make clinical or medical recommendations - these are technician, non-medical, non-clinical shift notes\n` +
`- Note any risk factors or notable behaviors\n` +
`- Use past tense\n` +
`- Consider these example notes as style references (do not copy verbatim):\n\n` +
`CLIENT HIGHLY ENGAGED – Example Shift Note:\nClient remained stable throughout the shift, presenting with a calm and cooperative demeanor. They participated in scheduled groups and meals without issue and engaged appropriately with peers and staff. No incidents or safety concerns were observed or reported. Vital signs were within normal limits, and the client complied with medication protocols as administered. The client appeared well-groomed and maintained personal hygiene. Staff observed no signs of distress, intoxication, or withdrawal. Client responded to redirection when needed and required minimal prompting for task completion. Overall, the client demonstrated appropriate behavior and maintained safety throughout the duration of the shift.\n\n` +
`CLIENT STRUGGLED WITH ENGAGING IN MILIEU – Example Shift Note:\nClient appeared withdrawn and irritable throughout the shift. They declined participation in two out of three scheduled groups despite redirection and encouragement from staff. During the one group they attended, client was present but minimally engaged. Client spent the majority of the day isolating in their room and required multiple prompts to complete hygiene tasks and attend meals. Staff noted that the client appeared tearful at times and reported feeling overwhelmed when briefly engaged. No safety concerns were observed or reported during the shift, and the client denied suicidal or homicidal ideation when assessed. Continued monitoring and clinical follow-up recommended.\n\n` +
`CLIENT SLEPT THROUGH THE NIGHT – Example Shift Note Summary:\nClient was observed resting in their room throughout the duration of the overnight shift. Sleep appeared uninterrupted and restful, with client changing position periodically but showing no signs of distress. All safety checks were completed, and the client remained safe with no behavioral concerns. No incidents or notable interactions occurred overnight. Client was redirected once for a minor noise disturbance and responded appropriately.\n\n` +
`CLIENT STRUGGLED WITH SLEEP – Example Shift Notes Summary:\nClient experienced difficulty sleeping during the overnight shift. They were observed out of bed multiple times and reported feeling restless and anxious. Staff offered supportive redirection and coping strategies, which the client was initially receptive to, but they continued to pace the hallway intermittently. Client declined PRN medication when offered and eventually rested for short intervals but did not achieve sustained sleep. No safety concerns were reported, and the client remained cooperative with staff interventions. Continued support and clinical follow-up are recommended.\n\n` +
`Evaluation Data:\n${evaluationSummary}`;

    const body = {
        model: model || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: 'You are a professional clinical documentation assistant specializing in behavioral health shift notes. Write clear, concise, and professional clinical documentation.' },
            { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.3
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content.trim() : '';
}

// Format evaluation data for AI
function formatEvaluationDataForAI(evaluationData) {
    let summary = [];
    if (!evaluationData) return 'No evaluation data.';

    // Medication compliance
    if (evaluationData.med_compliant) {
        summary.push('• Medication compliant');
    }
    // Medical concerns
    if (evaluationData.medical_concerns) {
        summary.push('• No medical concerns reported');
    }

    // Save in Kipu workflow
    if (saveInKipuBtn) {
        const newSaveBtn = saveInKipuBtn.cloneNode(true);
        saveInKipuBtn.parentNode.replaceChild(newSaveBtn, saveInKipuBtn);
        newSaveBtn.addEventListener('click', async function() {
            try {
                updateStatusMessage('Opening Kipu to save completed clients...', 'info', status);
                const completed = await getCompletedClientIds();
                if (completed.length === 0) {
                    updateStatusMessage('No completed clients checked. Please check clients to save.', 'error', status);
                    return;
                }
                await saveCompletedClientsInKipu(completed);
                updateStatusMessage('Save in Kipu initiated for completed clients.', 'success', status);
            } catch (e) {
                console.error('Save in Kipu error:', e);
                updateStatusMessage(`Save in Kipu failed: ${e.message}`, 'error', status);
            }
        });
    }

    // Delete all client/evaluation data
    if (deleteDataBtn) {
        const newDeleteBtn = deleteDataBtn.cloneNode(true);
        deleteDataBtn.parentNode.replaceChild(newDeleteBtn, deleteDataBtn);
        newDeleteBtn.addEventListener('click', async function() {
            if (!confirm('Delete all client list and evaluation data? This cannot be undone.')) return;
            try {
                updateStatusMessage('Deleting all client data...', 'info', status);
                await wipeAllClientData();
                updateStatusMessage('All client data deleted.', 'success', status);
                // Reset UI
                const clientListElement = document.getElementById('clientList');
                const clientCount = document.getElementById('clientCount');
                if (clientListElement) clientListElement.innerHTML = '';
                if (clientCount) clientCount.textContent = '';
                const resultsCard = document.getElementById('resultsCard');
                if (resultsCard) resultsCard.style.display = 'none';
                document.querySelectorAll('.ai-status-badge').forEach(b => { b.textContent = 'AI: Not enhanced'; b.classList.remove('done'); });
            } catch (e) {
                console.error('Delete data error:', e);
                updateStatusMessage('Failed to delete data.', 'error', status);
            }
        });
    }

    // Sections
    const sections = [
        { name: 'ADLs', prefix: 'adls' },
        { name: 'Appetite', prefix: 'appetite' },
        { name: 'Behavior', prefix: 'behavior' },
        { name: 'Thinking', prefix: 'thinking' },
        { name: 'Eye Contact', prefix: 'eye_contact' },
        { name: 'Affect', prefix: 'affect' },
        { name: 'Mood', prefix: 'mood' },
        { name: 'Speech', prefix: 'speech' },
        { name: 'Orientation', prefix: 'orientation' },
        { name: 'Insight', prefix: 'insight' },
        { name: 'Risk Behaviors', prefix: 'risk_behaviors' },
        { name: 'Withdrawal Symptoms', prefix: 'withdrawal' },
        { name: 'PAW Symptoms', prefix: 'paw_symptoms' }
    ];

    sections.forEach(section => {
        const values = [];
        Object.keys(evaluationData).forEach(key => {
            if (key.startsWith(section.prefix)) {
                const val = evaluationData[key];
                if (Array.isArray(val)) values.push(...val);
                else if (val) values.push(val);
            }
        });
        if (values.length > 0) summary.push(`• ${section.name}: ${values.join(', ')}`);
    });

    if (evaluationData.craving_level) {
        summary.push(`• Craving level: ${evaluationData.craving_level}/10`);
    }

    if (evaluationData.milieu_engagement && String(evaluationData.milieu_engagement).trim()) {
        summary.push(`• Milieu engagement notes: ${String(evaluationData.milieu_engagement).trim()}`);
    }

    return summary.length > 0 ? summary.join('\n') : 'No specific evaluation data recorded.';
}

// OpenAI API key management
async function getOpenAIApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['openai_api_key'], function(result) {
            resolve(result.openai_api_key || null);
        });
    });
}
async function getOpenAIModel() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['openai_model'], function(result) {
            resolve(result.openai_model || 'gpt-4o-mini');
        });
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
    const formEl = document.getElementById('patientEvaluationForm');
    const formData = new FormData(formEl);
    // Convert FormData to a rich object supporting arrays (checkbox groups)
    const dataObj = {};
    for (const [key, value] of formData.entries()) {
        if (dataObj[key] !== undefined) {
            if (!Array.isArray(dataObj[key])) dataObj[key] = [dataObj[key]];
            dataObj[key].push(value);
        } else {
            dataObj[key] = value;
        }
    }
    // Capture day/swing notes explicitly
    dataObj.day_shift_notes = (document.getElementById('day_shift_notes') || {}).value || '';
    dataObj.swing_shift_notes = (document.getElementById('swing_shift_notes') || {}).value || '';
    const evaluationData = {
        client: client,
        timestamp: new Date().toISOString(),
        data: dataObj
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
                
                <div class="button-row">
                    <button id="getClientListBtn" class="btn primary">
                        <span class="btn-text">Get Client List</span>
                        <span class="btn-loader" style="display: none;">⏳</span>
                    </button>
                    <button id="importCravingsBtn" class="btn secondary">📋 Import Cravings</button>
                </div>

                <div id="status" class="status"></div>
            </div>

            <div class="card results-card" id="resultsCard" style="display: none;">
                <h3>Extracted Client Data</h3>
                <div id="clientCount" class="client-count"></div>
                <div id="clientList" class="client-list"></div>
                <div class="actions-row">
                    <button id="enhanceBtn" class="btn primary ai-btn">
                        <span class="btn-text">🤖 Enhance with AI</span>
                        <span class="btn-loader" style="display: none;">⏳</span>
                    </button>
                    <button id="saveInKipuBtn" class="btn primary">Save in Kipu</button>
                    <button id="settingsBtn" class="btn secondary">Settings</button>
                    <div id="aiTooltip" class="tooltip" style="display:none;">Input API key!</div>
                </div>
                <div id="settingsPanel" class="settings-panel" style="display:none;">
                    <div class="settings-row">
                        <label for="apiKeyInput">OpenAI API Key</label>
                        <input type="password" id="apiKeyInput" placeholder="sk-...">
                    </div>
                    <div class="settings-row">
                        <label for="modelSelect">Model</label>
                        <select id="modelSelect">
                            <option value="gpt-4o-mini">gpt-4o-mini</option>
                            <option value="gpt-4o">gpt-4o</option>
                            <option value="gpt-4-turbo">gpt-4-turbo</option>
                            <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                        </select>
                    </div>
                    <div class="settings-actions">
                        <button id="saveSettingsBtn" class="btn secondary">Save</button>
                    </div>
                </div>
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
                
                // Set up AI button event listeners for restored results
                setupAIButtonListeners();
                
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
    const enhanceBtn = document.getElementById('enhanceBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const deleteDataBtn = document.getElementById('deleteDataBtn');
    const importCravingsBtn = document.getElementById('importCravingsBtn');
    const status = document.getElementById('status');
    const tooltip = document.getElementById('aiTooltip');
    
    if (!getClientListBtn || !status) {
        console.log('Missing required elements in initializeMainInterface');
        return;
    }
    
    // AI buttons might not be present initially, so we'll check for them separately
    console.log('Elements found:', {
        getClientListBtn: !!getClientListBtn,
        enhanceBtn: !!enhanceBtn,
        settingsBtn: !!settingsBtn,
        status: !!status,
        tooltip: !!tooltip,
        deleteDataBtn: !!deleteDataBtn
    });
    
    // Get client list button
    getClientListBtn.addEventListener('click', async function() {
        setLoadingState(true, getClientListBtn, status);
        updateStatusMessage('Navigating to Kipu...', 'info', status);

        try {
            // Create new tab and navigate to Kipu
            const tab = await chrome.tabs.create({
                url: 'https://foundrytreatmentcenter.kipuworks.com/occupancy?p_building=6'
            });

            // Wait for tab to reach the final occupancy page (handling potential sign-in redirect)
            await new Promise((resolve) => {
                const listener = (tabId, changeInfo, tabInfo) => {
                    if (tabId === tab.id) {
                        // Check if we're on the sign-in page
                        if (tabInfo.url && tabInfo.url.includes('/users/sign_in')) {
                            updateStatusMessage('Please sign in to Kipu in the opened tab...', 'info', status);
                        }
                        // Check if we've reached the occupancy page and it's fully loaded
                        else if (tabInfo.url && tabInfo.url.includes('/occupancy?p_building=6') && changeInfo.status === 'complete') {
                            updateStatusMessage('Occupancy page loaded, preparing extraction...', 'info', status);
                            chrome.tabs.onUpdated.removeListener(listener);
                            // Add a small delay to ensure page is fully rendered
                            setTimeout(resolve, 2000);
                        }
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
                // Close the Kipu tab only on success
                await chrome.tabs.remove(tab.id);
            } else {
                updateStatusMessage('No client data found. The page may still be loading or you may need to sign in. Check the opened tab.', 'error', status);
                // Don't close the tab so user can check what's wrong
                console.log('No client data extracted. Tab left open for debugging.');
            }

        } catch (error) {
            console.error('Error:', error);
            updateStatusMessage(`Error: ${error.message}`, 'error', status);
        } finally {
            setLoadingState(false, getClientListBtn, status);
        }
    });

    // Import Cravings button
    if (importCravingsBtn) {
        console.log('Setting up Import Cravings button listener');
        importCravingsBtn.addEventListener('click', function() {
            console.log('Import Cravings button clicked');
            showCravingsModal();
        });
    } else {
        console.log('Import Cravings button not found');
    }
    
    // AI button event listeners are now handled by setupAIButtonListeners() 
    // which is called when results are displayed
    
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

async function loadAISettingsIntoPanel() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['openai_api_key', 'openai_model'], function(result) {
            const apiKeyInput = document.getElementById('apiKeyInput');
            const modelSelect = document.getElementById('modelSelect');
            if (apiKeyInput) apiKeyInput.value = result.openai_api_key || '';
            if (modelSelect) modelSelect.value = result.openai_model || 'gpt-4o-mini';
            resolve();
        });
    });
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

// ================================
// CRAVINGS IMPORT FUNCTIONALITY
// ================================

// Show the cravings import modal
function showCravingsModal() {
    console.log('showCravingsModal called');
    const modal = document.getElementById('cravingsModal');
    const textarea = document.getElementById('cravingsTextarea');
    const statusDiv = document.getElementById('cravingsStatus');
    
    console.log('Modal elements found:', {
        modal: !!modal,
        textarea: !!textarea,
        statusDiv: !!statusDiv
    });
    
    if (!modal) {
        console.error('Cravings modal not found in DOM');
        return;
    }
    
    // Clear previous content and status
    if (textarea) textarea.value = '';
    if (statusDiv) {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
    }
    
    modal.style.display = 'block';
    console.log('Modal should now be visible');
    
    // Set up modal event listeners
    setupCravingsModalListeners();
}

// Shift Notes import modal
function showShiftNotesModal() {
    const modal = document.getElementById('shiftNotesModal');
    const textarea = document.getElementById('shiftNotesTextarea');
    const statusDiv = document.getElementById('shiftNotesStatus');
    if (!modal) return;
    if (textarea) textarea.value = '';
    if (statusDiv) { statusDiv.textContent = ''; statusDiv.className = 'status'; }
    modal.style.display = 'block';
    setupShiftNotesModalListeners();
}

function setupShiftNotesModalListeners() {
    const modal = document.getElementById('shiftNotesModal');
    const closeBtn = document.getElementById('closeShiftNotesModal');
    const cancelBtn = document.getElementById('cancelShiftNotesBtn');
    const parseBtn = document.getElementById('parseShiftNotesBtn');
    const statusDiv = document.getElementById('shiftNotesStatus');

    const closeModal = () => { if (modal) modal.style.display = 'none'; };
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    window.addEventListener('click', function (e) { if (e.target === modal) closeModal(); }, { once: true });

    if (parseBtn) parseBtn.onclick = async function() {
        const text = (document.getElementById('shiftNotesTextarea') || {}).value || '';
        if (!text.trim()) { updateShiftNotesStatus('Please paste the shift notes text.', 'error'); return; }
        try {
            updateShiftNotesStatus('Parsing shift notes...', 'info');
            const parsed = parseShiftNotesText(text);
            await persistShiftNotes(parsed);
            updateShiftNotesStatus(`Imported shift notes for ${Object.keys(parsed).length} clients.`, 'success');
            setTimeout(closeModal, 1500);
        } catch (e) {
            console.error('Shift notes parse error:', e);
            updateShiftNotesStatus(`Error: ${e.message}`, 'error');
        }
    };
}

function updateShiftNotesStatus(msg, type='info') {
    const el = document.getElementById('shiftNotesStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = `status ${type}`;
}

// Parse example blob into { ffrKey: { day: string, swing: string } }
function parseShiftNotesText(text) {
    const lines = text.split(/\r?\n/);
    const clientNotes = {}; // key: FFRYYYYNNN
    let currentKey = null;
    let collecting = null; // 'day' | 'swing'
    function normalizeFFR(ffrRaw) {
        const m = String(ffrRaw || '').toUpperCase().match(/F\s*F\s*R[\s-]*(\d{4})[\s-]*(\d{2,3})/);
        if (!m) return null;
        const year = m[1]; const last = m[2].padStart(3, '0');
        return `FFR${year}${last}`;
    }

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = (raw || '').trim();
        // Detect client line with FFR
        const f = line.match(/FFR[^\d]*(\d{4})[^\d]*(\d{2,3})/i) || line.match(/FRR[^\d]*(\d{4})[^\d]*(\d{2,3})/i);
        if (f) {
            const key = normalizeFFR(f[0]);
            if (key) {
                currentKey = key;
                if (!clientNotes[currentKey]) clientNotes[currentKey] = { day: '', swing: '' };
                collecting = null;
                continue;
            }
        }
        if (/^Day\s*:/.test(line)) { collecting = 'day'; const after = line.replace(/^Day\s*:\s*/,''); if (currentKey) clientNotes[currentKey].day += (after ? after + '\n' : ''); continue; }
        if (/^Swing\s*:/.test(line)) { collecting = 'swing'; const after = line.replace(/^Swing\s*:\s*/,''); if (currentKey) clientNotes[currentKey].swing += (after ? after + '\n' : ''); continue; }
        if (collecting && currentKey) {
            clientNotes[currentKey][collecting] += line + '\n';
        }
    }
    // Trim
    Object.keys(clientNotes).forEach(k => {
        clientNotes[k].day = clientNotes[k].day.trim();
        clientNotes[k].swing = clientNotes[k].swing.trim();
    });
    return clientNotes;
}

async function persistShiftNotes(parsed) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['shiftNotesByFfr'], function(result) {
            const existing = result.shiftNotesByFfr || {};
            const merged = { ...existing, ...parsed };
            chrome.storage.local.set({ shiftNotesByFfr: merged }, resolve);
        });
    });
}
// Set up event listeners for the cravings modal
function setupCravingsModalListeners() {
    const modal = document.getElementById('cravingsModal');
    const closeBtn = document.getElementById('closeCravingsModal');
    const cancelBtn = document.getElementById('cancelCravingsBtn');
    const parseBtn = document.getElementById('parseCravingsBtn');
    
    // Close modal handlers
    const closeModal = () => {
        modal.style.display = 'none';
    };
    
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    
    // Close modal when clicking outside
    window.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };
    
    // Parse cravings button
    parseBtn.onclick = function() {
        const textarea = document.getElementById('cravingsTextarea');
        const text = textarea.value.trim();
        
        if (!text) {
            updateCravingsStatus('Please paste the morning opener text first.', 'error');
            return;
        }
        
        processCravingsData(text);
    };
}

// Update status in the cravings modal
function updateCravingsStatus(message, type = 'info') {
    const statusDiv = document.getElementById('cravingsStatus');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

// Parse the morning opener text and extract craving data
function processCravingsData(text) {
    updateCravingsStatus('Parsing morning opener data...', 'info');
    
    try {
        const clients = parseMorningOpenerText(text);
        const matches = matchClientsWithCravings(clients);
        storeCravingData(matches);
        
        updateCravingsStatus(`Successfully processed ${matches.length} clients with craving data.`, 'success');
        
        // Close modal after short delay
        setTimeout(() => {
            document.getElementById('cravingsModal').style.display = 'none';
        }, 2000);
        
    } catch (error) {
        console.error('Error processing cravings data:', error);
        updateCravingsStatus(`Error processing data: ${error.message}`, 'error');
    }
}

// Parse the morning opener text blob
function parseMorningOpenerText(text) {
    const clients = [];
    const lines = text.split('\n');
    let currentClient = null;

    function normalizeFfr(ffrRaw) {
        if (!ffrRaw) return null;
        const m = String(ffrRaw).toUpperCase().match(/FFR[\s-]*(\d{4})[\s-]*(\d{2,3})/);
        if (!m) return null;
        const year = m[1];
        const last = m[2].padStart(3, '0');
        return { canonical: `FFR-${year}-${last}`, key: `FFR${year}${last}` };
    }

    function extractNameAndFfrFromLine(idx) {
        const raw = lines[idx] ?? '';
        const line = raw.trim();
        const f = line.match(/(FFR[\s-]*\d{4}[\s-]*\d{2,3})/i);
        if (!f) return null;
        const ffr = normalizeFfr(f[1]);
        // Try to get name from same line before FFR token
        const namePart = line.slice(0, f.index).trim();
        let name = namePart;
        if (!name) {
            // Fallback: previous non-empty line
            for (let j = idx - 1; j >= 0; j--) {
                const prev = (lines[j] || '').trim();
                if (prev) { name = prev; break; }
            }
        }
        return ffr ? { name, ffr } : null;
    }

    for (let i = 0; i < lines.length; i++) {
        const trimmed = (lines[i] || '').trim();

        // Any line containing FFR (flexible formatting) starts a new client
        const candidate = extractNameAndFfrFromLine(i);
        if (candidate && candidate.name) {
            if (currentClient) clients.push(currentClient);
            currentClient = {
                name: candidate.name,
                ffrNumber: candidate.ffr.canonical,
                ffrKey: candidate.ffr.key,
                cravings: []
            };
            continue;
        }

        // Parse craving/trigger line
        if (currentClient && trimmed.toLowerCase().includes('cravings/triggers')) {
            const idxColon = trimmed.indexOf(':');
            const cravingsData = idxColon >= 0 ? trimmed.slice(idxColon + 1).trim() : trimmed;
            currentClient.cravings = extractCravingLevels(cravingsData);
        }
    }

    // Don't forget the last client
    if (currentClient) {
        clients.push(currentClient);
    }

    console.log('Parsed clients:', clients);
    return clients;
}

// Extract craving levels from the cravings/triggers text (robust: supports unlabeled numbers)
function extractCravingLevels(cravingsText) {
    const out = [];
    if (!cravingsText) return out;

    const text = String(cravingsText).toLowerCase();

    // Known substance abbreviations for nicer labels (optional)
    const substanceMap = {
        'alc': 'alcohol',
        'nic': 'nicotine',
        'coc': 'cocaine',
        'her': 'heroin',
        'meth': 'methamphetamine',
        'pot': 'marijuana',
        'weed': 'marijuana',
        'thc': 'marijuana',
        'sub': 'substance'
    };

    // 1) Labeled forms like: "alc 5", "nic-7", "alc: 4"
    const labeledRegex = /(?:^|[\s,])(alc|nic|coc|her|meth|pot|weed|thc|sub)\s*[-:]?\s*(10|[0-9])(?=$|[^0-9])/gi;
    let m;
    while ((m = labeledRegex.exec(text)) !== null) {
        const sub = (m[1] || '').trim();
        const lvl = parseInt(m[2], 10);
        if (!Number.isNaN(lvl) && lvl >= 0 && lvl <= 10) {
            out.push({ substance: substanceMap[sub] || sub, level: lvl });
        }
    }

    // 2) Patterns like: "10 for ..." (number-first)
    const numberForRegex = /\b(10|[0-9])\s*for\b/gi;
    let nf;
    while ((nf = numberForRegex.exec(text)) !== null) {
        const lvl = parseInt(nf[1], 10);
        if (!Number.isNaN(lvl) && lvl >= 0 && lvl <= 10) {
            out.push({ substance: 'unknown', level: lvl });
        }
    }

    // 3) Generic numeric fallback: grab all numbers and keep those in [0..10]
    // Handles: "0/10", "0-0", "0 and 0", "nic-7", "0for" etc.
    const allNums = (text.match(/\d+/g) || [])
        .map(n => parseInt(n, 10))
        .filter(n => !Number.isNaN(n) && n >= 0 && n <= 10);

    if (allNums.length === 0 && out.length === 0) return out;

    // Determine the single highest level found overall
    const highest = Math.max(
        ...(out.map(o => o.level).concat([-1])),
        ...(allNums.length ? allNums : [-1])
    );

    // Return only the max level (substance optional)
    if (highest >= 0) {
        // Prefer a labeled entry if one matches the highest value
        const labeled = out.find(o => o.level === highest);
        return [{ substance: labeled ? labeled.substance : 'unknown', level: highest }];
    }

    return out;
}

// Match clients from morning opener with clients from our extracted list
function matchClientsWithCravings(morningClients) {
    if (!extractedData || !Array.isArray(extractedData)) {
        throw new Error('No client list found. Please extract client list first.');
    }
    
    const matches = [];
    function normalizeFfrFromP(pText) {
        if (!pText) return null;
        const m = String(pText).toUpperCase().match(/FFR[\s-]*(\d{4})[\s-]*(\d{2,3})/);
        if (!m) return null;
        const year = m[1];
        const last = m[2].padStart(3, '0');
        return `FFR${year}${last}`; // key form
    }

    morningClients.forEach(morningClient => {
        // Find matching client in our extracted data by FFR number (normalized)
        const targetKey = morningClient.ffrKey || (morningClient.ffrNumber ? morningClient.ffrNumber.replace(/[^0-9A-Z]/g, '') : null);
        const matchedClient = extractedData.find(client => {
            const key = normalizeFfrFromP(client.p || '');
            return key && targetKey && key === targetKey;
        });
        
        if (matchedClient && morningClient.cravings.length > 0) {
            // Find the highest craving level
            const highestCraving = morningClient.cravings.reduce((max, current) => 
                current.level > max.level ? current : max
            );
            
            matches.push({
                client: matchedClient,
                morningData: morningClient,
                highestCraving: highestCraving
            });
        }
    });
    
    console.log('Matched clients with cravings:', matches);
    return matches;
}

// Store craving data for use when opening evaluation forms
function storeCravingData(matches) {
    const cravingData = {};
    
    matches.forEach(match => {
        cravingData[match.client.patientId] = {
            substance: match.highestCraving.substance,
            level: match.highestCraving.level,
            ffrNumber: match.morningData.ffrNumber,
            clientName: match.client.name
        };
    });
    
    // Store in Chrome storage
    chrome.storage.local.set({ 'importedCravings': cravingData }, function() {
        console.log('Craving data stored:', cravingData);
    });
}

// Mark a client as AI enhanced and update badge
function markClientAiEnhanced(patientId) {
    const badge = document.querySelector(`.ai-status-badge[data-patient-id="${patientId}"]`);
    if (badge) {
        badge.textContent = 'AI: Enhanced';
        badge.classList.add('done');
    }
    // Persist optional flag
    chrome.storage.local.get(['aiEnhancedStatus'], function(result) {
        const status = result.aiEnhancedStatus || {};
        status[String(patientId)] = true;
        chrome.storage.local.set({ aiEnhancedStatus: status });
    });
}

// Wipe all client list, evaluations, completion flags, AI settings (optional keep), and imported cravings
async function wipeAllClientData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, function(all) {
            const keysToRemove = [];

            // Client list and timestamp
            if ('clientList' in all) keysToRemove.push('clientList');
            if ('clientListTimestamp' in all) keysToRemove.push('clientListTimestamp');

            // Completion checkboxes
            if ('clientCompletionStatus' in all) keysToRemove.push('clientCompletionStatus');

            // Imported cravings and shift notes
            if ('importedCravings' in all) keysToRemove.push('importedCravings');
            if ('shiftNotesByFfr' in all) keysToRemove.push('shiftNotesByFfr');

            // Evaluations
            Object.keys(all).forEach(k => {
                if (k.startsWith('evaluation_')) keysToRemove.push(k);
            });

            // AI Enhanced status badges
            if ('aiEnhancedStatus' in all) keysToRemove.push('aiEnhancedStatus');

            // Optionally keep OpenAI settings; comment next 2 lines if you want to delete
            // if ('openai_api_key' in all) keysToRemove.push('openai_api_key');
            // if ('openai_model' in all) keysToRemove.push('openai_model');

            if (keysToRemove.length === 0) return resolve();
            chrome.storage.local.remove(keysToRemove, () => resolve());
        });
    });
}

// Auto-populate craving level in evaluation form from imported morning opener data
function autoPopulateCravingLevel(client) {
    chrome.storage.local.get(['importedCravings'], function(result) {
        const cravingData = result.importedCravings || {};
        const pid = String(client.patientId);
        let clientCraving = cravingData[pid] || cravingData[client.patientId];
        if (!clientCraving) {
            // Fallback: find by loose key match
            const foundKey = Object.keys(cravingData).find(k => String(k) === pid);
            if (foundKey) clientCraving = cravingData[foundKey];
        }
        
        if (clientCraving) {
            console.log('Auto-populating craving level for', client.name, ':', clientCraving);
            
            // Find and check the radio button for the craving level
            const levelToUse = Math.max(1, Number(clientCraving.level) || 0); // clamp 0 to 1 (UI supports 1..10)
            const cravingRadio = document.querySelector(`input[name="craving_level"][value="${levelToUse}"]`);
            if (cravingRadio) {
                cravingRadio.checked = true;
                console.log(`Set craving level to ${levelToUse} for ${client.name}`);
                
                // Show a subtle notification that data was auto-populated
                const cravingSection = cravingRadio.closest('.form-item');
                if (cravingSection) {
                    const label = cravingSection.querySelector('.form-label');
                    if (label && !label.textContent.includes('(auto-filled)')) {
                        label.textContent += ` (auto-filled: ${clientCraving.substance || 'unlabeled'} ${levelToUse})`;
                        label.style.color = '#2e7d32'; // Green color to indicate auto-fill
                    }
                }
            } else {
                console.warn('Craving radio not found for level', levelToUse, 'for client', client);
            }
        }
    });
}
