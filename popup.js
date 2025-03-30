document.addEventListener('DOMContentLoaded', () => {
    // --- Globals ---
    let currentTemplates = []; // Still needed to populate Editor & Site Assignment
    let currentSites = [];
    let currentTabUrl = '';
    let selectedTemplateForEditor = null;

    // --- DOM References ---
    const tabs = {
        editor: document.getElementById('tab-editor'),
        templates: document.getElementById('tab-templates'), // Tab button still exists
        sites: document.getElementById('tab-sites'),
    };
    const contents = {
        editor: document.getElementById('content-editor'),
        templates: document.getElementById('content-templates'), // Content area still exists
        sites: document.getElementById('content-sites'),
    };
    // Editor Tab Elements
    const editorStatus = document.getElementById('editor-status');
    const editorArea = document.getElementById('editor-area');
    const printButton = document.getElementById('print-button');
    const templateSelectorDiv = document.getElementById('editor-template-selector');
    const templateSelect = document.getElementById('template-select');

    // Templates Tab Elements (Simplified)
    const openOptionsPageBtn = document.getElementById('open-options-page-btn');

    // Sites Tab Elements (Mostly unchanged)
    const sitesList = document.getElementById('sites-list');
    const addSiteBtn = document.getElementById('add-site-btn');
    const siteEditor = document.getElementById('site-editor');
    const siteEditorTitle = document.getElementById('site-editor-title');
    const saveSiteBtn = document.getElementById('save-site-btn');
    const cancelSiteBtn = document.getElementById('cancel-site-btn');
    const siteEditId = document.getElementById('site-edit-id');
    const siteTemplateAssignment = document.getElementById('site-template-assignment');
    // Site form fields...

    // --- Tab Switching Logic ---
    function switchTab(targetTabId) {
        Object.keys(tabs).forEach(key => {
            const isTarget = `tab-${key}` === targetTabId;
            tabs[key].classList.toggle('active', isTarget);
            contents[key].classList.toggle('active', isTarget);
        });
        // Refresh content if needed when switching TO a tab
        if (targetTabId === 'tab-editor') updateEditorTab();
        // No specific refresh needed for the new Templates tab content
        if (targetTabId === 'tab-sites') loadAndRenderSites(); // Load sites if needed
    }

    Object.values(tabs).forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.id));
    });

    // --- Storage Interaction (Unchanged) ---
    function loadData(callback) {
        chrome.storage.local.get(['templates', 'sites'], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error loading data:", chrome.runtime.lastError);
                currentTemplates = [];
                currentSites = [];
            } else {
                // Ensure elements array exists, default to empty
                currentTemplates = (result.templates || []).map(t => ({ ...t, elements: t.elements || [] }));
                currentSites = result.sites || [];
            }
            console.log("Popup: Data loaded:", { templates: currentTemplates, sites: currentSites });
            if (callback) callback();
        });
    }

    function saveData(callback) { // Keep for Sites saving
        chrome.storage.local.set({ templates: currentTemplates, sites: currentSites }, () => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Error saving data:", chrome.runtime.lastError);
            } else {
                console.log("Popup: Data saved (likely Sites).");
                if (callback) callback();
            }
        });
    }

    // --- Template Management (REMOVED from popup.js) ---
    // Functions like renderTemplatesList, showTemplateEditor, handleSaveTemplate, etc. are GONE.

    // --- Site Management (Largely Unchanged, but uses loaded templates) ---
     function renderSitesList() {
        sitesList.innerHTML = ''; // Clear list
        currentSites.forEach((site, index) => {
            const li = document.createElement('li');
             // Find template names for display (uses currentTemplates loaded from storage)
            const templateNames = (site.templateIds || [])
                .map(id => currentTemplates.find(t => t.id === id)?.name || 'Unknown')
                .join(', ');

            li.innerHTML = `
                <span><b>${site.name}</b> (${site.uriPattern})<br><small>${site.description || ''}</small><br><small><i>Templates: ${templateNames || 'None'}</i></small></span>
                <button data-index="${index}" class="edit-site">Edit</button>
                <button data-index="${index}" class="remove-site">Remove</button>
            `;
            sitesList.appendChild(li);
        });
        // Add event listeners
        sitesList.querySelectorAll('.edit-site').forEach(btn => btn.addEventListener('click', handleEditSite));
        sitesList.querySelectorAll('.remove-site').forEach(btn => btn.addEventListener('click', handleRemoveSite));
    }

     function showSiteEditor(site = null, index = -1) {
        siteEditor.style.display = 'block';
        renderSiteTemplateAssignment(site ? site.templateIds : []); // Render template choices using currentTemplates

        if (site) {
            siteEditorTitle.textContent = 'Edit Site';
            siteEditId.value = index;
            document.getElementById('site-name').value = site.name;
            document.getElementById('site-desc').value = site.description || '';
            document.getElementById('site-uri').value = site.uriPattern;
        } else {
            siteEditorTitle.textContent = 'Add New Site';
            siteEditId.value = '';
            // Basic reset
            siteEditor.querySelectorAll('input[type="text"], input[type="hidden"], textarea').forEach(el => el.value = '');
        }
    }

    function hideSiteEditor() {
        siteEditor.style.display = 'none';
    }

     function handleSaveSite() {
        const assignedTemplateIds = getAssignedTemplateIds(); // Get selected template IDs

        const siteData = {
            // Use existing ID if editing, else generate new
            id: siteEditId.value !== '' ? currentSites[parseInt(siteEditId.value)].id : Date.now().toString(),
            name: document.getElementById('site-name').value,
            description: document.getElementById('site-desc').value,
            uriPattern: document.getElementById('site-uri').value,
            templateIds: assignedTemplateIds
        };

        if (!siteData.name || !siteData.uriPattern) {
            alert("Site Name and URI Pattern are required.");
            return;
        }

        const editIndex = siteEditId.value;
        if (editIndex !== '') {
            currentSites[parseInt(editIndex)] = siteData; // Update existing
        } else {
            currentSites.push(siteData); // Add new
        }

        saveData(() => { // Save updated sites array
            hideSiteEditor();
            renderSitesList();
        });
    }

     function handleEditSite(event) {
        const index = parseInt(event.target.dataset.index);
        showSiteEditor(currentSites[index], index);
    }

     function handleRemoveSite(event) {
        const index = parseInt(event.target.dataset.index);
        if (confirm(`Are you sure you want to remove site "${currentSites[index].name}"?`)) {
            currentSites.splice(index, 1);
            saveData(renderSitesList); // Save updated sites array
        }
    }

    // --- Site Template Assignment (Uses loaded templates) ---
    function renderSiteTemplateAssignment(assignedIds = []) {
        siteTemplateAssignment.innerHTML = ''; // Clear
        if (currentTemplates.length === 0) {
            siteTemplateAssignment.innerHTML = '<p><i>No templates defined. Use the "Templates" tab to create some.</i></p>';
            return;
        }
        currentTemplates.forEach(template => {
            const label = document.createElement('label');
            label.style.display = 'block';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = template.id;
            checkbox.checked = assignedIds.includes(template.id);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${template.name}`));
            siteTemplateAssignment.appendChild(label);
        });
    }

    function getAssignedTemplateIds() {
        const ids = [];
        siteTemplateAssignment.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            ids.push(cb.value);
        });
        return ids;
    }

    // --- Editor Tab Logic (Largely Unchanged, uses loaded templates) ---
    function updateEditorTab() {
        editorStatus.textContent = 'Checking current site...';
        editorArea.innerHTML = ''; // Clear previous editor
        printButton.style.display = 'none';
        templateSelectorDiv.style.display = 'none';
        templateSelect.innerHTML = '';
        selectedTemplateForEditor = null;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
                editorStatus.textContent = 'Error getting current tab URL.';
                console.error("Error getting current tab:", chrome.runtime.lastError || 'No active tab found');
                return;
            }
            currentTabUrl = tabs[0].url;
            console.log("Current URL:", currentTabUrl);

            // Site Matching (Keep simple regex for now)
            const matchedSite = currentSites.find(site => {
                try {
                    const pattern = site.uriPattern.replace(/\*/g, '.*');
                    const regex = new RegExp(`^${pattern}$`);
                    return regex.test(currentTabUrl);
                } catch (e) {
                    console.warn(`Invalid regex pattern for site "${site.name}": ${site.uriPattern}`);
                    return false;
                }
            });

            if (matchedSite && matchedSite.templateIds && matchedSite.templateIds.length > 0) {
                // Use currentTemplates loaded from storage
                const availableTemplates = matchedSite.templateIds
                    .map(id => currentTemplates.find(t => t.id === id))
                    .filter(t => t); // Filter out templates that might have been deleted

                if (availableTemplates.length > 0) {
                    editorStatus.textContent = `Site matched: ${matchedSite.name}.`;
                    templateSelectorDiv.style.display = 'block';

                    availableTemplates.forEach(template => {
                        const option = document.createElement('option');
                        option.value = template.id;
                        option.textContent = template.name;
                        templateSelect.appendChild(option);
                    });

                    if (templateSelect.options.length > 0) {
                        templateSelect.value = templateSelect.options[0].value;
                        handleTemplateSelectionChange();
                    } else {
                         editorStatus.textContent = `Site matched: ${matchedSite.name}, but assigned templates not found.`;
                         templateSelectorDiv.style.display = 'none';
                    }

                    templateSelect.removeEventListener('change', handleTemplateSelectionChange);
                    templateSelect.addEventListener('change', handleTemplateSelectionChange);

                } else {
                    editorStatus.textContent = `Site matched: ${matchedSite.name}, but no valid templates assigned or found.`;
                }
            } else {
                editorStatus.textContent = 'No template(s) assigned for this site.';
            }
        });
    }

    function handleTemplateSelectionChange() {
        const selectedId = templateSelect.value;
        // Use currentTemplates loaded from storage
        selectedTemplateForEditor = currentTemplates.find(t => t.id === selectedId);
        if (selectedTemplateForEditor) {
            renderEditorForTemplate(selectedTemplateForEditor);
            printButton.style.display = 'block';
        } else {
            editorArea.innerHTML = '<p>Error: Selected template not found.</p>';
            printButton.style.display = 'none';
        }
    }

    // --- Dummy WYSIWYG & Print (Unchanged for now) ---
    function renderEditorForTemplate(template) {
        editorArea.innerHTML = '';
        editorArea.style.width = 'auto';
        editorArea.style.height = 'auto';
        editorArea.style.border = '1px dashed #aaa';

        const info = document.createElement('p');
        info.innerHTML = `Editing: <b>${template.name}</b> (${template.width}x${template.height} ${template.unit})`;
        editorArea.appendChild(info);

        (template.elements || []).forEach(element => {
            const elDiv = document.createElement('div');
            elDiv.classList.add('label-element');
            elDiv.dataset.id = element.id;

            let content = '';
            switch (element.type) {
                case 'Textbox':
                    // Use default value if available (and dataSource isn't prioritized yet)
                    const defaultValue = element.defaultValue || '';
                    content = `<label>${element.id}: <input type="text" data-element-id="${element.id}" placeholder="Enter text..." value="${defaultValue}"></label>`;
                    // Add note about data source if present
                     if (element.dataSource) {
                        content += `<br><small><i>(Default value might be overridden by data source: ${element.dataSource})</i></small>`;
                    }
                    break;
                case 'Imagebox':
                     content = `<div>${element.id}: <input type="file" data-element-id="${element.id}" accept="image/*"> (Image Placeholder)</div>`;
                    break;
                case 'Codebox':
                    elDiv.classList.add('codebox');
                    const sourceId = element.sourceTextboxId;
                    content = `<div>${element.id} (Datamatrix from ${sourceId || 'N/A'})</div><div class="barcode-placeholder" data-element-id="${element.id}" data-source-id="${sourceId}">[Barcode Area]</div>`;
                    break;
                default:
                    content = `<div>Unknown element type: ${element.type}</div>`;
            }
            elDiv.innerHTML = content;
            editorArea.appendChild(elDiv);
        });

        editorArea.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('input', handleEditorInputChange);
        });
        updateBarcodePlaceholders();
    }

    function handleEditorInputChange(event) {
        const changedElementId = event.target.dataset.elementId;
        updateBarcodePlaceholders(changedElementId);
    }

    function updateBarcodePlaceholders(sourceElementId = null) {
         editorArea.querySelectorAll('.barcode-placeholder').forEach(placeholder => {
            const elementId = placeholder.dataset.elementId;
            const sourceId = placeholder.dataset.sourceId;

            if (sourceId && (sourceElementId === null || sourceId === sourceElementId)) {
                const sourceInput = editorArea.querySelector(`input[data-element-id="${sourceId}"]`);
                if (sourceInput) {
                    const text = sourceInput.value;
                    placeholder.innerHTML = generateDatamatrix(text, elementId);
                } else {
                     placeholder.innerHTML = `[Source ${sourceId} not found]`;
                }
            }
        });
    }

    function generateDatamatrix(text, elementId) {
        console.log(`DUMMY: Generate Datamatrix for text "${text}" in element ${elementId}`);
        if (!text) return '[Barcode Area - No Text]';
        return `<svg width="50" height="50" style="border:1px solid black; background: #eee; display: inline-block; vertical-align: middle;"><text x="5" y="30" font-size="10" fill="#555">DM:${text.substring(0,5)}</text></svg>`;
    }

    function handlePrint() {
        // ... (Keep existing dummy print logic) ...
        if (!selectedTemplateForEditor) {
            alert("No template selected to print.");
            return;
        }
        console.log("Initiating print for template:", selectedTemplateForEditor.name);
        console.log("Current element values (placeholders):");
        const printData = {};
        selectedTemplateForEditor.elements.forEach(element => {
             const elDom = editorArea.querySelector(`[data-element-id="${element.id}"]`);
             if (elDom) {
                 if (element.type === 'Textbox') {
                     const input = elDom.querySelector('input[type="text"]');
                     printData[element.id] = input ? input.value : '';
                     console.log(` - ${element.id} (Text): ${printData[element.id]}`);
                 } else if (element.type === 'Imagebox') {
                     console.log(` - ${element.id} (Image): [Image data would go here]`);
                     printData[element.id] = '[Image Placeholder]';
                 } else if (element.type === 'Codebox') {
                     const sourceInput = editorArea.querySelector(`input[data-element-id="${element.sourceTextboxId}"]`);
                     const text = sourceInput ? sourceInput.value : '';
                     console.log(` - ${element.id} (Code from ${element.sourceTextboxId}): ${text}`);
                     printData[element.id] = text;
                 }
             }
        });
        alert("Print function called. Check console for dummy data. Actual print formatting needs implementation. Opening standard print dialog as placeholder.");
        console.log("Print Data Gathered:", printData);
        window.print();
    }

    // --- Initialization ---
    function initialize() {
        loadData(() => {
            // Initial rendering after data is loaded
            // No need to render templates list here anymore
            renderSitesList(); // Render sites (which might need template names)
            updateEditorTab(); // Check current site and update editor
        });

        // Setup button listeners
        openOptionsPageBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        // Site listeners remain
        addSiteBtn.addEventListener('click', () => showSiteEditor());
        cancelSiteBtn.addEventListener('click', hideSiteEditor);
        saveSiteBtn.addEventListener('click', handleSaveSite);

        printButton.addEventListener('click', handlePrint);

        // Listen for storage changes from the options page
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && (changes.templates || changes.sites)) {
                console.log('Popup: Storage changed, reloading data...');
                loadData(() => {
                    // Re-render relevant parts of the popup UI
                    renderSitesList(); // Update site list (template names might change)
                    // If the editor tab is active, update it
                    if (contents.editor.classList.contains('active')) {
                        updateEditorTab();
                    }
                    // If the site editor is open, refresh template assignments
                    if (siteEditor.style.display === 'block' && siteEditId.value !== '') {
                         const currentSiteIndex = parseInt(siteEditId.value);
                         if(currentSites[currentSiteIndex]) {
                            renderSiteTemplateAssignment(currentSites[currentSiteIndex].templateIds);
                         }
                    } else if (siteEditor.style.display === 'block') {
                         renderSiteTemplateAssignment(); // Refresh for new site form
                    }
                });
            }
        });
    }

    initialize();
});
