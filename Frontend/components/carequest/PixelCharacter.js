"use client";

const palettes = {
  guide: { skin: "#d6a98d", hair: "#596a64", body: "#78958a", accent: "#d8b47f", dark: "#34443f" },
  walker: { skin: "#d5a98f", hair: "#675d73", body: "#8a82a0", accent: "#c89582", dark: "#433f4d" },
  nurse: { skin: "#d8ad94", hair: "#4f625c", body: "#dcebe5", accent: "#6f9084", dark: "#374843" },
  doctor: { skin: "#cfa58a", hair: "#535b62", body: "#e9efec", accent: "#728b83", dark: "#384641" },
  guardian: { skin: "#c7a58f", hair: "#5b5d70", body: "#dcd8e7", accent: "#817996", dark: "#414053" },
};

const moods = {
  idle: "pixel-idle",
  celebrate: "pixel-celebrate",
  alert: "pixel-alert",
  wave: "pixel-wave",
  guide: "pixel-idle",
};

export default function PixelCharacter({
  variant = "guide",
  mood = "idle",
  size = 96,
  speech = "",
  className = "",
}) {
  const p = palettes[variant] || palettes.guide;
  const motion = moods[mood] || moods.idle;

  return (
    <div className={"inline-flex items-center gap-3 " + className}>
      <div className={"pixel-stage pixel-shadow " + motion} aria-hidden="true">
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          role="img"
          aria-label={variant + " pixel character"}
          shapeRendering="crispEdges"
        >
          <rect x="9" y="2" width="6" height="1" fill={p.hair} />
          <rect x="7" y="3" width="10" height="2" fill={p.hair} />
          <rect x="6" y="5" width="12" height="5" fill={p.skin} />
          <rect x="6" y="5" width="2" height="3" fill={p.hair} />
          <rect x="16" y="5" width="2" height="3" fill={p.hair} />
          <rect x="9" y="7" width="1" height="1" fill={p.dark} />
          <rect x="14" y="7" width="1" height="1" fill={p.dark} />
          <rect x="11" y="9" width="3" height="1" fill={p.accent} />
          <rect x="8" y="11" width="8" height="6" fill={p.body} />
          <rect x="6" y="12" width="2" height="5" fill={p.skin} />
          <rect x="16" y="12" width="2" height="5" fill={p.skin} />
          <rect x="9" y="17" width="3" height="4" fill={p.dark} />
          <rect x="13" y="17" width="3" height="4" fill={p.dark} />
          <rect x="8" y="21" width="4" height="1" fill={p.dark} />
          <rect x="13" y="21" width="4" height="1" fill={p.dark} />
          {variant === "nurse" ? (
            <>
              <rect x="10" y="3" width="4" height="1" fill="#ffffff" />
              <rect x="11" y="2" width="2" height="3" fill="#ffffff" />
              <rect x="11" y="12" width="2" height="3" fill={p.accent} />
            </>
          ) : null}
          {variant === "doctor" ? (
            <>
              <rect x="9" y="12" width="2" height="5" fill="#ffffff" />
              <rect x="14" y="12" width="2" height="5" fill="#ffffff" />
              <rect x="11" y="13" width="3" height="1" fill={p.accent} />
            </>
          ) : null}
          {variant === "walker" ? (
            <>
              <rect x="18" y="10" width="1" height="6" fill={p.accent} />
              <rect x="19" y="9" width="2" height="2" fill={p.accent} />
            </>
          ) : null}
          {variant === "guardian" ? (
            <>
              <rect x="5" y="11" width="2" height="6" fill={p.accent} />
              <rect x="17" y="11" width="2" height="6" fill={p.accent} />
              <rect x="9" y="12" width="6" height="1" fill="#ffffff" />
            </>
          ) : null}
        </svg>
      </div>
      {speech ? (
        <div className="cq-pixel-label max-w-[220px] normal-case leading-5">
          {speech}
        </div>
      ) : null}
    </div>
  );
}
