import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "light" | "dark";
  className?: string;
}

const sizes = {
  sm: { icon: 28, text: "text-base" },
  md: { icon: 36, text: "text-lg" },
  lg: { icon: 48, text: "text-2xl" },
};

export function Logo({
  size = "md",
  showText = true,
  variant = "dark",
  className,
}: LogoProps) {
  const s = sizes[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="PotolokAI"
        width={s.icon}
        height={s.icon}
        className="shrink-0"
      />
      {showText && (
        <span
          className={cn(
            "font-extrabold tracking-tight",
            s.text,
            variant === "light" ? "text-white" : "text-[#0F1724]"
          )}
        >
          Potolok
          <span className="text-[#F97316]">AI</span>
        </span>
      )}
    </span>
  );
}

/** Inline SVG version for places where Image import isn't ideal (e.g. favicon, OG) */
export function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <rect width="40" height="40" rx="10" fill="url(#logo-bg)" />
      <path
        d="M8 12 Q20 8 32 12"
        stroke="url(#logo-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M14 30V14h6.5a5.5 5.5 0 0 1 0 11H14"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="29" cy="28" r="2.5" fill="url(#logo-accent)" />
      <circle cx="29" cy="28" r="4.5" fill="url(#logo-accent)" opacity="0.2" />
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#0F1724" />
          <stop offset="100%" stopColor="#1a2d4a" />
        </linearGradient>
        <linearGradient id="logo-accent" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
      </defs>
    </svg>
  );
}
