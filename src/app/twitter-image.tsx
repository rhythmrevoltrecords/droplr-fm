import { renderOgImage } from "@/components/marketing/og-image";

export const alt = "droplr.fm: run your label's releases from one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return renderOgImage();
}
