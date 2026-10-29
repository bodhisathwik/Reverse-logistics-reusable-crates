import { memo, useEffect, useState } from "react";

const cache = new Map<string, string>();

export async function qrDataUrl(text: string, size = 256): Promise<string> {
  const key = text + "@" + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const QR = await import("qrcode");
  const url = await QR.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  cache.set(key, url);
  return url;
}

export const QrCode = memo(function QrCode({ text, size = 160, className }: { text: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    qrDataUrl(text, size * 2).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [text, size]);
  return src
    ? <img src={src} alt={`QR code ${text}`} width={size} height={size} className={className} />
    : <div style={{ width: size, height: size }} className={"shimmer rounded-md " + (className ?? "")} />;
});
