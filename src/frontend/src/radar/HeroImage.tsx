type Props = {
  heroImageId: string | null | undefined;
  altText?: string;
  height?: number | string;
};

export function HeroImage({
  heroImageId,
  altText = "Technology hero image",
  height = 140,
}: Props) {
  if (!heroImageId) {
    return (
      <div
        style={{
          width: "100%",
          height,
          background:
            "linear-gradient(135deg, var(--color-brand-dark-blue) 0%, color-mix(in srgb, var(--color-brand-dark-blue) 60%, var(--color-brand-bright-blue)) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-label="No hero image available"
        role="img"
        data-testid="hero-image-placeholder"
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="4"
            y="4"
            width="40"
            height="40"
            rx="4"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
          />
          <circle cx="18" cy="18" r="5" fill="rgba(255,255,255,0.25)" />
          <path
            d="M4 34 L16 22 L24 30 L32 20 L44 34"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={`/api/media/${heroImageId}`}
      alt={altText}
      style={{
        width: "100%",
        height,
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = "none";
        const placeholder = document.createElement("div");
        placeholder.style.cssText =
          "width:100%;height:140px;background:var(--color-brand-dark-blue);";
        target.parentElement?.appendChild(placeholder);
      }}
      data-testid="hero-image"
    />
  );
}
