import { cn } from "@/lib/utils";

/**
 * The phone-sized frame the bio form and the Look tab show their live preview in.
 *
 * The page is laid out at a real phone width (390px) and shrunk to fit with CSS `zoom`, not
 * `transform: scale`. A transform shrinks the picture but leaves the layout box full size, so the
 * frame had to clip at one screen height and nothing below the fold could be seen. Zoom shrinks the
 * layout too, so the frame scrolls through the whole page the way a phone would.
 *
 * The inner box is a grid with a phone-screen minimum height, so a short page still fills the frame
 * (a grid item stretches to its row) and a long one simply grows and scrolls.
 */
const PHONE_W = 390;
const FRAME_W = 300;
const ZOOM = FRAME_W / PHONE_W;

export function PhonePreview({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto h-[510px] w-[300px] overflow-y-auto overflow-x-hidden overscroll-contain rounded-[2rem] border border-white/10 bg-black", className)}>
      <div style={{ width: PHONE_W, minHeight: Math.round(510 / ZOOM), zoom: ZOOM, display: "grid" }}>{children}</div>
    </div>
  );
}
