import { MathUtils } from "three";
import type { OrnamentSeed, TreeLayoutData, Vec3Tuple } from "../types/tree";

const GOLDS = ["#ffd86b", "#efc15d", "#fff0c9"];
const BAUBLE_COLORS = ["#f2ca57", "#f7edd8", "#e7ba47", "#f4d984", "#c93f33"];
const GIFT_COLORS = ["#f1d39a", "#f8f2de", "#cfa14c", "#b8862b"];
const LIGHT_COLORS = ["#fff7da", "#ffefb6", "#fffdf1"];

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]) {
  return values[Math.floor(rng() * values.length)];
}

function randomSpherePoint(rng: () => number, minRadius: number, maxRadius: number): Vec3Tuple {
  const radius = MathUtils.lerp(minRadius, maxRadius, Math.pow(rng(), 0.82));
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(1 - 2 * rng());
  const sinPhi = Math.sin(phi);
  return [
    Math.cos(theta) * sinPhi * radius,
    Math.cos(phi) * radius * 0.9 + 1.2,
    Math.sin(theta) * sinPhi * radius,
  ];
}

function conePoint(
  rng: () => number,
  options: {
    shellBias?: number;
    heightBias?: number;
    lowerClamp?: number;
    upperClamp?: number;
  } = {},
): Vec3Tuple {
  const {
    shellBias = 0.6,
    heightBias = 0.82,
    lowerClamp = 0,
    upperClamp = 1,
  } = options;
  const heightRatio = MathUtils.clamp(
    lowerClamp + Math.pow(rng(), heightBias) * (upperClamp - lowerClamp),
    0,
    1,
  );
  const y = -4.4 + heightRatio * 10.8;
  const radiusMax = 0.35 + (1 - heightRatio) * 4.8;
  const radius =
    radiusMax *
    MathUtils.clamp(shellBias + (1 - shellBias) * Math.sqrt(rng()), 0.12, 1);
  const angle = rng() * Math.PI * 2;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function outwardRotation(position: Vec3Tuple, tilt: number, twist: number): Vec3Tuple {
  const angle = Math.atan2(position[2], position[0]);
  return [tilt, -angle + Math.PI / 2 + twist, twist * 0.65];
}

function createFoliage(rng: () => number, count: number) {
  const targetPositions = new Float32Array(count * 3);
  const chaosPositions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const tintMix = new Float32Array(count);
  const twinkle = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const target = conePoint(rng, {
      shellBias: MathUtils.lerp(0.12, 0.82, rng()),
      heightBias: MathUtils.lerp(0.72, 1.05, rng()),
    });
    const chaos = randomSpherePoint(rng, 6.8, 12.8);
    const offset = index * 3;

    targetPositions[offset] = target[0];
    targetPositions[offset + 1] = target[1];
    targetPositions[offset + 2] = target[2];

    chaosPositions[offset] = chaos[0];
    chaosPositions[offset + 1] = chaos[1];
    chaosPositions[offset + 2] = chaos[2];

    sizes[index] = MathUtils.lerp(3.6, 10.2, Math.pow(rng(), 1.45));
    tintMix[index] = MathUtils.lerp(0.02, 0.42, Math.pow(rng(), 2.2));
    twinkle[index] = rng() * Math.PI * 2;
  }

  return { count, targetPositions, chaosPositions, sizes, tintMix, twinkle };
}

function createSeed(
  rng: () => number,
  kind: OrnamentSeed["kind"],
  index: number,
  options: {
    targetOptions: Parameters<typeof conePoint>[1];
    colors: readonly string[];
    countOffset?: number;
    weightRange: [number, number];
    scaleRange: [number, number];
    boxy?: boolean;
  },
): OrnamentSeed {
  const target = conePoint(rng, options.targetOptions);
  const chaos = randomSpherePoint(rng, 6.8, 14.8);
  const scaleBase = MathUtils.lerp(
    options.scaleRange[0],
    options.scaleRange[1],
    Math.pow(rng(), 0.85),
  );
  const scale: Vec3Tuple = options.boxy
    ? [
        scaleBase * MathUtils.lerp(0.84, 1.35, rng()),
        scaleBase * MathUtils.lerp(0.84, 1.28, rng()),
        scaleBase * MathUtils.lerp(0.84, 1.35, rng()),
      ]
    : [scaleBase, scaleBase, scaleBase];

  const targetRotation = outwardRotation(
    target,
    MathUtils.lerp(-0.35, 0.42, rng()),
    MathUtils.lerp(-0.4, 0.4, rng()),
  );
  const chaosRotation: Vec3Tuple = [
    rng() * Math.PI * 2,
    rng() * Math.PI * 2,
    rng() * Math.PI * 2,
  ];

  return {
    id: `${kind}-${options.countOffset ?? 0}-${index}`,
    kind,
    chaosPosition: chaos,
    targetPosition: target,
    chaosRotation,
    targetRotation,
    scale,
    color: pick(rng, options.colors),
    accentColor: pick(rng, GOLDS),
    weight: MathUtils.lerp(options.weightRange[0], options.weightRange[1], rng()),
    spin: MathUtils.lerp(0.4, 1.4, rng()),
  };
}

function createGroup(
  rng: () => number,
  kind: OrnamentSeed["kind"],
  count: number,
  options: Parameters<typeof createSeed>[3],
) {
  return Array.from({ length: count }, (_, index) =>
    createSeed(rng, kind, index, options),
  );
}

function createLightSpiralGroup(rng: () => number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const strand = index % 4;
    const strandCount = Math.ceil(count / 4);
    const strandIndex = Math.floor(index / 4);
    const ratio = strandCount <= 1 ? 0 : strandIndex / (strandCount - 1);
    const y = 5.95 - ratio * 10.1;
    const radius = 0.52 + (1 - ratio) * 4.08;
    const angle =
      strand * (Math.PI / 2) +
      ratio * (Math.PI * 5.9) +
      Math.sin(ratio * Math.PI * 6 + strand) * 0.16;
    const target: Vec3Tuple = [
      Math.cos(angle) * radius,
      y + MathUtils.lerp(-0.12, 0.12, rng()),
      Math.sin(angle) * radius,
    ];

    return {
      id: `light-spiral-${index}`,
      kind: "light" as const,
      chaosPosition: randomSpherePoint(rng, 6.8, 14.8),
      targetPosition: target,
      chaosRotation: [
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
        rng() * Math.PI * 2,
      ] as Vec3Tuple,
      targetRotation: outwardRotation(target, 0, 0),
      scale: [
        MathUtils.lerp(0.05, 0.1, rng()),
        MathUtils.lerp(0.05, 0.1, rng()),
        MathUtils.lerp(0.05, 0.1, rng()),
      ] as Vec3Tuple,
      color: pick(rng, LIGHT_COLORS),
      accentColor: pick(rng, GOLDS),
      weight: MathUtils.lerp(1.55, 2.1, rng()),
      spin: MathUtils.lerp(0.4, 1.4, rng()),
    };
  });
}

export function buildTreeLayout(): TreeLayoutData {
  const rng = createRng(1225);

  return {
    foliage: createFoliage(rng, 700),
    gifts: createGroup(rng, "gift", 8, {
      targetOptions: { shellBias: 0.86, heightBias: 0.94, lowerClamp: 0.08, upperClamp: 0.42 },
      colors: GIFT_COLORS,
      weightRange: [0.48, 0.84],
      scaleRange: [0.16, 0.34],
      boxy: true,
    }),
    baubles: createGroup(rng, "bauble", 760, {
      targetOptions: { shellBias: 0.94, heightBias: 0.8, lowerClamp: 0.04, upperClamp: 0.97 },
      colors: BAUBLE_COLORS,
      weightRange: [0.92, 1.34],
      scaleRange: [0.18, 0.76],
    }),
    lights: createLightSpiralGroup(rng, 180),
    polaroids: createGroup(rng, "polaroid", 52, {
      targetOptions: { shellBias: 0.92, heightBias: 0.84, lowerClamp: 0.16, upperClamp: 0.9 },
      colors: ["#fdf6e8"],
      weightRange: [0.72, 1.08],
      scaleRange: [1.08, 1.32],
      boxy: true,
    }).map((seed) => ({
      ...seed,
      scale: [seed.scale[0] * 1.04, seed.scale[1] * 1.24, 0.08] as Vec3Tuple,
    })),
  };
}
