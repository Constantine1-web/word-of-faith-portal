"use client";

import { useMemo } from "react";
import { generateQrSvgMarkup } from "@/lib/qr";

export default function QrCodeSvg({
  value,
  size = 96,
  fgColor = "#0A2540",
  bgColor = "#FFFFFF",
  quietZone = 2,
  label = "QR Verification Code",
}: {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  quietZone?: number;
  label?: string;
}) {
  const svg = useMemo(
    () => generateQrSvgMarkup(value, { fgColor, bgColor, quietZone }),
    [value, fgColor, bgColor, quietZone]
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${svg.viewBoxSize} ${svg.viewBoxSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      style={{
        display: "block",
        background: svg.bgColor,
        borderRadius: "4px",
        flexShrink: 0,
      }}
    >
      <rect width={svg.viewBoxSize} height={svg.viewBoxSize} fill={svg.bgColor} />
      <path d={svg.pathD} fill={svg.fgColor} />
    </svg>
  );
}
