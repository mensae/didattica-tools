<?php
if (!defined('VECTOR_APP_AUTHORIZED')) {
  http_response_code(403);
  exit('Forbidden');
}

$isGuestMode = defined('VECTOR_APP_GUEST_MODE') && VECTOR_APP_GUEST_MODE === true;
$authActionLabel = $isGuestMode ? 'Leave guest mode' : 'Logout';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>3D Vector Visualizer</title>
  <link rel="stylesheet" href="app.css" />
</head>
<body data-read-only="<?php echo $isGuestMode ? 'true' : 'false'; ?>">
  <div id="app-loading-overlay" class="app-loading-overlay" role="status" aria-live="polite">
    <div class="app-loading-spinner" aria-hidden="true"></div>
  </div>
  <div id="toast-viewport" class="toast-viewport" aria-live="polite" aria-atomic="false"></div>
  <div id="canvas-container">
    <div id="plot-legend" class="plot-legend" hidden></div>
    <div id="add-controls-shell" class="add-controls-shell">
      <button id="add-controls-toggle" class="add-controls-toggle" type="button" aria-expanded="false" aria-controls="add-controls-panel" aria-label="Open add controls">
        <span class="add-controls-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 5v14"></path>
            <path d="M5 12h14"></path>
          </svg>
        </span>
      </button>
      <section id="add-controls-panel" class="add-controls-panel" hidden>
        <div class="add-controls-body">
          <section id="add-form" class="panel-section add-panel-section">
            <div class="row">
              <label class="color-dot-button form-color-button" style="--dot-color: #4a90d9">
                <input type="color" id="vec-color" value="#4a90d9" />
              </label>
              <input type="text" id="vec-name" placeholder="Name" />
            </div>
            <div class="vector-coord-row form-coord-row">
              <div class="vector-coord-field">
                <span class="vector-coord-label">X:</span>
                <input type="number" id="vec-x" placeholder="0" step="any" aria-label="X coordinate" />
              </div>
              <div class="vector-coord-field">
                <span class="vector-coord-label">Y:</span>
                <input type="number" id="vec-y" placeholder="0" step="any" aria-label="Y coordinate" />
              </div>
              <div class="vector-coord-field">
                <span class="vector-coord-label">Z:</span>
                <input type="number" id="vec-z" placeholder="0" step="any" aria-label="Z coordinate" />
              </div>
            </div>
            <div class="inline-action-row">
              <div class="select-shell inline-select-shell">
                <select id="vec-group"></select>
                <span class="select-shell-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M7 10 12 15 17 10"></path>
                  </svg>
                </span>
              </div>
              <button id="add-btn" class="inline-action-btn" type="button">Add Vector</button>
            </div>
          </section>

          <section id="group-form" class="panel-section add-panel-section">
            <div class="inline-action-row">
              <label class="color-dot-button form-color-button" style="--dot-color: #ff8a4c">
                <input type="color" id="group-color" value="#ff8a4c" />
              </label>
              <input type="text" id="group-name" placeholder="Group name" />
              <button id="add-group-btn" class="inline-action-btn" type="button">Add Group</button>
            </div>
          </section>
        </div>
      </section>
    </div>
    <div id="visual-controls-shell" class="visual-controls-shell">
      <button id="visual-controls-toggle" class="visual-controls-toggle" type="button" aria-expanded="false" aria-controls="visual-controls-panel" aria-label="Open visualization controls">
        <span class="visual-controls-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M5 7h14"></path>
            <path d="M5 12h14"></path>
            <path d="M5 17h14"></path>
            <circle cx="9" cy="7" r="1.8"></circle>
            <circle cx="15" cy="12" r="1.8"></circle>
            <circle cx="11" cy="17" r="1.8"></circle>
          </svg>
        </span>
      </button>
      <section id="visual-controls-panel" class="visual-controls-panel" hidden>
        <div class="visual-controls-body">
          <div class="settings-field settings-display-card visual-controls-view-card">
            <div class="settings-view-mode-stack">
              <div class="settings-display-row settings-display-row-full">
                <div class="settings-display-segmented settings-display-segmented-full" role="group" aria-label="View mode">
                  <button id="settings-view-3d-btn" class="settings-display-option-btn" type="button">3D</button>
                  <button id="settings-view-2d-btn" class="settings-display-option-btn" type="button">2D</button>
                </div>
              </div>
              <div id="settings-2d-plane-controls" class="settings-display-row settings-display-row-full settings-2d-plane-row" hidden>
                <div class="settings-display-segmented settings-display-segmented-full" role="group" aria-label="2D plane">
                  <button id="settings-plane-xy-btn" class="settings-display-option-btn" type="button">XY</button>
                  <button id="settings-plane-xz-btn" class="settings-display-option-btn" type="button">XZ</button>
                  <button id="settings-plane-yz-btn" class="settings-display-option-btn" type="button">YZ</button>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-field settings-range-card visual-controls-range-card">
            <div class="settings-range-header">
              <label class="settings-field-label no-margin" for="vector-scale-slider">Scale vectors values</label>
              <output id="vector-scale-value" class="settings-range-value" for="vector-scale-slider">1x</output>
            </div>
            <input id="vector-scale-slider" class="settings-range-input" type="range" min="0" max="10" step="0.2" value="1" aria-label="Scale vectors values" />
          </div>
          <div class="settings-field settings-range-card visual-controls-range-card">
            <div class="settings-range-header">
              <label class="settings-field-label no-margin" for="settings-axis-extent-slider">Axes and plane extension</label>
              <output id="settings-axis-extent-value" class="settings-range-value" for="settings-axis-extent-slider">12</output>
            </div>
            <input id="settings-axis-extent-slider" class="settings-range-input" type="range" min="4" max="24" step="0.5" value="12" aria-label="Axes and plane extension" />
          </div>
          <div class="settings-field settings-display-card">
            <div class="settings-display-row">
              <div class="settings-display-copy">Show vector as:</div>
              <div class="settings-display-segmented" role="group" aria-label="Vector display mode">
                <button id="settings-display-arrow-btn" class="settings-display-option-btn" type="button">Arrows</button>
                <button id="settings-display-point-btn" class="settings-display-option-btn" type="button">Points</button>
              </div>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-toggle-row">
              <div class="settings-toggle-copy">Show vector names</div>
              <button id="settings-name-toggle" class="settings-inline-toggle" type="button" aria-pressed="true">
                <span id="settings-name-toggle-value" class="settings-inline-toggle-value">Shown</span>
                <span id="settings-name-toggle-track" class="toggle-track active"></span>
              </button>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-toggle-row">
              <div class="settings-toggle-copy">Show group legend</div>
              <button id="settings-legend-toggle" class="settings-inline-toggle" type="button" aria-pressed="true">
                <span id="settings-legend-toggle-value" class="settings-inline-toggle-value">Shown</span>
                <span id="settings-legend-toggle-track" class="toggle-track active"></span>
              </button>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-toggle-row">
              <div class="settings-toggle-copy">Show plane</div>
              <button id="settings-plane-toggle" class="settings-inline-toggle" type="button" aria-pressed="true">
                <span id="settings-plane-toggle-value" class="settings-inline-toggle-value">Shown</span>
                <span id="settings-plane-toggle-track" class="toggle-track active"></span>
              </button>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-toggle-row">
              <div class="settings-toggle-copy">Show axis names</div>
              <button id="settings-axis-toggle" class="settings-inline-toggle" type="button" aria-pressed="true">
                <span id="settings-axis-toggle-value" class="settings-inline-toggle-value">Shown</span>
                <span id="settings-axis-toggle-track" class="toggle-track active"></span>
              </button>
            </div>
          </div>
          <div class="settings-field no-margin">
            <div class="settings-toggle-row">
              <div class="settings-toggle-copy">Auto rotate</div>
              <button id="settings-auto-rotate-toggle" class="settings-inline-toggle" type="button" aria-pressed="false">
                <span id="settings-auto-rotate-toggle-value" class="settings-inline-toggle-value">Off</span>
                <span id="settings-auto-rotate-toggle-track" class="toggle-track"></span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <div id="sidebar">
    <div id="control-panel">
      <div class="sidebar-toolbar">
        <button id="save-dataset-btn" class="toolbar-link-btn toolbar-save-btn" type="button" aria-label="Save current vectors as an unsaved dataset"<?php echo $isGuestMode ? ' disabled' : ''; ?>>
          <span class="toolbar-save-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7 4.75h8.5l4.5 4.5V19.25H7z"></path>
              <path d="M10 4.75v5.5h5.5"></path>
              <path d="M13.5 13.25v5"></path>
              <path d="M11 15.75h5"></path>
            </svg>
          </span>
        </button>
        <div class="select-shell toolbar-select-shell">
          <select id="dataset-select" aria-label="Load dataset">
            <option value="">Loading datasets...</option>
          </select>
          <span class="select-shell-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7 10 12 15 17 10"></path>
            </svg>
          </span>
        </div>
        <button id="copy-dataset-link-btn" class="sidebar-icon-btn toolbar-share-btn" type="button" aria-label="Copy share link" hidden>
          <span class="toolbar-share-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="18" cy="5" r="2.15"></circle>
              <circle cx="6" cy="12" r="2.15"></circle>
              <circle cx="18" cy="19" r="2.15"></circle>
              <path d="M7.95 10.95 15.9 6.2"></path>
              <path d="M7.95 13.05 15.9 17.8"></path>
            </svg>
          </span>
        </button>
        <button id="open-settings-btn" class="sidebar-icon-btn" type="button" aria-label="Open settings">
          <span class="settings-icon" aria-hidden="true">&#9881;</span>
        </button>
      </div>
    </div>
    <div id="vector-list">
      <div class="empty-state">No vectors added yet.</div>
    </div>
  </div>

  <div id="settings-modal" class="settings-modal" hidden>
    <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <aside class="settings-nav">
        <div class="settings-title-row">
          <div id="settings-title" class="settings-title">Settings</div>
        </div>
        <div class="settings-nav-list">
          <button class="settings-nav-btn is-active" type="button" data-settings-view="notes">Notes</button>
          <button class="settings-nav-btn" type="button" data-settings-view="import">Import/Export</button>
          <button class="settings-nav-btn" type="button" data-settings-view="delete">Rename/Delete</button>
        </div>
        <div class="settings-nav-footer">
          <button id="logout-btn" class="settings-logout-btn" type="button"><?php echo htmlspecialchars($authActionLabel, ENT_QUOTES, 'UTF-8'); ?></button>
        </div>
      </aside>
      <main class="settings-content">
        <section class="settings-view is-active" data-settings-view-panel="notes">
          <div class="settings-panel-title">Notes</div>
          <div class="settings-field">
            <label class="settings-field-label" for="settings-notes-input">Dataset notes</label>
            <textarea id="settings-notes-input" class="settings-textarea settings-notes-textarea" spellcheck="true" placeholder="Write any context or reminders for this dataset here"></textarea>
            <div class="settings-field-hint">Saved as plain text inside the dataset meta when you save.</div>
          </div>
        </section>

        <section class="settings-view" data-settings-view-panel="import">
          <div class="settings-panel-title">Import/Export</div>
          <div class="settings-section-stack">
            <div class="settings-section-group">
              <div class="settings-field no-margin">
                <label class="settings-field-label" for="import-json-input">Paste vectors JSON</label>
                <textarea id="import-json-input" class="settings-textarea" spellcheck="false" placeholder='{
  "Celestial Bodies": {
    "color": "#e6194b",
    "vectors": [
      {
        "vector_name": "sun",
        "coordinates": [
          0.104317,
          -0.372277,
          0.688111
        ]
      },
      {
        "vector_name": "planet",
        "coordinates": [
          -0.055542,
          -0.574048,
          0.01615
        ]
      }
    ]
  }
}'></textarea>
                <div id="import-status" class="settings-status" aria-live="polite"></div>
              </div>
              <div class="settings-actions settings-import-export-actions">
                <button id="import-json-btn" class="settings-import-btn" type="button">Import</button>
              </div>
            </div>
            <div class="settings-section-group">
              <div class="settings-field settings-export-card no-margin">
                <div class="settings-field-label">Current dataset</div>
                <div class="settings-export-copy">Export the current dataset as a JSON file</div>
                <div class="settings-field-hint">Includes notes, view, visualization settings, groups, colors, and vector visibility.</div>
              </div>
              <div class="settings-actions settings-import-export-actions">
                <button id="export-json-btn" class="settings-import-btn" type="button">Export JSON</button>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-view" data-settings-view-panel="delete">
          <div class="settings-panel-title">Rename/Delete</div>
          <div class="settings-section-stack">
            <div class="settings-section-group">
              <div class="settings-field settings-delete-card no-margin">
                <label class="settings-field-label" for="rename-dataset-input">Rename current dataset</label>
                <input id="rename-dataset-input" class="settings-inline-input" type="text" placeholder="vectors" />
                <div id="settings-rename-hint" class="settings-field-hint">Select a saved dataset to enable renaming.</div>
              </div>
              <div class="settings-actions settings-delete-actions">
                <button id="rename-dataset-btn" class="settings-import-btn" type="button">Rename dataset</button>
              </div>
            </div>
            <div class="settings-section-group">
              <div class="settings-field settings-delete-card no-margin">
                <div id="settings-delete-copy" class="settings-delete-copy">Delete the currently selected dataset file</div>
                <div id="settings-delete-hint" class="settings-field-hint">Select a saved dataset to enable deletion.</div>
              </div>
              <div class="settings-actions settings-delete-actions">
                <button id="delete-dataset-btn" class="settings-delete-dataset-btn" type="button">Delete this dataset</button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <button id="close-settings-btn" class="settings-close-btn" type="button" aria-label="Close settings">&times;</button>
    </div>
  </div>

  <div id="save-dataset-modal" class="app-modal" hidden>
    <div class="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="save-dataset-modal-title">
      <div class="app-modal-header">
        <div id="save-dataset-modal-title" class="app-modal-title">Save dataset</div>
        <div class="app-modal-copy">Choose a JSON filename for the current vectors.</div>
      </div>
      <div class="app-modal-body">
        <label class="app-modal-label" for="save-dataset-name-input">Dataset name</label>
        <input id="save-dataset-name-input" class="app-modal-input" type="text" placeholder="vectors" />
        <div id="save-dataset-modal-status" class="app-modal-status" aria-live="polite"></div>
      </div>
      <div class="app-modal-actions">
        <button id="save-dataset-modal-cancel-btn" class="app-modal-btn" type="button">Cancel</button>
        <button id="save-dataset-modal-confirm-btn" class="app-modal-btn is-primary" type="button">Save</button>
      </div>
    </div>
  </div>

  <div id="confirm-action-modal" class="app-modal" hidden>
    <div class="app-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
      <div class="app-modal-header">
        <div id="confirm-action-title" class="app-modal-title">Confirm action</div>
        <div id="confirm-action-message" class="app-modal-copy"></div>
      </div>
      <div class="app-modal-actions">
        <button id="confirm-action-cancel-btn" class="app-modal-btn" type="button">Cancel</button>
        <button id="confirm-action-confirm-btn" class="app-modal-btn is-primary" type="button">Confirm</button>
      </div>
    </div>
  </div>

  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/"
      }
    }
  </script>
  <script type="module" src="app.js"></script>
</body>
</html>
