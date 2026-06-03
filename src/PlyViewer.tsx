import React, { useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center, useProgress, Html } from "@react-three/drei";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import * as THREE from "three";

const HOTSPOTS: { id: string; position: [number, number, number] }[] = [
  { id: "1", position: [0.15, 0.35, 0.2] },
];

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-gray-400 font-mono text-sm tracking-wide">{progress.toFixed(0)}% loaded</div>
    </Html>
  );
}

function HotspotMarker({
  id,
  position,
  onSelect,
}: {
  id: string;
  position: [number, number, number];
  onSelect: (id: string) => void;
  key?: string;
}) {
  return (
    <Html position={position} center zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
      <button
        type="button"
        aria-label={`Open trace ${id}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="hotspot-dot pointer-events-auto"
      />
    </Html>
  );
}

function Model({
  url,
  onPointClick,
  showHotspots,
}: {
  url: string;
  onPointClick?: (id: string) => void;
  showHotspots?: boolean;
}) {
  const geometry = useLoader(PLYLoader, url, (loader) => {
    loader.setCustomPropertyNameMapping({
      color_sh: ["f_dc_0", "f_dc_1", "f_dc_2"],
    });
  });

  useMemo(() => {
    geometry.computeBoundingBox();

    if (!geometry.hasAttribute("color") && geometry.hasAttribute("color_sh")) {
      const color_sh = geometry.getAttribute("color_sh");
      const colors = new Float32Array(color_sh.count * 3);
      const SH_C0 = 0.28209479177387814;
      for (let i = 0; i < color_sh.count; i++) {
        colors[i * 3 + 0] = Math.max(0, Math.min(1, 0.5 + SH_C0 * color_sh.getX(i)));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, 0.5 + SH_C0 * color_sh.getY(i)));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, 0.5 + SH_C0 * color_sh.getZ(i)));
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    if (!geometry.hasAttribute("normal") && geometry.index) {
      geometry.computeVertexNormals();
    }
  }, [geometry]);

  const hasColors = geometry.hasAttribute("color");
  const isPoints = geometry.index === null;

  const box = geometry.boundingBox || new THREE.Box3();
  const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const pointSize = size ? size / 250 : 0.05;

  return (
    <Center>
      <group rotation={[Math.PI, 0, 0]}>
        {isPoints ? (
          <points geometry={geometry}>
            <pointsMaterial size={pointSize} vertexColors={hasColors} sizeAttenuation={true} />
          </points>
        ) : (
          <mesh geometry={geometry}>
            <meshBasicMaterial vertexColors={hasColors} side={THREE.DoubleSide} />
          </mesh>
        )}

        {showHotspots &&
          onPointClick &&
          HOTSPOTS.map((spot) => (
            <HotspotMarker key={spot.id} id={spot.id} position={spot.position} onSelect={onPointClick} />
          ))}
      </group>
    </Center>
  );
}

export function PlyViewer({
  url,
  onPointClick,
  hideHotspots,
}: {
  url: string;
  onPointClick?: (id: string) => void;
  hideHotspots?: boolean;
}) {
  return (
    <div className="relative w-full h-full cursor-grab active:cursor-grabbing">
      <style>{`
        @keyframes hotspot-ring {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.35); opacity: 1; }
        }
        @keyframes hotspot-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.35); }
          50% { box-shadow: 0 0 0 10px rgba(0, 0, 0, 0); }
        }
        .hotspot-dot {
          position: relative;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          border: 2px solid #111;
          background: #fff;
          cursor: pointer;
          animation: hotspot-ring 2s ease-in-out infinite, hotspot-glow 2s ease-in-out infinite;
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .hotspot-dot:hover {
          transform: scale(1.4);
          background: #111;
          border-color: #fff;
        }
        .hotspot-dot::after {
          content: "";
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          border: 1px solid rgba(0, 0, 0, 0.25);
          animation: hotspot-ring 2s ease-in-out infinite reverse;
        }
      `}</style>

      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <React.Suspense fallback={<Loader />}>
          <Model url={url} onPointClick={onPointClick} showHotspots={!hideHotspots} />
        </React.Suspense>
        <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} enableDamping />
      </Canvas>
    </div>
  );
}
