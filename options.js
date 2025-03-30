document.addEventListener('DOMContentLoaded', () => {
    // --- Globals ---
    let allTemplates = [];
    let currentlyEditingTemplate = null; // Holds the template object being edited
    let currentlyEditingTemplateId = null; // ID of the template being edited (null for new)
    let selectedElementId = null; // ID of the element selected on the canvas
    let isDirty = false; // Track unsaved changes

    // --- DOM References ---
    // Views
    const listView = document.getElementById('template-list-view');
    const editorView = document.getElementById('template-editor-view');

    // List View Elements
    const templatesList = document.getElementById('options-templates-list');
    const addTemplateBtn = document.getElementById('options-add-template-btn');

    // Editor View Elements
    const editorViewTitle = document.getElementById('editor-view-title');
    const saveBtn = document.getElementById('save-template-changes');
    const exitBtn = document.getElementById('exit-template-editor');
    const saveStatus = document.getElementById('save-status');

    // Canvas Area
    const canvasContainer = document.getElementById('editor-canvas-container');
    const canvas = document.getElementById('editor-canvas');
    const canvasElementsContainer = document.getElementById('canvas-elements-container');

    // Sidebar - Template Properties
    const editingTemplateIdInput = document.getElementById('editing-template-id');
    const templateNameInput = document.getElementById('options-template-name');
    const templateDescInput = document.getElementById('options-template-desc');
    const templateWidthInput = document.getElementById('options-template-width');
    const templateHeightInput = document.getElementById('options-template-height');
    const templateUnitInput = document.getElementById('options-template-unit');
    const templateMarginTopInput = document.getElementById('options-template-margin-top');
    const templateMarginBottomInput = document.getElementById('options-template-margin-bottom');
    const templateMarginLeftInput = document.getElementById('options-template-margin-left');
    const templateMarginRightInput = document.getElementById('options-template-margin-right');

    // Sidebar - Element Toolbox
    const elementToolbox = document.getElementById('element-toolbox');

    // Sidebar - Element Properties
    const elementPropsContainer = document.getElementById('element-properties');
    const elementPropsPlaceholder = document.getElementById('element-properties-placeholder');
    const editingElementIdInput = document.getElementById('editing-element-id');
    const elementPropIdSpan = document.getElementById('element-prop-id');
    const elementPropTypeSpan = document.getElementById('element-prop-type');
    const elementPropLeftInput = document.getElementById('element-prop-left');
    const elementPropTopInput = document.getElementById('element-prop-top');
    const elementPropWidthInput = document.getElementById('element-prop-width');
    const elementPropHeightInput = document.getElementById('element-prop-height');
    // Textbox specific
    const elementPropDefaultValueInput = document.getElementById('element-prop-default-value');
    const elementPropDataSourceInput = document.getElementById('element-prop-data-source');
    // Codebox specific
    const elementPropSourceIdSelect = document.getElementById('element-prop-source-id');


    // --- Utility Functions ---
    const pxPerUnit = { // Pixels per Inch/CM for canvas rendering (adjust as needed)
        in: 96, // Common screen DPI assumption
        cm: 96 / 2.54
    };

    function setDirty(dirty = true) {
        isDirty = dirty;
        saveStatus.textContent = dirty ? 'Unsaved changes' : '';
        saveBtn.disabled = !dirty;
    }

    // --- Storage Interaction ---
    function loadTemplatesFromStorage(callback) {
        chrome.storage.local.get('templates', (result) => {
            if (chrome.runtime.lastError) {
                console.error("Options: Error loading templates:", chrome.runtime.lastError);
                allTemplates = [];
            } else {
                 // Ensure elements array exists, default to empty
                allTemplates = (result.templates || []).map(t => ({ ...t, elements: t.elements || [] }));
            }
            console.log("Options: Templates loaded:", allTemplates);
            if (callback) callback();
        });
    }

    function saveTemplatesToStorage(callback) {
        chrome.storage.local.set({ templates: allTemplates }, () => {
            if (chrome.runtime.lastError) {
                console.error("Options: Error saving templates:", chrome.runtime.lastError);
                alert("Error saving templates. See console for details.");
            } else {
                console.log("Options: Templates saved.");
                setDirty(false); // Mark as clean after successful save
                if (callback) callback();
            }
        });
    }

    // --- List View Logic ---
    function renderTemplateList() {
        templatesList.innerHTML = ''; // Clear list
        if (allTemplates.length === 0) {
            templatesList.innerHTML = '<p>No templates created yet.</p>';
        }
        allTemplates.forEach((template) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>
                    <b>${template.name || 'Untitled Template'}</b>
                    <small>${template.description || 'No description'}</small>
                    <small>(${template.width || '?'}x${template.height || '?'} ${template.unit || '?'})</small>
                </span>
                <div>
                    <button data-id="${template.id}" class="rename-template">Rename</button>
                    <button data-id="${template.id}" class="open-template">Open</button>
                    <button data-id="${template.id}" class="delete-template">Delete</button>
                </div>
            `;
            templatesList.appendChild(li);
        });

        // Add event listeners after rendering
        templatesList.querySelectorAll('.rename-template').forEach(btn => btn.addEventListener('click', handleRenameTemplate));
        templatesList.querySelectorAll('.open-template').forEach(btn => btn.addEventListener('click', handleOpenTemplate));
        templatesList.querySelectorAll('.delete-template').forEach(btn => btn.addEventListener('click', handleDeleteTemplate));
    }

    function handleRenameTemplate(event) {
        const templateId = event.target.dataset.id;
        const template = allTemplates.find(t => t.id === templateId);
        if (!template) return;

        const newName = prompt("Enter new name for template:", template.name);
        if (newName && newName.trim() !== '') {
            template.name = newName.trim();
            saveTemplatesToStorage(renderTemplateList); // Save and re-render list
        }
    }

    function handleDeleteTemplate(event) {
        const templateId = event.target.dataset.id;
        const template = allTemplates.find(t => t.id === templateId);
        if (!template) return;

        if (confirm(`Are you sure you want to delete template "${template.name}"? This cannot be undone.`)) {
            allTemplates = allTemplates.filter(t => t.id !== templateId);
            // Also need to update Sites that might reference this template ID (complex, maybe handle later or just warn user)
            console.warn(`Template ${templateId} deleted. Sites using it may be affected.`);
            saveTemplatesToStorage(renderTemplateList); // Save and re-render list
        }
    }

    function handleOpenTemplate(event) {
        const templateId = event.target.dataset.id;
        const template = allTemplates.find(t => t.id === templateId);
        if (template) {
            // Deep clone the template object for editing to avoid modifying the original until save
            currentlyEditingTemplate = JSON.parse(JSON.stringify(template));
            currentlyEditingTemplateId = template.id;
            switchToEditorView();
        }
    }

    function handleAddNewTemplate() {
        // Create a new default template object
        currentlyEditingTemplateId = null; // Indicate it's a new template
        currentlyEditingTemplate = {
            id: `template_${Date.now()}`, // Generate a new ID
            name: "Untitled Template",
            description: "",
            width: 4,
            height: 2,
            unit: "in",
            margins: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
            elements: [] // Start with no elements
        };
        switchToEditorView();
    }

    // --- View Switching ---
    function switchToListView() {
        editorView.style.display = 'none';
        listView.style.display = 'block';
        currentlyEditingTemplate = null;
        currentlyEditingTemplateId = null;
        selectedElementId = null;
        isDirty = false; // Reset dirty flag when leaving editor
        renderTemplateList(); // Refresh list in case names changed
    }

    function switchToEditorView() {
        listView.style.display = 'none';
        editorView.style.display = 'flex'; // Use flex display for editor layout
        populateTemplateProperties();
        renderCanvas();
        deselectElement(); // Ensure no element is selected initially
        setDirty(false); // Start clean
        editorViewTitle.textContent = `Editing: ${currentlyEditingTemplate.name}`;
    }

    // --- Editor View - Template Properties ---
    function populateTemplateProperties() {
        if (!currentlyEditingTemplate) return;
        editingTemplateIdInput.value = currentlyEditingTemplate.id;
        templateNameInput.value = currentlyEditingTemplate.name;
        templateDescInput.value = currentlyEditingTemplate.description || '';
        templateWidthInput.value = currentlyEditingTemplate.width;
        templateHeightInput.value = currentlyEditingTemplate.height;
        templateUnitInput.value = currentlyEditingTemplate.unit;
        templateMarginTopInput.value = currentlyEditingTemplate.margins?.top || 0;
        templateMarginBottomInput.value = currentlyEditingTemplate.margins?.bottom || 0;
        templateMarginLeftInput.value = currentlyEditingTemplate.margins?.left || 0;
        templateMarginRightInput.value = currentlyEditingTemplate.margins?.right || 0;
    }

    function updateTemplateFromProperties() {
        if (!currentlyEditingTemplate) return;
        currentlyEditingTemplate.name = templateNameInput.value;
        currentlyEditingTemplate.description = templateDescInput.value;
        currentlyEditingTemplate.width = parseFloat(templateWidthInput.value) || 0;
        currentlyEditingTemplate.height = parseFloat(templateHeightInput.value) || 0;
        currentlyEditingTemplate.unit = templateUnitInput.value;
        currentlyEditingTemplate.margins = {
            top: parseFloat(templateMarginTopInput.value) || 0,
            bottom: parseFloat(templateMarginBottomInput.value) || 0,
            left: parseFloat(templateMarginLeftInput.value) || 0,
            right: parseFloat(templateMarginRightInput.value) || 0,
        };
        // Update canvas size and editor title dynamically
        renderCanvasSize();
        editorViewTitle.textContent = `Editing: ${currentlyEditingTemplate.name}`;
        setDirty();
    }

    // --- Editor View - Canvas Rendering ---
    function renderCanvasSize() {
         if (!currentlyEditingTemplate) return;
         const unit = currentlyEditingTemplate.unit || 'in';
         const widthPx = (currentlyEditingTemplate.width || 0) * pxPerUnit[unit];
         const heightPx = (currentlyEditingTemplate.height || 0) * pxPerUnit[unit];
         // Apply margins as padding inside the canvas for visual representation
         const marginTPx = (currentlyEditingTemplate.margins?.top || 0) * pxPerUnit[unit];
         const marginBPx = (currentlyEditingTemplate.margins?.bottom || 0) * pxPerUnit[unit];
         const marginLPx = (currentlyEditingTemplate.margins?.left || 0) * pxPerUnit[unit];
         const marginRPx = (currentlyEditingTemplate.margins?.right || 0) * pxPerUnit[unit];

         canvas.style.width = `${widthPx}px`;
         canvas.style.height = `${heightPx}px`;
         // Use padding on the inner container to represent margins visually
         canvasElementsContainer.style.padding = `${marginTPx}px ${marginRPx}px ${marginBPx}px ${marginLPx}px`;
         canvasElementsContainer.style.width = `calc(100% - ${marginLPx + marginRPx}px)`;
         canvasElementsContainer.style.height = `calc(100% - ${marginTPx + marginBPx}px)`;
    }

    function renderCanvas() {
        if (!currentlyEditingTemplate) return;
        renderCanvasSize();
        canvasElementsContainer.innerHTML = ''; // Clear existing elements

        (currentlyEditingTemplate.elements || []).forEach(element => {
            renderElementOnCanvas(element);
        });
    }

    function renderElementOnCanvas(element) {
        const elDiv = document.createElement('div');
        elDiv.classList.add('canvas-element');
        elDiv.dataset.id = element.id;
        elDiv.dataset.type = element.type;
        elDiv.style.left = `${element.left || 0}px`;
        elDiv.style.top = `${element.top || 0}px`;
        elDiv.style.width = `${element.width || 100}px`;
        elDiv.style.height = `${element.height || 20}px`;

        // Basic content representation
        let content = `[${element.type}] ${element.id.substring(0, 8)}`;
        if (element.type === 'Codebox') {
            elDiv.classList.add('codebox-element');
            content = `[Code] ${element.id.substring(0, 8)}<br><small>(Src: ${element.sourceTextboxId || '?'})</small>`;
        } else if (element.type === 'Textbox') {
             content = `[Text] ${element.id.substring(0, 8)}<br><small>${element.defaultValue || element.dataSource || ''}</small>`;
        } else if (element.type === 'Imagebox') {
             content = `[Img] ${element.id.substring(0, 8)}`;
        }
        elDiv.innerHTML = content;


        // Add selected class if this element is the selected one
        if (element.id === selectedElementId) {
            elDiv.classList.add('selected');
        }

        // ** DUMMY Interaction: Click to select **
        elDiv.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from deselecting if clicking within element
            selectElement(element.id);
        });

        // ** TODO: Add Drag and Resize functionality here (e.g., using interact.js) **
        // For boilerplate, elements are static.

        canvasElementsContainer.appendChild(elDiv);
    }

    // --- Editor View - Element Selection & Properties ---
    function selectElement(elementId) {
        if (selectedElementId === elementId) return; // Already selected

        selectedElementId = elementId;
        console.log("Selected element:", selectedElementId);

        // Update visual selection on canvas
        canvasElementsContainer.querySelectorAll('.canvas-element').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === elementId);
        });

        // Populate properties sidebar
        populateElementProperties();
        elementPropsPlaceholder.style.display = 'none';
        elementPropsContainer.style.display = 'block';
    }

    function deselectElement() {
        if (!selectedElementId) return; // Nothing selected

        selectedElementId = null;
        console.log("Deselected element");

        // Remove visual selection
        canvasElementsContainer.querySelectorAll('.canvas-element.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Hide properties sidebar
        elementPropsContainer.style.display = 'none';
        elementPropsPlaceholder.style.display = 'block';
    }

    function populateElementProperties() {
        if (!selectedElementId || !currentlyEditingTemplate) {
            deselectElement(); // Ensure props are hidden if no element selected
            return;
        }

        const element = currentlyEditingTemplate.elements.find(el => el.id === selectedElementId);
        if (!element) {
            console.error("Selected element not found in template data:", selectedElementId);
            deselectElement();
            return;
        }

        editingElementIdInput.value = element.id;
        elementPropIdSpan.textContent = element.id;
        elementPropTypeSpan.textContent = element.type;
        elementPropLeftInput.value = element.left || 0;
        elementPropTopInput.value = element.top || 0;
        elementPropWidthInput.value = element.width || 100;
        elementPropHeightInput.value = element.height || 20;

        // Show/hide type-specific property groups
        elementPropsContainer.querySelectorAll('.prop-group').forEach(group => {
            group.style.display = group.dataset.type === element.type ? 'block' : 'none';
        });

        // Populate type-specific fields
        if (element.type === 'Textbox') {
            elementPropDefaultValueInput.value = element.defaultValue || '';
            elementPropDataSourceInput.value = element.dataSource || '';
        } else if (element.type === 'Codebox') {
            populateSourceTextboxSelect(element.sourceTextboxId);
        }
    }

    function populateSourceTextboxSelect(currentSourceId) {
        elementPropSourceIdSelect.innerHTML = '<option value="">-- Select Source Textbox --</option>';
        if (!currentlyEditingTemplate) return;

        currentlyEditingTemplate.elements.forEach(el => {
            if (el.type === 'Textbox') {
                const option = document.createElement('option');
                option.value = el.id;
                option.textContent = `${el.id} (Textbox)`;
                option.selected = el.id === currentSourceId;
                elementPropSourceIdSelect.appendChild(option);
            }
        });
    }

    function updateElementFromProperties() {
        if (!selectedElementId || !currentlyEditingTemplate) return;

        const elementIndex = currentlyEditingTemplate.elements.findIndex(el => el.id === selectedElementId);
        if (elementIndex === -1) return;

        const element = currentlyEditingTemplate.elements[elementIndex];

        // Update common properties
        element.left = parseInt(elementPropLeftInput.value) || 0;
        element.top = parseInt(elementPropTopInput.value) || 0;
        element.width = parseInt(elementPropWidthInput.value) || 100;
        element.height = parseInt(elementPropHeightInput.value) || 20;

        // Update type-specific properties
        if (element.type === 'Textbox') {
            element.defaultValue = elementPropDefaultValueInput.value;
            element.dataSource = elementPropDataSourceInput.value;
        } else if (element.type === 'Codebox') {
            element.sourceTextboxId = elementPropSourceIdSelect.value;
        }

        // Re-render the specific element on the canvas to reflect changes
        const elementDiv = canvasElementsContainer.querySelector(`.canvas-element[data-id="${element.id}"]`);
        if (elementDiv) {
            // Update style
            elementDiv.style.left = `${element.left}px`;
            elementDiv.style.top = `${element.top}px`;
            elementDiv.style.width = `${element.width}px`;
            elementDiv.style.height = `${element.height}px`;
            // Update content representation (if needed)
             let content = `[${element.type}] ${element.id.substring(0, 8)}`;
             if (element.type === 'Codebox') content = `[Code] ${element.id.substring(0, 8)}<br><small>(Src: ${element.sourceTextboxId || '?'})</small>`;
             else if (element.type === 'Textbox') content = `[Text] ${element.id.substring(0, 8)}<br><small>${element.defaultValue || element.dataSource || ''}</small>`;
             else if (element.type === 'Imagebox') content = `[Img] ${element.id.substring(0, 8)}`;
             elementDiv.innerHTML = content;
        }

        setDirty();
    }

    // --- Editor View - Element Toolbox ---
    function handleAddElement(event) {
        if (!currentlyEditingTemplate) return;
        const type = event.target.dataset.type;
        if (!type) return;

        const newElement = {
            id: `${type.toLowerCase()}_${Date.now()}`,
            type: type,
            left: 10, // Default position
            top: (currentlyEditingTemplate.elements.length * 30) % 150, // Cascade slightly
            width: type === 'Imagebox' ? 50 : 120, // Default sizes
            height: type === 'Imagebox' ? 50 : 25,
            // Add type-specific defaults if needed
            ...(type === 'Textbox' && { defaultValue: '', dataSource: '' }),
            ...(type === 'Codebox' && { sourceTextboxId: '' }),
        };

        currentlyEditingTemplate.elements.push(newElement);
        renderElementOnCanvas(newElement); // Add visually
        selectElement(newElement.id); // Select the new element
        setDirty();
    }

    // --- Editor View - Save and Exit ---
    function handleSaveChanges() {
        if (!currentlyEditingTemplate) return;

        // Ensure template properties are up-to-date from inputs
        updateTemplateFromProperties();
        // Ensure selected element properties are up-to-date (if one was selected)
        if (selectedElementId) {
            updateElementFromProperties();
        }

        // Basic Validation
        if (!currentlyEditingTemplate.name || !currentlyEditingTemplate.width || !currentlyEditingTemplate.height) {
            alert("Template Name, Width, and Height are required.");
            return;
        }

        // Find if it's an existing template or a new one
        const existingIndex = allTemplates.findIndex(t => t.id === currentlyEditingTemplate.id);

        if (existingIndex > -1) {
            // Update existing template in the main array
            allTemplates[existingIndex] = JSON.parse(JSON.stringify(currentlyEditingTemplate)); // Save a clean copy
        } else {
            // Add new template to the main array
            allTemplates.push(JSON.parse(JSON.stringify(currentlyEditingTemplate))); // Save a clean copy
        }

        saveTemplatesToStorage(() => {
            saveStatus.textContent = 'Saved!';
            setTimeout(() => { if (!isDirty) saveStatus.textContent = ''; }, 2000); // Clear status after a delay if still clean
        });
    }

    function handleExitEditor() {
        if (isDirty) {
            if (!confirm("You have unsaved changes. Are you sure you want to exit without saving?")) {
                return; // Don't exit
            }
        }
        switchToListView();
    }


    // --- Initialization and Event Listeners ---
    function initialize() {
        loadTemplatesFromStorage(() => {
            renderTemplateList();
            switchToListView(); // Start in list view
        });

        // List View Listeners
        addTemplateBtn.addEventListener('click', handleAddNewTemplate);

        // Editor View Listeners
        saveBtn.addEventListener('click', handleSaveChanges);
        exitBtn.addEventListener('click', handleExitEditor);

        // Template Property Listeners
        [templateNameInput, templateDescInput, templateWidthInput, templateHeightInput, templateUnitInput,
         templateMarginTopInput, templateMarginBottomInput, templateMarginLeftInput, templateMarginRightInput]
         .forEach(input => input.addEventListener('change', updateTemplateFromProperties));

         // Element Property Listeners
         [elementPropLeftInput, elementPropTopInput, elementPropWidthInput, elementPropHeightInput,
          elementPropDefaultValueInput, elementPropDataSourceInput, elementPropSourceIdSelect]
          .forEach(input => input.addEventListener('change', updateElementFromProperties));

        // Element Toolbox Listeners
        elementToolbox.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', handleAddElement);
        });

        // Canvas Deselection Listener
        canvasContainer.addEventListener('click', (e) => {
            // If the click is directly on the container (not an element), deselect
            if (e.target === canvasContainer || e.target === canvas || e.target === canvasElementsContainer) {
                deselectElement();
            }
        });

        // Warn before leaving page if dirty
        window.addEventListener('beforeunload', (event) => {
            if (isDirty) {
                event.preventDefault(); // Standard requires this line
                event.returnValue = ''; // Required for Chrome
            }
        });
    }

    initialize();
});
