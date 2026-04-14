import { useEffect, useRef, useState } from "react";
import { LuxuryTreeScene } from "./scene/LuxuryTreeScene";
import { useHandTracking } from "../hooks/useHandTracking";
import type { TreeState, UploadedPhotoAsset } from "../types/tree";

const MAX_UPLOADS = 52;

export function GrandLuxuryTreeExperience() {
  const tracking = useHandTracking();
  const [treeState, setTreeState] = useState<TreeState>("FORMED");
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhotoAsset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTreeState(tracking.treeState);
  }, [tracking.treeState]);

  useEffect(() => {
    return () => {
      uploadedPhotos.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [uploadedPhotos]);

  const immersiveMode = treeState === "CHAOS";
  const detectionLabel = tracking.error
    ? "Gesture Error"
    : !tracking.ready
      ? "Initializing"
      : tracking.pinching
        ? "PHOTO GRAB"
        : tracking.hasHand
          ? tracking.treeState === "CHAOS"
            ? "UNLEASH"
            : "REFORM"
          : "Awaiting Hand";

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_UPLOADS);

    if (!files.length) {
      return;
    }

    const nextPhotos = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name.replace(/\.[^.]+$/, "").slice(0, 28),
      url: URL.createObjectURL(file),
    }));

    setUploadedPhotos((previous) => {
      previous.forEach((photo) => URL.revokeObjectURL(photo.url));
      return nextPhotos;
    });

    event.target.value = "";
  }

  function handleResetPhotos() {
    setUploadedPhotos((previous) => {
      previous.forEach((photo) => URL.revokeObjectURL(photo.url));
      return [];
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-stone-100">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.34] saturate-[1.08]"
        style={{
          backgroundImage: "url('/backgrounds/birthday-party-reference.png')",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.06),transparent_18%),radial-gradient(circle_at_50%_50%,rgba(255,101,182,0.12),transparent_36%),linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.5)_38%,rgba(0,0,0,0.82)_100%)]" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUploadChange}
      />

      <div className="absolute inset-0 opacity-90">
        <LuxuryTreeScene
          treeState={treeState}
          focusPoint={tracking.focusPoint}
          pinching={tracking.pinching}
          handProximity={tracking.handProximity}
          uploadedPhotos={uploadedPhotos}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(255,233,165,0.16),transparent_24%),radial-gradient(circle_at_12%_18%,rgba(255,91,182,0.12),transparent_22%),radial-gradient(circle_at_86%_12%,rgba(131,90,255,0.12),transparent_18%),radial-gradient(circle_at_50%_100%,rgba(0,0,0,0.22),transparent_42%)]" />

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-end p-4 md:p-8">
        <section className="mt-auto flex w-full items-end justify-between gap-6">
          <div
            className={`max-w-3xl transition-all duration-700 ${
              immersiveMode
                ? "pointer-events-none translate-y-8 opacity-0 blur-sm"
                : "pointer-events-auto translate-y-0 opacity-100 blur-0"
            }`}
          >
            <div className="luxury-panel rounded-[2rem] p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-xl uppercase tracking-[0.18em] text-goldBright">
                  {detectionLabel}
                </p>
                <span className="rounded-full border border-goldAura/25 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-stone-200/70">
                  {treeState}
                </span>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-stone-200/82 md:grid-cols-4">
                <MetricCard
                  label="Tracking"
                  value={tracking.ready ? "Ready" : "Booting"}
                />
                <MetricCard
                  label="Gesture"
                  value={tracking.hasHand ? tracking.treeState : "No hand"}
                />
                <MetricCard
                  label="Grab"
                  value={tracking.pinching ? "Active" : "Idle"}
                />
                <MetricCard
                  label="Photos"
                  value={`${uploadedPhotos.length || 0}/${MAX_UPLOADS}`}
                />
              </div>

              <div className="mt-5">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-300/60 md:text-base">
                  互动规则
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <RuleItem
                    emoji="🖐️"
                    title="张开手"
                    description="进入散开状态，并根据手离镜头的远近调整环绕速度。"
                  />
                  <RuleItem
                    emoji="✊"
                    title="握拳"
                    description="重新聚合成完整的豪华生日树。"
                  />
                  <RuleItem
                    emoji="🤏"
                    title="捏合"
                    description="抓取并放大离手势最近的已上传照片。"
                  />
                  <RuleItem
                    emoji="📷"
                    title="上传照片"
                    description="最多上传 52 张，自定义拍立得内容。"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setTreeState("CHAOS")}
                  className="luxury-panel rounded-full border border-goldAura/30 px-5 py-3 text-xs uppercase tracking-[0.26em] text-goldBright transition hover:border-goldBright/60 hover:bg-white/5"
                >
                  Unleash
                </button>
                <button
                  type="button"
                  onClick={() => setTreeState("FORMED")}
                  className="luxury-panel rounded-full border border-white/10 px-5 py-3 text-xs uppercase tracking-[0.26em] text-stone-100 transition hover:border-goldAura/40 hover:bg-white/5"
                >
                  Re-form
                </button>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="luxury-panel rounded-full border border-goldAura/30 px-5 py-3 text-xs uppercase tracking-[0.26em] text-goldBright transition hover:border-goldBright/60 hover:bg-white/5"
                >
                  Upload Photos
                </button>
                <button
                  type="button"
                  onClick={handleResetPhotos}
                  className="luxury-panel rounded-full border border-white/10 px-5 py-3 text-xs uppercase tracking-[0.26em] text-stone-100 transition hover:border-goldAura/40 hover:bg-white/5"
                >
                  Restore Default
                </button>
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.22em] text-stone-300/58">
                最多上传 52 张照片。重新上传会替换当前拍立得内容。
              </p>

              {tracking.error ? (
                <p className="mt-4 text-sm text-amber-200/90">
                  手势识别初始化失败：{tracking.error}
                </p>
              ) : null}
            </div>
          </div>

          <div
            className={`luxury-panel pointer-events-auto rounded-[2rem] p-3 transition-all duration-700 ${
              immersiveMode
                ? "w-52 md:w-60 shadow-[0_22px_80px_rgba(0,0,0,0.55)]"
                : "w-[250px] md:w-[280px]"
            }`}
          >
            <div className="relative overflow-hidden rounded-[1.4rem] border border-goldAura/15 bg-black/50 shadow-crown">
              <video
                ref={tracking.videoRef}
                muted
                playsInline
                autoPlay
                className="aspect-[4/5] w-full scale-x-[-1] object-cover"
              />
              <div className="pointer-events-none absolute inset-0 border-[10px] border-[#f6ecdd]/90" />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-4">
                <p className="font-display text-lg uppercase tracking-[0.18em] text-goldBright">
                  Live Gesture Feed
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.26em] text-stone-200/70">
                  {tracking.pinching
                    ? "Pinch detected / uploaded photo focus"
                    : immersiveMode
                      ? "Immersive mode / UI hidden"
                      : "Open / close / pinch / move closer to speed up orbit"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/8 bg-black/14 p-4">
      <p className="text-[10px] uppercase tracking-[0.26em] text-stone-300/55">
        {label}
      </p>
      <p className="mt-2 font-display text-lg uppercase tracking-[0.12em] text-goldBright">
        {value}
      </p>
    </div>
  );
}

function RuleItem({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-[1.25rem] border border-white/8 bg-black/14 p-4 md:p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-2xl md:h-12 md:w-12">
        {emoji}
      </div>
      <div className="min-w-0">
        <p className="font-display text-base uppercase tracking-[0.14em] text-goldBright md:text-lg">
          {title}
        </p>
        <p className="mt-1 text-base leading-7 text-stone-300/78 md:text-[1.05rem]">
          {description}
        </p>
      </div>
    </div>
  );
}
