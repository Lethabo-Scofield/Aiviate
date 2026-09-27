import { useId } from "react";

/**
 * Silk — the curved light-catching bands from the Aiviate design
 * reference. Renders a non-interactive SVG that fills its nearest
 * positioned ancestor.
 *
 *   <div className="apple-card silk-host">
 *     <Silk variant="a" weight="card" />
 *     <div className="silk-content">…</div>
 *   </div>
 *
 * variant  "a" | "b" | "c"   which fold arrangement to draw
 * weight   "panel" | "card" | "subtle"   how strongly it reads
 * drift    boolean            slow ambient movement (default true)
 *
 * IDs are generated per instance with useId, so multiple Silks on
 * one page never collide over their gradient defs. This matters —
 * duplicate SVG gradient ids silently make every instance after
 * the first inherit the wrong colours.
 */
export default function Silk({ variant = "a", weight = "panel", drift = true }) {
  const uid = useId().replace(/:/g, "");
  const g = (n) => `${uid}-${n}`;

  // Each band is an edge curve. The fill hangs off the bottom of
  // that curve and fades out; the stroke rides exactly on it.
  const bands = BANDS[variant] ?? BANDS.a;

  return (
    <svg
      className={[
        "silk",
        weight === "card" ? "silk-card" : weight === "subtle" ? "silk-subtle" : "silk-panel",
        drift ? "silk-drift" : "",
      ].filter(Boolean).join(" ")}
      viewBox="0 0 900 1200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {bands.map((b, i) => (
          <linearGradient
            key={`s${i}`}
            id={g(`sheen${i}`)}
            gradientUnits="userSpaceOnUse"
            x1={b.x1} y1="0" x2={b.x2} y2="0"
          >
            <stop offset="0" stopColor={b.c[0]} stopOpacity="0" />
            <stop offset="0.2" stopColor={b.c[0]} stopOpacity={b.o} />
            <stop offset="0.45" stopColor={b.c[1]} stopOpacity={b.o} />
            <stop offset="0.72" stopColor={b.c[2]} stopOpacity={b.o * 0.95} />
            <stop offset="1" stopColor={b.c[2]} stopOpacity="0" />
          </linearGradient>
        ))}

        {bands.map((b, i) => (
          <linearGradient
            key={`f${i}`}
            id={g(`fold${i}`)}
            gradientUnits="userSpaceOnUse"
            x1="0" y1={b.y} x2="0" y2={b.y + 240}
          >
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.012" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        ))}

        {/* The bloom. Generous vertical bounds or the blur clips. */}
        <filter id={g("bloom")} x="-25%" y="-400%" width="150%" height="900%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={g("bloomTight")} x="-25%" y="-400%" width="150%" height="900%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {bands.map((b, i) => (
        <g key={i} className={b.tight ? "silk-tight" : undefined}>
          {/* Fold body — the soft tonal shift that reads as fabric */}
          <path d={`${b.d} L940,1260 L-40,1260 Z`} fill={`url(#${g(`fold${i}`)})`} />
          {/* Bloom pass, then the crisp line on top of it */}
          <path
            d={b.d}
            fill="none"
            stroke={`url(#${g(`sheen${i}`)})`}
            strokeWidth="5"
            filter={`url(#${g("bloom")})`}
            opacity="0.55"
          />
          <path
            d={b.d}
            fill="none"
            stroke={`url(#${g(`sheen${i}`)})`}
            strokeWidth="1.1"
            filter={`url(#${g("bloomTight")})`}
          />
        </g>
      ))}
    </svg>
  );
}

const BLUE = "#5B7CFA";
const IRIS = "#A46BF5";
const ROSE = "#FF8A6B";
const GOLD = "#FFC46B";

/* Bands run edge to edge with gentle, wide radii. Keep the control
   points shallow — steep curves stop reading as draped fabric and
   start reading as a chart. */
const BANDS = {
  a: [
    { d: "M-40,150 C170,80 340,235 560,200 C740,172 850,105 940,140",
      y: 150, x1: -40, x2: 940, c: [BLUE, IRIS, ROSE], o: 0.5 },
    { d: "M-40,430 C140,375 300,510 520,470 C730,432 860,350 940,395",
      y: 430, x1: -40, x2: 940, c: [BLUE, IRIS, ROSE], o: 0.34, tight: true },
    { d: "M-40,790 C180,700 420,880 640,820 C790,779 880,720 940,745",
      y: 790, x1: -40, x2: 940, c: [IRIS, ROSE, GOLD], o: 0.42 },
    { d: "M-40,1035 C200,960 400,1105 620,1060 C780,1027 880,985 940,1005",
      y: 1035, x1: -40, x2: 940, c: [ROSE, GOLD, GOLD], o: 0.3, tight: true },
  ],
  b: [
    { d: "M-40,205 C200,130 380,280 600,235 C760,203 870,140 940,175",
      y: 205, x1: 940, x2: -40, c: [GOLD, ROSE, BLUE], o: 0.45 },
    { d: "M-40,520 C160,455 360,600 580,548 C760,505 870,440 940,480",
      y: 520, x1: 940, x2: -40, c: [ROSE, IRIS, BLUE], o: 0.32, tight: true },
    { d: "M-40,860 C210,770 430,940 650,880 C800,839 885,790 940,815",
      y: 860, x1: -40, x2: 940, c: [BLUE, IRIS, ROSE], o: 0.4 },
  ],
  c: [
    { d: "M-40,120 C190,55 360,190 580,155 C750,128 860,75 940,105",
      y: 120, x1: -40, x2: 940, c: [BLUE, BLUE, IRIS], o: 0.4 },
    { d: "M-40,930 C200,845 420,1010 640,955 C790,918 880,865 940,890",
      y: 930, x1: -40, x2: 940, c: [IRIS, ROSE, GOLD], o: 0.38 },
  ],
};