import { useId } from "react";
export default function LaptopArt({
  variant = "normal",
  large = false,
}: {
  variant?: "normal" | "faulty" | "accessory";
  large?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  return (
    <div
      className={`laptop-art ${variant} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 180 130" fill="none">
        <defs>
          <linearGradient
            id={id}
            x1="35"
            y1="20"
            x2="145"
            y2="95"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={variant === "faulty" ? "#997b68" : "#8ab5a3"} />
            <stop
              offset="1"
              stopColor={variant === "faulty" ? "#41372f" : "#234e48"}
            />
          </linearGradient>
        </defs>
        {variant === "accessory" ? (
          <>
            <rect x="32" y="22" width="116" height="72" rx="4" fill="#354b43" />
            <rect
              x="37"
              y="27"
              width="106"
              height="62"
              rx="2"
              fill={`url(#${id})`}
            />
            <path d="M88 94v15m-24 0h50" stroke="#52675d" strokeWidth="5" />
          </>
        ) : (
          <>
            <path
              d="M37 19h106a6 6 0 016 6v70H31V25a6 6 0 016-6Z"
              fill="#20312c"
              stroke="#61776d"
              strokeWidth="1.5"
            />
            <rect
              x="37"
              y="25"
              width="106"
              height="63"
              rx="1"
              fill={`url(#${id})`}
            />
            <path d="M37 88 96 25h47L85 88H37Z" fill="#b6d8c7" opacity=".17" />
            <path
              d="m31 95-17 17a4 4 0 003 7h146a4 4 0 003-7l-17-17H31Z"
              fill="#8fa199"
              stroke="#51665b"
            />
            <path d="m43 98-8 10h110l-8-10H43Z" fill="#3e534a" />
            <path
              d="M77 114h26"
              stroke="#d6e0d7"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="90" cy="102" r="2" fill="#d76750" />
            <circle cx="90" cy="22" r=".8" fill="#98ada0" />
            {variant === "faulty" && (
              <path
                d="m94 32-12 18 16 13-11 18"
                stroke="#d9b99e"
                strokeWidth="2"
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}
