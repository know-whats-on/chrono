/**
 * Animated Favicon — draws a simplified Voca V-logo with pulsing soundwave bars
 * on an offscreen canvas and updates <link rel="icon"> every frame.
 */

const SIZE = 64;
const HALF = SIZE / 2;

// Bar config: x-offset from center, base height, animation speed multiplier, phase offset
const BARS: [number, number, number, number][] = [
  [-12, 14, 1.0, 0],       // left outer
  [-6, 20, 0.85, 0.4],     // left middle
  [0, 26, 0.7, 0.8],       // center
  [6, 20, 0.85, 1.2],      // right middle
  [12, 14, 1.0, 1.6],      // right outer
];

const BAR_WIDTH = 3.5;
const BAR_RADIUS = 1.75;

function drawV(ctx: CanvasRenderingContext2D) {
  // Draw a stylised "V" shape
  ctx.beginPath();
  // Left arm
  ctx.moveTo(6, 10);
  ctx.lineTo(16, 10);
  ctx.lineTo(HALF, 54);
  // Right arm
  ctx.lineTo(SIZE - 6, 10);
  ctx.lineTo(SIZE - 16, 10);
  ctx.lineTo(HALF, 44);
  ctx.closePath();

  // Purple gradient fill
  const grad = ctx.createLinearGradient(0, 10, SIZE, 54);
  grad.addColorStop(0, "#6B4BC8");
  grad.addColorStop(0.5, "#904498");
  grad.addColorStop(1, "#CA3C43");
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawBars(ctx: CanvasRenderingContext2D, t: number) {
  const centerX = HALF;
  const centerY = 27; // vertical center of the soundwave area

  for (const [xOff, baseH, speed, phase] of BARS) {
    // Ease in-out sine animation
    const scale = 0.4 + 0.6 * Math.abs(Math.sin((t * speed * 0.003) + phase));
    const h = baseH * scale;
    const x = centerX + xOff - BAR_WIDTH / 2;
    const y = centerY - h / 2;

    // Rounded rect bar
    ctx.beginPath();
    ctx.roundRect(x, y, BAR_WIDTH, h, BAR_RADIUS);
    ctx.fillStyle = "white";
    ctx.fill();
  }
}

export function startAnimatedFavicon(): () => void {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // Get or create the favicon link
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";

  let rafId = 0;
  let lastUpdate = 0;
  const FPS_INTERVAL = 1000 / 24; // ~24fps is smooth enough for a favicon

  function render(now: number) {
    rafId = requestAnimationFrame(render);

    if (now - lastUpdate < FPS_INTERVAL) return;
    lastUpdate = now;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Optional: rounded background
    ctx.beginPath();
    ctx.roundRect(0, 0, SIZE, SIZE, 14);
    ctx.fillStyle = "#1c1c1e";
    ctx.fill();

    drawV(ctx);
    drawBars(ctx, now);

    link!.href = canvas.toDataURL("image/png");
  }

  rafId = requestAnimationFrame(render);

  // Return cleanup function
  return () => {
    cancelAnimationFrame(rafId);
  };
}