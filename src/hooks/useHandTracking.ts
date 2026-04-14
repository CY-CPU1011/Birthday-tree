import { useEffect, useRef, useState } from "react";
import type { HandMotionData, TreeState } from "../types/tree";

type Landmark = {
  x: number;
  y: number;
  z: number;
};

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const OPEN_THRESHOLD = 1.88;
const CLOSED_THRESHOLD = 1.38;
const PINCH_ACTIVE_THRESHOLD = 0.62;
const PINCH_RELEASE_THRESHOLD = 0.86;
const UI_COMMIT_INTERVAL = 96;
const FOCUS_COMMIT_EPSILON = 0.035;
const PROXIMITY_COMMIT_EPSILON = 0.08;
const OPENNESS_COMMIT_EPSILON = 0.12;
const PINCH_DISTANCE_COMMIT_EPSILON = 0.05;

const INITIAL_HAND_DATA: HandMotionData = {
  hasHand: false,
  openness: 0,
  palm: null,
  focusPoint: null,
  pinchDistance: 1,
  pinching: false,
  handProximity: 0,
  treeState: "FORMED",
  ready: false,
  error: null,
};

function averageLandmark(landmarks: Landmark[], indexes: number[]) {
  return indexes.reduce(
    (accumulator, index) => {
      accumulator.x += landmarks[index].x;
      accumulator.y += landmarks[index].y;
      accumulator.z += landmarks[index].z;
      return accumulator;
    },
    { x: 0, y: 0, z: 0 },
  );
}

function distance(a: Landmark, b: Landmark) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function analyzeLandmarks(landmarks: Landmark[]) {
  const palm = averageLandmark(landmarks, [0, 5, 9, 13, 17]);
  const palmCenter = {
    x: palm.x / 5,
    y: palm.y / 5,
    z: palm.z / 5,
  };
  const palmWidth = Math.max(distance(landmarks[5], landmarks[17]), 0.01);
  const fingertipIndexes = [4, 8, 12, 16, 20];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const openness =
    fingertipIndexes.reduce((total, index) => {
      return total + distance(landmarks[index], palmCenter);
    }, 0) /
    fingertipIndexes.length /
    palmWidth;
  const pinchDistance = distance(thumbTip, indexTip) / palmWidth;

  return {
    openness,
    palmWidth,
    palm: {
      x: palmCenter.x,
      y: palmCenter.y,
    },
    focusPoint: {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
    },
    pinchDistance,
  };
}

async function createHandLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

  try {
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }
}

function formatTrackingError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "手势识别初始化失败。";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("load") ||
    normalized.includes("fetch")
  ) {
    return "摄像头已连接，但手势模型资源加载失败。请检查当前网络是否能访问 storage.googleapis.com，或把 hand_landmarker.task 改为本地静态文件。";
  }

  if (normalized.includes("wasm")) {
    return "摄像头已连接，但 MediaPipe wasm 初始化失败。请刷新页面重试；如果仍失败，再检查浏览器是否拦截了本地 wasm 资源。";
  }

  return message;
}

function shouldCommitUiState(
  previous: HandMotionData,
  next: HandMotionData,
  now: number,
  lastCommitAt: number,
) {
  if (
    previous.ready !== next.ready ||
    previous.error !== next.error ||
    previous.hasHand !== next.hasHand ||
    previous.treeState !== next.treeState ||
    previous.pinching !== next.pinching
  ) {
    return true;
  }

  if (
    Math.abs(previous.handProximity - next.handProximity) >
      PROXIMITY_COMMIT_EPSILON ||
    Math.abs(previous.openness - next.openness) > OPENNESS_COMMIT_EPSILON ||
    Math.abs(previous.pinchDistance - next.pinchDistance) >
      PINCH_DISTANCE_COMMIT_EPSILON
  ) {
    return true;
  }

  if (!previous.focusPoint || !next.focusPoint) {
    if (previous.focusPoint !== next.focusPoint) {
      return true;
    }
  } else if (
    Math.abs(previous.focusPoint.x - next.focusPoint.x) >
      FOCUS_COMMIT_EPSILON ||
    Math.abs(previous.focusPoint.y - next.focusPoint.y) >
      FOCUS_COMMIT_EPSILON
  ) {
    return true;
  }

  return next.hasHand && now - lastCommitAt >= UI_COMMIT_INTERVAL;
}

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const gestureRef = useRef<TreeState>("FORMED");
  const pinchRef = useRef(false);
  const focusRef = useRef<{ x: number; y: number } | null>(null);
  const motionRef = useRef<HandMotionData>(INITIAL_HAND_DATA);
  const uiSnapshotRef = useRef<HandMotionData>(INITIAL_HAND_DATA);
  const lastUiCommitAtRef = useRef(0);
  const [data, setData] = useState<HandMotionData>(INITIAL_HAND_DATA);

  useEffect(() => {
    let mounted = true;
    let animationFrame = 0;
    let stream: MediaStream | null = null;
    let handLandmarker: Awaited<ReturnType<typeof createHandLandmarker>> | null = null;

    const publish = (nextData: HandMotionData, force = false) => {
      motionRef.current = nextData;

      if (!mounted) {
        return;
      }

      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      if (
        force ||
        shouldCommitUiState(
          uiSnapshotRef.current,
          nextData,
          now,
          lastUiCommitAtRef.current,
        )
      ) {
        uiSnapshotRef.current = nextData;
        lastUiCommitAtRef.current = now;
        setData(nextData);
      }
    };

    async function startTracking() {
      if (!navigator.mediaDevices?.getUserMedia) {
        publish(
          {
            ...motionRef.current,
            error: "当前浏览器不支持摄像头访问。",
          },
          true,
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted || !videoRef.current) {
          return;
        }

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        handLandmarker = await createHandLandmarker();

        if (!mounted) {
          return;
        }

        publish(
          {
            ...motionRef.current,
            ready: true,
            error: null,
          },
          true,
        );

        const detect = () => {
          if (!mounted || !handLandmarker || !videoRef.current) {
            return;
          }

          const activeVideo = videoRef.current;
          if (activeVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            animationFrame = window.requestAnimationFrame(detect);
            return;
          }

          const result = handLandmarker.detectForVideo(
            activeVideo,
            performance.now(),
          ) as { landmarks?: Landmark[][] };

          if (!result.landmarks?.length) {
            focusRef.current = null;
            publish({
              ...motionRef.current,
              hasHand: false,
              palm: null,
              focusPoint: null,
              pinching: false,
              handProximity: 0,
              treeState: gestureRef.current,
            });
            animationFrame = window.requestAnimationFrame(detect);
            return;
          }

          const analysis = analyzeLandmarks(result.landmarks[0]);
          const smoothedFocusPoint = focusRef.current
            ? {
                x:
                  focusRef.current.x +
                  (analysis.focusPoint.x - focusRef.current.x) * 0.42,
                y:
                  focusRef.current.y +
                  (analysis.focusPoint.y - focusRef.current.y) * 0.42,
              }
            : analysis.focusPoint;
          let nextState = gestureRef.current;
          let nextPinching = pinchRef.current;

          if (analysis.openness >= OPEN_THRESHOLD) {
            nextState = "CHAOS";
          } else if (analysis.openness <= CLOSED_THRESHOLD) {
            nextState = "FORMED";
          }

          if (analysis.pinchDistance <= PINCH_ACTIVE_THRESHOLD) {
            nextPinching = true;
          } else if (analysis.pinchDistance >= PINCH_RELEASE_THRESHOLD) {
            nextPinching = false;
          }
          const nextHandProximity = THREEClamp(
            (analysis.palmWidth - 0.08) / 0.18,
            0,
            1,
          );
          gestureRef.current = nextState;
          pinchRef.current = nextPinching;
          focusRef.current = smoothedFocusPoint;

          publish({
            hasHand: true,
            openness: analysis.openness,
            palm: analysis.palm,
            focusPoint: smoothedFocusPoint,
            pinchDistance: analysis.pinchDistance,
            pinching: nextPinching,
            handProximity: nextHandProximity,
            treeState: nextState,
            ready: true,
            error: null,
          });

          animationFrame = window.requestAnimationFrame(detect);
        };

        animationFrame = window.requestAnimationFrame(detect);
      } catch (error) {
        publish(
          {
            ...motionRef.current,
            ready: false,
            error: formatTrackingError(error),
          },
          true,
        );
      }
    }

    startTracking();

    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationFrame);
      handLandmarker?.close();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    videoRef,
    motionRef,
    ...data,
  };
}

function THREEClamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
