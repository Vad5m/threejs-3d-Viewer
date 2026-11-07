import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader, type Collada } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
// @ts-ignore
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

type EffectName = 'normal' | 'gray' | 'normals' | 'unlit' | 'cartoon' | 'sketch' | 'xray' | 'chrome' | 'hologram';
type BackgroundName = 'black' | 'gray' | 'gradient' | 'stars';

interface MeshRecord {
    original: THREE.Material | THREE.Material[];
    effect: THREE.Material | THREE.Material[] | null;
}

interface FxUniforms {
    uMix: { value: number };
    uTime: { value: number };
}

type EffectBuilder = (orig: THREE.Material) => THREE.Material;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const statusLine = $<HTMLDivElement>('status');
const dropOverlay = $<HTMLDivElement>('drop-overlay');
const hint = $<HTMLDivElement>('hint');
const effectsPanel = $<HTMLDivElement>('effects-panel');
const panelToggle = $<HTMLDivElement>('effects-toggle');
const statsPanel = $<HTMLDivElement>('info');
const fpsBadge = $<HTMLDivElement>('fps');
const loadBar = $<HTMLDivElement>('progress');
const toast = $<HTMLDivElement>('toast');
const animBar = $<HTMLDivElement>('animation-bar');
const animSelect = $<HTMLSelectElement>('anim-select');
const animScrub = $<HTMLInputElement>('anim-slider');
const animToggle = $<HTMLButtonElement>('anim-play');
const animClock = $<HTMLSpanElement>('anim-time');

function reportFatal(msg: string): void {
    statusLine.textContent = msg;
    statusLine.style.color = '#ff6b6b';
    statusLine.classList.add('show');
    console.error(msg);
}

window.addEventListener('error', (ev: ErrorEvent) => {
    reportFatal('JS Error: ' + (ev.message || 'unknown'));
});
window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = ev.reason as { message?: string } | string;
    const msg = typeof reason === 'string' ? reason : reason?.message ?? String(reason);
    reportFatal('Promise Error: ' + msg);
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 10000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;
controls.minDistance = 0.05;
controls.maxDistance = 5000;
controls.target.set(0, 1, 0);
controls.autoRotateSpeed = 2.0;

scene.add(new THREE.AmbientLight(0x505050, 1.2));

const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
mainLight.position.set(3, 6, 4);
mainLight.shadow.mapSize.width = 2048;
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.camera.near = 0.5;
mainLight.shadow.camera.far = 500;
mainLight.shadow.bias = -0.0005;
scene.add(mainLight);

const rimLight = new THREE.DirectionalLight(0xffddaa, 0.9);
rimLight.position.set(-4, 3, -5);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0xaaaaaa, 0.6);
fillLight.position.set(0, 4, 3);
scene.add(fillLight);

const overheadLight = new THREE.PointLight(0xffffff, 0.5);
overheadLight.position.set(0, 12, 0);
scene.add(overheadLight);

const grid = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
grid.position.y = -0.5;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.3;
scene.add(grid);

const starGeometry = new THREE.BufferGeometry();
const starTotal = 1500;
const starPositions = new Float32Array(starTotal * 3);
for (let i = 0; i < starTotal * 3; i += 3) {
    starPositions[i] = (Math.random() - 0.5) * 3000;
    starPositions[i + 1] = (Math.random() - 0.5) * 3000;
    starPositions[i + 2] = (Math.random() - 0.5) * 3000;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
        color: 0xffffff, size: 0.6, transparent: true,
        opacity: 0.3, depthWrite: false, sizeAttenuation: false
    })
);
stars.frustumCulled = false;
stars.visible = false;
scene.add(stars);

const modelRoot = new THREE.Group();
scene.add(modelRoot);
let loadedModel: THREE.Object3D | null = null;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.1/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const fbxLoader = new FBXLoader();
const objLoader = new OBJLoader();
const stlLoader = new STLLoader();
const plyLoader = new PLYLoader();
const colladaLoader = new ColladaLoader();
const threeMFLoader = new ThreeMFLoader();
const amfLoader = new AMFLoader();

let toastTimer: number | null = null;
let statusTimer: number | null = null;

function flashStatus(msg: string, isError = false): void {
    statusLine.textContent = msg;
    statusLine.style.color = isError ? '#ff6b6b' : '#ffaa00';
    statusLine.classList.add('show');
    if (!isError) {
        if (statusTimer !== null) clearTimeout(statusTimer);
        statusTimer = window.setTimeout(() => statusLine.classList.remove('show'), 2500);
    }
}

function flashToast(msg: string, dur = 1800): void {
    toast.textContent = msg;
    toast.classList.add('visible');
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), dur);
}

const fxUniforms: FxUniforms = { uMix: { value: 0 }, uTime: { value: 0 } };
const materialCache = new Map<string, THREE.Material>();

function cacheKey(effect: EffectName, orig: THREE.Material): string {
    const o = orig as THREE.MeshStandardMaterial;
    const mapId = o.map ? o.map.uuid : '';
    const colorId = o.color ? o.color.getHexString() : 'ffffff';
    const roughId = o.roughness !== undefined ? o.roughness.toFixed(2) : '0.5';
    const metalId = o.metalness !== undefined ? o.metalness.toFixed(2) : '0.0';
    return `${effect}|${mapId}|${colorId}|${roughId}|${metalId}`;
}

function cachedMaterial(effect: EffectName, orig: THREE.Material, factory: EffectBuilder): THREE.Material {
    const key = cacheKey(effect, orig);
    let m = materialCache.get(key);
    if (m === undefined) {
        m = factory(orig);
        materialCache.set(key, m);
    }
    return m;
}

function purgeMaterialCache(): void {
    materialCache.forEach((m) => {
        for (const k in m) {
            const v = (m as unknown as Record<string, unknown>)[k];
            if (v && (v as { isTexture?: boolean }).isTexture) {
                (v as THREE.Texture).dispose();
            }
        }
        m.dispose();
    });
    materialCache.clear();
}

function buildHologramMaterial(): THREE.Material {
    const m = new THREE.MeshLambertMaterial({
        color: 0x66ffcc, emissive: 0x00ffaa, emissiveIntensity: 1.4,
        transparent: true, opacity: 0.45, side: THREE.FrontSide
    });
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uMix = fxUniforms.uMix;
        shader.uniforms.uTime = fxUniforms.uTime;
        shader.vertexShader = 'varying vec3 vWorldPos;\nvarying vec3 vNormalW;\n' + shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vNormalW = normalize(mat3(modelMatrix) * objectNormal);'
        );
        shader.fragmentShader = 'uniform float uMix;\nuniform float uTime;\nvarying vec3 vWorldPos;\nvarying vec3 vNormalW;\n' + shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            '#include <dithering_fragment>\n' +
            'float bands = sin(vWorldPos.y * 80.0 + uTime * 6.0) * 0.5 + 0.5;\n' +
            'float scan = smoothstep(0.4, 0.6, bands);\n' +
            'vec3 viewDir = normalize(cameraPosition - vWorldPos);\n' +
            'float fres = pow(1.0 - abs(dot(viewDir, vNormalW)), 2.5);\n' +
            'vec3 holo = gl_FragColor.rgb + vec3(0.0, 0.35, 0.25) * scan * 0.7 + vec3(0.0, 0.6, 0.4) * fres;\n' +
            'gl_FragColor.rgb = mix(gl_FragColor.rgb, holo, uMix);\n' +
            'gl_FragColor.a = mix(1.0, 0.45 + 0.25 * scan + 0.3 * fres, uMix);'
        );
    };
    return m;
}

const buildGrayMaterial = (): THREE.Material => new THREE.MeshLambertMaterial({ color: 0xb0b0b0, side: THREE.FrontSide });
const buildNormalsMaterial = (): THREE.Material => new THREE.MeshNormalMaterial({ side: THREE.FrontSide });

const buildUnlitMaterial = (orig: THREE.Material): THREE.Material => {
    const o = orig as THREE.MeshStandardMaterial;
    return new THREE.MeshBasicMaterial({
        map: o.map ?? null,
        color: o.color ? o.color.clone() : new THREE.Color(0xffffff),
        side: THREE.FrontSide
    });
};

function buildCartoonMaterial(orig: THREE.Material): THREE.Material {
    const o = orig as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({
        color: o.color ? o.color.clone() : new THREE.Color(0xffffff),
        map: o.map ?? null, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide
    });
    m.onBeforeCompile = (shader) => {
        shader.vertexShader = 'varying vec3 vNormalW;\nvarying vec3 vViewDir;\n' + shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\n vNormalW = normalize(mat3(modelMatrix) * objectNormal);\n vec3 worldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vViewDir = normalize(cameraPosition - worldPos);'
        );
        shader.fragmentShader = 'varying vec3 vNormalW;\nvarying vec3 vViewDir;\n' + shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            '#include <dithering_fragment>\n float edge = 1.0 - abs(dot(vNormalW, vViewDir));\n float line = smoothstep(0.55, 0.75, edge);\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), line * 0.9);'
        );
    };
    return m;
}

function buildSketchMaterial(): THREE.Material {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.FrontSide });
    m.onBeforeCompile = (shader) => {
        shader.vertexShader = 'varying vec3 vNormalW;\nvarying vec3 vViewDir;\nvarying vec3 vWorldPos;\n' + shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\n vNormalW = normalize(mat3(modelMatrix) * objectNormal);\n vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vViewDir = normalize(cameraPosition - vWorldPos);'
        );
        shader.fragmentShader = 'varying vec3 vNormalW;\nvarying vec3 vViewDir;\nvarying vec3 vWorldPos;\n' + shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            '#include <dithering_fragment>\n' +
            'float ndotv = abs(dot(vNormalW, vViewDir));\n' +
            'float shade = smoothstep(0.15, 0.6, ndotv);\n' +
            'vec3 paper = vec3(1.0);\nvec3 ink = vec3(0.0);\n' +
            'float hatchCoord = (vWorldPos.x + vWorldPos.y * 1.3 + vWorldPos.z) * 45.0;\n' +
            'float hatch = step(0.5, fract(hatchCoord));\n' +
            'float line = (1.0 - shade);\n' +
            'float thick = smoothstep(0.2, 0.8, line);\n' +
            'gl_FragColor.rgb = mix(paper, ink, thick * hatch * 0.95);\n' +
            'gl_FragColor.a = 1.0;'
        );
    };
    return m;
}

const buildXRayMaterial = (): THREE.Material => new THREE.MeshBasicMaterial({
    color: 0x44aaff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false
});

const buildChromeMaterial = (): THREE.Material => new THREE.MeshStandardMaterial({
    color: 0xcccccc, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.5
});

const effectBuilders: Record<EffectName, EffectBuilder | null> = {
    normal: null,
    gray: buildGrayMaterial,
    normals: buildNormalsMaterial,
    unlit: buildUnlitMaterial,
    cartoon: buildCartoonMaterial,
    sketch: buildSketchMaterial,
    xray: buildXRayMaterial,
    chrome: buildChromeMaterial,
    hologram: buildHologramMaterial
};

const meshState = new Map<THREE.Mesh, MeshRecord>();

function disposeModel(): void {
    if (!loadedModel) return;
    haltAnimations();
    modelRoot.remove(loadedModel);
    loadedModel.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
                for (const k in m) {
                    const v = (m as unknown as Record<string, unknown>)[k];
                    if (v && (v as { isTexture?: boolean }).isTexture) {
                        (v as THREE.Texture).dispose();
                    }
                }
                m.dispose();
            });
        }
    });
    purgeMaterialCache();
    meshState.clear();
    loadedModel = null;
    effectsPanel.classList.remove('visible');
    panelToggle.classList.remove('visible');
    statsPanel.classList.remove('visible');
    animBar.classList.remove('visible');
    markEffectButton('normal');
    currentEffect = 'normal';
    mixAmount = 0;
    renderPending = true;
}

function frameModel(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) object.scale.multiplyScalar(2.5 / maxDim);

    const scaledSize = size.clone().multiplyScalar(object.scale.x);
    controls.target.set(0, 0, 0);
    const dist = Math.max(scaledSize.x, scaledSize.y, scaledSize.z) * 1.9;
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.near = Math.max(0.001, dist / 1000);
    camera.far = Math.max(dist * 100, 10000);
    camera.updateProjectionMatrix();
    grid.position.y = box.min.y * object.scale.x + object.position.y;
    controls.update();
    renderPending = true;
}

function refreshStats(): void {
    if (!loadedModel) { statsPanel.classList.remove('visible'); return; }
    let meshes = 0, tris = 0, verts = 0;
    const mats = new Set<THREE.Material>();
    const texs = new Set<THREE.Texture>();
    loadedModel.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh) return;
        meshes++;
        if (m.geometry) {
            if (m.geometry.index) tris += m.geometry.index.count / 3;
            else if (m.geometry.attributes.position) tris += m.geometry.attributes.position.count / 3;
            if (m.geometry.attributes.position) verts += m.geometry.attributes.position.count;
        }
        if (m.material) {
            const ms = Array.isArray(m.material) ? m.material : [m.material];
            ms.forEach((mm) => {
                mats.add(mm);
                const std = mm as THREE.MeshStandardMaterial;
                if (std.map) texs.add(std.map);
            });
        }
    });
    statsPanel.innerHTML =
        '<div><span class="k">Meshes:</span><span class="v">' + meshes + '</span></div>' +
        '<div><span class="k">Vertices:</span><span class="v">' + verts.toLocaleString() + '</span></div>' +
        '<div><span class="k">Triangles:</span><span class="v">' + Math.round(tris).toLocaleString() + '</span></div>' +
        '<div><span class="k">Materials:</span><span class="v">' + mats.size + '</span></div>' +
        '<div><span class="k">Textures:</span><span class="v">' + texs.size + '</span></div>';
    statsPanel.classList.add('visible');
}

const binaryExtensions = ['glb', 'stl', 'ply', '3mf', 'amf'] as const;
const textExtensions = ['gltf', 'obj', 'dae'] as const;

function ingestFile(file: File): void {
    hint.classList.add('hidden');
    flashStatus('Loading: ' + file.name);
    disposeModel();
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const reader = new FileReader();
    loadBar.classList.add('visible');
    loadBar.style.width = '0%';

    reader.onprogress = (ev: ProgressEvent<FileReader>) => {
        if (ev.lengthComputable) loadBar.style.width = (ev.loaded / ev.total * 100) + '%';
    };
    reader.onload = (ev) => {
        loadBar.style.width = '100%';
        setTimeout(() => loadBar.classList.remove('visible'), 300);
        try {
            parseByExtension(ext, ev.target!.result!, file.name);
        } catch (err) {
            console.error(err);
            flashStatus('Error: ' + (err as Error).message, true);
        }
    };
    reader.onerror = () => flashStatus('Failed to read file', true);

    if ((binaryExtensions as readonly string[]).includes(ext) || ext === 'fbx') {
        reader.readAsArrayBuffer(file);
    } else if ((textExtensions as readonly string[]).includes(ext)) {
        reader.readAsText(file);
    } else {
        flashStatus('.' + ext + ' format is not supported', true);
    }
}

function parseByExtension(ext: string, data: string | ArrayBuffer, sourceName: string): void {
    const assetBase = sourceName.includes('/') ? sourceName.substring(0, sourceName.lastIndexOf('/') + 1) : '';

    switch (ext) {
        case 'glb':
        case 'gltf':
            gltfLoader.parse(data as ArrayBuffer, assetBase, (gltf: GLTF) => {
                loadedModel = gltf.scene;
                clips = gltf.animations || [];
                finalizeModel(gltf.scene);
            }, (err) => {
                console.error(err);
                flashStatus('GLB/GLTF error: ' + err.message, true);
            });
            break;

        case 'fbx': {
            let fbxResult: THREE.Group;
            try {
                fbxResult = fbxLoader.parse(data as ArrayBuffer, assetBase);
            } catch (err) {
                const text = new TextDecoder('utf-8', { fatal: false }).decode(data as ArrayBuffer);
                if (text.startsWith('Kaydara FBX Binary')) {
                    flashStatus('Binary FBX could not be parsed', true);
                    return;
                }
                fbxResult = fbxLoader.parse(text, assetBase);
            }
            loadedModel = fbxResult;
            clips = fbxResult.animations || [];
            finalizeModel(fbxResult);
            break;
        }

        case 'obj': {
            const obj = objLoader.parse(data as string);
            loadedModel = obj;
            clips = [];
            finalizeModel(obj);
            break;
        }

        case 'stl': {
            const g = stlLoader.parse(data as ArrayBuffer);
            g.computeVertexNormals();
            loadedModel = new THREE.Mesh(g, defaultMaterial());
            clips = [];
            finalizeModel(loadedModel);
            break;
        }

        case 'ply': {
            const g = plyLoader.parse(data as ArrayBuffer);
            g.computeVertexNormals();
            loadedModel = new THREE.Mesh(g, defaultMaterial());
            clips = [];
            finalizeModel(loadedModel);
            break;
        }

        case 'dae': {
            const c = colladaLoader.parse(data as string, assetBase) as Collada & { animations?: THREE.AnimationClip[] };
            loadedModel = c.scene;
            clips = c.animations ?? [];
            finalizeModel(c.scene);
            break;
        }

        case '3mf':
            (threeMFLoader.parse as any)(data as ArrayBuffer, (obj: THREE.Object3D) => {
                loadedModel = obj;
                clips = [];
                finalizeModel(obj);
            }, (err: Error) => {
                console.error(err);
                flashStatus('3MF error: ' + err.message, true);
            });
            break;

        case 'amf':
            (amfLoader.parse as any)(data as ArrayBuffer, (obj: THREE.Object3D) => {
                loadedModel = obj;
                clips = [];
                finalizeModel(obj);
            }, (err: Error) => {
                console.error(err);
                flashStatus('AMF error: ' + err.message, true);
            });
            break;

        default:
            flashStatus('.' + ext + ' format is not supported', true);
    }
}

function defaultMaterial(): THREE.Material {
    return new THREE.MeshLambertMaterial({ color: 0xb0b0b0, side: THREE.FrontSide });
}

let clips: THREE.AnimationClip[] = [];
let mixer: THREE.AnimationMixer | null = null;
let activeAction: THREE.AnimationAction | null = null;
let isPlaying = false;

function finalizeModel(object: THREE.Object3D): void {
    object.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        if (mesh.geometry) mesh.geometry.computeBoundingSphere();
        if (mesh.material) {
            const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            ms.forEach((mm) => {
                if (mm.side !== undefined) mm.side = THREE.DoubleSide;
                if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                    (mm as THREE.MeshStandardMaterial).envMapIntensity = 1.0;
                }
            });
        }
        meshState.set(mesh, { original: mesh.material, effect: null });
    });

    modelRoot.add(object);
    frameModel(object);
    refreshStats();
    flashStatus('Done');
    effectsPanel.classList.add('visible');
    panelToggle.classList.remove('visible');
    markEffectButton('normal');
    currentEffect = 'normal';
    mixAmount = 0;
    renderPending = true;

    if (clips.length > 0) initAnimations();
}

function initAnimations(): void {
    if (!loadedModel) return;
    mixer = new THREE.AnimationMixer(loadedModel);
    animSelect.innerHTML = '';
    clips.forEach((clip, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = clip.name || ('Clip ' + (i + 1));
        animSelect.appendChild(opt);
    });
    animBar.classList.add('visible');
    startClip(0);
}

function startClip(index: number): void {
    if (!mixer || !clips[index]) return;
    if (activeAction) activeAction.stop();
    activeAction = mixer.clipAction(clips[index]);
    activeAction.reset();
    activeAction.play();
    isPlaying = true;
    animToggle.textContent = '⏸';
}

function haltAnimations(): void {
    if (mixer) { mixer.stopAllAction(); mixer = null; }
    activeAction = null;
    clips = [];
    isPlaying = false;
    animBar.classList.remove('visible');
}

function togglePlayback(): void {
    if (!activeAction) return;
    isPlaying = !isPlaying;
    activeAction.paused = !isPlaying;
    animToggle.textContent = isPlaying ? '⏸' : '▶';
}

let currentEffect: EffectName = 'normal';
let mixAmount = 0;
let fxClock = 0;
let renderPending = true;

function markEffectButton(name: EffectName): void {
    document.querySelectorAll<HTMLButtonElement>('.effect-btn[data-effect]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.effect === name);
    });
}

function switchEffect(name: EffectName): void {
    if (!loadedModel) return;
    currentEffect = name;
    mixAmount = 0;
    fxClock = 0;
    const builder = effectBuilders[name];

    meshState.forEach((record, mesh) => {
        record.effect = null;
        if (!builder) { mesh.material = record.original; return; }
        const origMats = Array.isArray(record.original) ? record.original : [record.original];
        const newMats = origMats.map((orig) => cachedMaterial(name, orig, builder));
        record.effect = Array.isArray(record.original) ? newMats : newMats[0];
        mesh.material = record.effect;
    });
    fxUniforms.uMix.value = 0;
    renderPending = true;
}

function advanceMix(dt: number): void {
    fxClock += dt;
    fxUniforms.uTime.value = fxClock;
    if (mixAmount < 1) {
        mixAmount = Math.min(1, mixAmount + dt * 2.5);
        fxUniforms.uMix.value = mixAmount;
    }
}

document.querySelectorAll<HTMLButtonElement>('.effect-btn[data-effect]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const name = btn.dataset.effect as EffectName;
        if (name === currentEffect) return;
        switchEffect(name);
        markEffectButton(name);
        flashStatus('Effect: ' + btn.textContent!.trim());
    });
});

$('hide-panel').addEventListener('click', () => {
    effectsPanel.classList.remove('visible');
    panelToggle.classList.add('visible');
});
panelToggle.addEventListener('click', () => {
    effectsPanel.classList.add('visible');
    panelToggle.classList.remove('visible');
});

let dragDepth = 0;
window.addEventListener('dragenter', (ev: DragEvent) => {
    ev.preventDefault();
    dragDepth++;
    dropOverlay.classList.add('active');
});
window.addEventListener('dragover', (ev: DragEvent) => {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (ev: DragEvent) => {
    ev.preventDefault();
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.remove('active'); }
});
window.addEventListener('drop', (ev: DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragDepth = 0;
    dropOverlay.classList.remove('active');
    const file = ev.dataTransfer?.files[0];
    if (file) ingestFile(file);
});

controls.addEventListener('change', () => { renderPending = true; });

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const ssaoPass = new SSAOPass(scene, camera, innerWidth, innerHeight);
ssaoPass.kernelRadius = 8;
ssaoPass.minDistance = 0.005;
ssaoPass.maxDistance = 0.1;
ssaoPass.enabled = false;
composer.addPass(ssaoPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.85);
bloomPass.enabled = false;
composer.addPass(bloomPass);

const vignetteShader = {
    uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        offset: { value: 1.0 },
        darkness: { value: 0.6 }
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; varying vec2 vUv;' +
        'void main() {' +
        '  vec4 texel = texture2D(tDiffuse, vUv);' +
        '  vec2 uv = (vUv - vec2(0.5)) * vec2(offset);' +
        '  float vignette = 1.0 - dot(uv, uv);' +
        '  vignette = clamp(pow(vignette, darkness * 2.0), 0.0, 1.0);' +
        '  gl_FragColor = vec4(texel.rgb * vignette, texel.a);' +
        '}'
};

const vignettePass = new ShaderPass(vignetteShader);
vignettePass.enabled = false;
composer.addPass(vignettePass);

let bloomOn = false, ssaoOn = false, vignetteOn = false;
let composerActive = false;

function syncComposer(): void {
    composerActive = bloomOn || ssaoOn || vignetteOn;
    bloomPass.enabled = bloomOn;
    ssaoPass.enabled = ssaoOn;
    vignettePass.enabled = vignetteOn;
    renderPending = true;
}

const backgroundColors: Record<'black' | 'gray', THREE.Color> = {
    black: new THREE.Color(0x000000),
    gray: new THREE.Color(0x333333)
};

let gradientTex: THREE.CanvasTexture | null = null;
function createGradientTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#1a2332');
    g.addColorStop(0.5, '#2a3548');
    g.addColorStop(1, '#0a0f18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

function applyBackground(name: BackgroundName): void {
    document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) => {
        b.classList.toggle('active', b.dataset.bg === name);
    });
    stars.visible = false;
    if (name === 'gradient') {
        if (!gradientTex) gradientTex = createGradientTexture();
        scene.background = gradientTex;
    } else if (name === 'stars') {
        scene.background = backgroundColors.black;
        stars.visible = true;
    } else {
        scene.background = backgroundColors[name];
    }
    renderPending = true;
}

document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) => {
    b.addEventListener('click', () => applyBackground(b.dataset.bg as BackgroundName));
});

$('btn-bloom').addEventListener('click', (ev) => {
    bloomOn = !bloomOn;
    (ev.currentTarget as HTMLElement).classList.toggle('active', bloomOn);
    syncComposer();
});
$('btn-ssao').addEventListener('click', (ev) => {
    ssaoOn = !ssaoOn;
    (ev.currentTarget as HTMLElement).classList.toggle('active', ssaoOn);
    syncComposer();
});
$('btn-vignette').addEventListener('click', (ev) => {
    vignetteOn = !vignetteOn;
    (ev.currentTarget as HTMLElement).classList.toggle('active', vignetteOn);
    syncComposer();
});

const shadowButton = $('btn-shadows');
shadowButton.addEventListener('click', () => {
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    mainLight.castShadow = renderer.shadowMap.enabled;
    shadowButton.classList.toggle('active', renderer.shadowMap.enabled);
    meshState.forEach((_r, mesh) => {
        mesh.castShadow = renderer.shadowMap.enabled;
        mesh.receiveShadow = renderer.shadowMap.enabled;
    });
    renderPending = true;
});

$<HTMLInputElement>('exposure').addEventListener('input', (ev) => {
    renderer.toneMappingExposure = parseFloat((ev.target as HTMLInputElement).value);
    renderPending = true;
});

animSelect.addEventListener('change', () => {
    startClip(parseInt(animSelect.value));
});
animToggle.addEventListener('click', togglePlayback);
animScrub.addEventListener('input', () => {
    if (!activeAction) return;
    const clip = activeAction.getClip();
    const t = (parseInt(animScrub.value) / 1000) * clip.duration;
    activeAction.time = t;
    if (mixer) mixer.update(0);
    animClock.textContent = t.toFixed(2) + 's';
    renderPending = true;
});

window.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === ' ' && activeAction) { ev.preventDefault(); togglePlayback(); }
});

const frameClock = new THREE.Clock();
let fpsElapsed = 0, fpsCount = 0;

function animate(): void {
    requestAnimationFrame(animate);
    const dt = Math.min(frameClock.getDelta(), 0.05);

    if (mixer) {
        mixer.update(dt);
        if (activeAction) {
            const clip = activeAction.getClip();
            animScrub.value = String(Math.min(1000, (activeAction.time / clip.duration) * 1000));
            animClock.textContent = activeAction.time.toFixed(2) + 's';
        }
        renderPending = true;
    }

    if (currentEffect === 'hologram' || mixAmount < 1) {
        advanceMix(dt);
        renderPending = true;
    } else {
        fxUniforms.uTime.value += dt;
    }

    if (controls.update()) renderPending = true;

    fpsElapsed += dt; fpsCount++;
    if (fpsElapsed >= 0.5) {
        fpsBadge.textContent = Math.round(fpsCount / fpsElapsed) + ' fps';
        fpsElapsed = 0; fpsCount = 0;
    }

    if (renderPending) {
        if (composerActive) composer.render();
        else renderer.render(scene, camera);
        renderPending = false;
    }
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    renderPending = true;
});
