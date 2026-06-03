import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh, SplatFileType } from "@sparkjsdev/spark";

type OrbType = "image" | "video" | "audio";

type OrbData = {
  id: number;
  position: THREE.Vector3;
  color: number;
  type: OrbType;
  title: string;
  description: string;
  src: string;
};

type ScanConfig = {
  id: string;
  title: string;
  description: string;
  url: string;
  mapLeft: string;
  mapTop: string;
  orbs: OrbData[];
};

type PopupState = {
  key: string;
  orb: OrbData;
  scanTitle: string;
  left: number;
  top: number;
  zIndex: number;
};

type ScanLoadState = "idle" | "loading" | "ready" | "error";

type LoadPhase = "download" | "parse";

/** 流式下载文件，回调真实下载进度。下载完即释放（不常驻缓存，避免多文件 OOM） */
async function downloadBytes(url: string, onProgress?: (percent: number) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("文件不存在（服务器返回了 HTML 页面）");
  }

  const total = Number(response.headers.get("content-length") ?? 0);

  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    onProgress?.(100);
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) onProgress?.(Math.min(100, Math.round((received / total) * 100)));
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const head = new TextDecoder().decode(merged.slice(0, 4)).trimStart().toLowerCase();
  if (!head.startsWith("ply")) {
    throw new Error("不是有效的 PLY 扫描文件");
  }

  onProgress?.(100);
  return merged;
}

/** 全局缓存：只缓存解析后的 SplatMesh（紧凑），原始字节解析后立即释放 */
const splatCache = new Map<string, SplatMesh>();
const splatPromises = new Map<string, Promise<SplatMesh>>();
const splatErrors = new Map<string, string>();

/**
 * 进度监听器（按 URL）。无论加载是由后台预加载还是用户点击触发，
 * 当前打开的弹窗都能通过这里订阅到真实进度。
 */
const progressListeners = new Map<string, (phase: LoadPhase, percent: number) => void>();
const lastProgress = new Map<string, { phase: LoadPhase; percent: number }>();

function notifyProgress(url: string, phase: LoadPhase, percent: number) {
  lastProgress.set(url, { phase, percent });
  progressListeners.get(url)?.(phase, percent);
}

function disposeAllSplats() {
  for (const splat of splatCache.values()) {
    splat.parent?.remove(splat);
    splat.dispose?.();
  }
  splatCache.clear();
  splatPromises.clear();
  splatErrors.clear();
}

async function acquireSplat(url: string): Promise<SplatMesh> {
  const cached = splatCache.get(url);
  if (cached) {
    notifyProgress(url, "parse", 100);
    return cached;
  }

  let pending = splatPromises.get(url);
  if (!pending) {
    pending = (async () => {
      const fileName = url.split("/").pop() ?? "scan.ply";

      notifyProgress(url, "download", 0);
      let fileBytes: Uint8Array | null = await downloadBytes(url, (percent) =>
        notifyProgress(url, "download", percent),
      );

      // 让出一帧，使下载完成的 UI（100%）先渲染，再进入解析阶段
      notifyProgress(url, "parse", 0);
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const splat = new SplatMesh({ fileBytes, fileName, fileType: SplatFileType.PLY });
      splat.rotation.x = Math.PI;
      await splat.initialized;

      // 解析完成，释放原始字节，降低内存占用
      fileBytes = null;

      splatCache.set(url, splat);
      splatPromises.delete(url);
      notifyProgress(url, "parse", 100);
      return splat;
    })().catch((err) => {
      splatPromises.delete(url);
      const message = err instanceof Error ? err.message : "加载失败";
      splatErrors.set(url, message);
      throw err;
    });
    splatPromises.set(url, pending);
  }
  return pending;
}

/** 后台按顺序预解析（一次只处理一个，避免内存/网络拥塞），点击时命中缓存即可秒开 */
let preloadStarted = false;
async function preloadScansSequentially() {
  if (preloadStarted) return;
  preloadStarted = true;
  for (const config of SCAN_CONFIGS) {
    if (splatCache.has(config.url)) continue;
    try {
      await acquireSplat(config.url);
    } catch {
      // 单个失败不影响其它预加载
    }
  }
}

type OrbGroup = THREE.Group & {
  userData: {
    core: THREE.Mesh;
    coreMat: THREE.MeshStandardMaterial;
    glowMat: THREE.MeshBasicMaterial;
    hovered: boolean;
    phase: number;
    data: OrbData;
  };
};

const SCANS_BASE = (import.meta.env.VITE_SCANS_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "/resources/scans";

const SCAN_CONFIGS: ScanConfig[] = [
  {
    id: "scan-shanghai",
    title: "Excercise Area",
    description: "Interactive Gaussian Splat scan in the exercise zone.",
    url: `${SCANS_BASE}/gs_Changfeng_Park_3.ply`,
    mapLeft: "24%",
    mapTop: "18%",
    orbs: [
      {
        id: 0,
        position: new THREE.Vector3(-0.9, 0.25, 0.3),
        color: 0xffd580,
        type: "image",
        title: "Punto A-1",
        description: "Visual reference for the exercise area.",
        src: "https://picsum.photos/seed/sha1/600/400",
      },
      {
        id: 1,
        position: new THREE.Vector3(0.5, -0.1, 0.4),
        color: 0x80d4ff,
        type: "video",
        title: "Punto A-2",
        description: "Short video clip from this location.",
        src: "https://www.w3schools.com/html/mov_bbb.mp4",
      },
      {
        id: 2,
        position: new THREE.Vector3(0.05, 0.45, -0.55),
        color: 0xb0ff90,
        type: "audio",
        title: "Punto A-3",
        description: "Audio note connected to this scan point.",
        src: "https://www.w3schools.com/html/horse.ogg",
      },
    ],
  },
  {
    id: "scan-montevideo",
    title: "Singing Pavilion",
    description: "Interactive Gaussian Splat scan in the pavilion.",
    url: `${SCANS_BASE}/gs_Changfeng_Park_2.ply`,
    mapLeft: "20%",
    mapTop: "33%",
    orbs: [
      {
        id: 0,
        position: new THREE.Vector3(0.4, 0.3, -0.4),
        color: 0xff9fb0,
        type: "image",
        title: "Punto B-1",
        description: "Image annotation for pavilion context.",
        src: "https://picsum.photos/seed/mvd1/600/400",
      },
      {
        id: 1,
        position: new THREE.Vector3(-0.3, -0.2, 0.5),
        color: 0xd4aaff,
        type: "video",
        title: "Punto B-2",
        description: "Video annotation from the pavilion.",
        src: "https://www.w3schools.com/html/mov_bbb.mp4",
      },
      {
        id: 2,
        position: new THREE.Vector3(0.1, 0.5, 0.3),
        color: 0xffcc80,
        type: "audio",
        title: "Punto B-3",
        description: "Audio annotation from the pavilion.",
        src: "https://www.w3schools.com/html/horse.ogg",
      },
    ],
  },
  {
    id: "scan-geneva",
    title: "Square",
    description: "Interactive Gaussian Splat scan in the square.",
    url: `${SCANS_BASE}/gs_Changfeng_Park_Pavilion_3.ply`,
    mapLeft: "18%",
    mapTop: "23%",
    orbs: [
      {
        id: 0,
        position: new THREE.Vector3(2.7, -1.6, 0.2),
        color: 0x80ffee,
        type: "image",
        title: "Punto C-1",
        description: "Image annotation from the square.",
        src: "https://picsum.photos/seed/gva1/600/400",
      },
      {
        id: 1,
        position: new THREE.Vector3(0.35, 0.4, -0.35),
        color: 0xffee80,
        type: "video",
        title: "Punto C-2",
        description: "Video annotation from the square.",
        src: "https://www.w3schools.com/html/mov_bbb.mp4",
      },
      {
        id: 2,
        position: new THREE.Vector3(-0.1, -0.5, 0.45),
        color: 0xc0c0ff,
        type: "audio",
        title: "Punto C-3",
        description: "Audio annotation from the square.",
        src: "https://www.w3schools.com/html/horse.ogg",
      },
    ],
  },
];

export function MapScanSection() {
  const [activeMarker, setActiveMarker] = useState<string | null>(null);
  const [activeScan, setActiveScan] = useState<ScanConfig | null>(null);
  const [hoveredOrbInfo, setHoveredOrbInfo] = useState<OrbData | null>(null);
  const [popups, setPopups] = useState<PopupState[]>([]);
  const [zSeed, setZSeed] = useState(3000);
  const [scanLoadState, setScanLoadState] = useState<ScanLoadState>("idle");
  const [scanLoadError, setScanLoadError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("download");
  const lookAtTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalWindowRef = useRef<HTMLDivElement>(null);

  const threeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sparkRendererRef = useRef<any>(null);
  const currentSplatRef = useRef<any>(null);
  const orbGroupsRef = useRef<OrbGroup[]>([]);
  const animationRunningRef = useRef(false);
  const activeScanRef = useRef<ScanConfig | null>(null);
  const dragRef = useRef<{ key: string; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2(-9999, -9999));
  const orbitRef = useRef({
    radius: 3,
    theta: 0,
    phi: Math.PI / 2.5,
    dragging: false,
    prevX: 0,
    prevY: 0,
    dragDist: 0,
  });

  const mapImage = useMemo(() => "/resources/images/mapa.png", []);

  const applyOrbit = () => {
    const camera = cameraRef.current;
    if (!camera) return;
    const orbit = orbitRef.current;
    const target = lookAtTargetRef.current;
    camera.position.set(
      target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      target.y + orbit.radius * Math.cos(orbit.phi),
      target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
    );
    camera.lookAt(target);
  };

  const fitCameraToSplat = (splat: SplatMesh) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const box = splat.getBoundingBox(true);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    lookAtTargetRef.current.copy(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.35;
    orbitRef.current.theta = 0;
    orbitRef.current.phi = Math.PI / 2.5;
    // 不要把相机硬性限制在很近的范围内，否则大尺度的真实扫描会让相机陷在模型内部，画面一片空白
    orbitRef.current.radius = Math.max(0.5, Math.min(400, distance));
    applyOrbit();
  };

  const getHoveredOrb = () => {
    const camera = cameraRef.current;
    if (!camera || orbGroupsRef.current.length === 0) return null;
    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(mouseRef.current, camera);
    const hits = raycaster.intersectObjects(orbGroupsRef.current.map((g) => g.userData.core));
    return hits.length ? (hits[0].object.parent as OrbGroup) : null;
  };

  const createOrb = (data: OrbData) => {
    const group = new THREE.Group() as OrbGroup;
    group.position.copy(data.position);

    const coreMat = new THREE.MeshStandardMaterial({
      color: data.color,
      emissive: new THREE.Color(data.color),
      emissiveIntensity: 2,
      roughness: 0,
      metalness: 0,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 20), coreMat);
    const glowMat = new THREE.MeshBasicMaterial({
      color: data.color,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), glowMat);
    const light = new THREE.PointLight(data.color, 0.6, 1.2);
    group.add(core, glow, light);
    group.userData = {
      core,
      coreMat,
      glowMat,
      hovered: false,
      phase: Math.random() * Math.PI * 2,
      data,
    };
    return group;
  };

  const loadScan = async (config: ScanConfig): Promise<boolean> => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const spark = sparkRendererRef.current;
    if (!scene || !camera) return false;

    const loadId = config.id;
    activeScanRef.current = config;
    setScanLoadError(null);
    setLoadProgress(0);
    setLoadPhase("download");
    lookAtTargetRef.current.set(0, 0, 0);

    splatErrors.delete(config.url);

    const alreadyCached = splatCache.has(config.url);
    if (!alreadyCached) {
      setScanLoadState("loading");
    }

    if (currentSplatRef.current) {
      scene.remove(currentSplatRef.current);
      currentSplatRef.current = null;
    }

    orbGroupsRef.current.forEach((g) => scene.remove(g));
    orbGroupsRef.current = [];

    orbitRef.current.theta = 0;
    orbitRef.current.phi = Math.PI / 2.5;
    orbitRef.current.radius = 3;
    applyOrbit();

    for (const orb of config.orbs) {
      const orbGroup = createOrb(orb);
      orbGroupsRef.current.push(orbGroup);
      scene.add(orbGroup);
    }

    const fileName = config.url.split("/").pop() ?? config.url;

    // 订阅该文件的真实进度（无论是点击触发还是后台预加载触发的下载/解析）
    progressListeners.set(config.url, (phase, percent) => {
      if (activeScanRef.current?.id === loadId) {
        setLoadPhase(phase);
        setLoadProgress(percent);
      }
    });
    const seeded = lastProgress.get(config.url);
    if (seeded) {
      setLoadPhase(seeded.phase);
      setLoadProgress(seeded.percent);
    }

    try {
      const splat = await acquireSplat(config.url);
      progressListeners.delete(config.url);
      if (activeScanRef.current?.id !== loadId) return false;

      scene.add(splat);
      currentSplatRef.current = splat;
      fitCameraToSplat(splat);

      // 触发一次排序更新，避免首帧空白；失败也不阻塞（渲染循环会自动更新）
      if (spark) {
        try {
          await spark.update({ scene, camera });
        } catch {
          /* autoUpdate 会在渲染循环中接管 */
        }
      }

      setLoadProgress(100);
      setScanLoadState("ready");
      return true;
    } catch (err) {
      progressListeners.delete(config.url);
      if (activeScanRef.current?.id !== loadId) return false;
      const requiredFiles = SCAN_CONFIGS.map((s) => s.url.split("/").pop()).join("\n");
      setScanLoadState("error");
      setScanLoadError(
        err instanceof Error
          ? `缺少扫描文件：${fileName}\n${err.message}\n\n请将以下 .ply 文件复制到 public/resources/scans/ 目录：\n${requiredFiles}`
          : `加载 ${fileName} 失败`,
      );
      return false;
    }
  };

  const initThree = () => {
    if (threeRendererRef.current || !canvasRef.current || !modalWindowRef.current) return;
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: false, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(modalWindowRef.current.clientWidth, modalWindowRef.current.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    const camera = new THREE.PerspectiveCamera(
      60,
      modalWindowRef.current.clientWidth / modalWindowRef.current.clientHeight,
      0.01,
      1000,
    );
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sparkRenderer = new SparkRenderer({ renderer });
    scene.add(sparkRenderer);

    threeRendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    sparkRendererRef.current = sparkRenderer;
    applyOrbit();
  };

  const startLoop = () => {
    const renderer = threeRendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera || animationRunningRef.current) return;
    animationRunningRef.current = true;

    renderer.setAnimationLoop((time) => {
      const hovered = getHoveredOrb();
      setHoveredOrbInfo(hovered ? hovered.userData.data : null);

      orbGroupsRef.current.forEach((g) => {
        g.userData.hovered = hovered === g;
        const pulse = 1 + Math.sin(time * 0.0018 + g.userData.phase) * 0.06;
        const targetScale = (g.userData.hovered ? 1.55 : 1) * pulse;
        const targetGlow = g.userData.hovered ? 0.5 : 0.22;
        const targetEmissive = g.userData.hovered ? 4 : 2;
        g.scale.setScalar(g.scale.x + (targetScale - g.scale.x) * 0.14);
        g.userData.glowMat.opacity += (targetGlow - g.userData.glowMat.opacity) * 0.14;
        g.userData.coreMat.emissiveIntensity += (targetEmissive - g.userData.coreMat.emissiveIntensity) * 0.14;
      });

      renderer.render(scene, camera);
    });
  };

  const stopLoop = () => {
    if (!threeRendererRef.current) return;
    threeRendererRef.current.setAnimationLoop(null);
    animationRunningRef.current = false;
  };

  useEffect(() => {
    void preloadScansSequentially();
  }, []);

  useEffect(() => {
    const onResize = () => {
      const renderer = threeRendererRef.current;
      const camera = cameraRef.current;
      const win = modalWindowRef.current;
      if (!renderer || !camera || !win) return;
      renderer.setSize(win.clientWidth, win.clientHeight);
      camera.aspect = win.clientWidth / win.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!activeScan) {
      stopLoop();
      setHoveredOrbInfo(null);
      setScanLoadState("idle");
      setScanLoadError(null);
      setLoadProgress(0);
      return;
    }
    initThree();
    requestAnimationFrame(() => {
      const renderer = threeRendererRef.current;
      const camera = cameraRef.current;
      const win = modalWindowRef.current;
      if (!renderer || !camera || !win) return;
      renderer.setSize(win.clientWidth, win.clientHeight);
      camera.aspect = win.clientWidth / win.clientHeight;
      camera.updateProjectionMatrix();
    });
    void loadScan(activeScan).then((ok) => {
      if (activeScanRef.current?.id === activeScan.id && ok) startLoop();
    });
  }, [activeScan]);

  useEffect(() => {
    return () => {
      stopLoop();
      if (currentSplatRef.current && sceneRef.current) {
        sceneRef.current.remove(currentSplatRef.current);
      }
      currentSplatRef.current = null;
      orbGroupsRef.current.forEach((g) => g.removeFromParent());
      threeRendererRef.current?.dispose();
      disposeAllSplats();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      orbitRef.current.dragging = true;
      orbitRef.current.prevX = e.clientX;
      orbitRef.current.prevY = e.clientY;
      orbitRef.current.dragDist = 0;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = ((e.clientY - rect.top) / rect.height) * -2 + 1;
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.prevX;
      const dy = e.clientY - orbitRef.current.prevY;
      orbitRef.current.dragDist += Math.abs(dx) + Math.abs(dy);
      orbitRef.current.theta -= dx * 0.006;
      orbitRef.current.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbitRef.current.phi + dy * 0.006));
      orbitRef.current.prevX = e.clientX;
      orbitRef.current.prevY = e.clientY;
      applyOrbit();
    };

    const onMouseUp = () => {
      const wasClick = orbitRef.current.dragDist < 5;
      orbitRef.current.dragging = false;
      orbitRef.current.dragDist = 0;
      if (!wasClick || !activeScanRef.current) return;
      const hit = getHoveredOrb();
      if (!hit) return;
      const key = `${activeScanRef.current.id}-${hit.userData.data.id}`;
      setZSeed((prevZ) => {
        const nextZ = prevZ + 1;
        setPopups((prev) => {
          const existing = prev.find((p) => p.key === key);
          if (existing) {
            return prev.map((p) => (p.key === key ? { ...p, zIndex: nextZ } : p));
          }
          return [
            ...prev,
            {
              key,
              orb: hit.userData.data,
              scanTitle: activeScanRef.current?.title ?? "Scan",
              left: 40 + Math.random() * Math.max(0, window.innerWidth - 420),
              top: 50 + Math.random() * Math.max(0, window.innerHeight - 380),
              zIndex: nextZ,
            },
          ];
        });
        return nextZ;
      });
    };

    const onMouseLeave = () => {
      orbitRef.current.dragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // 按当前距离比例缩放，适配任意尺度的扫描，避免大模型一滚就跳进内部
      const factor = Math.exp(e.deltaY * 0.0015);
      orbitRef.current.radius = Math.max(0.5, Math.min(400, orbitRef.current.radius * factor));
      applyOrbit();
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const active = dragRef.current;
      setPopups((prev) =>
        prev.map((popup) =>
          popup.key === active.key
            ? {
                ...popup,
                left: active.baseX + e.clientX - active.startX,
                top: active.baseY + e.clientY - active.startY,
              }
            : popup,
        ),
      );
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <section id="traces" className="relative w-full bg-[#050505] min-h-screen overflow-hidden border-t border-white/5 font-serif">
      <div className="relative h-[84vh] md:h-[88vh] w-full">
        <img src={mapImage} alt="Changfeng Park map" className="absolute inset-0 h-full w-full object-cover grayscale-[55%]" />
        <div className="absolute inset-0 bg-black/20" />

        {SCAN_CONFIGS.map((scan) => (
          <div
            key={scan.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: scan.mapLeft, top: scan.mapTop }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMarker((prev) => (prev === scan.id ? null : scan.id));
              }}
              className="relative h-8 w-8 rounded-full border-2 border-white bg-black/75 shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
              aria-label={scan.title}
            >
              <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-white" />
              <span className="absolute inset-0 rounded-full border border-white/70 animate-ping" />
            </button>

            <div className="absolute left-1/2 -translate-x-1/2 -top-9 px-2 py-1 font-mono text-[10px] tracking-widest uppercase bg-black/75 border border-white/30 whitespace-nowrap">
              {scan.title}
            </div>

            {activeMarker === scan.id && (
              <div className="absolute left-1/2 -translate-x-1/2 top-11 w-56 bg-[#0f0f0f] border border-white/15 shadow-xl p-4 z-30">
                <p className="font-sans text-sm font-medium tracking-tight">{scan.title}</p>
                <p className="font-serif text-[10px] tracking-wide text-white/60 mt-2 leading-relaxed">{scan.description}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMarker(null);
                    setActiveScan(scan);
                  }}
                  className="mt-3 w-full border border-white/30 py-2 font-mono text-[10px] tracking-widest uppercase hover:bg-white hover:text-black transition-colors"
                >
                  Open Scan
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        className={`fixed inset-0 z-[2100] flex items-center justify-center transition-opacity duration-200 ${
          activeScan ? "opacity-100 pointer-events-auto bg-black/70" : "opacity-0 pointer-events-none bg-black/0"
        }`}
        onClick={(e) => {
          if (activeScan && e.target === e.currentTarget) setActiveScan(null);
        }}
      >
        <div ref={modalWindowRef} className="relative w-[86vw] h-[78vh] bg-black shadow-2xl overflow-hidden">
          <canvas ref={canvasRef} className="h-full w-full block" />

          <div className="absolute top-0 left-0 right-0 h-12 px-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
            <div>
              <p className="font-sans font-medium text-white/85 text-sm tracking-tight">Gaussian Splat Viewer</p>
              <p className="font-mono text-[9px] tracking-widest uppercase text-white/45">{activeScan?.title ?? "No scan selected"}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveScan(null)}
              className="border border-white/30 px-3 py-1 font-mono text-[10px] tracking-widest uppercase text-white/80 hover:text-white hover:border-white/60"
            >
              Close
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-11 px-4 flex items-center bg-gradient-to-t from-black/70 to-transparent font-mono text-[10px] tracking-wide text-white/40">
            Drag to orbit · Scroll to zoom · Click glowing points
          </div>

          {activeScan && scanLoadState === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
              <p className="font-mono text-[11px] tracking-widest uppercase text-white/70">
                {loadPhase === "download"
                  ? `正在下载扫描… ${loadProgress}%`
                  : "正在解析点云…"}
              </p>
              <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full bg-white/80 ${loadPhase === "parse" ? "animate-pulse" : "transition-[width] duration-200"}`}
                  style={{ width: loadPhase === "parse" ? "100%" : `${Math.max(loadProgress, 4)}%` }}
                />
              </div>
              <p className="mt-3 font-mono text-[9px] tracking-wide text-white/40">
                {loadPhase === "download"
                  ? "首次加载约 300MB，请耐心等待"
                  : "解析 300MB 点云需要一些时间，请稍候"}
              </p>
            </div>
          )}

          {activeScan && scanLoadState === "error" && scanLoadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-8">
              <div className="max-w-lg text-center">
                <p className="font-sans font-medium text-lg text-white/90 tracking-tight">无法显示 3D 扫描</p>
                <pre className="mt-4 text-left font-serif text-[10px] leading-relaxed text-white/55 whitespace-pre-wrap tracking-wide">
                  {scanLoadError}
                </pre>
              </div>
            </div>
          )}

          {activeScan && hoveredOrbInfo && scanLoadState === "ready" && (
            <div className="absolute right-0 top-0 h-full w-56 border-l border-white/10 bg-black/80 backdrop-blur-md p-5">
              <p className="font-mono text-[9px] tracking-widest uppercase text-white/35">Interactable</p>
              <p className="mt-3 font-sans font-medium text-lg text-white/90 tracking-tight">{hoveredOrbInfo.title}</p>
              <p className="mt-3 font-serif text-[10px] leading-relaxed tracking-wide text-white/50">{hoveredOrbInfo.description}</p>
              <p className="mt-6 font-mono text-[9px] tracking-widest uppercase text-white/30">
                Click to open {hoveredOrbInfo.type}
              </p>
            </div>
          )}
        </div>
      </div>

      {popups.map((popup) => (
        <div
          key={popup.key}
          className="fixed w-[340px] max-h-[420px] bg-[#0f0f0f] border border-white/15 shadow-2xl overflow-hidden z-[3000]"
          style={{ left: popup.left, top: popup.top, zIndex: popup.zIndex }}
          onMouseDown={() =>
            setZSeed((prev) => {
              const nextZ = prev + 1;
              setPopups((old) => old.map((p) => (p.key === popup.key ? { ...p, zIndex: nextZ } : p)));
              return nextZ;
            })
          }
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-move"
            onMouseDown={(e) => {
              dragRef.current = {
                key: popup.key,
                startX: e.clientX,
                startY: e.clientY,
                baseX: popup.left,
                baseY: popup.top,
              };
            }}
          >
            <div className="min-w-0">
              <p className="font-mono text-[8px] tracking-widest uppercase text-white/30 truncate">{popup.scanTitle}</p>
              <p className="font-sans text-[10px] font-medium tracking-tight text-white/60 truncate">{popup.orb.title}</p>
            </div>
            <button
              type="button"
              className="text-white/50 hover:text-white"
              onClick={() => setPopups((prev) => prev.filter((p) => p.key !== popup.key))}
            >
              ×
            </button>
          </div>
          <div className="p-4">
            {popup.orb.type === "image" && <img src={popup.orb.src} alt={popup.orb.title} className="w-full h-auto" />}
            {popup.orb.type === "video" && <video src={popup.orb.src} controls autoPlay className="w-full h-auto" />}
            {popup.orb.type === "audio" && (
              <>
                <p className="font-serif text-[10px] text-white/60 mb-3 tracking-wide">{popup.orb.title}</p>
                <audio src={popup.orb.src} controls className="w-full" />
              </>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
