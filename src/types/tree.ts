export type TreeState = "CHAOS" | "FORMED";

export type OrnamentKind = "gift" | "bauble" | "light" | "polaroid";

export type Vec3Tuple = [number, number, number];

export interface OrnamentSeed {
  id: string;
  kind: OrnamentKind;
  chaosPosition: Vec3Tuple;
  targetPosition: Vec3Tuple;
  chaosRotation: Vec3Tuple;
  targetRotation: Vec3Tuple;
  scale: Vec3Tuple;
  color: string;
  accentColor?: string;
  weight: number;
  spin: number;
}

export interface FoliageGeometryData {
  count: number;
  targetPositions: Float32Array;
  chaosPositions: Float32Array;
  sizes: Float32Array;
  tintMix: Float32Array;
  twinkle: Float32Array;
}

export interface TreeLayoutData {
  foliage: FoliageGeometryData;
  gifts: OrnamentSeed[];
  baubles: OrnamentSeed[];
  lights: OrnamentSeed[];
  polaroids: OrnamentSeed[];
}

export interface HandMotionData {
  hasHand: boolean;
  openness: number;
  palm: { x: number; y: number } | null;
  focusPoint: { x: number; y: number } | null;
  pinchDistance: number;
  pinching: boolean;
  handProximity: number;
  treeState: TreeState;
  ready: boolean;
  error: string | null;
}

export interface UploadedPhotoAsset {
  id: string;
  name: string;
  url: string;
}
