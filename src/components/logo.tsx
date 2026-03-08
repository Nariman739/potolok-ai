import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "light" | "dark";
  className?: string;
}

const sizes = {
  sm: { icon: 28, text: "text-base" },
  md: { icon: 36, text: "text-xl" },
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
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoIcon size={s.icon} />
      {showText && (
        <span className={cn("font-bold tracking-tight", s.text)}>
          <span className={variant === "light" ? "text-white" : "text-[#1B3FE4]"}>
            potolok
          </span>
          <span className="text-[#FF6B35]">.ai</span>
        </span>
      )}
    </span>
  );
}

export function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={className}
    >
      <rect width="80" height="80" rx="18" fill="#1B3FE4" />
      <rect x="16" y="12" width="12" height="56" rx="6" fill="white" />
      <path
        d="M28 18 C64 18 64 50 28 50"
        fill="none"
        stroke="white"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M42 26 L37 34 L42 34 L37 43"
        stroke="#FF6B35"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
