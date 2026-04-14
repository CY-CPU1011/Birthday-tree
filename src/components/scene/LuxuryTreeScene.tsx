import {
  Suspense,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import { buildTreeLayout } from "../../lib/treeLayout";
import type {
  HandMotionData,
  OrnamentSeed,
  TreeLayoutData,
  TreeState,
  UploadedPhotoAsset,
} from "../../types/tree";

const FOLIAGE_VERTEX_SHADER = `
  uniform float uProgress;
  uniform float uTime;

  attribute vec3 aChaosPosition;
  attribute float aSize;
  attribute float aTintMix;
  attribute float aTwinkle;

  varying float vTintMix;
  varying float vPulse;
  varying float vHeight;

  void main() {
    vec3 current = mix(aChaosPosition, position, uProgress);
    float swirl = (1.0 - uProgress) * 0.35;
    float formed = smoothstep(0.48, 1.0, uProgress);
    current.x += sin(uTime * 0.6 + aTwinkle + current.y * 0.24) * swirl;
    current.z += cos(uTime * 0.45 + aTwinkle + current.y * 0.24) * swirl;

    vec4 mvPosition = modelViewMatrix * vec4(current, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float pulse = 0.9 + 0.35 * sin(uTime * 2.4 + aTwinkle);
    gl_PointSize = aSize * (280.0 / -mvPosition.z) * mix(pulse, pulse * 0.12, formed);

    vTintMix = aTintMix;
    vPulse = 0.55 + 0.45 * sin(uTime * 2.2 + aTwinkle);
    vHeight = smoothstep(-4.4, 6.4, current.y);
  }
`;

const FOLIAGE_FRAGMENT_SHADER = `
  uniform float uProgress;

  varying float vTintMix;
  varying float vPulse;
  varying float vHeight;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float formed = smoothstep(0.48, 1.0, uProgress);
    float alpha = smoothstep(0.52, 0.02, dist);

    vec3 deepEmerald = vec3(0.03, 0.21, 0.12);
    vec3 richEmerald = vec3(0.08, 0.45, 0.27);
    vec3 gold = vec3(1.0, 0.84, 0.49);

    vec3 base = mix(deepEmerald, richEmerald, vHeight);
    vec3 color = mix(base, gold, vTintMix * vPulse * 0.42);
    float halo = smoothstep(0.56, 0.0, dist) * (0.014 + vTintMix * 0.05) * mix(1.0, 0.08, formed);

    gl_FragColor = vec4(color + halo, alpha * mix(0.28 + vTintMix * 0.06, 0.004, formed));
  }
`;

interface LuxuryTreeSceneProps {
  treeState: TreeState;
  trackingRef: React.MutableRefObject<HandMotionData>;
  uploadedPhotos: UploadedPhotoAsset[];
}

interface OrnamentClusterProps {
  seeds: OrnamentSeed[];
  progressRef: React.MutableRefObject<number>;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  wobble: number;
}

export const LuxuryTreeScene = memo(function LuxuryTreeScene({
  treeState,
  trackingRef,
  uploadedPhotos,
}: LuxuryTreeSceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 4.15, 29.6], fov: 30, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        alpha: true,
        toneMappingExposure: 1.02,
      }}
    >
      <Suspense fallback={null}>
        <LuxurySceneContent
          treeState={treeState}
          trackingRef={trackingRef}
          uploadedPhotos={uploadedPhotos}
        />
      </Suspense>
    </Canvas>
  );
});

function LuxurySceneContent({
  treeState,
  trackingRef,
  uploadedPhotos,
}: LuxuryTreeSceneProps) {
  const progressRef = useRef(1);
  const layout = useMemo(() => buildTreeLayout(), []);

  useFrame((_, delta) => {
    const target = treeState === "FORMED" ? 1 : 0;
    progressRef.current = THREE.MathUtils.damp(
      progressRef.current,
      target,
      treeState === "FORMED" ? 4.1 : 2.55,
      delta,
    );
  }, -2);

  return (
    <>
      <CameraRig treeState={treeState} trackingRef={trackingRef} />

      <ambientLight color="#d8e2d7" intensity={0.24} />
      <hemisphereLight
        color="#dce5d6"
        groundColor="#03120d"
        intensity={0.56}
      />
      <directionalLight
        position={[-7, 10, 6]}
        color="#f6db9f"
        intensity={0.84}
      />
      <spotLight
        position={[6, 16, 10]}
        angle={0.5}
        penumbra={0.95}
        intensity={52}
        color="#ffd078"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[0, 8, 6]} color="#ffe8af" intensity={7.2} />

      <Environment preset="lobby" blur={0.86} />

      <group position={[0, 0.15, 0]}>
        <GrandPedestal />
        <LuxuryTreeBody
          layout={layout}
          progressRef={progressRef}
          trackingRef={trackingRef}
          uploadedPhotos={uploadedPhotos}
        />
      </group>

      <EffectComposer multisampling={4}>
        <Bloom
          mipmapBlur
          luminanceThreshold={0.92}
          intensity={0.7}
          radius={0.44}
        />
      </EffectComposer>
    </>
  );
}

function CameraRig({
  treeState,
  trackingRef,
}: {
  treeState: TreeState;
  trackingRef: React.MutableRefObject<HandMotionData>;
}) {
  const { camera } = useThree();
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const orbitAngleRef = useRef(-0.34);
  const orbitVelocityRef = useRef(0.528);

  useFrame(({ clock }, delta) => {
    const handProximity = trackingRef.current.handProximity;
    const chaosMix = treeState === "CHAOS" ? 1 : 0;
    const orbitRadius = THREE.MathUtils.lerp(26.6, 28.2, chaosMix);
    const baseVelocity = 0.528;
    const gestureVelocity = THREE.MathUtils.lerp(0.12, 0.44, handProximity);
    const desiredVelocity = treeState === "CHAOS" ? gestureVelocity : baseVelocity;

    orbitVelocityRef.current = THREE.MathUtils.damp(
      orbitVelocityRef.current,
      desiredVelocity,
      treeState === "CHAOS" ? 4.8 : 2.8,
      delta,
    );
    orbitAngleRef.current += orbitVelocityRef.current * delta;

    const lift =
      THREE.MathUtils.lerp(3.72, 4.08, chaosMix) +
      Math.cos(clock.elapsedTime * 0.18) * THREE.MathUtils.lerp(0.08, 0.16, chaosMix);

    cameraTarget.set(
      Math.sin(orbitAngleRef.current) * orbitRadius,
      lift,
      Math.cos(orbitAngleRef.current) * orbitRadius,
    );
    camera.position.lerp(cameraTarget, 1 - Math.exp(-delta * 3.4));

    lookTarget.set(0, THREE.MathUtils.lerp(1.46, 1.68, chaosMix), 0);
    camera.lookAt(lookTarget);
  }, -1);

  return null;
}

function GrandPedestal() {
  return (
    <group position={[0, -5.2, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[5.2, 5.8, 0.85, 64]} />
        <meshPhysicalMaterial
          color="#113526"
          roughness={0.36}
          metalness={0.42}
          clearcoat={0.58}
          reflectivity={0.9}
        />
      </mesh>
      <mesh position={[0, 0.38, 0]} receiveShadow>
        <cylinderGeometry args={[4.35, 4.75, 0.16, 64]} />
        <meshPhysicalMaterial
          color="#efc86f"
          roughness={0.2}
          metalness={1}
          clearcoat={0.6}
        />
      </mesh>
      <mesh position={[0, -0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.5, 64]} />
        <meshStandardMaterial color="#082216" roughness={1} />
      </mesh>
      <PedestalPartyDecorations />
    </group>
  );
}

function PedestalPartyDecorations() {
  const decorations = useMemo(
    () => [
      { kind: "cake", angle: -2.62, radius: 3.38, scale: 0.94, rotation: 0.22 },
      { kind: "gift", angle: -1.78, radius: 3.02, scale: 0.82, rotation: -0.3 },
      { kind: "bear", angle: -0.96, radius: 3.24, scale: 0.88, rotation: 0.14 },
      { kind: "balloons", angle: -0.18, radius: 3.56, scale: 0.92, rotation: -0.08 },
      { kind: "gift", angle: 0.72, radius: 3.08, scale: 0.9, rotation: 0.3 },
      { kind: "cake", angle: 1.58, radius: 3.42, scale: 0.78, rotation: -0.18 },
      { kind: "bear", angle: 2.38, radius: 3.1, scale: 0.8, rotation: 0.26 },
      { kind: "balloons", angle: 3.02, radius: 3.62, scale: 0.86, rotation: -0.22 },
    ],
    [],
  );

  return (
    <group position={[0, 0.48, 0]}>
      {decorations.map((item, index) => {
        const x = Math.sin(item.angle) * item.radius;
        const z = Math.cos(item.angle) * item.radius;
        return (
          <group
            key={`${item.kind}-${item.angle}`}
            position={[x, 0, z]}
            rotation={[0, item.angle + Math.PI + item.rotation, 0]}
            scale={[item.scale, item.scale, item.scale]}
          >
            {item.kind === "cake" ? <PartyCake seed={index} /> : null}
            {item.kind === "gift" ? <PartyGift seed={index} /> : null}
            {item.kind === "bear" ? <PartyBear seed={index} /> : null}
            {item.kind === "balloons" ? <PartyBalloons seed={index} /> : null}
          </group>
        );
      })}
    </group>
  );
}

function PartyCake({ seed }: { seed: number }) {
  return (
    <group position={[0, 0.04, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.56, 0.62, 0.26, 28]} />
        <meshStandardMaterial color="#f2d4fb" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.4, 0.46, 0.22, 28]} />
        <meshStandardMaterial color="#ffd4a8" roughness={0.56} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.48, 0.52, 0.08, 28]} />
        <meshStandardMaterial color="#fff0f7" roughness={0.3} />
      </mesh>
      {[-0.18, 0, 0.18].map((x, index) => (
        <group key={`${x}`} position={[x, 0.56, index % 2 === 0 ? 0.04 : -0.04]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.24, 10]} />
            <meshStandardMaterial color={["#ff7d87", "#72b7ff", "#ffd35a"][index]} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshBasicMaterial color="#ffd97d" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 7 }, (_, index) => {
        const angle = (index / 7) * Math.PI * 2 + seed * 0.17;
        return (
          <mesh key={`${angle}`} position={[Math.sin(angle) * 0.36, 0.32, Math.cos(angle) * 0.36]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={["#ff8ea4", "#ffd666", "#7ed79e", "#82bcff"][index % 4]} roughness={0.38} />
          </mesh>
        );
      })}
    </group>
  );
}

function PartyGift({ seed }: { seed: number }) {
  const colors = [
    ["#ff9bb2", "#f7f0d2"],
    ["#8ec5ff", "#fff3b0"],
    ["#97e0a1", "#f8c767"],
    ["#ffcf8a", "#f49fb4"],
  ] as const;
  const [boxColor, ribbonColor] = colors[seed % colors.length];

  return (
    <group position={[0, 0.28, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.68, 0.56, 0.68]} />
        <meshPhysicalMaterial color={boxColor} roughness={0.48} metalness={0.12} clearcoat={0.24} />
      </mesh>
      <mesh position={[0, 0.01, 0.01]}>
        <boxGeometry args={[0.11, 0.58, 0.72]} />
        <meshStandardMaterial color={ribbonColor} roughness={0.36} />
      </mesh>
      <mesh position={[0.01, 0.01, 0]}>
        <boxGeometry args={[0.72, 0.58, 0.11]} />
        <meshStandardMaterial color={ribbonColor} roughness={0.36} />
      </mesh>
      <mesh position={[0, 0.38, 0]} rotation={[0, 0, Math.PI / 5]}>
        <torusGeometry args={[0.12, 0.04, 10, 24, Math.PI]} />
        <meshStandardMaterial color={ribbonColor} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.38, 0]} rotation={[0, Math.PI / 2, -Math.PI / 5]}>
        <torusGeometry args={[0.12, 0.04, 10, 24, Math.PI]} />
        <meshStandardMaterial color={ribbonColor} roughness={0.32} />
      </mesh>
    </group>
  );
}

function PartyBear({ seed }: { seed: number }) {
  const shirtColors = ["#9cb7ff", "#f5a3bf", "#ffd26f", "#8fdcb0"];
  return (
    <group position={[0, 0.36, 0]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.34, 20, 18]} />
        <meshStandardMaterial color="#d9b691" roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.24, 20, 18]} />
        <meshStandardMaterial color="#dfbea0" roughness={0.78} />
      </mesh>
      {[-0.16, 0.16].map((x) => (
        <mesh key={`${x}`} position={[x, 0.62, -0.02]} castShadow receiveShadow>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#dfbea0" roughness={0.8} />
        </mesh>
      ))}
      {[-0.18, 0.18].map((x) => (
        <mesh key={`arm-${x}`} position={[x, 0.24, 0.02]} castShadow receiveShadow>
          <sphereGeometry args={[0.11, 14, 14]} />
          <meshStandardMaterial color="#dfbea0" roughness={0.8} />
        </mesh>
      ))}
      {[-0.11, 0.11].map((x) => (
        <mesh key={`leg-${x}`} position={[x, -0.02, 0.06]} castShadow receiveShadow>
          <sphereGeometry args={[0.12, 14, 14]} />
          <meshStandardMaterial color="#d8b492" roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 0.18, 0.12]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 0.26, 0.24]} />
        <meshStandardMaterial color={shirtColors[seed % shirtColors.length]} roughness={0.54} />
      </mesh>
    </group>
  );
}

function PartyBalloons({ seed }: { seed: number }) {
  const colors = ["#ff8ca2", "#ffd66a", "#7fc1ff", "#8de0a1"];
  return (
    <group position={[0, 0.18, 0]}>
      {[
        [-0.18, 1.24, 0],
        [0.16, 1.38, 0.08],
        [0, 1.6, -0.1],
      ].map((entry, index) => (
        <group key={`${entry[0]}-${entry[1]}`}>
          <mesh position={[entry[0], entry[1], entry[2]]} castShadow receiveShadow>
            <sphereGeometry args={[0.18, 18, 18]} />
            <meshPhysicalMaterial
              color={colors[(seed + index) % colors.length]}
              roughness={0.18}
              metalness={0.08}
              clearcoat={0.72}
            />
          </mesh>
          <mesh position={[entry[0], entry[1] - 0.48, entry[2]]} rotation={[0.12, 0, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.98, 6]} />
            <meshStandardMaterial color="#f7edd8" roughness={0.92} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.16, 18]} />
        <meshStandardMaterial color="#f7f0d8" roughness={0.72} />
      </mesh>
    </group>
  );
}

function getTreeSurfaceRadius(y: number) {
  const top = 5.95;
  const bottom = -4.25;
  const normalized = THREE.MathUtils.clamp((top - y) / (top - bottom), 0, 1);
  return 0.62 + normalized * 4.18;
}

function getTreeSurfacePosition(
  y: number,
  angle: number,
  inset = 0.2,
): [number, number, number] {
  const radius = Math.max(getTreeSurfaceRadius(y) - inset, 0.26);
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function TreeSilhouette({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const layerRefs = useRef<THREE.Mesh[]>([]);
  const targetScale = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const canopyLayers = useMemo(
    () => [
      { y: 5.7, radius: 0.68, height: 1.18, color: "#163f2b" },
      { y: 4.82, radius: 1.02, height: 1.42, color: "#143b28" },
      { y: 3.7, radius: 1.46, height: 1.82, color: "#123824" },
      { y: 2.34, radius: 1.92, height: 2.18, color: "#113521" },
      { y: 0.78, radius: 2.42, height: 2.46, color: "#0f311e" },
      { y: -1.06, radius: 2.96, height: 2.76, color: "#0d2c1b" },
      { y: -3.15, radius: 3.56, height: 3.04, color: "#0b2617" },
    ],
    [],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    targetScale.setScalar(0.05 + progressRef.current * 0.95);
    groupRef.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 4.2));
    targetPosition.set(0, THREE.MathUtils.lerp(0.8, 0, progressRef.current), 0);
    groupRef.current.position.lerp(targetPosition, 1 - Math.exp(-delta * 3.6));

    layerRefs.current.forEach((mesh, index) => {
      const sway = Math.sin(performance.now() * 0.00028 + index * 0.7) * 0.02;
      mesh.rotation.z = sway * (1 - progressRef.current * 0.4);
    });
  });

  return (
    <group ref={groupRef}>
      {canopyLayers.map((layer, index) => (
        <mesh
          key={`${layer.y}-${layer.radius}`}
          ref={(instance) => {
            if (instance) {
              layerRefs.current[index] = instance;
            }
          }}
          position={[0, layer.y, 0]}
          castShadow
          receiveShadow
        >
          <coneGeometry args={[layer.radius, layer.height, 36, 8, false]} />
          <meshStandardMaterial
            color={layer.color}
            roughness={0.94}
            metalness={0.02}
            emissive="#09170f"
            emissiveIntensity={0.08}
            transparent
            opacity={0.32}
          />
        </mesh>
      ))}
    </group>
  );
}

function BirthdayDecorations({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  return (
    <group>
      <BirthdayBow progressRef={progressRef} />
      <BirthdayLetterRows progressRef={progressRef} />
      <BirthdayPennants progressRef={progressRef} />
      <BirthdayPlaques progressRef={progressRef} />
      <BirthdayCakeAccent progressRef={progressRef} />
    </group>
  );
}

function LuxuryTreeBody({
  layout,
  progressRef,
  trackingRef,
  uploadedPhotos,
}: {
  layout: TreeLayoutData;
  progressRef: React.MutableRefObject<number>;
  trackingRef: React.MutableRefObject<HandMotionData>;
  uploadedPhotos: UploadedPhotoAsset[];
}) {
  return (
    <group>
      <TreeSilhouette progressRef={progressRef} />
      <FoliagePoints layout={layout} progressRef={progressRef} />
      <LuxuriousLights layout={layout} progressRef={progressRef} />
      <GiftBoxes layout={layout} progressRef={progressRef} />
      <Baubles layout={layout} progressRef={progressRef} />
      <PolaroidOrnaments
        layout={layout}
        progressRef={progressRef}
        trackingRef={trackingRef}
        uploadedPhotos={uploadedPhotos}
      />
      <group position={[0, 0.04, 0.26]} scale={[0.92, 0.92, 0.92]}>
        <BirthdayDecorations progressRef={progressRef} />
      </group>
      <Topper progressRef={progressRef} />
      <Trunk />
    </group>
  );
}

function FoliagePoints({
  layout,
  progressRef,
}: {
  layout: TreeLayoutData;
  progressRef: React.MutableRefObject<number>;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(layout.foliage.targetPositions, 3),
    );
    nextGeometry.setAttribute(
      "aChaosPosition",
      new THREE.Float32BufferAttribute(layout.foliage.chaosPositions, 3),
    );
    nextGeometry.setAttribute(
      "aSize",
      new THREE.Float32BufferAttribute(layout.foliage.sizes, 1),
    );
    nextGeometry.setAttribute(
      "aTintMix",
      new THREE.Float32BufferAttribute(layout.foliage.tintMix, 1),
    );
    nextGeometry.setAttribute(
      "aTwinkle",
      new THREE.Float32BufferAttribute(layout.foliage.twinkle, 1),
    );
    return nextGeometry;
  }, [layout]);

  useFrame(({ clock }) => {
    if (!materialRef.current) {
      return;
    }

    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
    materialRef.current.uniforms.uProgress.value = progressRef.current;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
        vertexShader={FOLIAGE_VERTEX_SHADER}
        fragmentShader={FOLIAGE_FRAGMENT_SHADER}
        uniforms={{
          uProgress: { value: 1 },
          uTime: { value: 0 },
        }}
      />
    </points>
  );
}

function GiftBoxes({
  layout,
  progressRef,
}: {
  layout: TreeLayoutData;
  progressRef: React.MutableRefObject<number>;
}) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#d7c28e",
        roughness: 0.18,
        metalness: 0.45,
        clearcoat: 0.88,
        clearcoatRoughness: 0.16,
        reflectivity: 1,
      }),
    [],
  );

  return (
    <OrnamentCluster
      seeds={layout.gifts}
      progressRef={progressRef}
      geometry={geometry}
      material={material}
      wobble={0.18}
    />
  );
}

function Baubles({
  layout,
  progressRef,
}: {
  layout: TreeLayoutData;
  progressRef: React.MutableRefObject<number>;
}) {
  const geometry = useMemo(() => new THREE.SphereGeometry(0.68, 20, 20), []);
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#edd28f",
        roughness: 0.06,
        metalness: 0.42,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transmission: 0.03,
      }),
    [],
  );

  return (
    <OrnamentCluster
      seeds={layout.baubles}
      progressRef={progressRef}
      geometry={geometry}
      material={material}
      wobble={0.36}
    />
  );
}

function LuxuriousLights({
  layout,
  progressRef,
}: {
  layout: TreeLayoutData;
  progressRef: React.MutableRefObject<number>;
}) {
  const geometry = useMemo(() => new THREE.SphereGeometry(0.1, 12, 12), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fff4cf",
        emissive: "#fff0b3",
        emissiveIntensity: 1.18,
        roughness: 0.24,
        metalness: 0.04,
        toneMapped: false,
      }),
    [],
  );

  return (
    <OrnamentCluster
      seeds={layout.lights}
      progressRef={progressRef}
      geometry={geometry}
      material={material}
      wobble={0.5}
    />
  );
}

function PolaroidOrnaments({
  layout,
  progressRef,
  trackingRef,
  uploadedPhotos,
}: {
  layout: TreeLayoutData;
  progressRef: React.MutableRefObject<number>;
  trackingRef: React.MutableRefObject<HandMotionData>;
  uploadedPhotos: UploadedPhotoAsset[];
}) {
  const { camera } = useThree();
  const interactiveCount = uploadedPhotos.length;
  const textures = useMemo(
    () => createPolaroidTextures(layout.polaroids.length, uploadedPhotos),
    [layout.polaroids.length, uploadedPhotos],
  );
  const selectedIndexRef = useRef<number | null>(null);
  const positions = useRef(
    layout.polaroids.map((seed) => new THREE.Vector3(...seed.chaosPosition)),
  );
  const rotations = useRef(
    layout.polaroids.map((seed) => new THREE.Euler(...seed.chaosRotation)),
  );
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempChaos = useMemo(() => new THREE.Vector3(), []);
  const tempTarget = useMemo(() => new THREE.Vector3(), []);
  const targetRotation = useMemo(() => new THREE.Euler(), []);
  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const focusTarget = useMemo(() => new THREE.Vector3(), []);
  const focusPlanePoint = useMemo(() => new THREE.Vector3(), []);
  const focusRayDirection = useMemo(() => new THREE.Vector3(), []);
  const focusQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const targetScale = useMemo(() => new THREE.Vector3(), []);
  const baseScales = useMemo(
    () => layout.polaroids.map((seed) => new THREE.Vector3(...seed.scale)),
    [layout.polaroids],
  );
  const photoRefs = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    return () => {
      textures.forEach((texture) => texture.dispose());
    };
  }, [textures]);

  useEffect(() => {
    if (
      selectedIndexRef.current !== null &&
      selectedIndexRef.current >= interactiveCount
    ) {
      selectedIndexRef.current = null;
    }
  }, [interactiveCount]);

  useFrame(({ clock }, delta) => {
    const { focusPoint, pinching } = trackingRef.current;
    let candidateIndex: number | null = null;
    let nearestDistance = 0.5;

    if (pinching && focusPoint && interactiveCount > 0) {
      pointerNdc.set(
        THREE.MathUtils.lerp(1, -1, focusPoint.x),
        THREE.MathUtils.lerp(1, -1, focusPoint.y),
      );

      if (selectedIndexRef.current !== null) {
        projected.copy(positions.current[selectedIndexRef.current]).project(camera);
        const stickyDistance = Math.hypot(
          projected.x - pointerNdc.x,
          projected.y - pointerNdc.y,
        );

        if (stickyDistance < 0.72) {
          candidateIndex = selectedIndexRef.current;
          nearestDistance = Math.max(stickyDistance - 0.06, 0.08);
        }
      }

      for (let index = 0; index < interactiveCount; index += 1) {
        projected.copy(positions.current[index]).project(camera);
        const distance = Math.hypot(
          projected.x - pointerNdc.x,
          projected.y - pointerNdc.y,
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          candidateIndex = index;
        }
      }
    }

    if (!pinching) {
      selectedIndexRef.current = null;
    } else if (candidateIndex !== null) {
      selectedIndexRef.current = candidateIndex;
    }

    layout.polaroids.forEach((seed, index) => {
      tempChaos.set(...seed.chaosPosition);
      tempTarget.set(...seed.targetPosition);
      tempPosition.lerpVectors(tempChaos, tempTarget, progressRef.current);

      const position = positions.current[index];
      position.lerp(
        tempPosition,
        1 - Math.exp(-delta * (2.35 + seed.weight * 1.45)),
      );

      const rotation = rotations.current[index];
      targetRotation.set(
        THREE.MathUtils.lerp(
          seed.chaosRotation[0],
          seed.targetRotation[0],
          progressRef.current,
        ),
        THREE.MathUtils.lerp(
          seed.chaosRotation[1],
          seed.targetRotation[1],
          progressRef.current,
        ) + Math.sin(clock.elapsedTime * 0.45 + index) * 0.04,
        THREE.MathUtils.lerp(
          seed.chaosRotation[2],
          seed.targetRotation[2],
          progressRef.current,
        ) + Math.cos(clock.elapsedTime * 0.35 + index) * 0.03,
      );

      rotation.x = THREE.MathUtils.damp(rotation.x, targetRotation.x, 4.2, delta);
      rotation.y = THREE.MathUtils.damp(rotation.y, targetRotation.y, 4.2, delta);
      rotation.z = THREE.MathUtils.damp(rotation.z, targetRotation.z, 4.2, delta);

      const mesh = photoRefs.current[index];
      if (!mesh) {
        return;
      }

      if (selectedIndexRef.current === index) {
        const focusDepth = 8.8;
        focusPlanePoint.set(pointerNdc.x, pointerNdc.y, 0.18).unproject(camera);
        focusRayDirection
          .copy(focusPlanePoint)
          .sub(camera.position)
          .normalize();
        focusTarget.copy(camera.position).add(
          focusRayDirection.multiplyScalar(focusDepth),
        );
        position.lerp(focusTarget, 1 - Math.exp(-delta * 6.8));
        mesh.position.copy(position);

        focusQuaternion.copy(camera.quaternion);
        mesh.quaternion.slerp(
          focusQuaternion,
          1 - Math.exp(-delta * 7.4),
        );

        targetScale.copy(baseScales[index]).multiplyScalar(2.95);
      } else {
        mesh.position.copy(position);
        mesh.rotation.copy(rotation);
        targetScale.copy(baseScales[index]);
      }

      mesh.scale.lerp(targetScale, 1 - Math.exp(-delta * 7.6));
    });
  });

  return (
    <group>
      {layout.polaroids.map((seed, index) => (
        <mesh
          key={seed.id}
          ref={(instance) => {
            if (instance) {
              photoRefs.current[index] = instance;
            }
          }}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            map={textures[index]}
            emissiveMap={textures[index]}
            emissive="#ffffff"
            emissiveIntensity={0.14}
            roughness={0.82}
            metalness={0.02}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Topper({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => createStarTopperTexture(), []);
  const chaosPosition = useMemo(() => new THREE.Vector3(0, 11, -8), []);
  const targetPosition = useMemo(() => new THREE.Vector3(0, 6.82, 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current || !haloRef.current) {
      return;
    }

    target.lerpVectors(chaosPosition, targetPosition, progressRef.current);
    meshRef.current.position.lerp(target, 1 - Math.exp(-delta * 3.8));
    haloRef.current.position.copy(meshRef.current.position);
    meshRef.current.rotation.y += delta * (0.25 + (1 - progressRef.current) * 0.8);
    haloRef.current.rotation.y = -clock.elapsedTime * 0.35;
    haloRef.current.scale.setScalar(1.2 + Math.sin(clock.elapsedTime * 2.4) * 0.08);
  });

  return (
    <group>
      <mesh ref={meshRef} castShadow>
        <planeGeometry args={[2.42, 2.42]} />
        <meshBasicMaterial
          map={texture}
          transparent
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={haloRef}>
        <ringGeometry args={[0.82, 1.06, 48]} />
        <meshBasicMaterial color="#ffd674" toneMapped={false} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Trunk() {
  return (
    <group position={[0, -3.55, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.82, 1.2, 2.45, 16]} />
        <meshStandardMaterial color="#5e3119" roughness={0.88} metalness={0.08} />
      </mesh>
    </group>
  );
}

function BirthdayBow({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);
  const ribbonMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#9a0f2d",
        roughness: 0.48,
        metalness: 0.18,
        clearcoat: 0.62,
        sheen: 0.78,
        sheenColor: "#e94870",
      }),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) {
      return;
    }

    targetScale.setScalar(0.14 + progressRef.current * 0.86);
    groupRef.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 5.6));
    groupRef.current.position.y = 4.3 + Math.sin(clock.elapsedTime * 1.3) * 0.04;
  });

  return (
    <group ref={groupRef} position={[0, 4.3, 2.45]} rotation={[0.04, 0, 0]}>
      <mesh material={ribbonMaterial} position={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.36, 20, 20]} />
      </mesh>
      <mesh material={ribbonMaterial} position={[-0.82, 0.05, 0]} rotation={[0, 0, 0.62]} castShadow>
        <sphereGeometry args={[0.64, 28, 18]} />
      </mesh>
      <mesh material={ribbonMaterial} position={[0.82, 0.05, 0]} rotation={[0, 0, -0.62]} castShadow>
        <sphereGeometry args={[0.64, 28, 18]} />
      </mesh>
      <mesh material={ribbonMaterial} position={[-0.28, -1.02, 0.04]} rotation={[0, 0, 0.1]} castShadow>
        <boxGeometry args={[0.42, 1.95, 0.14]} />
      </mesh>
      <mesh material={ribbonMaterial} position={[0.34, -1.08, 0.04]} rotation={[0, 0, -0.12]} castShadow>
        <boxGeometry args={[0.42, 1.95, 0.14]} />
      </mesh>
    </group>
  );
}

function BirthdayLetterRows({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const textures = useMemo(
    () => [
      ...createLetterTextures("HAPPY", ["#ffd64b", "#f54f64", "#3ca9ff", "#53cd83", "#f29f3f"]),
      ...createLetterTextures("BDAY", ["#f6a53e", "#ef5b4f", "#4d9bff", "#4bc78c"]),
      ...createLetterTextures("WISH", ["#ff84bb", "#ffd56a", "#6ab4ff", "#7ee29b"]),
    ],
    [],
  );
  const letters = useMemo(
    () => [
      { row: 0, text: "WISH", y: 3.18, spread: 0.92, scale: 0.74, inset: 0.66 },
      { row: 1, text: "HAPPY", y: 1.52, spread: 1.18, scale: 0.9, inset: 0.76 },
      { row: 2, text: "BDAY", y: -1.48, spread: 1.3, scale: 1.02, inset: 0.84 },
    ],
    [],
  );

  useEffect(() => {
    return () => {
      textures.forEach((texture) => texture.dispose());
    };
  }, [textures]);

  let textureCursor = 0;

  return (
    <group>
      {letters.map((row) => {
        const center = (row.text.length - 1) / 2;
        return row.text.split("").map((letter, letterIndex) => {
          const texture = textures[textureCursor];
          const textureIndex = textureCursor;
          textureCursor += 1;
          const angle = THREE.MathUtils.lerp(
            -row.spread / 2,
            row.spread / 2,
            row.text.length === 1 ? 0.5 : letterIndex / (row.text.length - 1),
          );
          const y =
            row.y - Math.abs(letterIndex - center) * 0.09;
          const position = getTreeSurfacePosition(y, angle, row.inset);
          return (
            <BirthdayLetter
              key={`${row.row}-${letter}-${letterIndex}`}
              texture={texture}
              progressRef={progressRef}
              position={position}
              rotation={[0.08, angle * 0.9, (letterIndex - center) * 0.04]}
              scale={row.scale}
              textureIndex={textureIndex}
            />
          );
        });
      })}
    </group>
  );
}

function BirthdayLetter({
  texture,
  progressRef,
  position,
  rotation,
  scale,
  textureIndex,
}: {
  texture: THREE.Texture;
  progressRef: React.MutableRefObject<number>;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  textureIndex: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) {
      return;
    }

    targetScale.setScalar(scale * (0.18 + progressRef.current * 0.82));
    meshRef.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 5.2));
    meshRef.current.position.z =
      position[2] + Math.sin(clock.elapsedTime * 0.8 + textureIndex) * 0.04;
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      renderOrder={4}
    >
      <planeGeometry args={[1, 1.12]} />
      <meshBasicMaterial
        map={texture}
        transparent
        toneMapped={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

function BirthdayPennants({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const pennantGeometry = useMemo(() => createPennantGeometry(), []);
  const rows = useMemo(
    () => [
      { y: 2.42, spread: 0.96, count: 5, inset: 0.9 },
      { y: 0.72, spread: 1.28, count: 7, inset: 1.02 },
      { y: -1.22, spread: 1.44, count: 7, inset: 1.12 },
      { y: -3.02, spread: 1.62, count: 8, inset: 1.2 },
    ],
    [],
  );
  const colors = ["#ff7d87", "#ffd07f", "#8ecf78", "#5ea5ff", "#f85db1", "#f7b7d6"];

  return (
    <group>
      {rows.map((row, rowIndex) =>
        Array.from({ length: row.count }, (_, index) => {
          const angle = THREE.MathUtils.lerp(
            -row.spread / 2,
            row.spread / 2,
            row.count === 1 ? 0.5 : index / (row.count - 1),
          );
          const position = getTreeSurfacePosition(
            row.y + Math.sin(index * 0.9 + rowIndex) * 0.06,
            angle,
            row.inset,
          );
          return (
            <BirthdayPennant
              key={`${rowIndex}-${index}`}
              geometry={pennantGeometry}
              color={colors[(rowIndex + index) % colors.length]}
              position={position}
              rotation={[0.14, angle * 0.95, (index - row.count / 2) * 0.05]}
              progressRef={progressRef}
              indexSeed={rowIndex * 10 + index}
            />
          );
        }),
      )}
    </group>
  );
}

function BirthdayPennant({
  geometry,
  color,
  position,
  rotation,
  progressRef,
  indexSeed,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  progressRef: React.MutableRefObject<number>;
  indexSeed: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) {
      return;
    }

    targetScale.setScalar(0.18 + progressRef.current * 0.82);
    meshRef.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 4.8));
    meshRef.current.rotation.z =
      rotation[2] + Math.sin(clock.elapsedTime * 1.35 + indexSeed) * 0.05;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={color} roughness={0.76} metalness={0.04} side={THREE.FrontSide} />
    </mesh>
  );
}

function BirthdayPlaques({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const textures = useMemo(
    () => createPlaqueTextures(["MAKE A WISH", "PARTY TIME", "BIRTHDAY STAR", "CELEBRATE", "PHOTO TIME", "HAPPY DAY"]),
    [],
  );
  const configs = useMemo(
    () => [
      { y: 3.08, angle: -0.46, inset: 0.96, rotation: [0.05, -0.4, 0.14] as [number, number, number], scale: 1.06 },
      { y: 3.46, angle: 0.44, inset: 0.98, rotation: [0.04, 0.42, -0.1] as [number, number, number], scale: 1.08 },
      { y: 0.38, angle: 0.02, inset: 1.06, rotation: [0.06, 0.02, 0.04] as [number, number, number], scale: 0.98 },
      { y: -1.68, angle: -0.38, inset: 1.08, rotation: [0.04, -0.34, 0.12] as [number, number, number], scale: 1.04 },
      { y: -2.42, angle: 0.46, inset: 1.14, rotation: [0.04, 0.4, -0.08] as [number, number, number], scale: 1.02 },
      { y: -3.12, angle: 0.06, inset: 1.22, rotation: [0.04, 0.06, 0.06] as [number, number, number], scale: 1.1 },
    ],
    [],
  );

  useEffect(() => {
    return () => {
      textures.forEach((texture) => texture.dispose());
    };
  }, [textures]);

  return (
    <group>
      {configs.map((config, index) => (
        <BirthdayPlaque
          key={`${config.y}-${config.angle}`}
          texture={textures[index]}
          progressRef={progressRef}
          position={getTreeSurfacePosition(config.y, config.angle, config.inset)}
          rotation={config.rotation}
          scale={config.scale}
          indexSeed={index}
        />
      ))}
    </group>
  );
}

function BirthdayPlaque({
  texture,
  progressRef,
  position,
  rotation,
  scale,
  indexSeed,
}: {
  texture: THREE.Texture;
  progressRef: React.MutableRefObject<number>;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  indexSeed: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) {
      return;
    }

    targetScale.setScalar(scale * (0.2 + progressRef.current * 0.8));
    meshRef.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 4.6));
    meshRef.current.rotation.z =
      rotation[2] + Math.sin(clock.elapsedTime * 0.9 + indexSeed) * 0.025;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation} renderOrder={4}>
      <planeGeometry args={[1.7, 1.05]} />
      <meshBasicMaterial
        map={texture}
        transparent
        toneMapped={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

function BirthdayCakeAccent({
  progressRef,
}: {
  progressRef: React.MutableRefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetScale = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) {
      return;
    }

    targetScale.setScalar(0.15 + progressRef.current * 0.85);
    groupRef.current.scale.lerp(targetScale, 1 - Math.exp(-delta * 4.8));
    groupRef.current.position.y = -4.15 + Math.sin(clock.elapsedTime * 0.8) * 0.03;
  });

  return (
    <group ref={groupRef} position={[0.3, -4.15, 3.2]}>
      <mesh castShadow>
        <cylinderGeometry args={[1.1, 1.18, 0.68, 32]} />
        <meshPhysicalMaterial color="#5f2dbd" roughness={0.36} metalness={0.16} clearcoat={0.42} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[1.18, 1.24, 0.18, 32]} />
        <meshStandardMaterial color="#f4d5fb" roughness={0.68} />
      </mesh>
      {[-0.58, -0.2, 0.18, 0.56].map((x, index) => (
        <group key={`${x}`} position={[x, 0.64, index % 2 === 0 ? 0.08 : -0.08]}>
          <mesh>
            <cylinderGeometry args={[0.06, 0.06, 0.58, 12]} />
            <meshStandardMaterial color={["#ffcf4d", "#ff6b7f", "#72b7ff", "#7ed79e"][index]} roughness={0.48} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <sphereGeometry args={[0.08, 10, 10]} />
            <meshBasicMaterial color="#ffd97d" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function OrnamentCluster({
  seeds,
  progressRef,
  geometry,
  material,
  wobble,
}: OrnamentClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useRef(
    seeds.map((seed) => new THREE.Vector3(...seed.chaosPosition)),
  );
  const scales = useMemo(
    () => seeds.map((seed) => new THREE.Vector3(...seed.scale)),
    [seeds],
  );
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempChaos = useMemo(() => new THREE.Vector3(), []);
  const tempTarget = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    seeds.forEach((seed, index) => {
      meshRef.current?.setColorAt(index, new THREE.Color(seed.color));
    });

    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seeds]);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current) {
      return;
    }

    seeds.forEach((seed, index) => {
      tempChaos.set(...seed.chaosPosition);
      tempTarget.set(...seed.targetPosition);
      tempPosition.lerpVectors(tempChaos, tempTarget, progressRef.current);

      const position = positions.current[index];
      position.lerp(
        tempPosition,
        1 - Math.exp(-delta * (2.05 + seed.weight * 1.55)),
      );

      const spinChaos = (1 - progressRef.current) * seed.spin;
      dummy.position.copy(position);
      dummy.rotation.set(
        THREE.MathUtils.lerp(
          seed.chaosRotation[0],
          seed.targetRotation[0],
          progressRef.current,
        ) + Math.sin(clock.elapsedTime * 0.7 + index) * wobble * 0.1,
        THREE.MathUtils.lerp(
          seed.chaosRotation[1],
          seed.targetRotation[1],
          progressRef.current,
        ) +
          spinChaos +
          clock.elapsedTime * 0.06 * seed.weight,
        THREE.MathUtils.lerp(
          seed.chaosRotation[2],
          seed.targetRotation[2],
          progressRef.current,
        ) + Math.cos(clock.elapsedTime * 0.55 + index) * wobble * 0.08,
      );
      dummy.scale.copy(scales[index]);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, seeds.length]}
      castShadow
      receiveShadow
    />
  );
}

function createPennantGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.54);
  shape.lineTo(-0.42, -0.54);
  shape.lineTo(0.42, -0.54);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createLetterTextures(text: string, colors: string[]) {
  return text.split("").map((letter, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");

    if (!context) {
      return new THREE.Texture();
    }

    context.clearRect(0, 0, 256, 256);
    context.fillStyle = "rgba(0, 0, 0, 0.16)";
    context.font = "900 168px Manrope";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(letter, 135, 148);

    context.fillStyle = colors[index % colors.length];
    context.fillText(letter, 128, 138);

    context.strokeStyle = "#fff6d8";
    context.lineWidth = 14;
    context.strokeText(letter, 128, 138);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

function createPlaqueTextures(labels: string[]) {
  return labels.map((label, index) => {
    const palettes = [
      ["#ffe8f5", "#ef5f8b", "#6a3658"],
      ["#eef7ff", "#5b8ef7", "#314870"],
      ["#fff3dd", "#e6a141", "#6f4e20"],
    ];
    const [background, accent, textColor] = palettes[index % palettes.length];
    const canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 260;
    const context = canvas.getContext("2d");

    if (!context) {
      return new THREE.Texture();
    }

    context.clearRect(0, 0, 420, 260);
    context.fillStyle = background;
    roundRect(context, 18, 26, 384, 206, 48);
    context.fill();

    context.lineWidth = 12;
    context.strokeStyle = accent;
    context.stroke();

    context.fillStyle = accent;
    context.beginPath();
    context.arc(70, 78, 16, 0, Math.PI * 2);
    context.arc(350, 78, 16, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = textColor;
    context.font = "900 54px Manrope";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 210, 136);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

function createStarTopperTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.Texture();
  }

  const points = createStarPoints(256, 256, 212, 88);
  context.clearRect(0, 0, 512, 512);
  context.strokeStyle = "#fff1ae";
  context.lineWidth = 10;
  context.shadowColor = "rgba(255, 221, 131, 0.55)";
  context.shadowBlur = 14;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.stroke();

  context.lineWidth = 4;
  for (let index = 0; index < points.length; index += 2) {
    const point = points[index];
    const next = points[(index + 4) % points.length];
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  for (let index = 0; index < 42; index += 1) {
    const point = points[index % points.length];
    const jitterX = Math.sin(index * 2.4) * 16;
    const jitterY = Math.cos(index * 1.7) * 16;
    context.fillStyle = index % 3 === 0 ? "#fffdf1" : "#ffe28a";
    context.beginPath();
    context.arc(point.x + jitterX, point.y + jitterY, index % 4 === 0 ? 4 : 2.6, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStarPoints(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const frameRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let offsetX = x;
  let offsetY = y;

  if (sourceRatio > frameRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    offsetX = x - (drawWidth - width) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    offsetY = y - (drawHeight - height) / 2;
  }

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  context.restore();
}

function drawDefaultPolaroid(
  context: CanvasRenderingContext2D,
  palette: string[],
  caption: string,
) {
  const [base, accent, glow] = palette;
  const gradient = context.createLinearGradient(0, 0, 320, 420);
  gradient.addColorStop(0, base);
  gradient.addColorStop(1, "#05120d");

  context.fillStyle = "#fef5e7";
  context.fillRect(0, 0, 320, 420);
  context.fillStyle = gradient;
  context.fillRect(24, 24, 272, 272);

  context.fillStyle = "rgba(255, 244, 211, 0.16)";
  context.beginPath();
  context.arc(220, 96, 74, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = accent;
  context.lineWidth = 12;
  context.strokeRect(42, 42, 236, 236);

  context.fillStyle = glow;
  context.font = "700 22px Cinzel";
  context.fillText("CHRISTMAS", 34, 338);
  context.fillStyle = "#4a5b54";
  context.font = "600 18px Manrope";
  context.fillText(caption, 34, 368);
  context.fillStyle = accent;
  context.fillRect(34, 384, 152, 7);
}

function drawUploadedPolaroid(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  photoName: string,
) {
  context.fillStyle = "#fdf5e8";
  context.fillRect(0, 0, 320, 420);

  drawCoverImage(context, image, 24, 24, 272, 272);

  context.strokeStyle = "#f1c56d";
  context.lineWidth = 10;
  context.strokeRect(38, 38, 244, 244);

  context.fillStyle = "rgba(255, 241, 204, 0.56)";
  context.fillRect(24, 252, 272, 44);

  context.fillStyle = "#6b5632";
  context.font = "700 22px Cinzel";
  context.fillText("MEMORY", 34, 338);
  context.fillStyle = "#32453d";
  context.font = "600 18px Manrope";
  context.fillText(photoName.toUpperCase().slice(0, 22), 34, 368);
  context.fillStyle = "#e0b95f";
  context.fillRect(34, 384, 184, 7);
}

function createPolaroidTextures(
  count: number,
  uploadedPhotos: UploadedPhotoAsset[],
) {
  const captions = [
    "GALA NIGHT",
    "WINTER FOYER",
    "EMERALD ROOM",
    "GOLD PARADE",
    "CROWN LOBBY",
    "GRAND ENTRANCE",
    "VELVET LIGHT",
    "HOLIDAY SUITE",
  ];
  const palettes = [
    ["#284f3f", "#d7a84f", "#f3e2b3"],
    ["#123426", "#6aa483", "#efc86f"],
    ["#103d32", "#ffe2a5", "#d2ebe0"],
    ["#1b4937", "#b88835", "#fff2ca"],
  ];

  return Array.from({ length: count }, (_, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 420;
    const context = canvas.getContext("2d");

    if (!context) {
      const texture = new THREE.Texture();
      return texture;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const uploadedPhoto = uploadedPhotos[index];

    if (uploadedPhoto) {
      drawDefaultPolaroid(
        context,
        palettes[index % palettes.length],
        "LOADING PHOTO",
      );

      const image = new Image();
      image.onload = () => {
        drawUploadedPolaroid(context, image, uploadedPhoto.name);
        texture.needsUpdate = true;
      };
      image.src = uploadedPhoto.url;
    } else {
      drawDefaultPolaroid(
        context,
        palettes[index % palettes.length],
        captions[index % captions.length],
      );
      texture.needsUpdate = true;
    }

    return texture;
  });
}
