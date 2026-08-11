type LogoProps = {
  className?: string;
};

export function StrelvaMark({ className = "strelva-mark" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24.5" cy="7.2" r="3.4" className="strelva-mark__pebble" />
      <ellipse
        cx="20.5"
        cy="15.9"
        rx="6.6"
        ry="4"
        fill="currentColor"
        transform="rotate(-8 20.5 15.9)"
      />
      <ellipse
        cx="22.5"
        cy="26.4"
        rx="9.4"
        ry="4.9"
        fill="currentColor"
        transform="rotate(5 22.5 26.4)"
      />
      <ellipse
        cx="24"
        cy="38.5"
        rx="12.2"
        ry="5.6"
        fill="currentColor"
        transform="rotate(-3 24 38.5)"
      />
    </svg>
  );
}

export function StrelvaLogo({ className = "strelva-logo" }: LogoProps) {
  return (
    <span className={className}>
      <StrelvaMark />
      <span>Strelva</span>
    </span>
  );
}
