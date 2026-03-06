import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { getRssFeedArticles, getRssFeeds, getWithPrefetch } from "../lib/api";
import { Rss, Plus, Settings } from "lucide-react";
import { useNavigate } from "react-router";

/* ── Types ── */
interface RssArticle {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
  image?: string;
  feedName?: string;
}

/* ── Helpers ── */
function timeAgo(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ""; }
}

function decodeHtmlEntities(str: string): string {
  if (!str) return str;
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

function upgradeImageUrl(url: string): string {
  if (!url) return url;
  try {
    if (url.includes("ichef.bbci.co.uk")) return url.replace(/\/\d+x\d+\//, "/800x450/");
    if (url.includes("media.guim.co.uk") && /\/\d+\.jpg/.test(url)) return url.replace(/\/\d+\.jpg/, "/1000.jpg");
    if (url.includes("lh3.googleusercontent.com")) return url.replace(/=w\d+/, "=w800").replace(/=s\d+/, "=s800");
  } catch {}
  return url;
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

/* ── Constants ── */
const CYCLE_MS = 6000;
const COLLAPSE_MS = 320;
const SHIFT_MS = 300;
const EXPAND_MS = 340;
const GAP = 6;
const DESKTOP_COUNT = 8;
const MOBILE_COUNT = 3;

type Phase = "idle" | "collapse" | "shift" | "expand";

/* ── Gradients & border colours (same palette as news carousel) ── */
const GRADIENTS = [
  "from-slate-700 to-slate-900",
  "from-indigo-800 to-slate-900",
  "from-emerald-800 to-slate-900",
  "from-rose-800 to-slate-900",
  "from-violet-800 to-slate-900",
  "from-amber-800 to-slate-900",
];

const BORDER_COLORS = [
  "hsl(210, 50%, 55%)",
  "hsl(250, 50%, 55%)",
  "hsl(150, 50%, 55%)",
  "hsl(350, 50%, 55%)",
  "hsl(270, 50%, 55%)",
  "hsl(30, 50%, 55%)",
];

/* ═══════════════════════════════════════════════════════ */

export function RssFeedTile() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const visibleCount = isMobile ? MOBILE_COUNT : DESKTOP_COUNT;

  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [feedCount, setFeedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [head, setHead] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [compactH, setCompactH] = useState(0);
  const [spotlightH, setSpotlightH] = useState(0);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const pauseRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const compactRef = useRef<HTMLAnchorElement>(null);
  const vpRef = useRef<HTMLDivElement>(null);

  /* ── Measure ── */
  useLayoutEffect(() => {
    const measureAll = () => {
      if (compactRef.current) setCompactH(compactRef.current.getBoundingClientRect().height);
      if (vpRef.current) setSpotlightH(vpRef.current.clientWidth * 9 / 16);
    };
    measureAll();
    const ro = new ResizeObserver(() => measureAll());
    if (compactRef.current) ro.observe(compactRef.current);
    if (vpRef.current) ro.observe(vpRef.current);
    return () => ro.disconnect();
  }, [articles]);

  /* ── Load ── */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [arts, feeds] = await Promise.all([
        getWithPrefetch("rssArticles", () => getRssFeedArticles()),
        getWithPrefetch("rssFeeds", () => getRssFeeds()),
      ]);
      setArticles(Array.isArray(arts) ? arts : []);
      setFeedCount(Array.isArray(feeds) ? feeds.length : 0);
    } catch (e) {
      console.error("RSS feed tile load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = articles.length;

  /* ── 3-phase animation cycle ── */
  useEffect(() => {
    if (total <= visibleCount || phase !== "idle") return;

    timerRef.current = setInterval(() => {
      if (pauseRef.current) return;

      setPhase("collapse");

      setTimeout(() => {
        setPhase("shift");

        setTimeout(() => {
          setHead(prev => (prev - 1 + total) % total);
          setPhase("expand");

          setTimeout(() => {
            setPhase("idle");
          }, EXPAND_MS + 30);
        }, SHIFT_MS + 20);
      }, COLLAPSE_MS + 20);
    }, CYCLE_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [total, phase, visibleCount]);

  /* ── Click non-spotlight card → move it to spotlight ── */
  const goToCard = useCallback((visibleIndex: number) => {
    const sIdx = total > visibleCount ? 2 : 1;
    if (visibleIndex === sIdx || phase !== "idle" || total === 0) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const newHead = (head + visibleIndex - sIdx + total) % total;
    setHead(newHead);
    setPhase("expand");
    setTimeout(() => { setPhase("idle"); }, EXPAND_MS + 30);
  }, [phase, head, total, visibleCount]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="glass rounded-2xl p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold mb-2 shrink-0">
          <Rss className="w-4 h-4" /> Today in My Feeds
        </div>
        <div className="flex-1 min-h-[140px] rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  /* ── Empty states ── */
  if (feedCount === 0) {
    return (
      <div className="glass rounded-2xl p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-center mb-2 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
            Today in{" "}
            <span
              className="text-black dark:text-black px-1.5 py-0.5 rounded-md inline-block"
              style={{
                background: "linear-gradient(135deg, rgba(255,218,185,0.55) 0%, rgba(255,200,170,0.45) 40%, rgba(245,190,200,0.4) 70%, rgba(220,195,230,0.35) 100%)",
              }}
            >
              My Feeds
            </span>
          </span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2 text-center">
          <Rss className="w-6 h-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No RSS feeds added yet</p>
          <button
            onClick={() => navigate("/settings?section=rss-feeds")}
            className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
          >
            <Plus className="w-3 h-3" /> Add a feed
          </button>
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="glass rounded-2xl p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-center mb-2 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
            Today in{" "}
            <span
              className="text-black dark:text-black px-1.5 py-0.5 rounded-md inline-block"
              style={{
                background: "linear-gradient(135deg, rgba(255,218,185,0.55) 0%, rgba(255,200,170,0.45) 40%, rgba(245,190,200,0.4) 70%, rgba(220,195,230,0.35) 100%)",
              }}
            >
              My Feeds
            </span>
          </span>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-4 gap-1 text-center">
          <p className="text-xs text-muted-foreground">No articles yet</p>
        </div>
      </div>
    );
  }

  /* ── Build visible cards ── */
  const showCount = Math.min(total, visibleCount + 1);
  const visible: RssArticle[] = [];
  for (let i = 0; i < showCount; i++) {
    visible.push(articles[(head + i) % total]);
  }

  // When animating, item[0] is hidden above viewport; spotlight is at index 2.
  // When not animating (too few articles), no offset and spotlight at index 1.
  const needsAnimation = total > visibleCount;
  const spotlightIdx = needsAnimation ? 2 : 1;

  // Downward animation: idle keeps item[0] hidden above viewport; shift animates to 0 (downward)
  const shiftY = needsAnimation ? (phase === "shift" ? 0 : compactH + GAP) : 0;

  // Compute a stable viewport height so animation phases don't cause layout shifts
  // (prevents parent scroll jumping on mobile). Height = 1 spotlight + (visibleCount-1) compacts + gaps
  // Only applied on mobile — on desktop flex-1 fills the column naturally.
  const stableVpHeight = (isMobile && spotlightH > 0 && compactH > 0)
    ? spotlightH + (visibleCount - 1) * compactH + (visibleCount) * GAP
    : undefined;

  return (
    <div
      className="glass rounded-2xl p-3 flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ overflowAnchor: 'none' as any }}
      onMouseEnter={() => { pauseRef.current = true; }}
      onMouseLeave={() => { pauseRef.current = false; }}
    >
      {/* Header */}
      <div className="flex items-center justify-center mb-2 shrink-0 relative">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
          Today in{" "}
          <span
            className="text-black dark:text-black px-1.5 py-0.5 rounded-md inline-block"
            style={{
              background: "linear-gradient(135deg, rgba(255,218,185,0.55) 0%, rgba(255,200,170,0.45) 40%, rgba(245,190,200,0.4) 70%, rgba(220,195,230,0.35) 100%)",
            }}
          >
            My Feeds
          </span>
          {feedCount > 0 && (
            <span className="text-[9px] text-muted-foreground/50 font-normal ml-1">({feedCount})</span>
          )}
        </span>
        <button
          onClick={() => navigate("/settings?section=rss-feeds")}
          className="absolute right-0 text-[10px] text-primary/70 hover:text-primary font-medium flex items-center gap-0.5 transition"
        >
          <Settings className="w-3 h-3" /> Manage
        </button>
      </div>

      {/* Carousel viewport */}
      <div
        ref={vpRef}
        className={`min-h-0 overflow-hidden relative rounded-xl ${stableVpHeight ? '' : 'flex-1'}`}
        style={stableVpHeight
          ? { height: stableVpHeight, flexGrow: 0, flexShrink: 0, overflowAnchor: 'none' as any }
          : undefined
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: `${GAP}px`,
            transform: `translateY(-${shiftY}px)`,
            transition: phase === "shift"
              ? `transform ${SHIFT_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`
              : "none",
            willChange: phase === "shift" ? "transform" : "auto",
          }}
        >
          {visible.map((article, i) => {
            const isSpotlightSlot = i === spotlightIdx;

            let height: number;
            if (isSpotlightSlot) {
              if (phase === "collapse" || phase === "shift") {
                height = compactH;
              } else {
                height = spotlightH;
              }
            } else {
              height = compactH;
            }

            const animateHeight = isSpotlightSlot && (phase === "collapse" || phase === "expand");
            const animDuration = phase === "collapse" ? COLLAPSE_MS : EXPAND_MS;

            const bannerOpacity = isSpotlightSlot
              ? (phase === "idle" ? 1 : phase === "expand" ? 1 : 0)
              : 0;

            return (
              <RssCard
                key={`rss-${(head + i) % total}`}
                ref={i === 0 ? compactRef : undefined}
                article={article}
                height={height}
                spotlightH={spotlightH}
                animateHeight={animateHeight}
                animDuration={animDuration}
                bannerOpacity={bannerOpacity}
                isSpotlightSlot={isSpotlightSlot}
                imgErrors={imgErrors}
                onImgError={(url) => setImgErrors(s => new Set(s).add(url))}
                onCompactClick={() => goToCard(i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── RSS Card ─────────────── */

const RssCard = React.forwardRef<HTMLAnchorElement, {
  article: RssArticle;
  height: number;
  spotlightH: number;
  animateHeight: boolean;
  animDuration: number;
  bannerOpacity: number;
  isSpotlightSlot: boolean;
  imgErrors: Set<string>;
  onImgError: (url: string) => void;
  onCompactClick: () => void;
}>(({
  article, height, spotlightH, animateHeight, animDuration,
  bannerOpacity, isSpotlightSlot,
  imgErrors, onImgError,
  onCompactClick,
}, ref) => {
  const imgUrl = article.image ? upgradeImageUrl(article.image) : null;
  const hasImg = imgUrl && !imgErrors.has(imgUrl);
  const gradIdx = (article.title.length + (article.feedName?.length ?? 0)) % GRADIENTS.length;

  const handleClick = (e: React.MouseEvent) => {
    if (!isSpotlightSlot) {
      e.preventDefault();
      onCompactClick();
    }
  };

  return (
    <a
      ref={ref}
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block shrink-0 w-full rounded-xl overflow-hidden group cursor-pointer relative"
      style={{
        height: height > 0 ? `${height}px` : "auto",
        transition: animateHeight
          ? `height ${animDuration}ms cubic-bezier(0.33, 1, 0.68, 1)`
          : "none",
        willChange: animateHeight ? "height" : "auto",
      }}
      onClick={handleClick}
    >
      {/* ── Banner layer (only for spotlight slot) ── */}
      {isSpotlightSlot && (
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{
            height: spotlightH > 0 ? `${spotlightH}px` : '100%',
            opacity: bannerOpacity,
            transition: `opacity ${animDuration * 0.7}ms ease`,
          }}
        >
          {hasImg ? (
            <img
              src={imgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03] saturate-[1.1]"
              onError={() => onImgError(imgUrl)}
              loading="eager"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENTS[gradIdx]}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>
      )}

      {/* ── Content layer ── */}
      {isSpotlightSlot ? (
        <div
          className="absolute left-0 right-0 bottom-0 flex flex-col justify-end p-3 z-10"
          style={{ height: spotlightH > 0 ? `${spotlightH}px` : '100%' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {article.feedName && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-white/80 bg-white/15 backdrop-blur-sm px-1.5 py-0.5 rounded">
                {article.feedName}
              </span>
            )}
            {article.pubDate && (
              <span className="text-[9px] text-white/50">{timeAgo(article.pubDate)}</span>
            )}
          </div>
          <h3
            className="text-white font-bold leading-[1.15] line-clamp-2 group-hover:underline decoration-white/40 underline-offset-2"
            style={{
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: "clamp(0.85rem, 1.4vw, 1.05rem)",
              letterSpacing: "-0.01em",
            }}
          >
            {decodeHtmlEntities(article.title)}
          </h3>
        </div>
      ) : (
        <div
          className="flex flex-col justify-center h-full px-3 py-1.5 border-l-[3px] rounded-lg hover:bg-muted/40 transition-colors"
          style={{ borderColor: BORDER_COLORS[gradIdx], minHeight: 44 }}
        >
          <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
            {article.feedName && (
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/70 truncate shrink min-w-0">
                {article.feedName}
              </span>
            )}
            {article.pubDate && (
              <span className="text-[8px] text-muted-foreground/40 shrink-0">{timeAgo(article.pubDate)}</span>
            )}
          </div>
          <h4
            className="font-semibold leading-snug line-clamp-1 text-foreground/85 group-hover:text-foreground transition-colors"
            style={{
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: "clamp(0.72rem, 1.1vw, 0.82rem)",
              letterSpacing: "-0.01em",
            }}
          >
            {decodeHtmlEntities(article.title)}
          </h4>
        </div>
      )}
    </a>
  );
});
RssCard.displayName = "RssCard";