import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// --- Configuration ---
const SCALES = {
    UNIVERSE: 100_000_000,
    GALAXY: 1_000_000,
    SYSTEM: 500,
    G: 50.0 
};

// Quality Presets
const QUALITY_PRESETS = {
    LOW: { starCount: 100_000, clusterCount: 200 },
    MED: { starCount: 250_000, clusterCount: 300 },
    HIGH: { starCount: 500_000, clusterCount: 400 },
    ULTRA: { starCount: 1_000_000, clusterCount: 500 }
};

const CONFIG = {
    starCount: QUALITY_PRESETS.HIGH.starCount, 
    clusterCount: QUALITY_PRESETS.HIGH.clusterCount,  
    filamentScatter: 0.04, 
    seed: 1337
};

// --- Astrophysics Data ---
const STAR_CLASSES = [
    { id: 'O', prob: 0.0001, color: 0x9999ff, temp: '30,000+', mass: 60, rad: 8, lum: '30,000+', lifespan: 0.01 },
    { id: 'B', prob: 0.0013, color: 0xaaaaff, temp: '10,000-30,000', mass: 10, rad: 5, lum: '25-30,000', lifespan: 0.1 },
    { id: 'A', prob: 0.006,  color: 0xffffff, temp: '7,500-10,000', mass: 3, rad: 2.5, lum: '5-25', lifespan: 1.0 },
    { id: 'F', prob: 0.03,   color: 0xffffee, temp: '6,000-7,500', mass: 1.5, rad: 1.3, lum: '1.5-5', lifespan: 4.0 },
    { id: 'G', prob: 0.076,  color: 0xffdd00, temp: '5,200-6,000', mass: 1.0, rad: 1.0, lum: '0.6-1.5', lifespan: 10.0 },
    { id: 'K', prob: 0.121,  color: 0xffaa22, temp: '3,700-5,200', mass: 0.7, rad: 0.8, lum: '0.08-0.6', lifespan: 30.0 },
    { id: 'M', prob: 0.7645, color: 0xff3300, temp: '2,400-3,700', mass: 0.3, rad: 0.4, lum: '< 0.08', lifespan: 1000.0 },
    { id: 'BH', prob: 0, color: 0x000000, temp: 'UNDEFINED', mass: 20, rad: 0.05, lum: '0', lifespan: 9999 }, 
    { id: 'N', prob: 0, color: 0x00ffff, temp: '600,000', mass: 2.5, rad: 0.02, lum: '0.001', lifespan: 9999 },
    { id: 'WD', prob: 0, color: 0xbbffff, temp: '100,000', mass: 0.9, rad: 0.1, lum: '0.01', lifespan: 9999 } 
];

// --- Shared GLSL ---
const NOISE_GLSL = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
`;

// --- Global State ---
let camera, scene, renderer, controls, composer;
let points, localGalaxy, localSystem, smbhGroup, supernovaSystem, nebulaSystem;
let raycaster, mouse;
let clock = new THREE.Clock();

let isDragging = false;
let dragStartPos = new THREE.Vector2();
const tmpWorldPos = new THREE.Vector3();
const tmpPickPos = new THREE.Vector3();
const tmpPickNdc = new THREE.Vector3();

function formatCoord(value) {
    const abs = Math.abs(value);
    if (abs >= 1e7) return value.toExponential(2);
    if (abs >= 1e4) return Math.round(value).toLocaleString();
    return value.toFixed(1);
}

function getSmbhInfo() {
    const baseSeed = (simState.activeGalaxyData?.designation || `SEED-${CONFIG.seed}`).split('')
        .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
    const isQuasar = /QUASAR|AGN/i.test(simState.activeGalaxyData?.type || '');
    const mass = 1_000_000 + (baseSeed % 9_000_000);
    const radius = (0.02 + (baseSeed % 400) / 10_000).toFixed(3); // purely cosmetic
    return {
        designation: simState.activeGalaxyData?.designation
            ? `${simState.activeGalaxyData.designation} ${isQuasar ? 'QUASAR' : 'CORE'}`
            : (isQuasar ? "QUASAR CORE" : "GALACTIC CORE"),
        typeObj: { id: 'BH', color: 0x00ff00 },
        state: 'REMNANT',
        age: simState.universeSimTime.toFixed(3),
        mass: mass.toLocaleString(),
        radius,
        lum: isQuasar ? "ACTIVE" : "0",
        spectrum: [],
        composition: isQuasar
            ? `AGN: ACTIVE (QUASAR)\nACCRETION: EXTREME\nMASS: ${mass.toLocaleString()} M☉`
            : `EVENT HORIZON: STABLE\nACCRETION: ACTIVE\nMASS: ${mass.toLocaleString()} M☉`
    };
}

function queueAutopilotGalaxyPriorityTargets() {
    simState.autopilotPriorityTargets = [];
    if (!simState.isAutopilot) return;
    if (simState.viewLevel !== 1) return;
    if (!smbhGroup || smbhGroup.children.length === 0) return;

    const data = getSmbhInfo();
    smbhGroup.children.forEach((obj) => {
        if (!obj || typeof obj.getWorldPosition !== 'function') return;
        simState.autopilotPriorityTargets.push({ object: obj, data });
    });
}

// Lensing Globals
let lensingPass, crtPass;
const MAX_BLACKHOLES = 4;
const blackHoleUniforms = {
    uBHCount: { value: 0 },
    uBHPos: { value: new Array(MAX_BLACKHOLES).fill(new THREE.Vector2(0,0)) },
    uBHMass: { value: new Array(MAX_BLACKHOLES).fill(0) }
};
let activeBlackHoles = []; 

// Physics & Events
let physicsBodies = []; 
let passiveBodies = []; 
let activeCMEs = []; 

let simState = {
    universeSimTime: 13.8, 
    galaxySimTime: 0,   
    isPaused: false,
    timeScale: 0.1, 
    viewLevel: 0, 
    isTransitioning: false,
    transitionTarget: new THREE.Vector3(),
    transitionData: null,
    transitionProgress: 0,
    nextLevel: 0,
    worldOffset: new THREE.Vector3(0,0,0),
    currentGalaxyType: 0,
    pixelationFactor: 1,
    selectedTarget: null, 
    activeGalaxyData: null,
    activeSystemData: null,
    isAutopilot: true,
    autopilotTimer: 0,
    autopilotNextAction: 2.0, 
    visitedSystemsCount: 0,
    lastGalaxyVisitTime: 0,
    autopilotZooming: false,
    autopilotPanelHidden: false,
    autopilotPriorityTargets: [],
    planetTourIndex: 0,
    trackingTarget: null,
    inspectingTarget: null,
    inspectingTargetPreviousPos: null,
    bigBangFlash: 0
};

// --- Elements ---
const elCX = document.getElementById('c-x');
const elCY = document.getElementById('c-y');
const elCZ = document.getElementById('c-z');
const elTime = document.getElementById('time');
const elFPS = document.getElementById('fps');
const elObjects = document.getElementById('objects');
const elSeed = document.getElementById('seed-disp');
let elPauseBtn = document.getElementById('pause-btn');
let elBackBtn = document.getElementById('back-btn');
const elSlider = document.getElementById('timestep-slider');
const elAlert = document.getElementById('alert-box');
const elAlertTitle = document.getElementById('alert-title');
const elAlertMsg = document.getElementById('alert-msg');
const elAlertDismiss = document.getElementById('alert-dismiss');
const elConfigBtn = document.getElementById('config-btn');
const elConfigModal = document.getElementById('config-modal');
const elConfigClose = document.getElementById('config-close');
const elRetroSlider = document.getElementById('retro-slider');
const elRetroVal = document.getElementById('retro-val');
const elCrtToggle = document.getElementById('crt-toggle');
const elAutopilotToggle = document.getElementById('autopilot-toggle');
const elCrtOverlay = document.getElementById('crt-overlay');
let elStatusToggle = document.getElementById('status-toggle-btn');
const elSimToggle = document.getElementById('sim-toggle-btn');
const elStatusPanel = document.getElementById('stats-panel');
const elSimPanel = document.getElementById('controls-panel');
const elStatusClose = document.getElementById('stats-close');
const elSimClose = document.getElementById('sim-close');
const elLocBtn = document.getElementById('loc-btn');
const elTargetPanel = document.getElementById('target-panel');
const elTargetClose = document.getElementById('target-close');
const elTargetTitle = document.getElementById('target-title');
const elTName = document.getElementById('t-name');
const elTType = document.getElementById('t-type');
const elTAge = document.getElementById('t-age');
const elTMass = document.getElementById('t-mass');
const elTRad = document.getElementById('t-rad');
const elTLum = document.getElementById('t-lum');
const elSpectrograph = document.getElementById('spectrograph');
const elTComposition = document.getElementById('t-composition');
const elWarpBtn = document.getElementById('warp-btn');
const elCursor = document.getElementById('mouse-cursor');

init();

function init() {
    // Determine pixelation scale based on screen width
    // 720p (approx 1280w) -> 1
    // 4k (approx 3840w) -> 5
    // Formula: floor(width / 750) clamped at 1
    simState.pixelationFactor = Math.max(1, Math.floor(window.innerWidth / 750));
    if (elRetroSlider) elRetroSlider.value = simState.pixelationFactor;
    if (elRetroVal) elRetroVal.innerText = simState.pixelationFactor;

    // Hard Clean: Remove canvas to ensure a full WebGL context restart
    const container = document.getElementById('canvas-container');
    while (container.firstChild) {
        if (container.firstChild.tagName === 'CANVAS') {
            try {
                // Attempt to lose context to force GPU resource cleanup
                const gl = container.firstChild.getContext('webgl2') || container.firstChild.getContext('webgl');
                if(gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
            } catch(e) {}
        }
        container.removeChild(container.firstChild);
    }
    
    // Dispose old renderer if exists
    if (renderer) { renderer.dispose(); renderer = null; }

    // Re-initialize Renderer
    try {
        renderer = new THREE.WebGLRenderer({ 
            antialias: false, powerPreference: "high-performance", logarithmicDepthBuffer: true 
        });
        renderer.xr.enabled = true;
    } catch (e) {
        console.error("Critical: WebGL Renderer could not be initialized.", e);
        return;
    }

    container.appendChild(renderer.domElement);
    
    // VR Support
    const oldVrBtn = document.getElementById('VRButton');
    if(oldVrBtn) oldVrBtn.remove();
    const vrButton = VRButton.createButton(renderer);
    vrButton.id = 'VRButton'; 
    vrButton.addEventListener('click', () => {
        if (vrButton.innerHTML.includes('NOT SUPPORTED')) vrButton.style.display = 'none';
    });
    const vrContainer = document.getElementById('vr-button-container');
    (vrContainer || document.body).appendChild(vrButton);
    setTimeout(() => {
        if (vrButton && vrButton.innerHTML.includes('NOT SUPPORTED')) vrButton.style.display = 'none';
    }, 10000);
    
    // Core Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 1e-9);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1e12);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // --- Shaders Re-Init ---
    const LensingShader = {
        uniforms: {
            "tDiffuse": { value: null },
            "uBHCount": blackHoleUniforms.uBHCount,
            "uBHPos": blackHoleUniforms.uBHPos, 
            "uBHMass": blackHoleUniforms.uBHMass
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform int uBHCount;
            uniform vec2 uBHPos[${MAX_BLACKHOLES}];
            uniform float uBHMass[${MAX_BLACKHOLES}];
            varying vec2 vUv;
            void main() {
                vec2 uv = vUv;
                vec2 totalOffset = vec2(0.0);
                for(int i = 0; i < ${MAX_BLACKHOLES}; i++) {
                    if (i >= uBHCount) break;
                    vec2 dir = uv - uBHPos[i];
                    float dist = length(dir);
                    if (dist < 0.3) {
                         float strength = uBHMass[i] * 0.002;
                         float distortion = strength / (dist + 0.001);
                         distortion = min(distortion, 0.1);
                         totalOffset -= normalize(dir) * distortion;
                    }
                }
                gl_FragColor = texture2D(tDiffuse, uv + totalOffset);
            }
        `
    };
    lensingPass = new ShaderPass(LensingShader);
    composer.addPass(lensingPass);

    const CRTShader = {
        uniforms: {
            "tDiffuse": { value: null },
            "curvature": { value: new THREE.Vector2(3.0, 3.0) },
            "uFlash": { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uFlash;
            varying vec2 vUv;
            void main() {
                vec2 uv = vUv;
                vec2 dc = abs(0.5 - uv) * 2.0;
                uv.x -= 0.5; uv.x *= 1.0 + (dc.y * (0.04)); uv.x += 0.5;
                uv.y -= 0.5; uv.y *= 1.0 + (dc.x * (0.04)); uv.y += 0.5;
                if (uv.y > 1.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0)
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                else {
                    vec4 color = texture2D(tDiffuse, uv);
                    color.rgb += vec3(uFlash); // Add The Flash
                    gl_FragColor = color;
                }
            }
        `
    };
    crtPass = new ShaderPass(CRTShader);
    composer.addPass(crtPass);

    updatePixelation();
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Re-create Groups
    localSystem = new THREE.Group();
    localSystem.visible = false;
    scene.add(localSystem);
    
    smbhGroup = new THREE.Group();
    scene.add(smbhGroup);

    elSlider.value = simState.timeScale;

    // Initial Generation
    generateUniverse(CONFIG.seed);
    
    // STARTUP WITH BANG
    simState.universeSimTime = 0.0;
    simState.bigBangFlash = 1.0; 

    // Initial State Set
    resetCamera(0);
    elStatusPanel.style.display = 'none';
    elSimPanel.style.display = 'none';
    
    // Precompile to reduce stutter on first frame
    try { renderer.compile(scene, camera); } catch(e) {}
    
    // Start Loop
    renderer.setAnimationLoop(animate);
    
    // Listeners (Remove old to prevent duplicates, though init shouldn't be called repeatedly without cleanup)
    window.removeEventListener('resize', onWindowResize);
    window.addEventListener('resize', onWindowResize);
    
    setupUIEvents();
}

function setupUIEvents() {
    document.addEventListener('mousemove', (e) => {
        if (elCursor) elCursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        if (!isDragging && dragStartPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 5) isDragging = true;
    });
    document.body.addEventListener('mouseover', (e) => {
        if (e.target.matches('button, input, .panel-close, label, a, .clickable')) {
            elCursor.classList.add('active'); elCursor.innerHTML = '&#8629;'; 
        } else {
            elCursor.classList.remove('active'); elCursor.innerHTML = '';
        }
    });
    renderer.domElement.addEventListener('pointerdown', (e) => {
        isDragging = false; dragStartPos.set(e.clientX, e.clientY);
        if (!simState.inspectingTarget) simState.trackingTarget = null;
        
        // INTERACTION KILLS AUTOPILOT & OPENS MENU
        if (simState.isAutopilot) {
            simState.isAutopilot = false;
            if (elAutopilotToggle) elAutopilotToggle.checked = false;
            // Open SIM control panel
            if (elSimPanel) elSimPanel.style.display = 'flex';
        }
    });
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // General purpose button binder that strips old listeners by cloning
    const bindBtn = (id, fn) => {
        const btn = document.getElementById(id);
        if(!btn) return;
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', fn);
        return newBtn;
    }

    bindBtn('reset-btn', () => generateUniverse(Math.floor(Math.random() * 10000)));
    
    // --- BIG BANG: HARD RESET ---
    bindBtn('bang-btn', () => {
        init();
    });
    
    elPauseBtn = bindBtn('pause-btn', () => {
        simState.isPaused = !simState.isPaused;
        elPauseBtn.textContent = simState.isPaused ? "RESUME SIM" : "PAUSE SIM";
        if(!simState.isPaused) clock.getDelta();
    });
    elBackBtn = bindBtn('back-btn', () => {
        if (simState.inspectingTarget) {
            simState.inspectingTarget = null; simState.inspectingTargetPreviousPos = null;
            controls.target.set(0,0,0); elBackBtn.textContent = "BACK TO GALAXY"; return;
        }
        if (simState.isAutopilot) { elAutopilotToggle.checked = false; simState.isAutopilot = false; }
        ejectView();
    });
    bindBtn('alert-dismiss', () => {
        elAlert.style.display = 'none'; if (simState.isTransitioning) completeTransition();
    });
    
    const panels = [elStatusPanel, elSimPanel, elConfigModal, elTargetPanel];
    const checkMobile = (active) => {
        if (window.innerWidth <= 768) panels.forEach(p => { if(p !== active) p.style.display = 'none'; });
    };

    // Toggle binder that also strips old listeners
    const bindToggle = (btnId, panelId) => {
        const btn = document.getElementById(btnId);
        const panel = document.getElementById(panelId);
        if (!btn || !panel) return;
        
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            const open = panel.style.display !== 'flex';
            if (open) checkMobile(panel);
            panel.style.display = open ? 'flex' : 'none';
        });
        return newBtn;
    };

    elStatusToggle = bindToggle('status-toggle-btn', 'stats-panel') || elStatusToggle;
    bindToggle('sim-toggle-btn', 'controls-panel');
    bindToggle('config-btn', 'config-modal');
    
    elStatusClose.onclick = () => elStatusPanel.style.display = 'none';
    elSimClose.onclick = () => elSimPanel.style.display = 'none';
    elConfigClose.onclick = () => elConfigModal.style.display = 'none';
    
    elTargetClose.onclick = () => {
        elTargetPanel.style.display = 'none';
        simState.selectedTarget = null;
        if(simState.isAutopilot) simState.autopilotPanelHidden = true;
    };

    // Location Button Logic (Toggle)
    const newLocBtn = bindBtn('loc-btn', () => {
        simState.autopilotPanelHidden = false;
        if (elTargetPanel.style.display === 'flex') { elTargetPanel.style.display = 'none'; return; }
        checkMobile(elTargetPanel);
        let d = null;
        if (simState.viewLevel === 0) {
            d = {
                designation: `UNIVERSE 0x${CONFIG.seed.toString(16).toUpperCase()}`,
                type: "COSMIC WEB",
                age: simState.universeSimTime.toFixed(2),
                mass: `${CONFIG.starCount.toLocaleString()} OBJECTS`,
                radius: `${(SCALES.UNIVERSE / 1_000_000).toFixed(1)} MLY`,
                lum: "N/A",
                composition: `SEED: 0x${CONFIG.seed.toString(16).toUpperCase()}\nOBJECTS: ${CONFIG.starCount.toLocaleString()}`
            };
        } else if (simState.viewLevel === 1) {
            d = simState.activeGalaxyData;
        } else if (simState.viewLevel === 2) {
            if (simState.inspectingTarget && simState.inspectingTarget.userData && simState.inspectingTarget.userData.type) {
                const t = simState.inspectingTarget;
                d = {
                    designation: t.userData.designation || "UNKNOWN",
                    type: t.userData.type || "UNKNOWN",
                    age: simState.universeSimTime.toFixed(2),
                    mass: "VAR",
                    radius: "VAR",
                    lum: "REFLECTIVE",
                    composition: t.userData.composition || "ANALYZING..."
                };
            } else d = simState.activeSystemData;
        }
        if (d) updateTargetPanel(d, true);
    });

    elWarpBtn.onclick = () => {
        if (simState.isAutopilot) { elAutopilotToggle.checked = false; simState.isAutopilot = false; }
        if (simState.selectedTarget) {
            elTargetPanel.style.display = 'none';
            if (simState.selectedTarget.level === 0) startTransition(simState.selectedTarget.position, 1);
            else if (simState.selectedTarget.level === 1) startTransition(simState.selectedTarget.position, 2);
            else if (simState.selectedTarget.level === 2) {
                simState.inspectingTarget = simState.selectedTarget.object;
                simState.trackingTarget = null;
                simState.inspectingTargetPreviousPos = simState.inspectingTarget.position.clone();
                // LOCK CAMERA ON TARGET IMMEDIATELY
                controls.target.copy(simState.inspectingTarget.position);
                elBackBtn.textContent = "LEAVE ORBIT";
            }
        }
    };

    document.querySelectorAll('.q-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const q = QUALITY_PRESETS[e.target.getAttribute('data-q')];
            if (q) {
                CONFIG.starCount = q.starCount; CONFIG.clusterCount = q.clusterCount;
                if (simState.viewLevel === 0) generateUniverse(CONFIG.seed);
                else if (simState.viewLevel === 1) generateDetailedGalaxy(simState.currentGalaxyType);
            }
        });
    });

    elRetroSlider.oninput = (e) => {
        simState.pixelationFactor = parseInt(e.target.value);
        elRetroVal.innerText = simState.pixelationFactor;
        updatePixelation();
    };
    
    elCrtToggle.onchange = (e) => e.target.checked ? elCrtOverlay.classList.add('crt-effects') : elCrtOverlay.classList.remove('crt-effects');
    
    elAutopilotToggle.onchange = (e) => {
        simState.isAutopilot = e.target.checked;
        if (simState.isAutopilot) { simState.autopilotNextAction = 0; simState.inspectingTarget = null; simState.autopilotPanelHidden = false; }
        if (simState.isAutopilot && simState.viewLevel === 1 && simState.autopilotPriorityTargets.length === 0) queueAutopilotGalaxyPriorityTargets();
    };
    
    document.getElementById('timestep-slider').oninput = (e) => simState.timeScale = parseFloat(e.target.value);
}

function updatePixelation() {
    if (!renderer || !composer) return;
    if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
    const f = simState.pixelationFactor === 0 ? 1 : (simState.pixelationFactor * 0.8) + 1;
    const w = Math.floor(window.innerWidth / f); const h = Math.floor(window.innerHeight / f);
    renderer.setSize(w, h, false); composer.setSize(w, h);
    renderer.domElement.style.width = '100vw'; renderer.domElement.style.height = '100vh';
    if (points) { points.material.uniforms.uPixelRatio.value = renderer.getPixelRatio(); points.material.uniforms.uScreenHeight.value = h; }
    if (localGalaxy) { localGalaxy.material.uniforms.uPixelRatio.value = renderer.getPixelRatio(); localGalaxy.material.uniforms.uScreenHeight.value = h; }
}

function onWindowResize() { updatePixelation(); }

function resetCamera(level) {
    if (level === 0) { controls.maxDistance = SCALES.UNIVERSE * 2; controls.minDistance = 1000; controls.zoomSpeed = 1.0; elBackBtn.disabled = true; elBackBtn.textContent = "RETURN TO ORBIT"; }
    else if (level === 1) { controls.maxDistance = SCALES.GALAXY * 3; controls.minDistance = 100; controls.zoomSpeed = 2.0; elBackBtn.disabled = false; elBackBtn.textContent = "BACK TO UNIVERSE"; }
    else if (level === 2) { controls.maxDistance = SCALES.SYSTEM * 4; controls.minDistance = 10; controls.zoomSpeed = 3.0; elBackBtn.disabled = false; elBackBtn.textContent = "BACK TO GALAXY"; }
    camera.updateProjectionMatrix();
}

function resetSimulation() {
    simState.galaxySimTime = 0; simState.isPaused = false;
    simState.isTransitioning = false; simState.viewLevel = 0; simState.worldOffset.set(0,0,0);
    simState.selectedTarget = null; simState.activeGalaxyData = null; simState.activeSystemData = null;
    simState.autopilotPriorityTargets = [];
    simState.lastGalaxyVisitTime = 0; simState.visitedSystemsCount = 0; simState.planetTourIndex = 0;
    simState.trackingTarget = null; simState.inspectingTarget = null; simState.inspectingTargetPreviousPos = null;
    simState.bigBangFlash = 0; // Reset flash by default
    
    physicsBodies = []; passiveBodies = []; activeCMEs = [];
    activeBlackHoles = []; blackHoleUniforms.uBHCount.value = 0;
    elLocBtn.style.display = 'block';
    if(points) points.position.set(0,0,0);
    if(localGalaxy) localGalaxy.visible = false;
    if(localSystem) localSystem.visible = false;
    if(smbhGroup) smbhGroup.clear();
    if(supernovaSystem) { scene.remove(supernovaSystem); supernovaSystem = null; }
    if(nebulaSystem) { scene.remove(nebulaSystem); nebulaSystem = null; }
    camera.position.set(0, SCALES.UNIVERSE * 0.1, SCALES.UNIVERSE * 0.2);
    controls.target.set(0,0,0); resetCamera(0); controls.autoRotate = true; controls.enabled = true;
    elPauseBtn.textContent = "PAUSE SIM"; elAlert.style.display = 'none'; elTargetPanel.style.display = 'none';
}

function ejectView() {
    if (simState.isTransitioning) return;
    elTargetPanel.style.display = 'none';
    if (simState.viewLevel === 2) {
        startTransition(new THREE.Vector3(0, SCALES.GALAXY * 0.5, 0), 1, true); 
    } else if (simState.viewLevel === 1) {
        startTransition(new THREE.Vector3(0, SCALES.UNIVERSE * 0.1, 0), 0, true);
    }
}

function startTransition(targetPoint, level, isBackingOut = false) {
    if (simState.isTransitioning) return;
    simState.isTransitioning = true;
    simState.transitionTarget.copy(targetPoint);
    simState.transitionData = (!isBackingOut && simState.selectedTarget) ? simState.selectedTarget.data : null;
    simState.nextLevel = level;
    simState.transitionProgress = 0;
    controls.enabled = false;
    elAlert.style.display = 'block';
    if (!simState.isAutopilot || isBackingOut) elTargetPanel.style.display = 'none'; 
    
    if (isBackingOut) {
         elAlertTitle.innerText = "LEAVING GRAVITY WELL"; elAlertMsg.innerText = "ACCELERATING TO ESCAPE VELOCITY...";
    } else {
        const id = Math.floor(Math.abs(targetPoint.x + targetPoint.y)).toString(16).toUpperCase();
        if (level === 1) { elAlertTitle.innerText = "APPROACHING GALAXY"; elAlertMsg.innerText = `SECTOR ${id} :: HYPERDRIVE ENGAGED`; }
        else { elAlertTitle.innerText = "APPROACHING SYSTEM"; elAlertMsg.innerText = `STAR ${id} :: ORBITAL INSERTION`; }
    }
}

function completeTransition() {
    const level = simState.nextLevel;
    const prevLevel = simState.viewLevel;
    simState.viewLevel = level;
    simState.isTransitioning = false;
    controls.enabled = true;
    elAlert.style.display = 'none';
    const shift = new THREE.Vector3().copy(simState.transitionTarget);
    
    activeBlackHoles = []; blackHoleUniforms.uBHCount.value = 0;
    
    if (level > prevLevel) {
        if (simState.transitionData) {
            if (level === 1) simState.activeGalaxyData = simState.transitionData;
            if (level === 2) simState.activeSystemData = simState.transitionData;
        } else if (simState.selectedTarget && simState.selectedTarget.data) {
            if (level === 1) simState.activeGalaxyData = simState.selectedTarget.data;
            if (level === 2) simState.activeSystemData = simState.selectedTarget.data;
        }
    } else {
        if (level === 1) simState.activeSystemData = null;
        if (level === 0) simState.activeGalaxyData = null;
    }
    
    elLocBtn.style.display = 'block';
    
    if (level > prevLevel) {
        camera.position.sub(shift); controls.target.sub(shift);
        if (points) points.position.sub(shift);
        if (level === 2 && localGalaxy) localGalaxy.position.sub(shift);
        if (level === 2 && smbhGroup) smbhGroup.position.sub(shift);
        if (level === 2 && nebulaSystem) nebulaSystem.position.sub(shift);
    }
    
    // Reset Planet Tour
    if (level === 2) simState.planetTourIndex = 0;

    if (level === 0) {
        if (localGalaxy) localGalaxy.visible = false; if (localSystem) localSystem.visible = false;
        if (smbhGroup) smbhGroup.visible = false; if (supernovaSystem) supernovaSystem.visible = false;
        if (nebulaSystem) nebulaSystem.visible = false;
        resetCamera(0); elAlertMsg.innerText = "INTERGALACTIC SPACE";
    } else if (level === 1) {
        if (localSystem) localSystem.visible = false;
        if (!localGalaxy || prevLevel === 0) {
            const age = simState.universeSimTime;
            simState.currentGalaxyType = (age < 3.0) ? 2 : (age > 10.0 ? 1 : 0);
            generateDetailedGalaxy(simState.currentGalaxyType);
        }
        if (localGalaxy) { localGalaxy.visible = true; if (level > prevLevel) localGalaxy.position.set(0,0,0); }
        if (smbhGroup) { smbhGroup.visible = true; if(level > prevLevel) smbhGroup.position.set(0,0,0); }
        if (smbhGroup.children.length > 0) activeBlackHoles.push(smbhGroup.children[0]);
        if (nebulaSystem) { nebulaSystem.visible = true; if (level > prevLevel) nebulaSystem.position.set(0,0,0); }
        if (prevLevel === 0) queueAutopilotGalaxyPriorityTargets();
        if (level > prevLevel) {
            if (simState.isAutopilot) {
                 const dist = SCALES.GALAXY * 1.5; const theta = Math.random() * Math.PI * 2; const phi = Math.random() * Math.PI * 0.5 + 0.1;
                 camera.position.set(dist * Math.sin(phi) * Math.cos(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.sin(theta));
                 simState.autopilotZooming = true;
            } else camera.position.set(0, SCALES.GALAXY * 0.8, SCALES.GALAXY * 0.4);
            controls.target.set(0,0,0);
        }
        resetCamera(1); elAlertMsg.innerText = "ARRIVED AT LOCAL GALAXY";
    } else if (level === 2) {
        if(smbhGroup) smbhGroup.visible = false; if(nebulaSystem) nebulaSystem.visible = false;
        generateStarSystem(shift);
        if (localSystem) { localSystem.visible = true; localSystem.position.set(0,0,0); }
        if (simState.isAutopilot) {
             const dist = SCALES.SYSTEM * 1.5; const theta = Math.random() * Math.PI * 2; const phi = Math.random() * Math.PI * 0.5 + 0.1;
             camera.position.set(dist * Math.sin(phi) * Math.cos(theta), dist * Math.cos(phi), dist * Math.sin(phi) * Math.sin(theta));
             simState.autopilotZooming = true; simState.planetTourIndex = 0; 
        } else camera.position.set(0, SCALES.SYSTEM * 0.4, SCALES.SYSTEM * 0.8);
        controls.target.set(0,0,0);
        resetCamera(2); elAlertMsg.innerText = "SYSTEM ORBIT STABLE";
    }
    
    if (simState.isAutopilot && level > 0 && !simState.autopilotPanelHidden) {
        elTargetPanel.style.display = 'flex';
        if (level === 1 && simState.activeGalaxyData) updateTargetPanel(simState.activeGalaxyData, true);
        if (level === 2 && simState.activeSystemData) updateTargetPanel(simState.activeSystemData, true);
    }
    if (level > prevLevel) simState.worldOffset.add(shift);
}

function evolveStar(initialClass, formationTime, currentTime) {
    const age = currentTime - formationTime;
    if (age < 0.05) return { state: 'PROTO', age: age, classObj: initialClass };
    if (age < initialClass.lifespan) return { state: 'MAIN', age: age, classObj: initialClass };
    if (age < initialClass.lifespan * 1.1) return { state: 'GIANT', age: age, classObj: initialClass };
    let remnantType;
    if (initialClass.id === 'O' || initialClass.id === 'B') remnantType = (Math.random() > 0.5) ? 'BH' : 'N';
    else if (initialClass.id === 'A' || initialClass.id === 'F' || initialClass.id === 'G') remnantType = 'WD';
    else return { state: 'MAIN', age: age, classObj: initialClass };
    return { state: 'REMNANT', age: age, classObj: STAR_CLASSES.find(c => c.id === remnantType) };
}

function generateComposition(seed, isStar) {
    let s = seed; const rnd = () => { const x = Math.sin(s++) * 10000; return x - Math.floor(x); };
    let h, he, met;
    if (isStar) { h = 70 + rnd() * 10; he = 24 + rnd() * 4; met = 100 - (h + he); } 
    else { h = 74 + rnd() * 5; he = 23 + rnd() * 2; met = 100 - (h + he); }
    if (met < 0) met = 0;
    const trace = ['O','C','Ne','Fe', 'N', 'Si', 'Mg', 'S'][Math.floor(rnd()*8)];
    return `COMPOSITION:\nH: ${h.toFixed(2)}% | He: ${he.toFixed(2)}% | Met: ${met.toFixed(2)}%\nTrace: ${trace}`;
}

function getStarSystemInfo(seed) {
    let s = seed; const rnd = () => { const x = Math.sin(s++) * 10000; return x - Math.floor(x); };
    let initialClass = STAR_CLASSES[STAR_CLASSES.length - 2]; 
    let cumulative = 0; const typeRoll = rnd();
    for (let i = 0; i < STAR_CLASSES.length - 3; i++) {
        cumulative += STAR_CLASSES[i].prob;
        if (typeRoll < cumulative) { initialClass = STAR_CLASSES[i]; break; }
    }
    const evoData = evolveStar(initialClass, rnd() * simState.universeSimTime, simState.universeSimTime);
    const spectrum = []; for(let i=0; i<10; i++) spectrum.push({ pos: rnd() * 100, intensity: rnd() });
    return {
        designation: `HIP-${Math.floor(rnd()*100000)}`,
        typeObj: evoData.classObj, state: evoData.state, age: evoData.age.toFixed(3),
        mass: evoData.classObj.mass, radius: evoData.classObj.rad, lum: evoData.classObj.lum,
        spectrum: spectrum, composition: generateComposition(seed, true)
    };
}

function getGalaxyInfo(seed, age) {
    let s = seed; const rnd = () => { const x = Math.sin(s++) * 10000; return x - Math.floor(x); };
    let type = "SPIRAL GALAXY";
    if (age < 3.0) { if (rnd() > 0.3) type = "IRREGULAR GALAXY"; else if (rnd() > 0.5) type = "QUASAR (AGN)"; else type = "PROTO-GALAXY"; } 
    else if (age > 10.0) { if (rnd() > 0.4) type = "ELLIPTICAL GALAXY"; else type = "LENTICULAR GALAXY"; }
    return {
        designation: `NGC-${Math.floor(rnd()*5000)}`, type: type, age: age.toFixed(2),
        mass: (rnd() * 50 + 10).toFixed(1) + " Billion", radius: (rnd() * 50 + 20).toFixed(1) + " kly",
        lum: "HIGH", spectrum: [], composition: generateComposition(seed, false)
    };
}

function updateTargetPanel(data, readOnly = false) {
    if (window.innerWidth <= 768) { [elStatusPanel, elSimPanel, elConfigModal].forEach(p => p.style.display = 'none'); }
    elTargetTitle.innerText = readOnly ? "CURRENT LOCATION" : "TARGET ANALYSIS";
    elTName.innerText = data.designation; elTAge.innerText = data.age + " Bn YR";
    if (data.typeObj) {
        let typeStr = `CLASS ${data.typeObj.id}`;
        if (data.state === 'PROTO') typeStr += " (PROTO-STAR)";
        else if (data.state === 'GIANT') typeStr += " (RED GIANT)";
        else if (data.state === 'REMNANT') typeStr += " (REMNANT)";
        elTType.innerText = typeStr;
        elTType.style.color = (data.typeObj.id === 'BH') ? '#0f0' : ('#' + data.typeObj.color.toString(16).padStart(6,'0'));
        elTMass.innerText = data.mass + " M☉"; elTRad.innerText = data.radius + " R☉"; elTLum.innerText = data.lum + " L☉";
    } else {
        elTType.innerText = data.type; elTType.style.color = "#0f0";
        elTMass.innerText = data.mass + " M☉"; elTRad.innerText = data.radius; elTLum.innerText = "VAR";
    }
    elSpectrograph.innerHTML = '';
    let s = 0; for(let i=0; i<data.designation.length; i++) s += data.designation.charCodeAt(i);
    const rnd = () => { const x = Math.sin(s++) * 10000; return x - Math.floor(x); };
    const palette = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#0088ff', '#ff00ff'];
    const numLines = 5 + Math.floor(rnd() * 8); 
    for(let i=0; i<numLines; i++) {
        const line = document.createElement('div'); line.className = 'spec-line';
        const pos = Math.floor(rnd() * 95 / 5) * 5; 
        line.style.left = pos + '%'; line.style.backgroundColor = palette[Math.floor((pos/100)*palette.length)];
        elSpectrograph.appendChild(line);
    }
    elTComposition.innerText = data.composition || "ANALYZING...";
    if (readOnly) { document.getElementById('warp-btn').style.display = 'none'; } 
    else { 
        document.getElementById('warp-btn').style.display = 'block'; 
        document.getElementById('warp-btn').innerText = (simState.viewLevel === 2) ? "INSPECT ORBIT" : "INITIATE HYPERDRIVE";
    }
    if (simState.isAutopilot && simState.autopilotPanelHidden) elTargetPanel.style.display = 'none';
    else elTargetPanel.style.display = 'flex';
}

function createBlackHole(radius, x, y, z) {
    const ehGeom = new THREE.SphereGeometry(radius, 64, 64);
    const ehMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const blackHole = new THREE.Mesh(ehGeom, ehMat);
    blackHole.position.set(x,y,z);

    const diskGeom = new THREE.RingGeometry(radius * 1.5, radius * 8.0, 128);
    const diskMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff6600) } },
        side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `
            varying vec3 vWorldPos;
            void main() {
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime; uniform vec3 uColor; varying vec3 vWorldPos;
            ${NOISE_GLSL}
            void main() {
                float r = length(vWorldPos.xz);
                float angle = atan(vWorldPos.z, vWorldPos.x);
                float n = snoise(vec3(vWorldPos.x * 0.1, vWorldPos.z * 0.1, uTime * 0.5));
                float fastN = snoise(vec3(vWorldPos.x * 0.5, vWorldPos.z * 0.5, uTime * 2.0));
                float spiral = sin(angle * 3.0 + r * 0.5 - uTime * 2.0);
                float intensity = 0.5 + 0.5 * spiral;
                intensity *= (0.5 + 0.5 * n);
                intensity += fastN * 0.2;
                float dist = length(vWorldPos); 
                float alpha = smoothstep(${(radius * 2.0).toFixed(1)}, ${(radius * 4.0).toFixed(1)}, dist) * (1.0 - smoothstep(${(radius * 6.0).toFixed(1)}, ${(radius * 8.0).toFixed(1)}, dist));
                gl_FragColor = vec4(uColor * (1.0 + fastN), intensity * 0.4 * alpha);
            }
        `
    });
    const disk = new THREE.Mesh(diskGeom, diskMat);
    disk.rotation.x = Math.PI / 2;
    blackHole.add(disk);
    return blackHole;
}

// --- GENERATION FUNCTIONS ---

function generateUniverse(seed) {
    if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); points = null; }
    if (localGalaxy) { scene.remove(localGalaxy); localGalaxy.geometry.dispose(); if(localGalaxy.material) localGalaxy.material.dispose(); localGalaxy = null; }
    while(localSystem.children.length > 0){ const c = localSystem.children[0]; if(c.geometry) c.geometry.dispose(); if(c.material) c.material.dispose(); localSystem.remove(c); }
    if (renderer) renderer.renderLists.dispose();

    resetSimulation();
    CONFIG.seed = seed;
    elSeed.textContent = "0x" + CONFIG.seed.toString(16).toUpperCase();
    elObjects.textContent = CONFIG.starCount.toLocaleString();

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(CONFIG.starCount * 3);
    const colors = new Float32Array(CONFIG.starCount * 3);
    const sizes = new Float32Array(CONFIG.starCount);
    
    // Improved Filament Generation
    const clusters = [];
    let localSeed = seed; function rand() { const x = Math.sin(localSeed++) * 10000; return x - Math.floor(x); }
    for(let i = 0; i < CONFIG.clusterCount; i++) {
        const r = Math.pow(rand(), 0.5) * SCALES.UNIVERSE; 
        const theta = rand() * Math.PI * 2; const phi = Math.acos(2 * rand() - 1);
        clusters.push(new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)));
    }
    const colorA = new THREE.Color(0x4488ff); const colorB = new THREE.Color(0xffaaee); const colorC = new THREE.Color(0xffddaa); 
    for (let i = 0; i < CONFIG.starCount; i++) {
        const i3 = i * 3;
        const idx1 = Math.floor(rand() * CONFIG.clusterCount);
        let idx2 = idx1; let minDist = Infinity;
        for(let k=0; k<3; k++) {
            const tryIdx = Math.floor(rand() * CONFIG.clusterCount); if (tryIdx === idx1) continue;
            const distSq = clusters[idx1].distanceToSquared(clusters[tryIdx]);
            if (distSq < minDist) { minDist = distSq; idx2 = tryIdx; }
        }
        const c1 = clusters[idx1]; const c2 = clusters[idx2];
        let t = rand(); 
        // Power curve for denser filaments
        t = (t < 0.5) ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t; 
        
        const bx = c1.x + (c2.x - c1.x) * t;
        const by = c1.y + (c2.y - c1.y) * t;
        const bz = c1.z + (c2.z - c1.z) * t;
        const noiseScale = SCALES.UNIVERSE * CONFIG.filamentScatter;
        const rNoise = rand() * noiseScale;
        const theta = rand() * Math.PI * 2; const phi = Math.acos(2 * rand() - 1);
        positions[i3] = bx + rNoise * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = by + rNoise * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = bz + rNoise * Math.cos(phi);
        
        const mixVal = rand(); let c;
        if (mixVal < 0.33) c = colorA.clone().lerp(colorB, rand());
        else if (mixVal < 0.66) c = colorB.clone().lerp(colorC, rand());
        else c = colorC.clone().lerp(colorA, rand());
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
        sizes[i] = rand() * 40000.0 + 10000.0;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0.0 }, uPixelRatio: { value: renderer.getPixelRatio() }, uScreenHeight: { value: window.innerHeight } },
        vertexShader: `
            uniform float uTime; uniform float uPixelRatio; uniform float uScreenHeight;
            attribute float size; varying vec3 vColor;
            #include <common>
            #include <logdepthbuf_pars_vertex>
            void main() {
                // Inflation Physics: Universe expands from singularity (0,0,0)
                // Curve: Rapid expansion that tapers off (Inflation theory style)
                float expansion = 1.0 - exp(-uTime * 2.0);
                
                vec3 finalPos = position * expansion;
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = size * uPixelRatio * (uScreenHeight / -mvPosition.z);
                #include <logdepthbuf_vertex>
            }
        `,
        fragmentShader: `
            uniform float uTime;
            varying vec3 vColor;
            #include <common>
            #include <logdepthbuf_pars_fragment>
            void main() {
                #include <logdepthbuf_fragment>
                vec2 center = gl_PointCoord - vec2(0.5);
                if (length(center) > 0.5) discard;
                
                // Thermodynamics: Early universe stars are hotter (white/blue) and cool to their colors
                float heat = exp(-uTime * 0.5); 
                vec3 finalColor = mix(vColor, vec3(1.0, 1.0, 1.0), heat);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true
    });
    points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points);
}

function generateDetailedGalaxy(type = 0) {
    if(localGalaxy) { scene.remove(localGalaxy); localGalaxy.geometry.dispose(); }
    if(supernovaSystem) { scene.remove(supernovaSystem); supernovaSystem = null; }
    if(nebulaSystem) { scene.remove(nebulaSystem); nebulaSystem = null; }
    smbhGroup.clear();
    const pCount = CONFIG.starCount;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3); const col = new Float32Array(pCount * 3);
    const sz = new Float32Array(pCount); const orbitParams = new Float32Array(pCount * 3);
    const radius = SCALES.GALAXY; 
    
    const irregularAttractors = [];
    if (type === 2) {
        for(let k=0; k<4; k++) irregularAttractors.push(new THREE.Vector3((Math.random()-0.5)*radius*1.2, (Math.random()-0.5)*radius*0.8, (Math.random()-0.5)*radius*1.2));
    }
    for(let i=0; i<pCount; i++) {
        const i3 = i*3; let x, y, z; let speed = 1.0; let initAngle = 0;
        if (type === 0) { 
            const isBulge = Math.random() < 0.2;
            if (isBulge) {
                const r = Math.random() * radius * 0.25; const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1);
                x = r * Math.sin(phi) * Math.cos(theta); y = r * Math.sin(phi) * Math.sin(theta) * 0.8; z = r * Math.cos(phi);
                col[i3]=1.0; col[i3+1]=0.8; col[i3+2]=0.4;
            } else {
                const r = (Math.random() * 0.1 + Math.pow(Math.random(), 2.0) * 0.9) * radius;
                const arms = 2; const armOffset = (Math.PI * 2 / arms) * (i % arms);
                const spiralAngle = armOffset + 7.0 * Math.log(r / radius * 10.0 + 1.0);
                x = Math.cos(spiralAngle) * r + (Math.random()-0.5)*radius*0.1; 
                z = Math.sin(spiralAngle) * r + (Math.random()-0.5)*radius*0.1;
                y = (Math.random() - 0.5) * radius * 0.02 * (1.0 + r/radius);
                initAngle = Math.atan2(z, x); speed = Math.sqrt(1.0 / (r/radius + 0.1));
                if (Math.random() > 0.3) { col[i3]=0.6; col[i3+1]=0.7; col[i3+2]=1.0; } else { col[i3]=1.0; col[i3+1]=1.0; col[i3+2]=1.0; }
            }
        } else if (type === 1) {
            const r = Math.pow(Math.random(), 2.5) * radius * 0.6; const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1);
            x = r * Math.sin(phi) * Math.cos(theta) * 0.8; y = r * Math.sin(phi) * Math.sin(theta) * 0.6; z = r * Math.cos(phi) * 0.8; speed = 0.1;
            col[i3]=1.0; col[i3+1]=0.7; col[i3+2]=0.3;
        } else {
            const attr = irregularAttractors[i % irregularAttractors.length];
            const locR = Math.random() * radius * 0.3; const th = Math.random() * Math.PI * 2; const ph = Math.acos(2 * Math.random() - 1);
            x = attr.x + locR * Math.sin(ph) * Math.cos(th); y = attr.y + locR * Math.sin(ph) * Math.sin(th); z = attr.z + locR * Math.cos(ph); speed = 0.5;
            if (Math.random() > 0.9) { col[i3]=1.0; col[i3+1]=0.2; col[i3+2]=0.1; sz[i] = Math.random() * 8000 + 4000; } 
            else { col[i3]=0.6; col[i3+1]=0.8; col[i3+2]=1.0; }
        }
        pos[i3] = x; pos[i3+1] = y; pos[i3+2] = z; if (sz[i] === 0) sz[i] = Math.random() * 4000.0 + 1000.0;
        orbitParams[i3] = Math.sqrt(x*x + z*z); orbitParams[i3+1] = speed; orbitParams[i3+2] = Math.atan2(z, x);
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sz, 1)); geom.setAttribute('aOrbit', new THREE.BufferAttribute(orbitParams, 3));
    
    const mat = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 }, uScreenHeight: { value: window.innerHeight } },
        vertexShader: `
            uniform float uPixelRatio; uniform float uTime; uniform float uScreenHeight;
            attribute float size; attribute vec3 aOrbit; varying vec3 vColor;
            #include <common>
            #include <logdepthbuf_pars_vertex>
            void main() {
                vColor = color;
                float radius = aOrbit.x; float speed = aOrbit.y; float initAngle = aOrbit.z;
                vec3 newPos = position;
                if (radius > 0.0) {
                     float finalAngle = initAngle + uTime * speed * 0.005;
                     newPos.x = cos(finalAngle) * radius; newPos.z = sin(finalAngle) * radius;
                }
                vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = size * uPixelRatio * (uScreenHeight / -mvPosition.z);
                #include <logdepthbuf_vertex>
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            #include <common>
            #include <logdepthbuf_pars_fragment>
            void main() {
                #include <logdepthbuf_fragment>
                vec2 center = gl_PointCoord - vec2(0.5);
                float glow = 1.0 - smoothstep(0.0, 0.5, length(center));
                gl_FragColor = vec4(vColor, pow(glow, 2.0)); 
            }
        `,
        depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, transparent: true
    });
    localGalaxy = new THREE.Points(geom, mat); localGalaxy.frustumCulled = false; localGalaxy.visible = false; scene.add(localGalaxy);

    if (type !== 1) {
        const nebCount = (type === 2) ? 60 : 30;
        const nebGeom = new THREE.BufferGeometry(); const nebPos = new Float32Array(nebCount * 3); const nebCol = new Float32Array(nebCount * 3); const nebSize = new Float32Array(nebCount);
        for(let i=0; i<nebCount; i++) {
             const r = Math.random() * radius * 0.8; const angle = Math.random() * Math.PI * 2;
             nebPos[i*3] = r * Math.cos(angle); nebPos[i*3+1] = (Math.random()-0.5)*radius*0.2; nebPos[i*3+2] = r * Math.sin(angle);
             nebCol[i*3]=0.4; nebCol[i*3+1]=0.1; nebCol[i*3+2]=0.6; nebSize[i] = Math.random() * 800000 + 400000;
        }
        nebGeom.setAttribute('position', new THREE.BufferAttribute(nebPos, 3)); nebGeom.setAttribute('color', new THREE.BufferAttribute(nebCol, 3)); nebGeom.setAttribute('size', new THREE.BufferAttribute(nebSize, 1));
        const nebMat = new THREE.ShaderMaterial({
            uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uScreenHeight: { value: window.innerHeight }, uTime: { value: 0 } },
            vertexShader: `
                uniform float uPixelRatio; uniform float uScreenHeight; attribute float size; varying vec3 vColor;
                #include <common>
                #include <logdepthbuf_pars_vertex>
                void main() {
                    vColor = color; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = size * uPixelRatio * (uScreenHeight / -mvPosition.z) * 0.05;
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: `
                varying vec3 vColor; uniform float uTime; ${NOISE_GLSL}
                #include <common>
                #include <logdepthbuf_pars_fragment>
                void main() {
                    #include <logdepthbuf_fragment>
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float n = snoise(vec3(center * 4.0, uTime * 0.2));
                    float alpha = (1.0 - smoothstep(0.0, 0.5, length(center))) * (0.5 + 0.5 * n);
                    if (alpha < 0.05) discard;
                    gl_FragColor = vec4(vColor, alpha * 0.3);
                }
            `,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true
        });
        nebulaSystem = new THREE.Points(nebGeom, nebMat); nebulaSystem.visible = false; scene.add(nebulaSystem);
    }
    const bh = createBlackHole(radius * 0.005, 0, 0, 0);
    smbhGroup.add(bh); smbhGroup.visible = false;
}

function generateStarSystem(seedPos) {
    physicsBodies = []; passiveBodies = []; activeCMEs = [];
    while(localSystem.children.length > 0){ const c = localSystem.children[0]; if(c.geometry) c.geometry.dispose(); if(c.material) c.material.dispose(); localSystem.remove(c); }
    let seedVal = Math.abs(seedPos.x + seedPos.y + seedPos.z); const rand = () => { const x = Math.sin(seedVal++) * 10000; return x - Math.floor(x); };
    const S = SCALES.SYSTEM; const G = SCALES.G; 
    let baseStarColor = 0xffaa00; let baseStarRad = S * 0.25; let isBH = false;
    if (simState.selectedTarget && simState.selectedTarget.data) {
         const d = simState.selectedTarget.data;
         if (d.typeObj) baseStarColor = d.typeObj.color;
         if (d.typeObj.id === 'BH') { baseStarRad = S * 0.1; isBH = true; }
    }
    const numStars = isBH ? 1 : (rand() > 0.6 ? (rand() > 0.9 ? 3 : 2) : 1);
    for(let i=0; i<numStars; i++) {
        const sizeMod = (i===0) ? 1.0 : (0.5 + rand() * 0.5); const rad = baseStarRad * sizeMod; const mass = 1000.0 * sizeMod; 
        let mesh;
        if (isBH) {
             mesh = createBlackHole(rad, 0, 0, 0);
             activeBlackHoles.push(mesh);
             mesh.add(new THREE.PointLight(0xffaa44, 100000, SCALES.SYSTEM * 5));
             mesh.add(new THREE.AmbientLight(0x222233, 0.5));
        } else {
            const geom = new THREE.SphereGeometry(rad, 64, 64);
            const mat = new THREE.MeshStandardMaterial({ color: baseStarColor, emissive: baseStarColor, emissiveIntensity: 2.0 });
            
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uTime = { value: 0 };
                // Use a unique varying name to avoid collision with standard material's vNormal/vViewPosition
                shader.vertexShader = `
                    uniform float uTime; varying vec3 vCustomWorldPos; ${NOISE_GLSL}
                ` + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n vCustomWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n
                    float disp = (snoise(vec3(position * 0.2 + uTime * 0.5)) + snoise(vec3(position * 0.5 - uTime * 0.2))) * 0.05 * ${rad.toFixed(2)};
                    transformed += normal * disp;
                `);
                shader.fragmentShader = `uniform float uTime; varying vec3 vCustomWorldPos; ${NOISE_GLSL}` + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                    float n = snoise(vec3(vCustomWorldPos * 0.1 + uTime * 0.2));
                    float bright = snoise(vec3(vCustomWorldPos * 0.3 + uTime * 0.5));
                    vec3 base = diffuseColor.rgb;
                    vec3 final = mix(base, base*0.3, smoothstep(0.4, 0.8, n));
                    final = mix(final, base*3.0, smoothstep(0.5, 0.9, bright));
                    diffuseColor.rgb = final;
                `);
                mat.userData.shader = shader;
            };
            mesh = new THREE.Mesh(geom, mat);
            // Corona
            const cGeom = new THREE.SphereGeometry(rad * 1.4, 32, 32);
            const cMat = new THREE.ShaderMaterial({
                uniforms: { uColor: { value: new THREE.Color(baseStarColor) } }, transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending,
                vertexShader: `varying vec3 vNorm; void main() { vNorm = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: `uniform vec3 uColor; varying vec3 vNorm; void main() { float i = pow(0.6 - dot(vNorm, vec3(0,0,1)), 4.0); gl_FragColor = vec4(uColor, i*0.6); }`
            });
            mesh.add(new THREE.Mesh(cGeom, cMat));
            mesh.add(new THREE.PointLight(baseStarColor, 300000, SCALES.SYSTEM * 10, 2));
        }
        localSystem.add(mesh);
        if (numStars === 1) physicsBodies.push({ mesh: mesh, mass: mass, velocity: new THREE.Vector3(0,0,0), isStar: true });
        else {
             const dist = S * 0.4; mesh.position.set((i===0?1:-1)*dist, 0, 0); 
             const v = Math.sqrt(G*mass/(2*dist)); physicsBodies.push({ mesh: mesh, mass: mass, velocity: new THREE.Vector3(0,0,(i===0?1:-1)*v), isStar: true });
        }
    }
    
    // Planets
    const pCount = Math.floor(rand() * 5) + 3; 
    for(let i=0; i<pCount; i++) {
        const orbitBase = (numStars > 1) ? S * 0.8 : S * 0.3; const dist = orbitBase + (i * S * 0.2) + rand() * S * 0.1; 
        const rad = S * 0.01 + rand() * S * 0.02; const mass = rad * 10.0; 
        const isGas = (i > 2 && rand() > 0.3); const isRocky = !isGas;
        const pGeom = new THREE.SphereGeometry(rad, 64, 64);
        const pMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rand(), isGas ? 0.8 : 0.2, 0.5), roughness: 0.7 });
        
        pMat.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.vertexShader = `varying vec3 vPos; ${NOISE_GLSL}` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n vPos = position; ${isRocky ? `float h = snoise(position*0.2)*0.5 + snoise(position*1.0)*0.2; transformed += normal*h*${rad.toFixed(2)}*0.1;` : ''}`);
            shader.fragmentShader = `uniform float uTime; varying vec3 vPos; ${NOISE_GLSL}` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                float n = snoise(vPos * ${isGas ? '2.0' : '5.0'} + vec3(0.0, ${isGas ? 'uTime*0.5' : '0.0'}, 0.0));
                ${isGas ? `
                    // Increase Gas Giant animation speed
                    float band = sin(vPos.y * 20.0 + n * 2.0 + uTime * 2.0);
                    vec3 c1 = diffuseColor.rgb; vec3 c2 = diffuseColor.rgb * 0.5;
                    diffuseColor.rgb = mix(c1, c2, band * 0.5 + 0.5) + n * 0.05;
                    // Lightning
                    float storm = snoise(vPos * 5.0 + uTime * 3.0);
                    if(storm > 0.8) diffuseColor.rgb += vec3(0.8, 0.9, 1.0) * (storm - 0.8) * 5.0;
                ` : `
                    float h = snoise(vPos * 0.2);
                    if (h > 0.3) diffuseColor.rgb *= 1.2; else if (h < -0.2) diffuseColor.rgb *= 0.8;
                    diffuseColor.rgb *= (0.8 + 0.4 * n);
                `}
            `);
            pMat.userData.shader = shader;
        };
        const planet = new THREE.Mesh(pGeom, pMat);
        const ang = rand() * Math.PI * 2; planet.position.set(Math.cos(ang)*dist, 0, Math.sin(ang)*dist);
        
        const aGeom = new THREE.SphereGeometry(rad * 1.1, 32, 32);
        const aMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform float uTime; uniform float uIntensity; varying vec2 vUv;
            void main() {
                if (uIntensity <= 0.01) discard;
                float pole = smoothstep(0.3, 0.5, abs(vUv.y - 0.5));
                float wave = sin(vUv.x * 20.0 + uTime * 5.0) * 0.5 + 0.5;
                gl_FragColor = vec4(0.2, 0.8, 0.4, uIntensity * pole * wave * 0.5);
            }`
        });
        const aurora = new THREE.Mesh(aGeom, aMat);
        planet.add(aurora); planet.userData = { designation: `PLANET ${String.fromCharCode(65+i)}`, type: isGas?"GAS GIANT":"ROCKY", aurora: aMat };
        
        localSystem.add(planet);
        physicsBodies.push({ mesh: planet, mass: mass, velocity: new THREE.Vector3(-Math.sin(ang)*Math.sqrt(G*1000/dist),0,Math.cos(ang)*Math.sqrt(G*1000/dist)), isStar: false });
    }
}

function spawnCME() {
    if (simState.viewLevel !== 2 || !localSystem.visible) return;
    const stars = physicsBodies.filter(b => b.isStar);
    if (stars.length === 0) return;
    const star = stars[Math.floor(Math.random()*stars.length)].mesh;
    
    // Volumetric CME using custom shader on sphere
    const cmeGeom = new THREE.SphereGeometry(5, 32, 32);
    const cmeMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff4400) } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vPos; ${NOISE_GLSL}
        void main() {
            float n = snoise(vec3(vPos * 0.5 + uTime * 2.0));
            float alpha = smoothstep(0.0, 0.5, n);
            gl_FragColor = vec4(uColor, alpha * 0.8);
        }`
    });
    const cme = new THREE.Mesh(cmeGeom, cmeMat);
    cme.position.copy(star.position);
    
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const dir = new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
    
    cme.userData = { dir: dir, age: 0, life: 10.0, speed: 20.0, mat: cmeMat };
    localSystem.add(cme);
    activeCMEs.push(cme);
}

function updatePhysics(dt) {
    const subSteps = 2; const dtSub = dt/subSteps;
    for(let s=0; s<subSteps; s++) {
        for(let i=0; i<physicsBodies.length; i++) {
            const b = physicsBodies[i]; 
            b.mesh.position.add(b.velocity.clone().multiplyScalar(dtSub));
            if(!b.isStar) {
                const r = b.mesh.position.lengthSq();
                const f = b.mesh.position.clone().normalize().multiplyScalar(-SCALES.G * 1000 / r);
                b.velocity.add(f.multiplyScalar(dtSub));
            }
        }
    }
}

function animate() {
    const delta = clock.getDelta(); const simDelta = Math.min(delta, 0.1) * simState.timeScale;
    
    // Update Big Bang Flash
    if (simState.bigBangFlash > 0) {
        simState.bigBangFlash -= delta * 0.5; // Flash fades over 2 seconds
        if(simState.bigBangFlash < 0) simState.bigBangFlash = 0;
        if(crtPass) crtPass.uniforms.uFlash.value = simState.bigBangFlash;
    }

    if (!simState.isPaused) {
        if (simState.viewLevel === 0) {
            simState.universeSimTime += simDelta;
            // Link Time to Star Shader
            if(points) points.material.uniforms.uTime.value = simState.universeSimTime;
        }
        else if (simState.viewLevel === 1) simState.galaxySimTime += simDelta;
        else if (simState.viewLevel === 2) {
            updatePhysics(simDelta * 5.0);
            
            if (Math.random() < 0.005) spawnCME(); 
            for (let i = activeCMEs.length - 1; i >= 0; i--) {
                const cme = activeCMEs[i];
                cme.userData.age += simDelta;
                cme.position.add(cme.userData.dir.clone().multiplyScalar(cme.userData.speed * simDelta));
                cme.scale.setScalar(1.0 + cme.userData.age * 2.0); 
                if (cme.userData.mat) cme.userData.mat.uniforms.uTime.value += delta;
                
                physicsBodies.forEach(p => {
                    if (!p.isStar && p.mesh.userData.aurora) {
                        const d = cme.position.distanceTo(p.mesh.position);
                        if (d < 30) p.mesh.userData.aurora.uniforms.uIntensity.value = 1.0;
                        else p.mesh.userData.aurora.uniforms.uIntensity.value *= 0.98;
                    }
                });

                if (cme.userData.age > cme.userData.life) {
                    localSystem.remove(cme); activeCMEs.splice(i, 1);
                }
            }

            physicsBodies.forEach(b => {
                if (!b.isStar) b.mesh.rotation.y += delta * 0.1;
                if (b.mesh.userData.aurora) b.mesh.userData.aurora.uniforms.uTime.value += delta;
                if (b.mesh.material && b.mesh.material.userData && b.mesh.material.userData.shader) {
                    b.mesh.material.userData.shader.uniforms.uTime.value += delta;
                }
            });
        }
    }

    // Camera Lock during Inspection
    if (simState.inspectingTarget && controls) {
        controls.target.copy(simState.inspectingTarget.position);
    }

    let bhCount = 0;
    activeBlackHoles.forEach(bh => {
         const pos = bh.getWorldPosition(new THREE.Vector3()); pos.project(camera);
         if (pos.z < 1.0 && Math.abs(pos.x) < 1.5 && Math.abs(pos.y) < 1.5) {
              blackHoleUniforms.uBHPos.value[bhCount].set(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5);
              blackHoleUniforms.uBHMass.value[bhCount] = 2.0; bhCount++;
         }
    });
    blackHoleUniforms.uBHCount.value = bhCount;

    if (simState.isAutopilot && !simState.isTransitioning) {
        simState.autopilotTimer += delta;
        
        let canTour = true;
        // Gate: Wait for universe to be > 1.0 Billion Years old before picking first target
        if (simState.viewLevel === 0 && simState.universeSimTime < 1.0) canTour = false;

        if (canTour && simState.autopilotTimer > simState.autopilotNextAction) {
            simState.autopilotTimer = 0; simState.autopilotNextAction = 5.0;
            if (simState.viewLevel === 0) {
                const randIdx = Math.floor(Math.random() * CONFIG.starCount);
                if (points) {
                    const posAttr = points.geometry.attributes.position;
                    const pos = new THREE.Vector3(posAttr.getX(randIdx), posAttr.getY(randIdx), posAttr.getZ(randIdx));
                    const data = getGalaxyInfo(CONFIG.seed + randIdx, simState.universeSimTime);
                    simState.selectedTarget = { level: 0, index: randIdx, position: pos, data: data };
                    updateTargetPanel(data, true);
                    startTransition(pos, 1);
                }
            } else if (simState.viewLevel === 1) {
                if (simState.autopilotPriorityTargets.length > 0) {
                    const next = simState.autopilotPriorityTargets.shift();
                    if (next && next.object && typeof next.object.getWorldPosition === 'function') {
                        next.object.getWorldPosition(tmpPickPos);
                        const pos = tmpPickPos.clone();
                        const data = next.data || getSmbhInfo();
                        simState.selectedTarget = { level: 1, object: next.object, position: pos, data };
                        updateTargetPanel(data, true);
                        startTransition(pos, 2);
                    }
                } else {
                    const randIdx = Math.floor(Math.random() * CONFIG.starCount);
                    if (localGalaxy) {
                        const posAttr = localGalaxy.geometry.attributes.position;
                        const pos = new THREE.Vector3(posAttr.getX(randIdx), posAttr.getY(randIdx), posAttr.getZ(randIdx));
                        const data = getStarSystemInfo(randIdx);
                        simState.selectedTarget = { level: 1, index: randIdx, position: pos, data: data };
                        updateTargetPanel(data, true);
                        startTransition(pos, 2);
                    }
                }
            } else if (simState.viewLevel === 2) {
                // Autopilot Planet Tour
                const planets = localSystem.children.filter(c => c.userData && c.userData.type); 
                if (simState.planetTourIndex < planets.length) {
                    const p = planets[simState.planetTourIndex];
                    const data = {
                        designation: p.userData.designation,
                        type: p.userData.type,
                        age: simState.universeSimTime.toFixed(2),
                        mass: "VAR", radius: "VAR", lum: "REFLECTIVE",
                        composition: "SILICATES/ICE"
                    };
                    simState.selectedTarget = { level: 2, object: p, position: p.position, data: data };
                    updateTargetPanel(data, true);
                    controls.target.copy(p.position); // Look at planet
                    simState.planetTourIndex++;
                } else {
                    ejectView();
                }
            }
        }
    }

    if (simState.isTransitioning) {
        simState.transitionProgress += delta;
        let t = Math.min(simState.transitionProgress * 0.5, 1.0); t = t * t * (3.0 - 2.0 * t);
        camera.position.lerp(simState.transitionTarget, 0.05); controls.target.lerp(simState.transitionTarget, 0.05);
        if (simState.transitionProgress > 3.0) completeTransition();
    } else controls.update();

    composer.render();
    const simAge = (simState.viewLevel === 0 ? simState.universeSimTime : simState.galaxySimTime);
    if(elTime) elTime.innerText = simAge.toFixed(2) + " Bn YR";
    if(elStatusToggle) elStatusToggle.innerText = `[ STATUS ${simAge.toFixed(2)}Bn ]`;
    
    if (camera && (elCX || elCY || elCZ)) {
        tmpWorldPos.copy(camera.position).add(simState.worldOffset);
        if (elCX) elCX.innerText = formatCoord(tmpWorldPos.x);
        if (elCY) elCY.innerText = formatCoord(tmpWorldPos.y);
        if (elCZ) elCZ.innerText = formatCoord(tmpWorldPos.z);
    }
    elFPS.innerText = Math.round(1 / (delta || 0.001));
}

function onPointerUp(event) {
    if (isDragging) return;
    if (event.target.closest('button') || event.target.closest('.hud-panel')) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (simState.viewLevel === 0 && points) {
        raycaster.params.Points.threshold = 500000; const intersects = raycaster.intersectObject(points);
        if (intersects.length > 0) {
            const index = intersects[0].index; const data = getGalaxyInfo(CONFIG.seed + index, simState.universeSimTime);
            simState.selectedTarget = { level: 0, index: index, position: intersects[0].point, data: data };
            updateTargetPanel(data);
        }
    } else if (simState.viewLevel === 1 && localGalaxy) {
        const smbh = (smbhGroup && smbhGroup.visible && smbhGroup.children.length > 0) ? smbhGroup.children[0] : null;
        if (smbh) {
            const smbhHits = raycaster.intersectObject(smbh, true);
            if (smbhHits.length > 0) {
                const data = getSmbhInfo();
                smbh.getWorldPosition(tmpPickPos);
                simState.selectedTarget = { level: 1, object: smbh, position: tmpPickPos.clone(), data };
                updateTargetPanel(data);
                return;
            }
            tmpPickNdc.copy(smbh.getWorldPosition(tmpPickPos)).project(camera);
            if (tmpPickNdc.z < 1.0) {
                const px = rect.left + (tmpPickNdc.x * 0.5 + 0.5) * rect.width;
                const py = rect.top + (-tmpPickNdc.y * 0.5 + 0.5) * rect.height;
                const r = Math.max(24, Math.min(rect.width, rect.height) * 0.06);
                if (Math.hypot(event.clientX - px, event.clientY - py) <= r) {
                    const data = getSmbhInfo();
                    simState.selectedTarget = { level: 1, object: smbh, position: tmpPickPos.clone(), data };
                    updateTargetPanel(data);
                    return;
                }
            }
        }

        raycaster.params.Points.threshold = 50000;
        const intersects = raycaster.intersectObject(localGalaxy);
        if (intersects.length > 0) {
            const index = intersects[0].index; const data = getStarSystemInfo(index);
            simState.selectedTarget = { level: 1, index: index, position: intersects[0].point, data: data };
            updateTargetPanel(data);
        }
    } else if (simState.viewLevel === 2 && localSystem) {
         raycaster.params.Points.threshold = 1; 
         const intersects = raycaster.intersectObjects(localSystem.children);
         if (intersects.length > 0) {
             let target = intersects[0].object;
             if (!target.userData.type && target.parent && target.parent.userData.type) target = target.parent;
             
             if (target.userData.type) {
                 const data = {
                    designation: target.userData.designation,
                    type: target.userData.type,
                    age: simState.universeSimTime.toFixed(2),
                    mass: "0.003 M☉", radius: "0.01 R☉", lum: "0",
                    composition: "Atmosphere: N2, O2"
                 };
                 simState.selectedTarget = { level: 2, object: target, position: target.position, data: data };
                 updateTargetPanel(data);
             }
         }
    }
}
