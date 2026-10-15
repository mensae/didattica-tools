    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

    // --- Scene setup ---
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    let camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(5, 4, 7);
    const perspectiveCamera = camera;
    const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    orthographicCamera.position.copy(camera.position);
    orthographicCamera.zoom = 1;
    orthographicCamera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'label-layer';
    container.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.6;
    const AXIS_LENGTH = 12;
    const DEFAULT_AXIS_EXTENT = 12;
    const PLANE_GRID_AXIS_RATIO = 10 / 12;
    const LABEL_BASE_CAMERA_DISTANCE = camera.position.distanceTo(controls.target);
    const DEFAULT_CAMERA_DIRECTION = camera.position.clone().sub(controls.target).normalize();
    const DEFAULT_CAMERA_DISTANCE = camera.position.distanceTo(controls.target);
    const LABEL_BASE_FONT_SIZE = 28;
    const LABEL_BASE_GAP = 30;
    const AXIS_LABEL_BASE_FONT_SIZE = 36;
    const AXIS_LABEL_OFFSET = 0.24;
    const AXIS_ARROW_HEAD_LENGTH = 0.38;
    const AXIS_ARROW_HEAD_RADIUS = 0.055;
    const AXIS_PLANE_OVERFLOW = 0.85;
    const AXIS_SHAFT_RADIUS = 0.01;
    const SETTINGS_AXIS_EXTENT_MIN = 4;
    const SETTINGS_AXIS_EXTENT_MAX = 24;
    const SETTINGS_AXIS_EXTENT_STEP = 0.5;
    const VECTOR_SLIDER_STEP = 0.001;
    const VECTOR_SLIDER_MIN_EXTENT = 1;
    const VECTOR_SLIDER_PADDING_FACTOR = 1.15;

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // --- Grid & axes ---
    function getPlaneGridExtent(axisExtent = DEFAULT_AXIS_EXTENT) {
      return Math.max(1, Math.round(axisExtent * PLANE_GRID_AXIS_RATIO));
    }

    function getAxisRenderedExtent(axisExtent = DEFAULT_AXIS_EXTENT) {
      return getPlaneGridExtent(axisExtent) + AXIS_PLANE_OVERFLOW;
    }

    function createGrid(axisExtent = DEFAULT_AXIS_EXTENT) {
      const gridSize = getPlaneGridExtent(axisExtent);
      const material = new THREE.LineBasicMaterial({ color: 0x2b3042, transparent: true, opacity: 0.8 });

      // XZ grid
      const geo = new THREE.BufferGeometry();
      const pts = [];
      for (let i = -gridSize; i <= gridSize; i++) {
        pts.push(-gridSize, 0, i, gridSize, 0, i);
        pts.push(i, 0, -gridSize, i, 0, gridSize);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const grid = new THREE.LineSegments(geo, material);
      scene.add(grid);
      return grid;
    }
    let planeGrid = null;
    const axisMeshes = [];

    function createAxis(dir, color, length = DEFAULT_AXIS_EXTENT) {
      const axisGroup = new THREE.Group();
      const positiveLength = getAxisRenderedExtent(length);
      const negativeLength = getAxisRenderedExtent(length);
      const shaftEnd = positiveLength - AXIS_ARROW_HEAD_LENGTH;
      const shaftStart = -negativeLength;
      const shaftLength = Math.max(shaftEnd - shaftStart, 0.001);
      const sharedMaterialSettings = {
        color,
        emissive: color,
        emissiveIntensity: 0.16,
        metalness: 0.06,
        roughness: 0.44
      };

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(AXIS_SHAFT_RADIUS, AXIS_SHAFT_RADIUS, shaftLength, 20),
        new THREE.MeshStandardMaterial(sharedMaterialSettings)
      );
      shaft.position.y = (shaftStart + shaftEnd) / 2;

      const arrowHead = new THREE.Mesh(
        new THREE.ConeGeometry(AXIS_ARROW_HEAD_RADIUS, AXIS_ARROW_HEAD_LENGTH, 24),
        new THREE.MeshStandardMaterial(sharedMaterialSettings)
      );
      arrowHead.position.y = positiveLength - (AXIS_ARROW_HEAD_LENGTH / 2);

      axisGroup.add(shaft, arrowHead);
      axisGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      axisGroup.renderOrder = 2;
      scene.add(axisGroup);
      return axisGroup;
    }

    // Origin sphere
    const originGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const originMat = new THREE.MeshBasicMaterial({ color: 0x666666 });
    scene.add(new THREE.Mesh(originGeo, originMat));

    // --- Vector management ---
    const vectors = [];
    const groups = [];
    let nextVectorId = 1;
    let nextGroupId = 1;
    let displayMode = 'arrow';
    let draggedVectorId = null;
    const vectorLayer = new THREE.Group();
    scene.add(vectorLayer);
    const collapsedGroupIds = new Set();
    let ungroupedCollapsed = false;

    const listEl = document.getElementById('vector-list');
    const vecNameInput = document.getElementById('vec-name');
    const vecColorInput = document.getElementById('vec-color');
    const vecColorButton = vecColorInput.closest('.color-dot-button');
    const vecXInput = document.getElementById('vec-x');
    const vecYInput = document.getElementById('vec-y');
    const vecZInput = document.getElementById('vec-z');
    const vecGroupSelect = document.getElementById('vec-group');
    const groupNameInput = document.getElementById('group-name');
    const groupColorInput = document.getElementById('group-color');
    const groupColorButton = groupColorInput.closest('.color-dot-button');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const datasetSelect = document.getElementById('dataset-select');
    const copyDatasetLinkBtn = document.getElementById('copy-dataset-link-btn');
    const saveDatasetBtn = document.getElementById('save-dataset-btn');
    const toastViewport = document.getElementById('toast-viewport');
    const plotLegend = document.getElementById('plot-legend');
    const appLoadingOverlay = document.getElementById('app-loading-overlay');
    const addControlsShell = document.getElementById('add-controls-shell');
    const addControlsToggle = document.getElementById('add-controls-toggle');
    const addControlsPanel = document.getElementById('add-controls-panel');
    const visualControlsShell = document.getElementById('visual-controls-shell');
    const visualControlsToggle = document.getElementById('visual-controls-toggle');
    const visualControlsPanel = document.getElementById('visual-controls-panel');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingsNavButtons = Array.from(document.querySelectorAll('.settings-nav-btn'));
    const settingsViewPanels = Array.from(document.querySelectorAll('.settings-view'));
    const settingsView3dBtn = document.getElementById('settings-view-3d-btn');
    const settingsView2dBtn = document.getElementById('settings-view-2d-btn');
    const settings2dPlaneControls = document.getElementById('settings-2d-plane-controls');
    const settingsPlaneXYBtn = document.getElementById('settings-plane-xy-btn');
    const settingsPlaneXZBtn = document.getElementById('settings-plane-xz-btn');
    const settingsPlaneYZBtn = document.getElementById('settings-plane-yz-btn');
    const settingsDisplayArrowBtn = document.getElementById('settings-display-arrow-btn');
    const settingsDisplayPointBtn = document.getElementById('settings-display-point-btn');
    const settingsAxisExtentSlider = document.getElementById('settings-axis-extent-slider');
    const settingsAxisExtentValue = document.getElementById('settings-axis-extent-value');
    const settingsNameToggle = document.getElementById('settings-name-toggle');
    const settingsNameToggleValue = document.getElementById('settings-name-toggle-value');
    const settingsNameToggleTrack = document.getElementById('settings-name-toggle-track');
    const settingsLegendToggle = document.getElementById('settings-legend-toggle');
    const settingsLegendToggleValue = document.getElementById('settings-legend-toggle-value');
    const settingsLegendToggleTrack = document.getElementById('settings-legend-toggle-track');
    const settingsPlaneToggle = document.getElementById('settings-plane-toggle');
    const settingsPlaneToggleValue = document.getElementById('settings-plane-toggle-value');
    const settingsPlaneToggleTrack = document.getElementById('settings-plane-toggle-track');
    const settingsAxisToggle = document.getElementById('settings-axis-toggle');
    const settingsAxisToggleValue = document.getElementById('settings-axis-toggle-value');
    const settingsAxisToggleTrack = document.getElementById('settings-axis-toggle-track');
    const settingsAutoRotateToggle = document.getElementById('settings-auto-rotate-toggle');
    const settingsAutoRotateToggleValue = document.getElementById('settings-auto-rotate-toggle-value');
    const settingsAutoRotateToggleTrack = document.getElementById('settings-auto-rotate-toggle-track');
    const settingsDeleteCopy = document.getElementById('settings-delete-copy');
    const settingsDeleteHint = document.getElementById('settings-delete-hint');
    const settingsRenameHint = document.getElementById('settings-rename-hint');
    const renameDatasetInput = document.getElementById('rename-dataset-input');
    const renameDatasetBtn = document.getElementById('rename-dataset-btn');
    const deleteDatasetBtn = document.getElementById('delete-dataset-btn');
    const settingsNotesInput = document.getElementById('settings-notes-input');
    const logoutBtn = document.getElementById('logout-btn');
    const importJsonInput = document.getElementById('import-json-input');
    const importJsonBtn = document.getElementById('import-json-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const importStatus = document.getElementById('import-status');
    const vectorScaleSlider = document.getElementById('vector-scale-slider');
    const vectorScaleValue = document.getElementById('vector-scale-value');
    const saveDatasetModal = document.getElementById('save-dataset-modal');
    const saveDatasetNameInput = document.getElementById('save-dataset-name-input');
    const saveDatasetModalStatus = document.getElementById('save-dataset-modal-status');
    const saveDatasetModalCancelBtn = document.getElementById('save-dataset-modal-cancel-btn');
    const saveDatasetModalConfirmBtn = document.getElementById('save-dataset-modal-confirm-btn');
    const confirmActionModal = document.getElementById('confirm-action-modal');
    const confirmActionTitle = document.getElementById('confirm-action-title');
    const confirmActionMessage = document.getElementById('confirm-action-message');
    const confirmActionCancelBtn = document.getElementById('confirm-action-cancel-btn');
    const confirmActionConfirmBtn = document.getElementById('confirm-action-confirm-btn');
    let pendingManualColor = vecColorInput.value;
    let activeDatasetPath = '';
    let editingGroupId = null;
    let editingVectorId = null;
    let showVectorNames = true;
    let showPlotLegend = true;
    let showPlane = true;
    let showAxisNames = true;
    let autoRotateEnabled = false;
    let datasetScale = 1;
    let axisExtent = DEFAULT_AXIS_EXTENT;
    let datasetNotes = '';
    let addControlsOpen = false;
    let visualControlsOpen = false;
    let vectorSliderExtent = VECTOR_SLIDER_MIN_EXTENT;
    let confirmModalAction = null;
    let confirmModalCancelAction = null;
    let activeDatasetToast = null;
    let viewMode = '3d';
    let viewPlane = 'xy';
    let saved3DViewState = null;
    const isReadOnlyMode = document.body.dataset.readOnly === 'true';
    const axisLabelObjects = [];
    const labelOriginNdc = new THREE.Vector3();
    const labelEndpointNdc = new THREE.Vector3();
    const DATASET_META_KEY = '__meta__';
    const DATASET_SCALE_MIN = 0;
    const DATASET_SCALE_MAX = 10;
    const DATASET_SCALE_STEP = 0.2;
    const DATA_DIRECTORY_URL = 'data/';
    const DATA_MANIFEST_URL = `${DATA_DIRECTORY_URL}manifest.json`;
    const SAVE_DATASET_ACTION = 'save-dataset';
    const DELETE_DATASET_ACTION = 'delete-dataset';
    const RENAME_DATASET_ACTION = 'rename-dataset';
    const VIEW_MODE_3D = '3d';
    const VIEW_MODE_2D = '2d';
    const VIEW_PLANE_XY = 'xy';
    const VIEW_PLANE_XZ = 'xz';
    const VIEW_PLANE_YZ = 'yz';
    const PLANE_GRID_OFFSET = 0.01;
    const NEW_DATASET_OPTION_LABEL = 'Unsaved dataset';
    const SAVE_BUTTON_ICON = `
      <span class="toolbar-save-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 4.75h11l3.25 3.25v11.25H5z"></path>
          <path d="M8 4.75v6h8v-6"></path>
          <path d="M9 15.25h6"></path>
        </svg>
      </span>
    `;
    const SAVE_AS_BUTTON_ICON = `
      <span class="toolbar-save-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M7 4.75h8.5l4.5 4.5V19.25H7z"></path>
          <path d="M10 4.75v5.5h5.5"></path>
          <path d="M13.5 13.25v5"></path>
          <path d="M11 15.75h5"></path>
        </svg>
      </span>
    `;
    const VISIBILITY_ICON = `
      <span class="visibility-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M2.75 12S6.25 6.75 12 6.75 21.25 12 21.25 12 17.75 17.25 12 17.25 2.75 12 2.75 12Z"></path>
          <circle cx="12" cy="12" r="2.85"></circle>
        </svg>
      </span>
    `;
    const VISIBILITY_OFF_ICON = `
      <span class="visibility-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M2.75 12S6.25 6.75 12 6.75 21.25 12 21.25 12 17.75 17.25 12 17.25 2.75 12 2.75 12Z"></path>
          <circle cx="12" cy="12" r="2.85"></circle>
          <path d="M4.5 19.5 19.5 4.5"></path>
        </svg>
      </span>
    `;
    const UNGROUPED_STORAGE_KEY = '__ungrouped__';
    const INITIAL_DATASET_QUERY = new URLSearchParams(window.location.search).get('json');

    function parseCoordinate(value) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatNumber(value) {
      const rounded = Math.round(value * 1000) / 1000;
      return String(rounded);
    }

    function normalizeDatasetScale(value) {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) {
        return 1;
      }

      const clamped = THREE.MathUtils.clamp(parsed, DATASET_SCALE_MIN, DATASET_SCALE_MAX);
      const snapped = Math.round(clamped / DATASET_SCALE_STEP) * DATASET_SCALE_STEP;
      const rounded = Number(snapped.toFixed(1));
      return Object.is(rounded, -0) ? 0 : rounded;
    }

    function scaleCoordinateFromBase(value) {
      return value * datasetScale;
    }

    function scaleCoordinateToBase(value) {
      return datasetScale === 0 ? value : value / datasetScale;
    }

    function normalizeAxisExtent(value) {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) {
        return DEFAULT_AXIS_EXTENT;
      }

      const clamped = THREE.MathUtils.clamp(parsed, SETTINGS_AXIS_EXTENT_MIN, SETTINGS_AXIS_EXTENT_MAX);
      const snapped = Math.round(clamped / SETTINGS_AXIS_EXTENT_STEP) * SETTINGS_AXIS_EXTENT_STEP;
      return Number(snapped.toFixed(1));
    }

    function normalizeStatusMessage(message) {
      if (typeof message !== 'string' || message === '' || message.endsWith('...')) {
        return message;
      }

      return message.replace(/\.$/, '');
    }

    function roundForSave(value, digits = 6) {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }

    function getEditableLabelSize(value, minSize = 6, maxSize = 18) {
      const trimmedLength = String(value || '').trim().length;
      const measuredLength = trimmedLength || minSize;
      return Math.max(minSize, Math.min(maxSize, measuredLength));
    }

    function setAppLoading(isLoading) {
      if (!appLoadingOverlay) {
        return;
      }

      appLoadingOverlay.hidden = !isLoading;
    }

    function serializeVector3ForSave(vector) {
      return [
        roundForSave(vector.x),
        roundForSave(vector.y),
        roundForSave(vector.z)
      ];
    }

    function parseMetaVector3(value, label) {
      if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`${label} must be an array of 3 numbers.`);
      }

      const parsed = value.map(entry => Number.parseFloat(entry));
      if (!parsed.every(Number.isFinite)) {
        throw new Error(`${label} must contain only numbers.`);
      }

      return new THREE.Vector3(parsed[0], parsed[1], parsed[2]);
    }

    function isValidViewPlane(value) {
      return [VIEW_PLANE_XY, VIEW_PLANE_XZ, VIEW_PLANE_YZ].includes(value);
    }

    function capture3DViewState(
      target = controls.target.clone(),
      distance = camera.position.distanceTo(controls.target)
    ) {
      const safeDistance = Math.max(distance, DEFAULT_CAMERA_DISTANCE);

      if (viewMode === VIEW_MODE_3D) {
        return {
          position: camera.position.clone(),
          target: controls.target.clone(),
          distance: camera.position.distanceTo(controls.target),
          zoom: camera.isOrthographicCamera ? camera.zoom : 1,
        };
      }

      return {
        position: target.clone().addScaledVector(DEFAULT_CAMERA_DIRECTION, safeDistance),
        target: target.clone(),
        distance: safeDistance,
        zoom: orthographicCamera.zoom,
      };
    }

    function getPlaneCameraConfig(plane = viewPlane) {
      switch (plane) {
        case VIEW_PLANE_XZ:
          return {
            offset: new THREE.Vector3(0, -1, 0),
            up: new THREE.Vector3(0, 0, 1)
          };
        case VIEW_PLANE_YZ:
          return {
            offset: new THREE.Vector3(-1, 0, 0),
            up: new THREE.Vector3(0, 1, 0)
          };
        case VIEW_PLANE_XY:
        default:
          return {
            offset: new THREE.Vector3(0, 0, 1),
            up: new THREE.Vector3(0, 1, 0)
          };
      }
    }

    function getActiveCameraDistance() {
      return Math.max(camera.position.distanceTo(controls.target), 0.001);
    }

    function updateOrthographicFrustum(distance = orthographicCamera.position.distanceTo(controls.target)) {
      const safeHeight = Math.max(container.clientHeight, 1);
      const aspect = Math.max(container.clientWidth / safeHeight, 0.0001);
      const safeDistance = Math.max(distance, 0.001);
      const halfHeight = Math.max(
        Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)) * safeDistance,
        0.01
      );
      const halfWidth = halfHeight * aspect;

      orthographicCamera.left = -halfWidth;
      orthographicCamera.right = halfWidth;
      orthographicCamera.top = halfHeight;
      orthographicCamera.bottom = -halfHeight;
      orthographicCamera.updateProjectionMatrix();
    }

    function setActiveCamera(nextCamera) {
      camera = nextCamera;
      controls.object = camera;
      controls.update();
    }

    function snapCameraToPlane(
      plane,
      {
        target = controls.target.clone(),
        distance = getActiveCameraDistance(),
        zoom = orthographicCamera.zoom,
      } = {}
    ) {
      const planeConfig = getPlaneCameraConfig(plane);
      const safeDistance = Math.max(distance, 0.001);
      const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

      orthographicCamera.up.copy(planeConfig.up);
      orthographicCamera.position.copy(target).addScaledVector(planeConfig.offset, safeDistance);
      controls.target.copy(target);
      updateOrthographicFrustum(safeDistance);
      orthographicCamera.zoom = safeZoom;
      orthographicCamera.updateProjectionMatrix();

      setActiveCamera(orthographicCamera);
      controls.enableRotate = false;
      controls.autoRotate = false;
      controls.update();
    }

    function setViewMode(nextViewMode, { plane = viewPlane, preserve3DState = true, viewState = null } = {}) {
      const normalizedViewMode = nextViewMode === VIEW_MODE_2D ? VIEW_MODE_2D : VIEW_MODE_3D;
      const normalizedPlane = isValidViewPlane(plane) ? plane : VIEW_PLANE_XY;

      if (normalizedViewMode === VIEW_MODE_2D) {
        if (preserve3DState && viewMode !== VIEW_MODE_2D) {
          saved3DViewState = capture3DViewState();
        }

        const nextTarget = viewState?.target ? viewState.target.clone() : controls.target.clone();
        const nextDistance = Number.isFinite(viewState?.distance) && viewState.distance > 0
          ? viewState.distance
          : getActiveCameraDistance();
        const nextZoom = Number.isFinite(viewState?.zoom) && viewState.zoom > 0
          ? viewState.zoom
          : (camera.isOrthographicCamera ? camera.zoom : 1);

        if (!saved3DViewState) {
          saved3DViewState = capture3DViewState(nextTarget, nextDistance);
        }

        viewMode = VIEW_MODE_2D;
        viewPlane = normalizedPlane;
        snapCameraToPlane(viewPlane, { target: nextTarget, distance: nextDistance, zoom: nextZoom });
        refreshAllVectors();
        renderVisualizationSettings();
        return;
      }

      const next3DState = viewState ?? saved3DViewState ?? capture3DViewState();

      viewMode = VIEW_MODE_3D;
      viewPlane = normalizedPlane;
      orthographicCamera.up.set(0, 1, 0);
      orthographicCamera.position.copy(next3DState.position);
      controls.target.copy(next3DState.target);
      updateOrthographicFrustum(next3DState.distance);
      orthographicCamera.zoom = Number.isFinite(next3DState.zoom) && next3DState.zoom > 0 ? next3DState.zoom : orthographicCamera.zoom;
      orthographicCamera.updateProjectionMatrix();

      setActiveCamera(orthographicCamera);
      controls.enableRotate = true;
      controls.autoRotate = autoRotateEnabled;
      controls.update();
      refreshAllVectors();
      renderVisualizationSettings();
    }

    function getCurrentViewStateForSave() {
      return {
        position: serializeVector3ForSave(camera.position),
        target: serializeVector3ForSave(controls.target),
        distance: roundForSave(camera.position.distanceTo(controls.target)),
        viewMode,
        viewPlane,
        zoom: camera.isOrthographicCamera ? roundForSave(camera.zoom) : 1
      };
    }

    function applyViewState(viewState) {
      if (!viewState) {
        return;
      }

      const nextViewMode = viewState.viewMode === VIEW_MODE_2D ? VIEW_MODE_2D : VIEW_MODE_3D;
      const nextViewPlane = isValidViewPlane(viewState.viewPlane) ? viewState.viewPlane : viewPlane;
      const nextDistance = Number.isFinite(viewState.distance) && viewState.distance > 0
        ? viewState.distance
        : viewState.position.distanceTo(viewState.target);

      if (nextViewMode === VIEW_MODE_2D) {
        saved3DViewState = capture3DViewState(viewState.target, nextDistance);
        setViewMode(VIEW_MODE_2D, {
          plane: nextViewPlane,
          preserve3DState: false,
          viewState: {
            target: viewState.target,
            distance: nextDistance,
            zoom: viewState.zoom,
          }
        });
        return;
      }

      setViewMode(VIEW_MODE_3D, {
        plane: nextViewPlane,
        preserve3DState: false,
        viewState: {
          position: viewState.position,
          target: viewState.target,
          distance: nextDistance,
          zoom: viewState.zoom,
        }
      });
    }

    function renderScalePanel() {
      vectorScaleSlider.value = String(datasetScale);
      vectorScaleValue.textContent = `${formatNumber(datasetScale)}x`;
    }

    function renderAddControlsPanel() {
      addControlsToggle.setAttribute('aria-expanded', String(addControlsOpen));
      addControlsToggle.setAttribute('aria-label', addControlsOpen ? 'Close add controls' : 'Open add controls');
      addControlsPanel.hidden = !addControlsOpen;
    }

    function openAddControls() {
      if (visualControlsOpen) {
        closeVisualControls();
      }

      addControlsOpen = true;
      renderAddControlsPanel();

      requestAnimationFrame(() => {
        vecNameInput.focus();
      });
    }

    function closeAddControls() {
      if (!addControlsOpen) {
        return;
      }

      addControlsOpen = false;
      renderAddControlsPanel();
    }

    function toggleAddControls() {
      if (addControlsOpen) {
        closeAddControls();
        return;
      }

      openAddControls();
    }

    function renderVisualControlsPanel() {
      visualControlsToggle.setAttribute('aria-expanded', String(visualControlsOpen));
      visualControlsToggle.setAttribute('aria-label', visualControlsOpen ? 'Close visualization controls' : 'Open visualization controls');
      visualControlsPanel.hidden = !visualControlsOpen;
    }

    function applyReadOnlyStateToStaticControls() {
      if (!isReadOnlyMode) {
        return;
      }

      importJsonInput.readOnly = true;
      importJsonBtn.disabled = true;
    }

    function openVisualControls() {
      if (addControlsOpen) {
        closeAddControls();
      }

      visualControlsOpen = true;
      renderVisualControlsPanel();
    }

    function closeVisualControls() {
      if (!visualControlsOpen) {
        return;
      }

      visualControlsOpen = false;
      renderVisualControlsPanel();
    }

    function toggleVisualControls() {
      if (visualControlsOpen) {
        closeVisualControls();
        return;
      }

      openVisualControls();
    }

    function renderNotesSettings() {
      if (settingsNotesInput.value !== datasetNotes) {
        settingsNotesInput.value = datasetNotes;
      }
    }

    function computeVectorSliderExtent() {
      let maxAbs = 0;

      vectors.forEach(vector => {
        maxAbs = Math.max(
          maxAbs,
          Math.abs(vector.vec.x),
          Math.abs(vector.vec.y),
          Math.abs(vector.vec.z)
        );
      });

      const paddedExtent = maxAbs * VECTOR_SLIDER_PADDING_FACTOR;
      return Math.max(VECTOR_SLIDER_MIN_EXTENT, Math.ceil(paddedExtent * 1000) / 1000);
    }

    function syncRenderedVectorSliders() {
      const nextExtent = computeVectorSliderExtent();
      if (nextExtent <= vectorSliderExtent) {
        return;
      }

      vectorSliderExtent = nextExtent;
      listEl.querySelectorAll('.vector-slider-input').forEach(sliderInput => {
        const vectorId = Number.parseInt(sliderInput.dataset.vectorId, 10);
        const vector = getVectorById(vectorId);
        if (!vector) return;

        sliderInput.min = String(-vectorSliderExtent);
        sliderInput.max = String(vectorSliderExtent);
        sliderInput.value = String(vector.vec[sliderInput.dataset.field]);
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getVectorById(vectorId) {
      return vectors.find(vector => vector.id === vectorId) || null;
    }

    function getGroupById(groupId) {
      return groups.find(group => group.id === groupId) || null;
    }

    function getEffectiveColor(vector) {
      const group = getGroupById(vector.groupId);
      return group ? group.color : vector.manualColor;
    }

    function rebuildAxesAndGrid() {
      if (planeGrid) {
        scene.remove(planeGrid);
        planeGrid.geometry.dispose();
        planeGrid.material.dispose();
      }

      while (axisMeshes.length) {
        const axisMesh = axisMeshes.pop();
        scene.remove(axisMesh);
        disposeMeshes(axisMesh);
      }

      planeGrid = createGrid(axisExtent);
      axisMeshes.push(
        createAxis(new THREE.Vector3(1, 0, 0), 0xffffff, axisExtent),
        createAxis(new THREE.Vector3(0, 1, 0), 0xffffff, axisExtent),
        createAxis(new THREE.Vector3(0, 0, 1), 0xffffff, axisExtent)
      );
      updatePlaneGridState();
      updateAxisLabelsVisibility();
      updateAxisLabelPositions();
    }

    function updatePlaneGridState() {
      if (!planeGrid) {
        return;
      }

      const is2DView = viewMode === VIEW_MODE_2D;
      const activePlane = is2DView ? viewPlane : VIEW_PLANE_XZ;

      planeGrid.rotation.set(0, 0, 0);
      planeGrid.position.set(0, -PLANE_GRID_OFFSET, 0);

      if (activePlane === VIEW_PLANE_XY) {
        planeGrid.rotation.set(Math.PI / 2, 0, 0);
        planeGrid.position.set(0, 0, -PLANE_GRID_OFFSET);
      } else if (activePlane === VIEW_PLANE_YZ) {
        planeGrid.rotation.set(0, 0, Math.PI / 2);
        planeGrid.position.set(-PLANE_GRID_OFFSET, 0, 0);
      }

      planeGrid.visible = showPlane;
    }

    function syncVectorCoordinatesFromScale(vector) {
      vector.vec.x = scaleCoordinateFromBase(vector.baseVec.x);
      vector.vec.y = scaleCoordinateFromBase(vector.baseVec.y);
      vector.vec.z = scaleCoordinateFromBase(vector.baseVec.z);
    }

    function isVectorVisible(vector) {
      return vector.visible !== false;
    }

    function syncVectorSceneVisibility(vector) {
      const isVisible = isVectorVisible(vector);
      if (vector.obj3d) {
        vector.obj3d.visible = isVisible;
      }
      if (vector.labelObject) {
        vector.labelObject.visible = isVisible && showVectorNames;
      }
    }

    function setColorButtonValue(button, color) {
      if (!button) return;
      button.style.setProperty('--dot-color', color);
    }

    function dismissToast(toast) {
      if (!toast || toast.dataset.state === 'leaving') {
        return;
      }

      toast.dataset.state = 'leaving';
      if (toast._dismissTimer) {
        window.clearTimeout(toast._dismissTimer);
        toast._dismissTimer = 0;
      }

      toast.classList.remove('is-visible');
      toast.classList.add('is-leaving');

      window.setTimeout(() => {
        if (toast === activeDatasetToast) {
          activeDatasetToast = null;
        }

        toast.remove();
      }, 180);
    }

    function showToast(message, { type = '', duration = 3200 } = {}) {
      if (!toastViewport) {
        return null;
      }

      const normalizedMessage = normalizeStatusMessage(message);
      if (!normalizedMessage) {
        return null;
      }

      const toast = document.createElement('div');
      toast.className = 'app-toast';
      if (type) {
        toast.classList.add(`is-${type}`);
      }

      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
      toast.textContent = normalizedMessage;
      toastViewport.prepend(toast);

      requestAnimationFrame(() => {
        toast.classList.add('is-visible');
      });

      toast._dismissTimer = window.setTimeout(() => {
        dismissToast(toast);
      }, duration);

      while (toastViewport.childElementCount > 4) {
        dismissToast(toastViewport.lastElementChild);
      }

      return toast;
    }

    function setDatasetStatus(message = '', type = '') {
      if (activeDatasetToast) {
        dismissToast(activeDatasetToast);
        activeDatasetToast = null;
      }

      const normalizedMessage = normalizeStatusMessage(message);
      if (!normalizedMessage) {
        return;
      }

      const duration = type === 'error' ? 4200 : type === 'success' ? 3200 : 2400;
      activeDatasetToast = showToast(normalizedMessage, { type, duration });
    }

    function isWritableDatasetPath(datasetPath = activeDatasetPath) {
      return typeof datasetPath === 'string'
        && datasetPath.startsWith(DATA_DIRECTORY_URL)
        && datasetPath.toLowerCase().endsWith('.json');
    }

    function getShareableDatasetQueryValue(datasetPath) {
      const normalizedPath = normalizeRequestedDatasetPath(datasetPath);
      if (!normalizedPath) {
        return '';
      }
      return normalizedPath.startsWith(DATA_DIRECTORY_URL)
        ? normalizedPath.slice(DATA_DIRECTORY_URL.length)
        : normalizedPath;
    }

    function buildDatasetShareUrl(datasetPath = activeDatasetPath) {
      const shareableDatasetPath = getShareableDatasetQueryValue(datasetPath);
      const url = new URL(window.location.href);

      if (shareableDatasetPath) {
        url.searchParams.set('json', shareableDatasetPath);
      } else {
        url.searchParams.delete('json');
      }

      return url.toString();
    }

    function buildSaveDatasetUrl() {
      const url = new URL(window.location.href);
      url.searchParams.set('action', SAVE_DATASET_ACTION);
      url.searchParams.delete('logout');
      return url.toString();
    }

    function buildDeleteDatasetUrl() {
      const url = new URL(window.location.href);
      url.searchParams.set('action', DELETE_DATASET_ACTION);
      url.searchParams.delete('logout');
      return url.toString();
    }

    function buildRenameDatasetUrl() {
      const url = new URL(window.location.href);
      url.searchParams.set('action', RENAME_DATASET_ACTION);
      url.searchParams.delete('logout');
      return url.toString();
    }

    function buildLogoutUrl() {
      const url = new URL(window.location.href);
      url.searchParams.set('logout', '1');
      return url.toString();
    }

    function syncPageUrlToDataset(datasetPath = activeDatasetPath) {
      const nextUrl = buildDatasetShareUrl(datasetPath);
      window.history.replaceState({}, '', nextUrl);
    }

    function renderDatasetLinkButton() {
      const hasDataset = Boolean(activeDatasetPath);
      const canOverwriteDataset = isWritableDatasetPath(activeDatasetPath);
      copyDatasetLinkBtn.disabled = !hasDataset;
      copyDatasetLinkBtn.hidden = !hasDataset;
      const shareLabel = hasDataset
        ? `Copy share link for ${getDatasetDisplayName(activeDatasetPath)}`
        : 'Create or load a dataset first';
      copyDatasetLinkBtn.title = shareLabel;
      copyDatasetLinkBtn.setAttribute('aria-label', shareLabel);

      saveDatasetBtn.disabled = isReadOnlyMode;

      if (isReadOnlyMode) {
        saveDatasetBtn.innerHTML = SAVE_BUTTON_ICON;
        saveDatasetBtn.title = 'Guest mode is view-only';
        saveDatasetBtn.setAttribute('aria-label', 'Guest mode is view-only');
        return;
      }

      saveDatasetBtn.title = canOverwriteDataset
        ? `Save ${getDatasetDisplayName(activeDatasetPath)}`
        : 'Save current vectors as an unsaved dataset';

      if (canOverwriteDataset) {
        saveDatasetBtn.innerHTML = SAVE_BUTTON_ICON;
        saveDatasetBtn.setAttribute('aria-label', `Save ${getDatasetDisplayName(activeDatasetPath)}`);
      } else {
        saveDatasetBtn.innerHTML = SAVE_AS_BUTTON_ICON;
        saveDatasetBtn.setAttribute('aria-label', 'Save current vectors as an unsaved dataset');
      }
    }

    function setActiveDatasetPath(datasetPath) {
      activeDatasetPath = normalizeRequestedDatasetPath(datasetPath);
      renderDatasetLinkButton();
      renderDeleteSettings();
      syncPageUrlToDataset(activeDatasetPath);
    }

    async function copyTextToClipboard(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const tempTextarea = document.createElement('textarea');
      tempTextarea.value = text;
      tempTextarea.setAttribute('readonly', '');
      tempTextarea.style.position = 'fixed';
      tempTextarea.style.opacity = '0';
      document.body.appendChild(tempTextarea);
      tempTextarea.select();
      document.execCommand('copy');
      tempTextarea.remove();
    }

    function downloadTextFile(fileName, text, mimeType = 'application/json;charset=utf-8') {
      const blob = new Blob([text], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 0);
    }

    function getDatasetDisplayName(datasetPath) {
      const normalizedPath = String(datasetPath).replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || normalizedPath;
      return decodeURIComponent(fileName)
        .replace(/\.json$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/([0-9])([A-Za-z])/g, '$1 $2')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function getDatasetEditableName(datasetPath) {
      const normalizedPath = String(datasetPath).replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || normalizedPath;
      return decodeURIComponent(fileName)
        .replace(/\.json$/i, '')
        .trim();
    }

    function getExportDatasetFileName() {
      const normalizedPath = String(activeDatasetPath || '').replace(/\\/g, '/');
      const fileName = normalizedPath.split('/').pop() || '';

      if (fileName && fileName.toLowerCase().endsWith('.json')) {
        return fileName;
      }

      return 'vectors.json';
    }

    function normalizeRequestedDatasetPath(datasetPath) {
      const trimmedPath = String(datasetPath || '').trim();
      if (!trimmedPath || !trimmedPath.toLowerCase().endsWith('.json')) {
        return '';
      }
      if (/^(https?:)?\/\//i.test(trimmedPath) || trimmedPath.startsWith('/')) {
        return trimmedPath;
      }
      return trimmedPath.includes('/') ? trimmedPath : `${DATA_DIRECTORY_URL}${trimmedPath}`;
    }

    function normalizeDatasetEntries(entries) {
      const seenPaths = new Set();

      return entries
        .map(entry => String(entry || '').trim())
        .filter(entry => entry.toLowerCase().endsWith('.json'))
        .map(entry => entry.replace(/^\.\//, ''))
        .map(entry => entry.startsWith(DATA_DIRECTORY_URL) ? entry : `${DATA_DIRECTORY_URL}${entry}`)
        .filter(entry => entry.toLowerCase() !== DATA_MANIFEST_URL.toLowerCase())
        .filter(entry => {
          if (seenPaths.has(entry)) {
            return false;
          }
          seenPaths.add(entry);
          return true;
        })
        .sort((left, right) => left.localeCompare(right));
    }

    async function fetchDatasetEntriesFromManifest() {
      const response = await fetch(DATA_MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('manifest unavailable');
      }

      const payload = await response.json();
      if (Array.isArray(payload)) {
        return normalizeDatasetEntries(payload);
      }
      if (payload && Array.isArray(payload.files)) {
        return normalizeDatasetEntries(payload.files);
      }

      throw new Error('manifest format invalid');
    }

    function extractDatasetEntriesFromDirectoryListing(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const dataDirectoryUrl = new URL(DATA_DIRECTORY_URL, window.location.href);
      const datasetEntries = Array.from(doc.querySelectorAll('a[href]'))
        .map(link => link.getAttribute('href'))
        .filter(Boolean)
        .map(href => new URL(href, dataDirectoryUrl))
        .filter(url => url.pathname.startsWith(dataDirectoryUrl.pathname) && url.pathname.toLowerCase().endsWith('.json'))
        .map(url => decodeURIComponent(url.pathname.slice(dataDirectoryUrl.pathname.length)));

      return normalizeDatasetEntries(datasetEntries);
    }

    async function fetchDatasetEntriesFromDirectory() {
      const response = await fetch(DATA_DIRECTORY_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('directory listing unavailable');
      }

      return extractDatasetEntriesFromDirectoryListing(await response.text());
    }

    async function fetchDatasetEntries() {
      try {
        const manifestEntries = await fetchDatasetEntriesFromManifest();
        if (manifestEntries.length) {
          return manifestEntries;
        }
      } catch {
        // Fall back to directory listing when no manifest exists.
      }

      return fetchDatasetEntriesFromDirectory();
    }

    function renderDatasetOptions(datasetEntries, placeholderText = NEW_DATASET_OPTION_LABEL) {
      datasetSelect.innerHTML = [
        `<option value="">${escapeHtml(placeholderText)}</option>`,
        ...datasetEntries.map(entry => `<option value="${escapeHtml(entry)}">${escapeHtml(getDatasetDisplayName(entry))}</option>`)
      ].join('');
    }

    function ensureDatasetOption(datasetPath) {
      if (!datasetPath || Array.from(datasetSelect.options).some(option => option.value === datasetPath)) {
        return;
      }

      datasetSelect.insertAdjacentHTML(
        'beforeend',
        `<option value="${escapeHtml(datasetPath)}">${escapeHtml(getDatasetDisplayName(datasetPath))}</option>`
      );
    }

    async function refreshDatasetOptions() {
      datasetSelect.disabled = true;
      renderDatasetOptions([], 'Loading datasets...');
      setDatasetStatus();

      try {
        const datasetEntries = await fetchDatasetEntries();
        if (!datasetEntries.length) {
          renderDatasetOptions([], NEW_DATASET_OPTION_LABEL);
          datasetSelect.disabled = false;
          datasetSelect.value = '';
          setDatasetStatus('No JSON files found in data/.');
          renderDatasetLinkButton();
          renderDeleteSettings();
          return [];
        }

        renderDatasetOptions(datasetEntries, NEW_DATASET_OPTION_LABEL);
        datasetSelect.disabled = false;
        const activeDatasetStillAvailable = datasetEntries.includes(activeDatasetPath);
        if (!activeDatasetStillAvailable && activeDatasetPath) {
          setActiveDatasetPath('');
        }
        datasetSelect.value = activeDatasetStillAvailable ? activeDatasetPath : '';
        setDatasetStatus();
        renderDatasetLinkButton();
        renderDeleteSettings();
        return datasetEntries;
      } catch {
        renderDatasetOptions([], NEW_DATASET_OPTION_LABEL);
        datasetSelect.disabled = false;
        datasetSelect.value = activeDatasetPath;
        setDatasetStatus('Could not list data/. Directory listing or data/manifest.json is required.', 'error');
        renderDatasetLinkButton();
        renderDeleteSettings();
        return [];
      }
    }

    async function loadDataset(datasetPath, { failureMessage = '' } = {}) {
      const datasetLabel = getDatasetDisplayName(datasetPath);
      datasetSelect.disabled = true;
      setDatasetStatus(`Loading ${datasetLabel}...`);

      try {
        const response = await fetch(datasetPath, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Could not fetch ${datasetLabel}.`);
        }

        const rawText = await response.text();
        ensureDatasetOption(datasetPath);
        datasetSelect.value = datasetPath;
        setActiveDatasetPath(datasetPath);
        clearImportJsonInput();
        const { importedGroupCount, importedVectorCount } = importVectorsFromJson(rawText);
        setDatasetStatus(`Loaded '${datasetLabel}' (${importedVectorCount} vectors)`, 'success');
        setImportStatus(`Loaded ${datasetLabel}.`, 'success');
        return true;
      } catch (error) {
        datasetSelect.value = '';
        setActiveDatasetPath('');
        setDatasetStatus(failureMessage || error.message || 'Dataset load failed.', failureMessage ? '' : 'error');
        return false;
      } finally {
        datasetSelect.disabled = false;
      }
    }

    async function maybeLoadDatasetFromQuery() {
      const requestedDatasetPath = normalizeRequestedDatasetPath(INITIAL_DATASET_QUERY);
      if (!requestedDatasetPath) {
        return;
      }

      await loadDataset(requestedDatasetPath, {
        failureMessage: 'Requested dataset was not found. Start an unsaved dataset or choose another one.'
      });
    }

    function renderPlotLegend() {
      const visibleGroups = groups.filter(group =>
        vectors.some(vector => vector.groupId === group.id && isVectorVisible(vector))
      );

      if (!showPlotLegend || visibleGroups.length === 0) {
        plotLegend.hidden = true;
        plotLegend.innerHTML = '';
        return;
      }

      plotLegend.hidden = false;
      plotLegend.innerHTML = `
        <div class="plot-legend-list">
          ${visibleGroups.map(group => `
            <div class="plot-legend-item">
              <span class="plot-legend-swatch" style="background:${escapeHtml(group.color)}"></span>
              <span class="plot-legend-label">${escapeHtml(group.name)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    function getRenderedVector(vec) {
      const renderedVector = new THREE.Vector3(vec.x, vec.y, vec.z);

      if (viewMode !== VIEW_MODE_2D) {
        return renderedVector;
      }

      if (viewPlane === VIEW_PLANE_XY) {
        renderedVector.z = 0;
      } else if (viewPlane === VIEW_PLANE_XZ) {
        renderedVector.y = 0;
      } else if (viewPlane === VIEW_PLANE_YZ) {
        renderedVector.x = 0;
      }

      return renderedVector;
    }

    function isAxisVisibleInCurrentView(axisIndex) {
      if (viewMode !== VIEW_MODE_2D) {
        return true;
      }

      if (viewPlane === VIEW_PLANE_XY) {
        return axisIndex !== 2;
      }

      if (viewPlane === VIEW_PLANE_XZ) {
        return axisIndex !== 1;
      }

      return axisIndex !== 0;
    }

    function createVectorLabelObject(name) {
      const element = document.createElement('div');
      element.className = 'vector-label';
      element.textContent = name.trim() || 'Vector';
      const labelObject = new CSS2DObject(element);
      labelObject.center.set(0.5, 0.5);
      labelObject.userData.offsetX = 0;
      labelObject.userData.offsetY = 0;
      return labelObject;
    }

    function createAxisLabelObject(name, position) {
      const element = document.createElement('div');
      element.className = 'axis-label';
      element.textContent = name;

      const labelObject = new CSS2DObject(element);
      labelObject.position.copy(position);
      labelObject.center.set(0.5, 0.5);
      labelObject.visible = showAxisNames;
      scene.add(labelObject);
      axisLabelObjects.push(labelObject);
    }

    function updateAxisLabelPositions() {
      if (axisLabelObjects.length < 3) {
        return;
      }

      const axisLabelPosition = getAxisRenderedExtent(axisExtent) + AXIS_LABEL_OFFSET;

      axisLabelObjects[0].position.set(axisLabelPosition, 0, 0);
      axisLabelObjects[1].position.set(0, axisLabelPosition, 0);
      axisLabelObjects[2].position.set(0, 0, axisLabelPosition);
    }

    function initializeAxisLabels() {
      if (axisLabelObjects.length) {
        updateAxisLabelPositions();
        return;
      }

      const axisLabelPosition = getAxisRenderedExtent(axisExtent) + AXIS_LABEL_OFFSET;

      createAxisLabelObject('x', new THREE.Vector3(axisLabelPosition, 0, 0));
      createAxisLabelObject('y', new THREE.Vector3(0, axisLabelPosition, 0));
      createAxisLabelObject('z', new THREE.Vector3(0, 0, axisLabelPosition));
    }

    function getZoomResponsiveLabelScale() {
      if (camera.isOrthographicCamera) {
        return THREE.MathUtils.clamp(Math.sqrt(camera.zoom), 0.4, 1.8);
      }

      const cameraDistance = camera.position.distanceTo(controls.target);
      const rawScale = LABEL_BASE_CAMERA_DISTANCE / Math.max(cameraDistance, 0.001);
      return THREE.MathUtils.clamp(rawScale, 0.4, 1);
    }

    function syncVectorLabel(vector) {
      if (!vector.labelObject) {
        vector.labelObject = createVectorLabelObject(vector.name);
        scene.add(vector.labelObject);
      }

      vector.labelObject.element.textContent = vector.name.trim() || 'Vector';
      vector.labelObject.element.style.color = getEffectiveColor(vector);
      vector.labelObject.position.copy(getRenderedVector(vector.vec));
      syncVectorSceneVisibility(vector);
    }

    function updateVectorLabelLayout(vector) {
      if (!vector.labelObject) return;

      const labelScale = getZoomResponsiveLabelScale();
      vector.labelObject.element.style.fontSize = `${(LABEL_BASE_FONT_SIZE * labelScale).toFixed(2)}px`;

      labelOriginNdc.set(0, 0, 0).project(camera);
      labelEndpointNdc.copy(getRenderedVector(vector.vec)).project(camera);

      let screenDx = labelEndpointNdc.x - labelOriginNdc.x;
      let screenDy = labelEndpointNdc.y - labelOriginNdc.y;

      if (Math.abs(screenDx) < 1e-4 && Math.abs(screenDy) < 1e-4) {
        screenDx = 0.55;
        screenDy = 0.85;
      }

      const screenLength = Math.hypot(screenDx, screenDy) || 1;
      const dirX = screenDx / screenLength;
      const dirY = screenDy / screenLength;

      const gapPx = Math.max(8, LABEL_BASE_GAP * labelScale);
      const targetOffsetX = dirX * gapPx;
      const targetOffsetY = -dirY * gapPx;
      if (!Number.isFinite(vector.labelObject.userData.offsetX)) {
        vector.labelObject.userData.offsetX = targetOffsetX;
      }
      if (!Number.isFinite(vector.labelObject.userData.offsetY)) {
        vector.labelObject.userData.offsetY = targetOffsetY;
      }
      vector.labelObject.userData.offsetX = THREE.MathUtils.lerp(vector.labelObject.userData.offsetX, targetOffsetX, 0.22);
      vector.labelObject.userData.offsetY = THREE.MathUtils.lerp(vector.labelObject.userData.offsetY, targetOffsetY, 0.22);
      vector.labelObject.element.style.marginLeft = `${vector.labelObject.userData.offsetX.toFixed(2)}px`;
      vector.labelObject.element.style.marginTop = `${vector.labelObject.userData.offsetY.toFixed(2)}px`;
    }

    function updateVectorLabelsLayout() {
      vectors.forEach(updateVectorLabelLayout);
    }

    function updateVectorLabelsVisibility() {
      vectors.forEach(vector => {
        syncVectorSceneVisibility(vector);
      });
    }

    function updateAxisLabelsVisibility() {
      axisLabelObjects.forEach((axisLabelObject, index) => {
        axisLabelObject.visible = showAxisNames && isAxisVisibleInCurrentView(index);
      });

      axisMeshes.forEach((axisMesh, index) => {
        const isVisibleInPlane = isAxisVisibleInCurrentView(index);
        axisMesh.visible = isVisibleInPlane;
        const arrowHead = axisMesh.children[1];
        if (arrowHead) {
          arrowHead.visible = showAxisNames && isVisibleInPlane;
        }
      });
    }

    function updateAxisLabelsLayout() {
      const labelScale = getZoomResponsiveLabelScale();
      axisLabelObjects.forEach(axisLabelObject => {
        axisLabelObject.element.style.fontSize = `${Math.round(AXIS_LABEL_BASE_FONT_SIZE * labelScale)}px`;
      });
    }

    function disposeVectorLabel(vector) {
      if (!vector.labelObject) return;
      if (vector.labelObject.element?.parentNode) {
        vector.labelObject.element.remove();
      }
      scene.remove(vector.labelObject);
      vector.labelObject = null;
    }

    function createZeroMarker(color) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 20, 20),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.22,
          metalness: 0.12,
          roughness: 0.4
        })
      );
      return marker;
    }

    function createArrow(vec, color) {
      const direction = getRenderedVector(vec);
      const length = direction.length();
      if (length === 0) {
        return createZeroMarker(color);
      }

      const group = new THREE.Group();
      const unitDirection = direction.clone().normalize();
      const maxHeadLength = Math.max(length * 0.48, 0.09);
      const headLength = Math.min(0.38, maxHeadLength);
      const shaftLength = Math.max(length - headLength, 0.001);
      const headRadius = 0.1;
      const shaftRadiusTop = 0.03;
      const shaftRadiusBottom = 0.036;

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(shaftRadiusTop, shaftRadiusBottom, shaftLength, 20),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.16,
          metalness: 0.1,
          roughness: 0.32
        })
      );
      shaft.position.y = shaftLength / 2;

      const head = new THREE.Mesh(
        new THREE.ConeGeometry(headRadius, headLength, 24),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.24,
          metalness: 0.08,
          roughness: 0.28
        })
      );
      head.position.y = shaftLength + headLength / 2;

      group.add(shaft, head);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unitDirection);
      return group;
    }

    function createPoint(vec, color) {
      const geo = new THREE.SphereGeometry(0.12, 16, 16);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(getRenderedVector(vec));
      return mesh;
    }

    function buildVectorObject(vector) {
      const color = new THREE.Color(getEffectiveColor(vector)).getHex();
      return displayMode === 'arrow' ? createArrow(vector.vec, color) : createPoint(vector.vec, color);
    }

    function syncVectorObject(vector) {
      if (vector.obj3d) {
        vectorLayer.remove(vector.obj3d);
        disposeMeshes(vector.obj3d);
      }

      vector.obj3d = buildVectorObject(vector);
      vectorLayer.add(vector.obj3d);
      syncVectorLabel(vector);
      syncVectorSceneVisibility(vector);
    }

    function refreshAllVectors() {
      vectors.forEach(syncVectorObject);
    }

    function getCurrentVisualizationSettingsForSave() {
      return {
        scale: datasetScale,
        axisExtent,
        displayMode,
        showVectorNames,
        showPlotLegend,
        showPlane,
        showAxisNames,
        autoRotateEnabled
      };
    }

    function parseVisualizationSettings(settings = {}, baseSettings = {}) {
      if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
        throw new Error('Dataset settings must be an object.');
      }

      const normalizedSettings = {
        ...baseSettings
      };

      if (Object.prototype.hasOwnProperty.call(settings, 'scale')) {
        const parsedScale = Number.parseFloat(settings.scale);
        if (!Number.isFinite(parsedScale)) {
          throw new Error('Dataset scale must be a number.');
        }
        if (parsedScale < DATASET_SCALE_MIN || parsedScale > DATASET_SCALE_MAX) {
          throw new Error(`Dataset scale must stay between ${DATASET_SCALE_MIN} and ${DATASET_SCALE_MAX}.`);
        }
        normalizedSettings.scale = normalizeDatasetScale(parsedScale);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'axisExtent')) {
        const parsedAxisExtent = Number.parseFloat(settings.axisExtent);
        if (!Number.isFinite(parsedAxisExtent)) {
          throw new Error('Axis extent must be a number.');
        }
        normalizedSettings.axisExtent = normalizeAxisExtent(parsedAxisExtent);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'displayMode')) {
        if (!['arrow', 'point'].includes(settings.displayMode)) {
          throw new Error('Display mode must be arrow or point.');
        }
        normalizedSettings.displayMode = settings.displayMode;
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'showVectorNames')) {
        normalizedSettings.showVectorNames = Boolean(settings.showVectorNames);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'showPlotLegend')) {
        normalizedSettings.showPlotLegend = Boolean(settings.showPlotLegend);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'showPlane')) {
        normalizedSettings.showPlane = Boolean(settings.showPlane);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'showAxisNames')) {
        normalizedSettings.showAxisNames = Boolean(settings.showAxisNames);
      }

      if (Object.prototype.hasOwnProperty.call(settings, 'autoRotateEnabled')) {
        normalizedSettings.autoRotateEnabled = Boolean(settings.autoRotateEnabled);
      }

      return normalizedSettings;
    }

    function applyVisualizationSettings(settings = {}) {
      const normalizedSettings = parseVisualizationSettings(settings, getCurrentVisualizationSettingsForSave());
      datasetScale = normalizedSettings.scale;
      axisExtent = normalizedSettings.axisExtent;
      displayMode = normalizedSettings.displayMode;
      showVectorNames = normalizedSettings.showVectorNames;
      showPlotLegend = normalizedSettings.showPlotLegend;
      showPlane = normalizedSettings.showPlane;
      showAxisNames = normalizedSettings.showAxisNames;
      autoRotateEnabled = normalizedSettings.autoRotateEnabled;
    }

    function disposeMeshes(obj) {
      if (!obj) return;

      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(material => {
            if (material.map) material.map.dispose();
            material.dispose();
          });
        }
      });
    }

    // --- UI ---
    function renderVisualizationSettings() {
      const is2DView = viewMode === VIEW_MODE_2D;
      const usesPoints = displayMode === 'point';
      settingsView3dBtn.classList.toggle('is-active', !is2DView);
      settingsView3dBtn.setAttribute('aria-pressed', String(!is2DView));
      settingsView2dBtn.classList.toggle('is-active', is2DView);
      settingsView2dBtn.setAttribute('aria-pressed', String(is2DView));
      settings2dPlaneControls.hidden = !is2DView;
      settingsPlaneXYBtn.classList.toggle('is-active', is2DView && viewPlane === VIEW_PLANE_XY);
      settingsPlaneXYBtn.setAttribute('aria-pressed', String(is2DView && viewPlane === VIEW_PLANE_XY));
      settingsPlaneXZBtn.classList.toggle('is-active', is2DView && viewPlane === VIEW_PLANE_XZ);
      settingsPlaneXZBtn.setAttribute('aria-pressed', String(is2DView && viewPlane === VIEW_PLANE_XZ));
      settingsPlaneYZBtn.classList.toggle('is-active', is2DView && viewPlane === VIEW_PLANE_YZ);
      settingsPlaneYZBtn.setAttribute('aria-pressed', String(is2DView && viewPlane === VIEW_PLANE_YZ));
      settingsDisplayArrowBtn.classList.toggle('is-active', !usesPoints);
      settingsDisplayArrowBtn.setAttribute('aria-pressed', String(!usesPoints));
      settingsDisplayPointBtn.classList.toggle('is-active', usesPoints);
      settingsDisplayPointBtn.setAttribute('aria-pressed', String(usesPoints));
      settingsAxisExtentSlider.value = String(axisExtent);
      settingsAxisExtentValue.textContent = formatNumber(axisExtent);
      settingsNameToggleValue.textContent = showVectorNames ? 'Shown' : 'Hidden';
      settingsNameToggle.setAttribute('aria-pressed', String(showVectorNames));
      settingsNameToggleTrack.classList.toggle('active', showVectorNames);
      settingsLegendToggleValue.textContent = showPlotLegend ? 'Shown' : 'Hidden';
      settingsLegendToggle.setAttribute('aria-pressed', String(showPlotLegend));
      settingsLegendToggleTrack.classList.toggle('active', showPlotLegend);
      settingsPlaneToggle.disabled = false;
      settingsPlaneToggleValue.textContent = showPlane ? 'Shown' : 'Hidden';
      settingsPlaneToggle.setAttribute('aria-pressed', String(showPlane));
      settingsPlaneToggleTrack.classList.toggle('active', showPlane);
      settingsAxisToggleValue.textContent = showAxisNames ? 'Shown' : 'Hidden';
      settingsAxisToggle.setAttribute('aria-pressed', String(showAxisNames));
      settingsAxisToggleTrack.classList.toggle('active', showAxisNames);
      settingsAutoRotateToggle.disabled = is2DView;
      settingsAutoRotateToggleValue.textContent = !is2DView && autoRotateEnabled ? 'On' : 'Off';
      settingsAutoRotateToggle.setAttribute('aria-pressed', String(!is2DView && autoRotateEnabled));
      settingsAutoRotateToggleTrack.classList.toggle('active', !is2DView && autoRotateEnabled);
      updatePlaneGridState();
      controls.autoRotate = !is2DView && autoRotateEnabled;
      updateVectorLabelsVisibility();
      updateAxisLabelsVisibility();
      renderPlotLegend();
    }

    function setImportStatus(message = '', type = '') {
      importStatus.textContent = normalizeStatusMessage(message);
      importStatus.className = 'settings-status';
      if (type) {
        importStatus.classList.add(`is-${type}`);
      }
    }

    function clearImportJsonInput() {
      importJsonInput.value = '';
    }

    function setSettingsView(viewName) {
      settingsNavButtons.forEach(button => {
        button.classList.toggle('is-active', button.dataset.settingsView === viewName);
      });
      settingsViewPanels.forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.settingsViewPanel === viewName);
      });
    }

    function openSettings(viewName = 'notes') {
      settingsModal.hidden = false;
      setSettingsView(viewName);
      renderDeleteSettings();
      renderNotesSettings();
      if (viewName === 'import') {
        importJsonInput.focus();
      }
    }

    function closeSettings() {
      settingsModal.hidden = true;
    }

    function renderDeleteSettings() {
      if (isReadOnlyMode) {
        renameDatasetInput.value = '';
        renameDatasetInput.disabled = true;
        renameDatasetBtn.disabled = true;
        settingsRenameHint.textContent = 'Log in to rename JSON files in data/.';
        deleteDatasetBtn.disabled = true;
        settingsDeleteCopy.textContent = 'Deleting datasets is unavailable in guest mode';
        settingsDeleteHint.textContent = 'Log in to delete JSON files from data/.';
        return;
      }

      const canManageDataset = isWritableDatasetPath(activeDatasetPath);
      renameDatasetInput.disabled = !canManageDataset;
      renameDatasetBtn.disabled = !canManageDataset;
      deleteDatasetBtn.disabled = !canManageDataset;

      if (canManageDataset) {
        const datasetLabel = getDatasetDisplayName(activeDatasetPath);
        const editableDatasetName = getDatasetEditableName(activeDatasetPath);
        if (document.activeElement !== renameDatasetInput) {
          renameDatasetInput.value = editableDatasetName;
        }
        renameDatasetInput.placeholder = editableDatasetName;
        settingsRenameHint.textContent = 'Pick a new JSON filename for the selected dataset.';
        settingsDeleteCopy.textContent = `Delete '${datasetLabel}'`;
        settingsDeleteHint.textContent = 'This permanently removes the JSON file and updates the dataset list.';
        return;
      }

      renameDatasetInput.value = '';
      renameDatasetInput.placeholder = 'Select a saved dataset';
      settingsRenameHint.textContent = 'Select a saved dataset to enable renaming.';
      settingsDeleteCopy.textContent = 'Delete the currently selected dataset file';
      settingsDeleteHint.textContent = 'Select a saved dataset to enable deletion';
    }

    function setSaveDatasetModalStatus(message = '', type = '') {
      saveDatasetModalStatus.textContent = message;
      saveDatasetModalStatus.className = 'app-modal-status';
      if (type) {
        saveDatasetModalStatus.classList.add(`is-${type}`);
      }
    }

    function setSaveDatasetModalBusy(isBusy) {
      saveDatasetNameInput.disabled = isBusy;
      saveDatasetModalCancelBtn.disabled = isBusy;
      saveDatasetModalConfirmBtn.disabled = isBusy;
    }

    function openSaveDatasetModal(defaultName = activeDatasetPath ? getDatasetDisplayName(activeDatasetPath) : 'vectors') {
      saveDatasetNameInput.value = defaultName;
      setSaveDatasetModalStatus();
      setSaveDatasetModalBusy(false);
      saveDatasetModal.hidden = false;

      requestAnimationFrame(() => {
        saveDatasetNameInput.focus();
        saveDatasetNameInput.select();
      });
    }

    function closeSaveDatasetModal() {
      saveDatasetModal.hidden = true;
      setSaveDatasetModalBusy(false);
      setSaveDatasetModalStatus();
    }

    function openConfirmModal({ title, message, confirmLabel = 'Confirm', tone = 'primary', onConfirm = null, onCancel = null }) {
      confirmActionTitle.textContent = title;
      confirmActionMessage.textContent = message;
      confirmActionConfirmBtn.textContent = confirmLabel;
      confirmActionConfirmBtn.classList.toggle('is-danger', tone === 'danger');
      confirmModalAction = onConfirm;
      confirmModalCancelAction = onCancel;
      confirmActionModal.hidden = false;

      requestAnimationFrame(() => {
        confirmActionConfirmBtn.focus();
      });
    }

    function closeConfirmModal({ invokeCancel = false } = {}) {
      const cancelAction = invokeCancel ? confirmModalCancelAction : null;
      confirmActionModal.hidden = true;
      confirmActionTitle.textContent = 'Confirm action';
      confirmActionMessage.textContent = '';
      confirmActionConfirmBtn.textContent = 'Confirm';
      confirmActionConfirmBtn.classList.remove('is-danger');
      confirmModalAction = null;
      confirmModalCancelAction = null;

      if (cancelAction) {
        cancelAction();
      }
    }

    function startNewDataset({ statusMessage = 'Working on an unsaved dataset.' } = {}) {
      setActiveDatasetPath('');
      clearAllData();
      updateDatasetScale(1);
      datasetNotes = '';
      datasetSelect.value = '';
      clearImportJsonInput();
      renderNotesSettings();
      setImportStatus();
      setDatasetStatus(statusMessage);
    }

    function exportCurrentDatasetJson() {
      const datasetData = buildDatasetExportPayload();
      const fileName = getExportDatasetFileName();
      downloadTextFile(fileName, JSON.stringify(datasetData, null, 2));
      setImportStatus(`Exported ${fileName}.`, 'success');
    }

    function normalizeImportColor(value, contextLabel) {
      if (typeof value !== 'string' || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim())) {
        throw new Error(`${contextLabel} must use a hex color like #ff8844.`);
      }
      const normalized = value.trim();
      return normalized.length === 4
        ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
        : normalized;
    }

    function stripJsonCodeFence(text) {
      const trimmed = text.trim();
      const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      return fencedMatch ? fencedMatch[1] : trimmed;
    }

    function makeUniqueStorageKey(baseLabel, usedKeys) {
      const normalizedBase = String(baseLabel || '').trim() || 'Group';
      let candidate = normalizedBase;
      let counter = 2;

      while (usedKeys.has(candidate) || candidate === UNGROUPED_STORAGE_KEY || candidate === DATASET_META_KEY) {
        candidate = `${normalizedBase} ${counter++}`;
      }

      usedKeys.add(candidate);
      return candidate;
    }

    function serializeVectorForSave(vector, { includeColor = false } = {}) {
      const payload = {
        vector_name: vector.name.trim() || `v${vector.id}`,
        coordinates: [vector.baseVec.x, vector.baseVec.y, vector.baseVec.z]
      };

      if (!isVectorVisible(vector)) {
        payload.visible = false;
      }

      if (includeColor) {
        payload.color = vector.manualColor || getEffectiveColor(vector);
      }

      return payload;
    }

    function buildDatasetExportPayload() {
      const payload = {
        [DATASET_META_KEY]: {
          notes: datasetNotes,
          view: getCurrentViewStateForSave(),
          settings: getCurrentVisualizationSettingsForSave()
        }
      };
      const usedKeys = new Set();

      groups.forEach(group => {
        const storageKey = makeUniqueStorageKey(group.name, usedKeys);
        payload[storageKey] = {
          group_name: group.name,
          color: group.color,
          vectors: vectors
            .filter(vector => vector.groupId === group.id)
            .map(vector => serializeVectorForSave(vector))
        };
      });

      const ungroupedVectors = vectors.filter(vector => !getGroupById(vector.groupId));
      if (ungroupedVectors.length) {
        payload[UNGROUPED_STORAGE_KEY] = {
          ungrouped: true,
          vectors: ungroupedVectors.map(vector => serializeVectorForSave(vector, { includeColor: true }))
        };
      }

      return payload;
    }

    async function persistDatasetToServer({ datasetName = '', datasetPath = '', overwrite = false } = {}) {
      const datasetData = buildDatasetExportPayload();

      const response = await fetch(buildSaveDatasetUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ datasetName, datasetPath, overwrite, datasetData })
      });

      let responsePayload = null;
      try {
        responsePayload = await response.json();
      } catch {
        responsePayload = null;
      }

      if (!response.ok) {
        const error = new Error(responsePayload?.error || 'Could not save the dataset.');
        error.code = responsePayload?.code || '';
        error.datasetPath = responsePayload?.datasetPath || '';
        throw error;
      }

      return responsePayload;
    }

    async function deleteDatasetFromServer(datasetPath) {
      const response = await fetch(buildDeleteDatasetUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ datasetPath })
      });

      let responsePayload = null;
      try {
        responsePayload = await response.json();
      } catch {
        responsePayload = null;
      }

      if (!response.ok) {
        throw new Error(responsePayload?.error || 'Could not delete the dataset.');
      }

      return responsePayload;
    }

    async function renameDatasetOnServer(datasetPath, datasetName) {
      const response = await fetch(buildRenameDatasetUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ datasetPath, datasetName })
      });

      let responsePayload = null;
      try {
        responsePayload = await response.json();
      } catch {
        responsePayload = null;
      }

      if (!response.ok) {
        const error = new Error(responsePayload?.error || 'Could not rename the dataset.');
        error.code = responsePayload?.code || '';
        error.datasetPath = responsePayload?.datasetPath || '';
        throw error;
      }

      return responsePayload;
    }

    async function performSaveCurrentDatasetAs(requestedName, overwrite = false) {
      saveDatasetBtn.disabled = true;
      setDatasetStatus(`Saving ${requestedName}...`);

      try {
        const responsePayload = await persistDatasetToServer({ datasetName: requestedName, overwrite });
        await refreshDatasetOptions();
        ensureDatasetOption(responsePayload.datasetPath);
        datasetSelect.value = responsePayload.datasetPath;
        setActiveDatasetPath(responsePayload.datasetPath);
        setDatasetStatus(`Saved ${getDatasetDisplayName(responsePayload.datasetPath)}.`, 'success');
        setImportStatus(`Saved ${getDatasetDisplayName(responsePayload.datasetPath)}.`, 'success');
        return responsePayload;
      } finally {
        saveDatasetBtn.disabled = false;
        renderDatasetLinkButton();
      }
    }

    async function performSaveActiveDataset() {
      const datasetLabel = getDatasetDisplayName(activeDatasetPath);
      saveDatasetBtn.disabled = true;
      setDatasetStatus(`Saving ${datasetLabel}...`);

      try {
        const responsePayload = await persistDatasetToServer({ datasetPath: activeDatasetPath, overwrite: true });
        ensureDatasetOption(responsePayload.datasetPath);
        datasetSelect.value = responsePayload.datasetPath;
        setActiveDatasetPath(responsePayload.datasetPath);
        setDatasetStatus(`Saved ${getDatasetDisplayName(responsePayload.datasetPath)}.`, 'success');
        setImportStatus(`Saved ${getDatasetDisplayName(responsePayload.datasetPath)}.`, 'success');
      } catch (error) {
        setDatasetStatus(error.message || 'Could not save dataset.', 'error');
      } finally {
        saveDatasetBtn.disabled = false;
        renderDatasetLinkButton();
      }
    }

    function saveCurrentDatasetAs() {
      openSaveDatasetModal(activeDatasetPath ? getDatasetDisplayName(activeDatasetPath) : 'vectors');
    }

    function saveActiveDataset() {
      if (!isWritableDatasetPath(activeDatasetPath)) {
        saveCurrentDatasetAs();
        return;
      }

      const datasetLabel = getDatasetDisplayName(activeDatasetPath);
      openConfirmModal({
        title: 'Save dataset?',
        message: `Save changes to ${datasetLabel}?`,
        confirmLabel: 'Save',
        onConfirm: async () => {
          await performSaveActiveDataset();
        }
      });
    }

    async function submitSaveDatasetModal() {
      const requestedName = saveDatasetNameInput.value.trim();
      if (!requestedName) {
        setSaveDatasetModalStatus('Dataset name is required.', 'error');
        return;
      }

      setSaveDatasetModalBusy(true);
      setSaveDatasetModalStatus(`Saving ${requestedName}...`);

      try {
        await performSaveCurrentDatasetAs(requestedName, false);
        closeSaveDatasetModal();
      } catch (error) {
        if (error.code === 'dataset_exists') {
          closeSaveDatasetModal();
          openConfirmModal({
            title: 'Overwrite dataset?',
            message: `${requestedName} already exists. Replace it with the current vectors?`,
            confirmLabel: 'Overwrite',
            tone: 'danger',
            onConfirm: async () => {
              await performSaveCurrentDatasetAs(requestedName, true);
            },
            onCancel: () => {
              openSaveDatasetModal(requestedName);
            }
          });
          return;
        }

        setSaveDatasetModalStatus(error.message || 'Could not save dataset.', 'error');
        setDatasetStatus(error.message || 'Could not save dataset.', 'error');
      } finally {
        setSaveDatasetModalBusy(false);
      }
    }

    async function deleteActiveDataset() {
      if (!isWritableDatasetPath(activeDatasetPath)) {
        return;
      }

      const datasetLabel = getDatasetDisplayName(activeDatasetPath);
      await deleteDatasetFromServer(activeDatasetPath);
      startNewDataset({ statusMessage: '' });
      await refreshDatasetOptions();
      closeSettings();
      setDatasetStatus(`Deleted ${datasetLabel}.`, 'success');
      setImportStatus(`Deleted ${datasetLabel}.`, 'success');
    }

    async function renameActiveDataset() {
      if (isReadOnlyMode || !isWritableDatasetPath(activeDatasetPath)) {
        return;
      }

      const requestedName = renameDatasetInput.value.trim();
      if (!requestedName) {
        setDatasetStatus('Dataset name is required.', 'error');
        renameDatasetInput.focus();
        return;
      }

      const currentDatasetLabel = getDatasetDisplayName(activeDatasetPath);
      renameDatasetBtn.disabled = true;
      setDatasetStatus(`Renaming ${currentDatasetLabel}...`);

      try {
        const responsePayload = await renameDatasetOnServer(activeDatasetPath, requestedName);
        setActiveDatasetPath(responsePayload.datasetPath);
        await refreshDatasetOptions();
        ensureDatasetOption(responsePayload.datasetPath);
        datasetSelect.value = responsePayload.datasetPath;
        setActiveDatasetPath(responsePayload.datasetPath);
        renderDeleteSettings();

        if (responsePayload.renamed === false) {
          setDatasetStatus(`Dataset is already named ${getDatasetDisplayName(responsePayload.datasetPath)}.`, 'success');
          return;
        }

        setDatasetStatus(
          `Renamed ${currentDatasetLabel} to ${getDatasetDisplayName(responsePayload.datasetPath)}.`,
          'success'
        );
      } catch (error) {
        setDatasetStatus(error.message || 'Could not rename dataset.', 'error');
      } finally {
        renameDatasetBtn.disabled = false;
        renderDeleteSettings();
      }
    }

    function clearAllData() {
      while (vectors.length) {
        const vector = vectors.pop();
        vectorLayer.remove(vector.obj3d);
        disposeMeshes(vector.obj3d);
        disposeVectorLabel(vector);
      }

      groups.length = 0;
  collapsedGroupIds.clear();
  ungroupedCollapsed = false;
      nextVectorId = 1;
      nextGroupId = 1;
      clearDragState();
      updateGroupOptions();
      renderList();
    }

    function importVectorsFromJson(rawText) {
      const jsonText = stripJsonCodeFence(rawText);
      if (!jsonText) {
        throw new Error('Paste a JSON object to import.');
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error('The pasted text is not valid JSON.');
      }

      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('Expected a JSON object with group names as top-level keys.');
      }

      const normalizedGroups = [];
      let importedVisualizationSettings = {
        ...getCurrentVisualizationSettingsForSave(),
        scale: 1
      };
      let importedViewState = null;
      let importedNotes = '';

      let importedGroupCount = 0;
      let importedVectorCount = 0;

      for (const [groupName, groupData] of Object.entries(parsed)) {
        const isMetaSection = groupName === DATASET_META_KEY
          && groupData
          && !Array.isArray(groupData)
          && typeof groupData === 'object';

        if (isMetaSection) {
          if (Object.prototype.hasOwnProperty.call(groupData, 'notes')) {
            if (groupData.notes !== null && typeof groupData.notes !== 'string') {
              throw new Error('Dataset notes must be a string.');
            }
            importedNotes = groupData.notes ?? '';
          }

          if (Object.prototype.hasOwnProperty.call(groupData, 'scale')) {
            const parsedScale = Number.parseFloat(groupData.scale);
            if (!Number.isFinite(parsedScale)) {
              throw new Error('Dataset scale must be a number.');
            }
            if (parsedScale < DATASET_SCALE_MIN || parsedScale > DATASET_SCALE_MAX) {
              throw new Error(`Dataset scale must stay between ${DATASET_SCALE_MIN} and ${DATASET_SCALE_MAX}.`);
            }
            importedVisualizationSettings.scale = normalizeDatasetScale(parsedScale);
          }

          if (Object.prototype.hasOwnProperty.call(groupData, 'view')) {
            const rawView = groupData.view;
            if (!rawView || Array.isArray(rawView) || typeof rawView !== 'object') {
              throw new Error('Dataset view must be an object.');
            }

            const parsedViewMode = Object.prototype.hasOwnProperty.call(rawView, 'viewMode')
              ? String(rawView.viewMode).toLowerCase()
              : VIEW_MODE_3D;
            if (![VIEW_MODE_3D, VIEW_MODE_2D].includes(parsedViewMode)) {
              throw new Error('Dataset view mode must be 3d or 2d.');
            }

            const parsedViewPlane = Object.prototype.hasOwnProperty.call(rawView, 'viewPlane')
              ? String(rawView.viewPlane).toLowerCase()
              : VIEW_PLANE_XY;
            if (!isValidViewPlane(parsedViewPlane)) {
              throw new Error('Dataset 2D plane must be xy, xz, or yz.');
            }

            const parsedDistance = Object.prototype.hasOwnProperty.call(rawView, 'distance')
              ? Number.parseFloat(rawView.distance)
              : null;
            if (parsedDistance !== null && (!Number.isFinite(parsedDistance) || parsedDistance <= 0)) {
              throw new Error('Dataset view distance must be a positive number.');
            }

            const parsedZoom = Object.prototype.hasOwnProperty.call(rawView, 'zoom')
              ? Number.parseFloat(rawView.zoom)
              : 1;
            if (!Number.isFinite(parsedZoom) || parsedZoom <= 0) {
              throw new Error('Dataset view zoom must be a positive number.');
            }

            importedViewState = {
              position: parseMetaVector3(rawView.position, 'Dataset view position'),
              target: parseMetaVector3(rawView.target, 'Dataset view target'),
              distance: parsedDistance,
              zoom: parsedZoom,
              viewMode: parsedViewMode,
              viewPlane: parsedViewPlane,
            };
          }

          if (Object.prototype.hasOwnProperty.call(groupData, 'settings')) {
            importedVisualizationSettings = parseVisualizationSettings(groupData.settings, importedVisualizationSettings);
          }

          continue;
        }

        if (!groupData || Array.isArray(groupData) || typeof groupData !== 'object') {
          throw new Error(`Group "${groupName}" must be an object.`);
        }

        if (!Array.isArray(groupData.vectors)) {
          throw new Error(`Group "${groupName}" must contain a vectors array.`);
        }

        const isUngroupedSection = groupName === UNGROUPED_STORAGE_KEY || groupData.ungrouped === true;
        const displayGroupName = typeof groupData.group_name === 'string' && groupData.group_name.trim()
          ? groupData.group_name.trim()
          : groupName;
        const color = isUngroupedSection
          ? null
          : normalizeImportColor(groupData.color, `Group "${groupName}" color`);

        const normalizedVectors = [];
        if (!isUngroupedSection) {
          importedGroupCount += 1;
        }

        groupData.vectors.forEach((vectorEntry, index) => {
          if (!vectorEntry || Array.isArray(vectorEntry) || typeof vectorEntry !== 'object') {
            throw new Error(`Entry ${index + 1} in group "${groupName}" is not a valid vector object.`);
          }

          const vectorName = typeof vectorEntry.vector_name === 'string' ? vectorEntry.vector_name.trim() : '';
          const coordinates = vectorEntry.coordinates;
          if (!vectorName) {
            throw new Error(`Entry ${index + 1} in group "${groupName}" is missing vector_name.`);
          }
          if (!Array.isArray(coordinates) || coordinates.length !== 3) {
            throw new Error(`Vector "${vectorName}" in group "${groupName}" must have exactly 3 coordinates.`);
          }

          const [x, y, z] = coordinates.map(value => Number.parseFloat(value));
          if (![x, y, z].every(Number.isFinite)) {
            throw new Error(`Vector "${vectorName}" in group "${groupName}" has invalid numeric coordinates.`);
          }

          if (isUngroupedSection) {
            const vectorColor = normalizeImportColor(
              vectorEntry.color ?? groupData.color ?? '#4a90d9',
              `Vector "${vectorName}" color`
            );
            normalizedVectors.push({
              vectorName,
              x,
              y,
              z,
              color: vectorColor,
              visible: vectorEntry.visible !== false
            });
          } else {
            normalizedVectors.push({
              vectorName,
              x,
              y,
              z,
              visible: vectorEntry.visible !== false
            });
          }
          importedVectorCount += 1;
        });

        normalizedGroups.push({
          groupName: displayGroupName,
          color,
          vectors: normalizedVectors,
          ungrouped: isUngroupedSection
        });
      }

      clearAllData();
      applyVisualizationSettings(importedVisualizationSettings);
      datasetNotes = importedNotes;
      rebuildAxesAndGrid();
      renderScalePanel();
      renderNotesSettings();

      normalizedGroups.forEach(groupEntry => {
        if (groupEntry.ungrouped) {
          groupEntry.vectors.forEach(vectorEntry => {
            addVector(
              vectorEntry.vectorName,
              vectorEntry.x,
              vectorEntry.y,
              vectorEntry.z,
              vectorEntry.color,
              null,
              vectorEntry.visible,
              { areBaseCoordinates: true }
            );
          });
          return;
        }

        const group = addGroup(groupEntry.groupName, groupEntry.color);
        groupEntry.vectors.forEach(vectorEntry => {
          addVector(
            vectorEntry.vectorName,
            vectorEntry.x,
            vectorEntry.y,
            vectorEntry.z,
            groupEntry.color,
            group.id,
            vectorEntry.visible,
            { areBaseCoordinates: true }
          );
        });
      });

      updateGroupOptions();
      applyViewState(importedViewState);
      renderVisualizationSettings();
      renderList();

      return { importedGroupCount, importedVectorCount, datasetScale: importedVisualizationSettings.scale };
    }

    function updateGroupOptions() {
      const currentValue = vecGroupSelect.value;
      vecGroupSelect.innerHTML = [
        '<option value="">Ungrouped</option>',
        ...groups.map(group => `<option value="${group.id}">${escapeHtml(group.name)}</option>`)
      ].join('');

      if (groups.some(group => group.id === currentValue)) {
        vecGroupSelect.value = currentValue;
      }

      updateAddVectorColorState();
    }

    function updateAddVectorColorState() {
      const selectedGroup = getGroupById(vecGroupSelect.value);
      if (selectedGroup) {
        vecColorInput.disabled = true;
        vecColorInput.value = selectedGroup.color;
        setColorButtonValue(vecColorButton, selectedGroup.color);
        return;
      }

      vecColorInput.disabled = false;
      vecColorInput.value = pendingManualColor;
      setColorButtonValue(vecColorButton, pendingManualColor);
    }

    function addGroup(name, color) {
      const group = {
        id: `group-${nextGroupId++}`,
        name,
        color
      };

      groups.push(group);
      updateGroupOptions();
      renderList();
      return group;
    }

    function removeGroup(groupId) {
      const groupIndex = groups.findIndex(group => group.id === groupId);
      if (groupIndex === -1) return;

      const [group] = groups.splice(groupIndex, 1);
      collapsedGroupIds.delete(groupId);
      vectors.forEach(vector => {
        if (vector.groupId === groupId) {
          vector.groupId = null;
          vector.manualColor = group.color;
          syncVectorObject(vector);
        }
      });

      updateGroupOptions();
      renderList();
    }

    function updateGroupColor(groupId, color) {
      const group = getGroupById(groupId);
      if (!group) return;

      group.color = color;
      vectors.forEach(vector => {
        if (vector.groupId === group.id) {
          vector.manualColor = color;
          syncVectorObject(vector);
        }
      });

      if (vecGroupSelect.value === group.id) {
        updateAddVectorColorState();
      }

      renderList();
    }

    function updateGroupName(groupId, name) {
      const group = getGroupById(groupId);
      if (!group) return;

      group.name = name;
      updateGroupOptions();
      renderList();
    }

    function startEditingGroupName(groupId) {
      if (!getGroupById(groupId)) return;

      editingGroupId = groupId;
      renderList();

      requestAnimationFrame(() => {
        const groupNameInput = listEl.querySelector(`.group-name-edit-input[data-group-id="${groupId}"]`);
        if (!groupNameInput) return;

        groupNameInput.focus();
        groupNameInput.select();
      });
    }

    function finishEditingGroupName(groupId, rawValue, { cancel = false } = {}) {
      if (editingGroupId !== groupId) return;

      const group = getGroupById(groupId);
      editingGroupId = null;

      if (!group) {
        renderList();
        return;
      }

      if (cancel) {
        renderList();
        return;
      }

      const nextName = rawValue.trim() || group.name;
      if (nextName === group.name) {
        renderList();
        return;
      }

      updateGroupName(groupId, nextName);
    }

    function startEditingVectorName(vectorId) {
      if (!getVectorById(vectorId)) return;

      editingVectorId = vectorId;
      renderList();

      requestAnimationFrame(() => {
        const vectorNameInput = listEl.querySelector(`.vector-name-edit-input[data-vector-id="${vectorId}"]`);
        if (!vectorNameInput) return;

        vectorNameInput.focus();
        vectorNameInput.select();
      });
    }

    function finishEditingVectorName(vectorId, rawValue, { cancel = false } = {}) {
      if (editingVectorId !== vectorId) return;

      const vector = getVectorById(vectorId);
      editingVectorId = null;

      if (!vector) {
        renderList();
        return;
      }

      if (cancel) {
        renderList();
        return;
      }

      const nextName = rawValue.trim() || vector.name;
      if (nextName === vector.name) {
        renderList();
        return;
      }

      updateVectorName(vectorId, nextName);
      renderList();
    }

    function addVector(name, x, y, z, manualColor, groupId = null, visible = true, { areBaseCoordinates = false } = {}) {
      const group = getGroupById(groupId);
      const parsedCoordinates = {
        x: parseCoordinate(x),
        y: parseCoordinate(y),
        z: parseCoordinate(z)
      };
      const baseVec = areBaseCoordinates
        ? parsedCoordinates
        : {
          x: scaleCoordinateToBase(parsedCoordinates.x),
          y: scaleCoordinateToBase(parsedCoordinates.y),
          z: scaleCoordinateToBase(parsedCoordinates.z)
        };
      const vector = {
        id: nextVectorId++,
        name,
        baseVec,
        vec: { x: 0, y: 0, z: 0 },
        manualColor: group ? group.color : manualColor,
        groupId: group ? group.id : null,
        visible,
        obj3d: null,
        labelObject: null
      };

      syncVectorCoordinatesFromScale(vector);
      vectors.push(vector);
      syncVectorObject(vector);
      renderList();
      return vector;
    }

    function removeVector(vectorId) {
      const vectorIndex = vectors.findIndex(vector => vector.id === vectorId);
      if (vectorIndex === -1) return;

      const [vector] = vectors.splice(vectorIndex, 1);
      vectorLayer.remove(vector.obj3d);
      disposeMeshes(vector.obj3d);
      disposeVectorLabel(vector);
      renderList();
    }

    function assignVectorToGroup(vectorId, groupId) {
      const vector = getVectorById(vectorId);
      if (!vector) return;

      const group = getGroupById(groupId);
      if (!group) {
        vector.manualColor = getEffectiveColor(vector);
      }

      vector.groupId = group ? group.id : null;
      if (group) {
        vector.manualColor = group.color;
      }

      syncVectorObject(vector);
      renderList();
    }

    function updateVectorColor(vectorId, color) {
      const vector = getVectorById(vectorId);
      if (!vector) return;

      const group = getGroupById(vector.groupId);
      if (group) {
        updateGroupColor(group.id, color);
        return;
      }

      vector.manualColor = color;
      syncVectorObject(vector);
      renderList();
    }

    function updateVectorName(vectorId, name) {
      const vector = getVectorById(vectorId);
      if (!vector) return;
      vector.name = name;
      syncVectorLabel(vector);
    }

    function updateVectorCoordinate(vectorId, field, value) {
      const vector = getVectorById(vectorId);
      if (!vector) return;
      vector.baseVec[field] = scaleCoordinateToBase(value);
      syncVectorCoordinatesFromScale(vector);
      syncVectorObject(vector);
    }

    function updateDatasetScale(nextScale) {
      const normalizedScale = normalizeDatasetScale(nextScale);
      if (datasetScale === normalizedScale) {
        renderScalePanel();
        return;
      }

      datasetScale = normalizedScale;
      vectors.forEach(vector => {
        syncVectorCoordinatesFromScale(vector);
        syncVectorObject(vector);
      });

      renderScalePanel();
      renderList();
    }

    function updateAxisExtent(nextAxisExtent) {
      const normalizedAxisExtent = normalizeAxisExtent(nextAxisExtent);
      if (axisExtent === normalizedAxisExtent) {
        renderVisualizationSettings();
        return;
      }

      axisExtent = normalizedAxisExtent;
      rebuildAxesAndGrid();
      renderVisualizationSettings();
    }

    function getSectionVectors(groupId = null) {
      return vectors.filter(vector => groupId ? vector.groupId === groupId : !getGroupById(vector.groupId));
    }

    function isSectionCollapsed(groupId = null) {
      return groupId ? collapsedGroupIds.has(groupId) : ungroupedCollapsed;
    }

    function toggleSectionCollapsed(groupId = null) {
      if (groupId) {
        if (collapsedGroupIds.has(groupId)) {
          collapsedGroupIds.delete(groupId);
        } else {
          collapsedGroupIds.add(groupId);
        }
      } else {
        ungroupedCollapsed = !ungroupedCollapsed;
      }

      renderList();
    }

    function isSectionVisible(groupId = null) {
      const sectionVectors = getSectionVectors(groupId);
      return sectionVectors.length === 0 || sectionVectors.some(isVectorVisible);
    }

    function toggleVectorVisibility(vectorId) {
      const vector = getVectorById(vectorId);
      if (!vector) return;

      vector.visible = !isVectorVisible(vector);
      syncVectorSceneVisibility(vector);
      renderList();
    }

    function toggleSectionVisibility(groupId = null) {
      const sectionVectors = getSectionVectors(groupId);
      if (!sectionVectors.length) {
        renderList();
        return;
      }

      const nextVisible = !sectionVectors.some(isVectorVisible);
      sectionVectors.forEach(vector => {
        vector.visible = nextVisible;
        syncVectorSceneVisibility(vector);
      });

      renderList();
    }

    function renderVisibilityButton({ buttonClassName, dataAttributes = '', visible, label }) {
      const escapedLabel = escapeHtml(label);
      return `
        <button
          class="visibility-toggle-btn ${buttonClassName}"
          ${dataAttributes}
          title="${escapedLabel}"
          aria-label="${escapedLabel}"
          aria-pressed="${String(visible)}"
          type="button"
        >
          ${visible ? VISIBILITY_ICON : VISIBILITY_OFF_ICON}
        </button>
      `;
    }

    function renderVectorCoordinateField(vector, field, label) {
      return `
        <div class="vector-coord-field vector-card-coord-field">
          <span class="vector-coord-label">${label}:</span>
          <input type="number" class="vector-input" data-vector-id="${vector.id}" data-field="${field}" step="any" aria-label="${label} coordinate" value="${formatNumber(vector.vec[field])}" />
          <input type="range" class="vector-slider-input" data-vector-id="${vector.id}" data-field="${field}" min="${-vectorSliderExtent}" max="${vectorSliderExtent}" step="${VECTOR_SLIDER_STEP}" aria-label="${label} coordinate slider" value="${vector.vec[field]}" />
        </div>
      `;
    }

    function renderVectorItem(vector) {
      const effectiveColor = getEffectiveColor(vector);
      const showVectorColor = !vector.groupId;
      const isEditingName = editingVectorId === vector.id;
      const vectorInputSize = getEditableLabelSize(vector.name, 6, 18);
      const isVisible = isVectorVisible(vector);
      const visibilityLabel = `${isVisible ? 'Hide' : 'Show'} vector ${vector.name.trim() || `v${vector.id}`}`;

      return `
        <div class="vector-item${isVisible ? '' : ' is-hidden'}" data-vector-id="${vector.id}">
          <div class="vector-top" draggable="true">
            <div class="vector-title-row${showVectorColor ? '' : ' is-grouped'}">
              ${showVectorColor ? `
                <label class="color-dot-button" style="--dot-color: ${effectiveColor}">
                  <input type="color" class="vector-color-input" data-vector-id="${vector.id}" value="${effectiveColor}" />
                </label>
              ` : ''}
              ${renderVisibilityButton({
                buttonClassName: 'vector-visibility-btn',
                dataAttributes: `data-vector-id="${vector.id}"`,
                visible: isVisible,
                label: visibilityLabel
              })}
              <div class="vector-name-shell">
                ${isEditingName ? `
                  <input
                    type="text"
                    class="vector-name-edit-input"
                    data-vector-id="${vector.id}"
                    size="${vectorInputSize}"
                    value="${escapeHtml(vector.name)}"
                  />
                ` : `
                  <button class="vector-name-btn" data-vector-id="${vector.id}" type="button">${escapeHtml(vector.name)}</button>
                `}
              </div>
            </div>
            <div class="vector-actions">
              <button class="delete-btn" data-id="${vector.id}" title="Delete" type="button">✕</button>
            </div>
          </div>
          <div class="vector-coord-row">
            ${renderVectorCoordinateField(vector, 'x', 'X')}
            ${renderVectorCoordinateField(vector, 'y', 'Y')}
            ${renderVectorCoordinateField(vector, 'z', 'Z')}
          </div>
        </div>
      `;
    }

    function renderGroupSection(group) {
      const isUngrouped = !group;
      const isEditingName = !isUngrouped && editingGroupId === group.id;
      const sectionVectors = getSectionVectors(isUngrouped ? null : group?.id ?? null);
      const sectionName = isUngrouped ? 'Ungrouped' : group.name;
      const groupId = isUngrouped ? '' : group.id;
      const sectionVisible = isSectionVisible(isUngrouped ? null : group.id);
      const sectionCollapsed = isSectionCollapsed(isUngrouped ? null : group.id);
      const countLabel = String(sectionVectors.length);
      const emptyText = isUngrouped
        ? 'Drag here to ungroup'
        : 'Drop vectors here';
      const visibilityLabel = isUngrouped
        ? `${sectionVisible ? 'Hide' : 'Show'} ungrouped vectors`
        : `${sectionVisible ? 'Hide' : 'Show'} vectors in ${group.name}`;
      const collapseLabel = isUngrouped
        ? `${sectionCollapsed ? 'Expand' : 'Collapse'} ungrouped vectors`
        : `${sectionCollapsed ? 'Expand' : 'Collapse'} ${group.name}`;

      return `
        <section class="group-section${sectionVisible ? '' : ' is-hidden'}${sectionCollapsed ? ' is-collapsed' : ''}${isEditingName ? ' is-editing-name' : ''}" data-group-id="${groupId}">
          <div class="group-header">
            <div class="group-meta">
              ${isUngrouped ? '' : `
                <label class="color-dot-button group-color-button" style="--dot-color: ${group.color}">
                  <input type="color" class="group-color-input" data-group-id="${group.id}" value="${group.color}" />
                </label>
              `}
              ${renderVisibilityButton({
                buttonClassName: isUngrouped ? 'ungrouped-visibility-btn' : 'group-visibility-btn',
                dataAttributes: isUngrouped ? 'data-section="ungrouped"' : `data-group-id="${group.id}"`,
                visible: sectionVisible,
                label: visibilityLabel
              })}
              <div class="group-name-shell${isEditingName ? ' is-editing' : ''}">
                ${isUngrouped ? `<div class="group-name">${escapeHtml(sectionName)}</div>` : isEditingName ? `
                  <input type="text" class="group-name-edit-input" data-group-id="${group.id}" value="${escapeHtml(sectionName)}" />
                ` : `
                  <button class="group-name-btn" data-group-id="${group.id}" type="button">${escapeHtml(sectionName)}</button>
                `}
                ${isEditingName ? `
                  <button class="group-edit-delete-btn" data-group-id="${group.id}" aria-label="Delete ${escapeHtml(sectionName)}" title="Delete ${escapeHtml(sectionName)}" type="button">Delete</button>
                ` : ''}
              </div>
            </div>
            <button
              class="group-collapse-btn"
              ${isUngrouped ? 'data-section="ungrouped"' : `data-group-id="${group.id}"`}
              aria-expanded="${String(!sectionCollapsed)}"
              aria-label="${escapeHtml(collapseLabel)}"
              title="${escapeHtml(collapseLabel)}"
              type="button"
            >
              <span class="group-count">${countLabel}</span>
              <span class="group-collapse-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M7 10 12 15 17 10"></path>
                </svg>
              </span>
            </button>
          </div>
          ${sectionCollapsed ? '' : `
            <div class="group-body" data-group-id="${groupId}">
              ${sectionVectors.length ? sectionVectors.map(renderVectorItem).join('') : `<div class="group-empty">${emptyText}</div>`}
            </div>
          `}
        </section>
      `;
    }

    function renderList() {
      vectorSliderExtent = computeVectorSliderExtent();
      listEl.innerHTML = [
        renderGroupSection(null),
        ...groups.map(renderGroupSection)
      ].join('');
      renderPlotLegend();
    }

    function clearDragState() {
      draggedVectorId = null;
      listEl.querySelectorAll('.group-body.drag-over').forEach(groupBody => {
        groupBody.classList.remove('drag-over');
      });
      listEl.querySelectorAll('.vector-item.is-dragging').forEach(vectorItem => {
        vectorItem.classList.remove('is-dragging');
      });
    }

    function handleAddVector() {
      const name = vecNameInput.value.trim() || `v${nextVectorId}`;
      const groupId = vecGroupSelect.value || null;
      const manualColor = groupId ? getGroupById(groupId).color : pendingManualColor;

      addVector(name, vecXInput.value || 0, vecYInput.value || 0, vecZInput.value || 0, manualColor, groupId);

      vecNameInput.value = '';
      vecXInput.value = '';
      vecYInput.value = '';
      vecZInput.value = '';
    }

    function handleAddGroup() {
      const name = groupNameInput.value.trim();
      if (!name) return;

      addGroup(name, groupColorInput.value);
      groupNameInput.value = '';
    }

    listEl.addEventListener('click', e => {
      const vectorVisibilityBtn = e.target.closest('.vector-visibility-btn');
      if (vectorVisibilityBtn) {
        toggleVectorVisibility(Number.parseInt(vectorVisibilityBtn.dataset.vectorId, 10));
        return;
      }

      const groupVisibilityBtn = e.target.closest('.group-visibility-btn');
      if (groupVisibilityBtn) {
        toggleSectionVisibility(groupVisibilityBtn.dataset.groupId);
        return;
      }

      const groupCollapseBtn = e.target.closest('.group-collapse-btn');
      if (groupCollapseBtn) {
        toggleSectionCollapsed(groupCollapseBtn.dataset.groupId || null);
        return;
      }

      const ungroupedVisibilityBtn = e.target.closest('.ungrouped-visibility-btn');
      if (ungroupedVisibilityBtn) {
        toggleSectionVisibility(null);
        return;
      }

      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        removeVector(Number.parseInt(deleteBtn.dataset.id, 10));
        return;
      }

      const vectorNameBtn = e.target.closest('.vector-name-btn');
      if (vectorNameBtn) {
        startEditingVectorName(Number.parseInt(vectorNameBtn.dataset.vectorId, 10));
        return;
      }

      const groupNameBtn = e.target.closest('.group-name-btn');
      if (groupNameBtn) {
        startEditingGroupName(groupNameBtn.dataset.groupId);
        return;
      }

      const removeGroupBtn = e.target.closest('.group-edit-delete-btn, .remove-group-btn');
      if (removeGroupBtn) {
        removeGroup(removeGroupBtn.dataset.groupId);
      }
    });

    listEl.addEventListener('input', e => {
      const coordSliderInput = e.target.closest('.vector-slider-input');
      if (coordSliderInput) {
        const parsed = Number.parseFloat(coordSliderInput.value);
        if (!Number.isFinite(parsed)) return;

        const vectorId = Number.parseInt(coordSliderInput.dataset.vectorId, 10);
        const field = coordSliderInput.dataset.field;

        updateVectorCoordinate(
          vectorId,
          field,
          parsed
        );

        const vector = getVectorById(vectorId);
        const coordInput = coordSliderInput.closest('.vector-card-coord-field')?.querySelector('.vector-input');
        if (coordInput && vector) {
          coordInput.value = formatNumber(vector.vec[field]);
        }
        coordSliderInput.value = String(vector?.vec[field] ?? parsed);
        return;
      }

      const coordInput = e.target.closest('.vector-input');
      if (!coordInput) return;

      const rawValue = coordInput.value.trim();
      if (rawValue === '' || rawValue === '-' || rawValue === '.' || rawValue === '-.') return;

      const parsed = Number.parseFloat(rawValue);
      if (!Number.isFinite(parsed)) return;

      const vectorId = Number.parseInt(coordInput.dataset.vectorId, 10);
      const field = coordInput.dataset.field;

      updateVectorCoordinate(
        vectorId,
        field,
        parsed
      );

      const vector = getVectorById(vectorId);
      syncRenderedVectorSliders();
      const coordSlider = coordInput.closest('.vector-card-coord-field')?.querySelector('.vector-slider-input');
      if (coordSlider && vector) {
        coordSlider.value = String(vector.vec[field]);
      }
    });

    listEl.addEventListener('change', e => {
      const vectorNameEditInput = e.target.closest('.vector-name-edit-input');
      if (vectorNameEditInput) {
        finishEditingVectorName(Number.parseInt(vectorNameEditInput.dataset.vectorId, 10), vectorNameEditInput.value);
        return;
      }

      const groupNameEditInput = e.target.closest('.group-name-edit-input');
      if (groupNameEditInput) {
        finishEditingGroupName(groupNameEditInput.dataset.groupId, groupNameEditInput.value);
        return;
      }

      const groupColorInputField = e.target.closest('.group-color-input');
      if (groupColorInputField) {
        updateGroupColor(groupColorInputField.dataset.groupId, groupColorInputField.value);
        return;
      }

      const colorInput = e.target.closest('.vector-color-input');
      if (colorInput) {
        updateVectorColor(Number.parseInt(colorInput.dataset.vectorId, 10), colorInput.value);
        return;
      }

      const coordInput = e.target.closest('.vector-input');
      if (!coordInput) return;

      const normalizedValue = parseCoordinate(coordInput.value);
      const vectorId = Number.parseInt(coordInput.dataset.vectorId, 10);
      const field = coordInput.dataset.field;
      updateVectorCoordinate(
        vectorId,
        field,
        normalizedValue
      );
      const vector = getVectorById(vectorId);
      coordInput.value = formatNumber(vector?.vec[field] ?? normalizedValue);
      syncRenderedVectorSliders();
      const coordSlider = coordInput.closest('.vector-card-coord-field')?.querySelector('.vector-slider-input');
      if (coordSlider && vector) {
        coordSlider.value = String(vector.vec[field]);
      }
    });

    listEl.addEventListener('focusout', e => {
      const vectorNameEditInput = e.target.closest('.vector-name-edit-input');
      if (vectorNameEditInput) {
        finishEditingVectorName(Number.parseInt(vectorNameEditInput.dataset.vectorId, 10), vectorNameEditInput.value);
        return;
      }

      const groupNameEditInput = e.target.closest('.group-name-edit-input');
      if (!groupNameEditInput) return;

      finishEditingGroupName(groupNameEditInput.dataset.groupId, groupNameEditInput.value);
    });

    listEl.addEventListener('keydown', e => {
      const vectorNameEditInput = e.target.closest('.vector-name-edit-input');
      if (vectorNameEditInput) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEditingVectorName(Number.parseInt(vectorNameEditInput.dataset.vectorId, 10), vectorNameEditInput.value);
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          finishEditingVectorName(Number.parseInt(vectorNameEditInput.dataset.vectorId, 10), vectorNameEditInput.defaultValue, { cancel: true });
        }
        return;
      }

      const groupNameEditInput = e.target.closest('.group-name-edit-input');
      if (!groupNameEditInput) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        finishEditingGroupName(groupNameEditInput.dataset.groupId, groupNameEditInput.value);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        finishEditingGroupName(groupNameEditInput.dataset.groupId, groupNameEditInput.defaultValue, { cancel: true });
      }
    });

    listEl.addEventListener('dragstart', e => {
      const dragHandle = e.target.closest('.vector-top');
      if (!dragHandle) return;

      const vectorItem = dragHandle.closest('.vector-item');
      if (!vectorItem) return;

      const vectorId = Number.parseInt(vectorItem.dataset.vectorId, 10);
      if (!Number.isFinite(vectorId)) return;

      draggedVectorId = vectorId;
      vectorItem.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(vectorId));
    });

    listEl.addEventListener('dragover', e => {
      const groupBody = e.target.closest('.group-body');
      if (!groupBody) return;

      e.preventDefault();
      listEl.querySelectorAll('.group-body.drag-over').forEach(otherGroupBody => {
        if (otherGroupBody !== groupBody) {
          otherGroupBody.classList.remove('drag-over');
        }
      });
      groupBody.classList.add('drag-over');
    });

    listEl.addEventListener('dragleave', e => {
      const groupBody = e.target.closest('.group-body');
      if (!groupBody) return;

      const relatedTarget = e.relatedTarget;
      if (relatedTarget && groupBody.contains(relatedTarget)) return;
      groupBody.classList.remove('drag-over');
    });

    listEl.addEventListener('drop', e => {
      const groupBody = e.target.closest('.group-body');
      if (!groupBody) return;

      e.preventDefault();
      const vectorId = draggedVectorId ?? Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (Number.isFinite(vectorId)) {
        assignVectorToGroup(vectorId, groupBody.dataset.groupId || null);
      }
      clearDragState();
    });

    listEl.addEventListener('dragend', clearDragState);

    vecColorInput.addEventListener('input', () => {
      if (!vecColorInput.disabled) {
        pendingManualColor = vecColorInput.value;
        setColorButtonValue(vecColorButton, pendingManualColor);
      }
    });

    groupColorInput.addEventListener('input', () => {
      setColorButtonValue(groupColorButton, groupColorInput.value);
    });

    vecGroupSelect.addEventListener('change', updateAddVectorColorState);

    settingsNavButtons.forEach(button => {
      button.addEventListener('click', () => {
        setSettingsView(button.dataset.settingsView);
      });
    });

    openSettingsBtn.addEventListener('click', () => {
      setImportStatus();
      closeAddControls();
      closeVisualControls();
      openSettings('notes');
    });

    addControlsToggle.addEventListener('click', event => {
      event.stopPropagation();
      toggleAddControls();
    });

    addControlsPanel.addEventListener('click', event => {
      event.stopPropagation();
    });

    addControlsPanel.addEventListener('pointerdown', event => {
      event.stopPropagation();
    });

    visualControlsToggle.addEventListener('click', event => {
      event.stopPropagation();
      toggleVisualControls();
    });

    visualControlsPanel.addEventListener('click', event => {
      event.stopPropagation();
    });

    visualControlsPanel.addEventListener('pointerdown', event => {
      event.stopPropagation();
    });

    settingsView3dBtn.addEventListener('click', () => {
      if (viewMode === VIEW_MODE_3D) {
        return;
      }

      setViewMode(VIEW_MODE_3D);
    });

    settingsView2dBtn.addEventListener('click', () => {
      if (viewMode === VIEW_MODE_2D) {
        return;
      }

      setViewMode(VIEW_MODE_2D, { plane: viewPlane });
    });

    settingsPlaneXYBtn.addEventListener('click', () => {
      if (viewMode === VIEW_MODE_2D && viewPlane === VIEW_PLANE_XY) {
        return;
      }

      setViewMode(VIEW_MODE_2D, { plane: VIEW_PLANE_XY, preserve3DState: false });
    });

    settingsPlaneXZBtn.addEventListener('click', () => {
      if (viewMode === VIEW_MODE_2D && viewPlane === VIEW_PLANE_XZ) {
        return;
      }

      setViewMode(VIEW_MODE_2D, { plane: VIEW_PLANE_XZ, preserve3DState: false });
    });

    settingsPlaneYZBtn.addEventListener('click', () => {
      if (viewMode === VIEW_MODE_2D && viewPlane === VIEW_PLANE_YZ) {
        return;
      }

      setViewMode(VIEW_MODE_2D, { plane: VIEW_PLANE_YZ, preserve3DState: false });
    });

    saveDatasetBtn.addEventListener('click', async () => {
      if (isReadOnlyMode) {
        setDatasetStatus('Guest mode is view-only.', 'error');
        return;
      }

      if (isWritableDatasetPath(activeDatasetPath)) {
        await saveActiveDataset();
        return;
      }

      saveCurrentDatasetAs();
    });

    copyDatasetLinkBtn.addEventListener('click', async () => {
      if (!activeDatasetPath) {
        return;
      }

      try {
        await copyTextToClipboard(buildDatasetShareUrl());
        setDatasetStatus(`Copied link for ${getDatasetDisplayName(activeDatasetPath)}.`, 'success');
      } catch {
        setDatasetStatus('Could not copy the dataset link.', 'error');
      }
    });

    datasetSelect.addEventListener('change', () => {
      if (!datasetSelect.value) {
        startNewDataset();
        return;
      }

      loadDataset(datasetSelect.value);
    });

    saveDatasetModal.addEventListener('click', e => {
      if (e.target === saveDatasetModal) {
        closeSaveDatasetModal();
      }
    });

    saveDatasetModalCancelBtn.addEventListener('click', closeSaveDatasetModal);
    saveDatasetModalConfirmBtn.addEventListener('click', submitSaveDatasetModal);

    saveDatasetNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitSaveDatasetModal();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeSaveDatasetModal();
      }
    });

    confirmActionModal.addEventListener('click', e => {
      if (e.target === confirmActionModal) {
        closeConfirmModal({ invokeCancel: true });
      }
    });

    confirmActionCancelBtn.addEventListener('click', () => {
      closeConfirmModal({ invokeCancel: true });
    });

    confirmActionConfirmBtn.addEventListener('click', async () => {
      const action = confirmModalAction;
      closeConfirmModal();
      if (action) {
        try {
          await action();
        } catch (error) {
          setDatasetStatus(error.message || 'Action failed.', 'error');
        }
      }
    });

    closeSettingsBtn.addEventListener('click', closeSettings);

    settingsModal.addEventListener('click', e => {
      if (e.target === settingsModal) {
        closeSettings();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') {
        return;
      }

      if (!confirmActionModal.hidden) {
        closeConfirmModal({ invokeCancel: true });
        return;
      }

      if (!saveDatasetModal.hidden) {
        closeSaveDatasetModal();
        return;
      }

      if (!settingsModal.hidden) {
        closeAddControls();
        closeVisualControls();
        closeSettings();
        return;
      }

      if (addControlsOpen) {
        closeAddControls();
        return;
      }

      if (visualControlsOpen) {
        closeVisualControls();
      }
    });

    document.addEventListener('pointerdown', event => {
      if (addControlsOpen && !addControlsShell.contains(event.target)) {
        closeAddControls();
      }

      if (visualControlsOpen && !visualControlsShell.contains(event.target)) {
        closeVisualControls();
      }
    });

    settingsDisplayArrowBtn.addEventListener('click', () => {
      if (displayMode === 'arrow') {
        return;
      }

      displayMode = 'arrow';
      refreshAllVectors();
      renderVisualizationSettings();
    });

    settingsDisplayPointBtn.addEventListener('click', () => {
      if (displayMode === 'point') {
        return;
      }

      displayMode = 'point';
      refreshAllVectors();
      renderVisualizationSettings();
    });

    settingsAxisExtentSlider.addEventListener('input', () => {
      updateAxisExtent(settingsAxisExtentSlider.value);
    });

    settingsNameToggle.addEventListener('click', () => {
      showVectorNames = !showVectorNames;
      renderVisualizationSettings();
    });

    settingsLegendToggle.addEventListener('click', () => {
      showPlotLegend = !showPlotLegend;
      renderVisualizationSettings();
    });

    settingsPlaneToggle.addEventListener('click', () => {
      showPlane = !showPlane;
      renderVisualizationSettings();
    });

    settingsAxisToggle.addEventListener('click', () => {
      showAxisNames = !showAxisNames;
      renderVisualizationSettings();
    });

    settingsAutoRotateToggle.addEventListener('click', () => {
      autoRotateEnabled = !autoRotateEnabled;
      renderVisualizationSettings();
    });

    settingsNotesInput.addEventListener('input', () => {
      datasetNotes = settingsNotesInput.value;
    });

    vectorScaleSlider.addEventListener('input', () => {
      updateDatasetScale(vectorScaleSlider.value);
    });

    renameDatasetBtn.addEventListener('click', async () => {
      await renameActiveDataset();
    });

    renameDatasetInput.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') {
        return;
      }

      e.preventDefault();
      await renameActiveDataset();
    });

    deleteDatasetBtn.addEventListener('click', () => {
      if (isReadOnlyMode || !isWritableDatasetPath(activeDatasetPath)) {
        return;
      }

      const datasetLabel = getDatasetDisplayName(activeDatasetPath);
      openConfirmModal({
        title: 'Delete dataset?',
        message: `Delete ${datasetLabel}? This cannot be undone.`,
        confirmLabel: 'Delete',
        tone: 'danger',
        onConfirm: async () => {
          await deleteActiveDataset();
        }
      });
    });

    importJsonBtn.addEventListener('click', () => {
      if (isReadOnlyMode) {
        setImportStatus('Guest mode cannot import datasets.', 'error');
        return;
      }

      try {
        const { importedGroupCount, importedVectorCount } = importVectorsFromJson(importJsonInput.value);
        datasetSelect.value = '';
        setActiveDatasetPath('');
        clearImportJsonInput();
        setDatasetStatus('Working on an unsaved dataset.', 'success');
        setImportStatus(`Imported ${importedGroupCount} groups and ${importedVectorCount} vectors.`, 'success');
        closeSettings();
      } catch (error) {
        setImportStatus(error.message || 'Import failed.', 'error');
        setSettingsView('import');
      }
    });

    exportJsonBtn.addEventListener('click', () => {
      exportCurrentDatasetJson();
    });

    logoutBtn.addEventListener('click', () => {
      window.location.href = buildLogoutUrl();
    });

    document.getElementById('add-btn').addEventListener('click', handleAddVector);
    document.getElementById('add-group-btn').addEventListener('click', handleAddGroup);

    document.getElementById('add-form').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddVector();
      }
    });

    document.getElementById('group-form').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddGroup();
      }
    });

    updateGroupOptions();
    rebuildAxesAndGrid();
    initializeAxisLabels();
    renderDatasetLinkButton();
    renderScalePanel();
    renderAddControlsPanel();
    renderVisualControlsPanel();
    renderVisualizationSettings();
    renderNotesSettings();
    renderDeleteSettings();
    applyReadOnlyStateToStaticControls();
    renderList();
    setViewMode(VIEW_MODE_3D, { preserve3DState: false });

    // --- Resize ---
    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      perspectiveCamera.aspect = w / h;
      perspectiveCamera.updateProjectionMatrix();
      updateOrthographicFrustum(orthographicCamera.position.distanceTo(controls.target));
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);
    onResize();

    // --- Animate ---
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      updateVectorLabelsLayout();
      updateAxisLabelsLayout();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    animate();

    async function initializeDatasetControls() {
      try {
        await refreshDatasetOptions();
        await maybeLoadDatasetFromQuery();
      } finally {
        setAppLoading(false);
      }
    }

    initializeDatasetControls();