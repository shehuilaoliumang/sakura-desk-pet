import { useId } from "react";
import type { FormId, PetEvent } from "@shared/types";

type Tone = "soft" | "dark";

export function PetFigure({ form, mood, name }: { form: FormId; mood: PetEvent; name: string }) {
  if (form === "form4" || form === "form5") return <ReservedForm mood={mood} name={name} />;
  if (form === "dark") return <DarkAlone mood={mood} />;
  if (form === "duo") return <Duo mood={mood} />;
  return <SoftAlone mood={mood} />;
}

function SoftAlone({ mood }: { mood: PetEvent }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className={`figure mood-${mood}`} viewBox="0 0 480 640" role="presentation">
      <Defs gid={gid} />
      <ellipse className="shadow" cx="240" cy="590" rx="108" ry="16" />
      <HairSoft cx={240} cy={168} gid={gid} />
      <SoftBody x={240} y={250} gid={gid} withApple />
      <Head cx={240} cy={168} tone="soft" mood={mood} />
      <RedBow x={286} y={132} scale={0.72} />
      <RedBow x={240} y={268} scale={0.9} />
    </svg>
  );
}

function DarkAlone({ mood }: { mood: PetEvent }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className={`figure mood-${mood}`} viewBox="0 0 480 640" role="presentation">
      <Defs gid={gid} />
      <ellipse className="shadow" cx="240" cy="596" rx="120" ry="16" />
      <HairDark cx={232} cy={156} spread={1.15} gid={gid} />
      <DarkDress x={236} y={250} gid={gid} />
      <ShieldHand />
      <Head cx={232} cy={150} tone="dark" mood={mood} />
      <RedBow x={274} y={108} scale={0.78} />
    </svg>
  );
}

function Duo({ mood }: { mood: PetEvent }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className={`figure mood-${mood}`} viewBox="0 0 480 640" role="presentation">
      <Defs gid={gid} />
      <ellipse className="shadow" cx="270" cy="600" rx="150" ry="16" />
      <g className="ribbons back">
        <Ribbon d="M40 540 C 120 500, 180 610, 280 560 C 360 520, 420 600, 470 548" />
        <Ribbon d="M20 580 C 110 540, 200 640, 310 590 C 390 552, 450 620, 490 570" />
      </g>
      <HairDark cx={168} cy={128} spread={1} gid={gid} />
      <DarkDress x={176} y={236} gid={gid} lean />
      <HairSoft cx={304} cy={214} gid={gid} />
      <SoftBody x={304} y={292} gid={gid} withApple={false} />
      <Head cx={304} cy={214} tone="soft" mood={mood} />
      <RedBow x={352} y={176} scale={0.7} />
      <RedBow x={304} y={312} scale={0.86} />
      <g className="apple-group">
        <Apple x={286} y={468} gid={gid} />
        <ellipse cx="258" cy="486" rx="16" ry="11" fill="#f3d4cb" />
        <ellipse cx="316" cy="490" rx="16" ry="11" fill="#f6ddd4" />
      </g>
      <Head cx={168} cy={132} tone="dark" mood={mood} />
      <RedBow x={214} y={86} scale={0.74} />
      <CheekHand />
      <AppleTouch />
      <g className="ribbons front">
        <Ribbon d="M70 560 C 150 520, 230 630, 340 575 C 410 540, 450 610, 500 560" />
      </g>
      <Motes />
    </svg>
  );
}

function ReservedForm({ mood, name }: { mood: PetEvent; name: string }) {
  return (
    <svg className={`figure mood-${mood} reserved`} viewBox="0 0 480 640" role="presentation">
      <rect x="78" y="86" width="324" height="470" rx="28" fill="none" stroke="#c4313c" strokeDasharray="7 8" strokeWidth="2" />
      <text x="240" y="300" textAnchor="middle" fill="#f4efe8" fontSize="28" fontFamily="serif">
        {name}
      </text>
      <text x="240" y="336" textAnchor="middle" fill="#e7c4c0" fontSize="16">
        素材未绑定
      </text>
    </svg>
  );
}

function Defs({ gid }: { gid: string }) {
  return (
    <defs>
      <linearGradient id={`${gid}-hair-s`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#efe8f6" />
        <stop offset="0.45" stopColor="#b79bcf" />
        <stop offset="1" stopColor="#6d5688" />
      </linearGradient>
      <linearGradient id={`${gid}-hair-d`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#e4e0e6" />
        <stop offset="1" stopColor="#b7b1ba" />
      </linearGradient>
      <linearGradient id={`${gid}-dress`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a2228" />
        <stop offset="1" stopColor="#100d12" />
      </linearGradient>
      <radialGradient id={`${gid}-apple`} cx="38%" cy="35%" r="70%">
        <stop offset="0" stopColor="#ff8d86" />
        <stop offset="0.45" stopColor="#e42734" />
        <stop offset="1" stopColor="#8d1020" />
      </radialGradient>
      <linearGradient id={`${gid}-vest`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e4c7a2" />
        <stop offset="1" stopColor="#b48962" />
      </linearGradient>
      <filter id={`${gid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
    </defs>
  );
}

function HairSoft({ cx, cy, gid }: { cx: number; cy: number; gid: string }) {
  return (
    <g className="hair">
      <path
        fill={`url(#${gid}-hair-s)`}
        d={`M ${cx} ${cy - 58}
            C ${cx + 70} ${cy - 70}, ${cx + 86} ${cy + 10}, ${cx + 58} ${cy + 78}
            C ${cx + 46} ${cy + 150}, ${cx + 10} ${cy + 170}, ${cx - 8} ${cy + 120}
            C ${cx - 70} ${cy + 150}, ${cx - 78} ${cy + 40}, ${cx - 62} ${cy - 10}
            C ${cx - 70} ${cy - 70}, ${cx - 20} ${cy - 78}, ${cx} ${cy - 58} Z`}
      />
      <path
        fill="#c7b0dc"
        d={`M ${cx - 48} ${cy - 8}
            Q ${cx} ${cy - 36}, ${cx + 50} ${cy - 6}
            Q ${cx + 18} ${cy + 8}, ${cx} ${cy - 8}
            Q ${cx - 16} ${cy + 6}, ${cx - 48} ${cy - 8} Z`}
      />
    </g>
  );
}

function HairDark({ cx, cy, spread, gid }: { cx: number; cy: number; spread: number; gid: string }) {
  const s = spread;
  return (
    <g className="hair">
      <path
        fill={`url(#${gid}-hair-d)`}
        d={`M ${cx + 10} ${cy - 46}
            C ${cx + 90 * s} ${cy - 120}, ${cx - 150 * s} ${cy - 80}, ${cx - 170 * s} ${cy + 20}
            C ${cx - 190 * s} ${cy + 90}, ${cx - 120 * s} ${cy + 150}, ${cx - 70 * s} ${cy + 110}
            C ${cx - 130 * s} ${cy + 180}, ${cx - 40 * s} ${cy + 230}, ${cx + 10} ${cy + 160}
            C ${cx - 20} ${cy + 80}, ${cx + 30} ${cy + 40}, ${cx + 24} ${cy - 10}
            C ${cx + 70} ${cy - 20}, ${cx + 40} ${cy - 70}, ${cx + 10} ${cy - 46} Z`}
      />
    </g>
  );
}

function Head({ cx, cy, tone, mood }: { cx: number; cy: number; tone: Tone; mood: PetEvent }) {
  const skin = tone === "soft" ? "#f6d7cf" : "#f3d0c8";
  return (
    <g>
      <ellipse cx={cx - 40} cy={cy + 6} rx="10" ry="13" fill={skin} />
      <ellipse cx={cx + 40} cy={cy + 6} rx="10" ry="13" fill={skin} />
      <ellipse cx={cx} cy={cy} rx={tone === "soft" ? 46 : 42} ry={tone === "soft" ? 50 : 46} fill={skin} />
      <ellipse className="blush" cx={cx - 24} cy={cy + 16} rx="9" ry="5" fill="#ef9aa0" />
      <ellipse className="blush" cx={cx + 24} cy={cy + 16} rx="9" ry="5" fill="#ef9aa0" />
      <Brow x={cx - 16} y={cy - 10} mood={mood} tone={tone} side="l" />
      <Brow x={cx + 16} y={cy - 10} mood={mood} tone={tone} side="r" />
      <Eye cx={cx - 15} cy={cy + 2} tone={tone} />
      <Eye cx={cx + 15} cy={cy + 2} tone={tone} />
      <path d={`M ${cx} ${cy + 12} q 1.4 5 -1.2 7`} stroke="#e4b6ad" strokeWidth="1.2" fill="none" />
      <Mouth x={cx} y={cy + 28} mood={mood} tone={tone} />
    </g>
  );
}

function Eye({ cx, cy, tone }: { cx: number; cy: number; tone: Tone }) {
  const iris = tone === "soft" ? "#6d5a86" : "#c4232c";
  return (
    <g className="eye-open">
      <ellipse cx={cx} cy={cy} rx={tone === "soft" ? 7 : 6.2} ry={tone === "soft" ? 9 : 7.4} fill="#f8f3f1" />
      <ellipse className="iris" cx={cx} cy={cy + 0.8} rx={tone === "soft" ? 3.3 : 2.8} ry={tone === "soft" ? 4.2 : 3.6} fill={iris} />
      <ellipse cx={cx - 1.3} cy={cy - 1.6} rx="1.15" ry="1.15" fill="#fff" />
    </g>
  );
}

function Brow({ x, y, mood, tone, side }: { x: number; y: number; mood: PetEvent; tone: Tone; side: "l" | "r" }) {
  const lift = mood === "thinking" ? -3 : mood === "success" ? 1 : 0;
  const tiltBase = mood === "error" ? (tone === "soft" ? 10 : -12) : mood === "working" && tone === "dark" ? -5 : 0;
  const angle = tiltBase * (side === "l" ? -1 : 1);
  return (
    <path
      d={`M ${x - 9} ${y} Q ${x} ${y - 4} ${x + 9} ${y}`}
      transform={`translate(0 ${lift}) rotate(${angle} ${x} ${y})`}
      stroke={tone === "soft" ? "#8a6c74" : "#6d3034"}
      strokeWidth="1.7"
      strokeLinecap="round"
      fill="none"
    />
  );
}

function Mouth({ x, y, mood, tone }: { x: number; y: number; mood: PetEvent; tone: Tone }) {
  const color = tone === "soft" ? "#c45b66" : "#9d3036";
  if (mood === "success") {
    return <path d={`M ${x - 7} ${y} Q ${x} ${y + (tone === "soft" ? 7 : 4.5)} ${x + 7} ${y}`} stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" />;
  }
  if (mood === "error" && tone === "soft") {
    return <path d={`M ${x - 6} ${y + 4} Q ${x} ${y - 1} ${x + 6} ${y + 4}`} stroke={color} strokeWidth="1.7" fill="none" strokeLinecap="round" />;
  }
  if (mood === "error") {
    return <path d={`M ${x - 7} ${y + 1} L ${x + 7} ${y + 1}`} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  }
  if (mood === "thinking") return <ellipse cx={x} cy={y + 1} rx="2.1" ry="2.3" fill={color} />;
  const dip = tone === "soft" ? 3.2 : 1.4;
  return <path d={`M ${x - 5.5} ${y} Q ${x} ${y + dip} ${x + 5.5} ${y}`} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />;
}

function SoftBody({ x, y, gid, withApple }: { x: number; y: number; gid: string; withApple: boolean }) {
  return (
    <g>
      <path d={`M ${x - 34} ${y + 8} Q ${x} ${y + 28} ${x + 34} ${y + 8} L ${x + 46} ${y + 78} L ${x - 46} ${y + 78} Z`} fill="#f7f4ef" />
      <path d={`M ${x - 58} ${y + 24} Q ${x - 78} ${y + 70} ${x - 46} ${y + 92} Q ${x - 30} ${y + 48} ${x - 36} ${y + 20} Z`} fill="#f7f4ef" />
      <path d={`M ${x + 58} ${y + 24} Q ${x + 78} ${y + 70} ${x + 46} ${y + 92} Q ${x + 30} ${y + 48} ${x + 36} ${y + 20} Z`} fill="#f4f0ea" />
      <path d={`M ${x - 40} ${y + 16} L ${x - 52} ${y + 150} L ${x + 52} ${y + 150} L ${x + 40} ${y + 16} Q ${x} ${y + 36} ${x - 40} ${y + 16} Z`} fill={`url(#${gid}-vest)`} />
      <path d={`M ${x - 58} ${y + 150} Q ${x} ${y + 176} ${x + 58} ${y + 150} L ${x + 70} ${y + 300} Q ${x} ${y + 324} ${x - 70} ${y + 300} Z`} fill="#241c22" />
      {withApple ? (
        <g>
          <Apple x={x} y={y + 196} gid={gid} />
          <ellipse cx={x - 30} cy={y + 210} rx="16" ry="11" fill="#f3d4cb" />
          <ellipse cx={x + 30} cy={y + 214} rx="16" ry="11" fill="#f6ddd4" />
        </g>
      ) : null}
    </g>
  );
}

function DarkDress({ x, y, gid, lean = false }: { x: number; y: number; gid: string; lean?: boolean }) {
  const shift = lean ? -16 : 0;
  return (
    <g className="dress">
      <path
        fill={`url(#${gid}-dress)`}
        d={`M ${x - 36 + shift} ${y}
            C ${x - 70 + shift} ${y + 80}, ${x - 78 + shift} ${y + 180}, ${x - 60 + shift} ${y + 310}
            L ${x + 54} ${y + 330}
            L ${x + 36} ${y + 120}
            C ${x + 20} ${y + 40}, ${x + 8} ${y + 8}, ${x - 8} ${y - 8} Z`}
      />
      <path d={`M ${x - 10} ${y - 6} L ${x - 18} ${y + 250}`} className="piping" />
      <path d={`M ${x + 8} ${y + 20} L ${x + 2} ${y + 250}`} className="piping" />
      <path d={`M ${x - 28 + shift} ${y + 40} L ${x - 36 + shift} ${y + 250}`} className="piping" />
    </g>
  );
}

function ShieldHand() {
  return (
    <g transform="translate(318 300)">
      <ellipse cx="0" cy="18" rx="16" ry="18" fill="#f3d0c8" />
      <rect x="-7" y="-8" width="8" height="22" rx="4" fill="#f6d7cf" transform="rotate(-18)" />
      <rect x="1" y="-12" width="8" height="24" rx="4" fill="#f8ddd6" />
      <rect x="9" y="-8" width="7" height="22" rx="4" fill="#f0cfc6" transform="rotate(16 12 0)" />
    </g>
  );
}

function CheekHand() {
  return (
    <g transform="translate(338 196) rotate(18)">
      <ellipse cx="8" cy="34" rx="15" ry="12" fill="#f0cfc6" />
      <rect x="0" y="2" width="7" height="28" rx="3.5" fill="#f6d8d0" />
      <rect x="8" y="0" width="7" height="30" rx="3.5" fill="#f8e0d8" />
      <rect x="16" y="3" width="6.5" height="26" rx="3.2" fill="#f1d2ca" />
      <rect x="22" y="8" width="6" height="20" rx="3" fill="#e8c6be" />
    </g>
  );
}

function AppleTouch() {
  return (
    <g transform="translate(236 430) rotate(-20)">
      <rect x="0" y="0" width="8" height="34" rx="4" fill="#f3d3cb" />
      <ellipse cx="4" cy="36" rx="10" ry="8" fill="#f0cdc4" />
    </g>
  );
}

function Apple({ x, y, gid }: { x: number; y: number; gid: string }) {
  return (
    <g className="apple" transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="27" ry="25" fill={`url(#${gid}-apple)`} />
      <ellipse cx="-8" cy="-8" rx="7" ry="4.5" fill="#fff" opacity="0.38" />
      <path d="M 0 -24 q 1 -12 -1 -16" stroke="#5c3a34" strokeWidth="2.2" fill="none" />
      <ellipse cx="11" cy="-30" rx="9" ry="4.2" fill="#7ea36a" transform="rotate(-30 11 -30)" />
    </g>
  );
}

function RedBow({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M 0 0 C -8 -12 -26 -8 -26 1 C -22 10 -8 10 0 0 Z" fill="#c4313c" />
      <path d="M 0 0 C 8 -12 26 -8 26 1 C 22 10 8 10 0 0 Z" fill="#d84b55" />
      <circle cx="0" cy="0" r="3.3" fill="#8d1d28" />
      <path d="M -2 2 L -8 16 L -1 13 Z" fill="#c4313c" />
      <path d="M 2 2 L 9 16 L 1 13 Z" fill="#d84b55" />
    </g>
  );
}

function Ribbon({ d }: { d: string }) {
  return <path className="ribbon" d={d} />;
}

function Motes() {
  return (
    <g className="motes">
      <circle cx="46" cy="150" r="1.5" />
      <circle cx="78" cy="430" r="1.1" />
      <circle cx="430" cy="180" r="1.6" />
      <circle cx="410" cy="470" r="1.1" />
      <circle cx="120" cy="520" r="1.3" />
    </g>
  );
}
