import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getNews, updateMe, getBookmarks, addBookmark, removeBookmark } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { copyToClipboard } from "../lib/clipboard";
import {
  X, Plus, ExternalLink, Loader2,
  Search, Check, ChevronRight, RefreshCw,
  Bookmark, BookmarkCheck, Share2, BookOpen, ArrowLeft
} from "lucide-react";

function decodeHtmlEntities(str: string): string {
  if (!str) return str;
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

/** Round-robin interleave articles by interest tag to ensure tag diversity */
function interleaveByInterest(articles: NewsArticle[]): NewsArticle[] {
  if (articles.length === 0) return articles;
  const bucketMap = new Map<string, NewsArticle[]>();
  for (const a of articles) {
    const key = (a.interest || "General").toLowerCase();
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key)!.push(a);
  }
  if (bucketMap.size <= 1) return articles; // only one tag, nothing to mix
  const buckets = Array.from(bucketMap.values());
  const interleaved: NewsArticle[] = [];
  const maxLen = Math.max(...buckets.map(b => b.length));
  for (let round = 0; round < maxLen; round++) {
    for (const bucket of buckets) {
      if (round < bucket.length) interleaved.push(bucket[round]);
    }
  }
  return interleaved;
}

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source?: string;
  interest?: string;
  image?: string;
}

interface BookmarkedArticle extends NewsArticle {
  bookmarkedAt?: string;
}

interface NewsData {
  locale: { city: string; gl: string };
  interests: string[];
  feeds: {
    top?: NewsArticle[];
    local?: NewsArticle[];
    forYou?: NewsArticle[];
  };
}

const SUGGESTED_INTERESTS = [
  "Technology", "Business", "Science", "Health", "Sports",
  "Entertainment", "Politics", "Finance", "Climate", "AI",
  "Space", "Music", "Gaming", "Travel", "Food",
  "Fashion", "Crypto", "Startups", "Education", "Movies",
];

function timeAgo(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

async function shareArticle(article: NewsArticle) {
  const shareData = {
    title: article.title,
    text: `${article.title}${article.source ? ` — ${article.source}` : ""}`,
    url: article.link,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch {
      // User cancelled
    }
  } else {
    await copyToClipboard(article.link);
  }
}

type NewsTab = "top" | "local" | "forYou";

const INITIAL_VISIBLE = 8;
const LOAD_MORE_INCREMENT = 8;

export function NewsSection() {
  const { profile, refreshProfile } = useAuth();
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileTab, setMobileTab] = useState<NewsTab>("top");
  const [showInterests, setShowInterests] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [savingInterests, setSavingInterests] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileVisible, setMobileVisible] = useState(INITIAL_VISIBLE);
  const [bookmarkedLinks, setBookmarkedLinks] = useState<Set<string>>(new Set());
  const [bookmarkedArticles, setBookmarkedArticles] = useState<BookmarkedArticle[]>([]);
  const [showReadingList, setShowReadingList] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.news_interests) {
      setInterests(profile.news_interests);
    }
  }, [profile]);

  const loadNews = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getNews();
      setNewsData(data);
      if (data.interests?.length > 0) {
        setInterests(data.interests);
      }
    } catch (e) {
      console.error("Failed to load news:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const data = await getBookmarks();
      setBookmarkedArticles(Array.isArray(data) ? data : []);
      setBookmarkedLinks(new Set((Array.isArray(data) ? data : []).map((b: BookmarkedArticle) => b.link)));
    } catch (e) {
      console.error("Failed to load bookmarks:", e);
    }
  }, []);

  useEffect(() => { loadNews(); loadBookmarks(); }, [loadNews, loadBookmarks]);

  const toggleInterest = (interest: string) => {
    setInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const addCustomInterest = () => {
    const trimmed = customInput.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests(prev => [...prev, trimmed]);
      setCustomInput("");
      setSearchFilter("");
    }
  };

  const saveInterests = async () => {
    setSavingInterests(true);
    try {
      await updateMe({ news_interests: interests });
      await refreshProfile();
      setShowInterests(false);
      loadNews();
    } catch (e) {
      console.error("Failed to save interests:", e);
    } finally {
      setSavingInterests(false);
    }
  };

  const handleToggleBookmark = async (article: NewsArticle) => {
    const isBookmarked = bookmarkedLinks.has(article.link);
    if (isBookmarked) {
      setBookmarkedLinks(prev => { const next = new Set(prev); next.delete(article.link); return next; });
      setBookmarkedArticles(prev => prev.filter(b => b.link !== article.link));
      try { await removeBookmark(article.link); } catch (e) { console.error("Unbookmark error:", e); loadBookmarks(); }
    } else {
      setBookmarkedLinks(prev => new Set(prev).add(article.link));
      setBookmarkedArticles(prev => [{ ...article, bookmarkedAt: new Date().toISOString() }, ...prev]);
      try { await addBookmark(article); } catch (e) { console.error("Bookmark error:", e); loadBookmarks(); }
    }
  };

  const handleShare = async (article: NewsArticle) => {
    await shareArticle(article);
    if (!navigator.share) {
      setCopiedLink(article.link);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  const hasForYou = interests.length >= 1;

  // Frontend round-robin interleaving for "For You" to guarantee tag diversity
  const forYouArticles = useMemo(
    () => interleaveByInterest(newsData?.feeds?.forYou || []),
    [newsData?.feeds?.forYou]
  );

  const handleMobileTabClick = (t: NewsTab) => {
    if (t === "forYou" && !hasForYou) {
      setShowInterests(true);
      return;
    }
    setMobileTab(t);
    setMobileVisible(INITIAL_VISIBLE);
  };

  const mobileArticles = mobileTab === "top"
    ? newsData?.feeds?.top || []
    : mobileTab === "local"
    ? newsData?.feeds?.local || []
    : forYouArticles;

  const filteredSuggestions = searchFilter
    ? SUGGESTED_INTERESTS.filter(s =>
        s.toLowerCase().includes(searchFilter.toLowerCase()) && !interests.includes(s)
      )
    : SUGGESTED_INTERESTS.filter(s => !interests.includes(s));

  // Reading List view
  if (showReadingList) {
    return (
      <ReadingList
        articles={bookmarkedArticles}
        bookmarkedLinks={bookmarkedLinks}
        onBack={() => setShowReadingList(false)}
        onToggleBookmark={handleToggleBookmark}
        onShare={handleShare}
        copiedLink={copiedLink}
      />
    );
  }

  return (
    <>
      {/* ── Desktop: multi-column layout ── */}
      <div className="hidden md:flex md:flex-col flex-1 min-h-0">
        {/* Section header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">News</h2>
            {newsData?.locale && (
              <span className="text-xs text-muted-foreground">
                {newsData.locale.city}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReadingList(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
            >
              <BookOpen className="w-3 h-3" />
              Reading List
              {bookmarkedArticles.length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1">
                  {bookmarkedArticles.length}
                </span>
              )}
            </button>
            <button
              onClick={loadNews}
              disabled={loading}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowInterests(true)}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              Interests <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading news...</p>
            </div>
          </div>
        ) : (
          <div className={`flex-1 min-h-0 grid gap-4 ${hasForYou ? "grid-cols-3" : "grid-cols-2"}`}>
            <NewsColumn
              title="Top Stories"
              articles={newsData?.feeds?.top || []}
              bookmarkedLinks={bookmarkedLinks}
              onToggleBookmark={handleToggleBookmark}
              onShare={handleShare}
              copiedLink={copiedLink}
            />
            <NewsColumn
              title={`Local${newsData?.locale ? ` · ${newsData.locale.city}` : ""}`}
              articles={newsData?.feeds?.local || []}
              bookmarkedLinks={bookmarkedLinks}
              onToggleBookmark={handleToggleBookmark}
              onShare={handleShare}
              copiedLink={copiedLink}
            />
            {hasForYou ? (
              <NewsColumn
                title="For You"
                articles={forYouArticles}
                onManageInterests={() => setShowInterests(true)}
                bookmarkedLinks={bookmarkedLinks}
                onToggleBookmark={handleToggleBookmark}
                onShare={handleShare}
                copiedLink={copiedLink}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* ── Mobile: tabbed layout ── */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">News</h2>
            {newsData?.locale && (
              <span className="text-xs text-muted-foreground">
                {newsData.locale.city}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReadingList(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
            >
              <BookOpen className="w-3 h-3" />
              {bookmarkedArticles.length > 0 && (
                <span className="min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1">
                  {bookmarkedArticles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowInterests(true)}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              Interests <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-3">
          <TabButton active={mobileTab === "top"} onClick={() => handleMobileTabClick("top")}>
            Top Stories
          </TabButton>
          <TabButton active={mobileTab === "local"} onClick={() => handleMobileTabClick("local")}>
            Local
          </TabButton>
          <TabButton active={mobileTab === "forYou"} onClick={() => handleMobileTabClick("forYou")}>
            For You
          </TabButton>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading news...</p>
          </div>
        ) : mobileArticles.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">No articles found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {mobileArticles.slice(0, mobileVisible).map((article, i) => (
              <ArticleCard
                key={`${mobileTab}-${i}`}
                article={article}
                isBookmarked={bookmarkedLinks.has(article.link)}
                onToggleBookmark={() => handleToggleBookmark(article)}
                onShare={() => handleShare(article)}
                copiedLink={copiedLink}
              />
            ))}
            {mobileVisible < mobileArticles.length && (
              <button
                onClick={() => setMobileVisible(mobileVisible + LOAD_MORE_INCREMENT)}
                className="w-full py-2.5 mt-1 rounded-xl text-xs font-medium text-primary hover:bg-primary/5 transition flex items-center justify-center gap-1.5"
              >
                Load More
                <span className="text-[10px] text-muted-foreground font-normal">({mobileArticles.length - mobileVisible})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Interests Modal ── */}
      {showInterests && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInterests(false)} />
          <div
            className="relative w-full max-w-md mx-auto z-10 bg-background rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "85dvh" }}
          >
            <div className="flex items-center justify-between p-4 pb-2 shrink-0">
              <h3 className="text-base font-semibold">Your Interests</h3>
              <button onClick={() => setShowInterests(false)} className="p-1.5 rounded-lg hover:bg-muted transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-2 shrink-0">
              <p className="text-xs text-muted-foreground mb-3">
                Choose at least 3 interests to unlock your personalized "For You" feed.
              </p>

              {interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {interests.map(i => (
                    <button
                      key={i}
                      onClick={() => toggleInterest(i)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition"
                    >
                      {i}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    value={customInput}
                    onChange={(e) => { setCustomInput(e.target.value); setSearchFilter(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustomInterest(); }}
                    placeholder="Type an interest..."
                    className="w-full pl-8 pr-3 py-2 rounded-lg border bg-input-background text-sm"
                  />
                </div>
                {customInput.trim() && (
                  <button onClick={addCustomInterest} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredSuggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleInterest(s)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition border border-transparent hover:border-border"
                  >
                    <Plus className="w-3 h-3" />
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 pt-2 border-t shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
              <button
                onClick={saveInterests}
                disabled={savingInterests}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingInterests ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Interests ({interests.length} selected)
                  </>
                )}
              </button>
              {interests.length < 3 && interests.length > 0 && (
                <p className="text-[10px] text-center text-muted-foreground mt-1.5">
                  Choose {3 - interests.length} more to unlock "For You"
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Reading List ── */
function ReadingList({ articles, bookmarkedLinks, onBack, onToggleBookmark, onShare, copiedLink }: {
  articles: BookmarkedArticle[];
  bookmarkedLinks: Set<string>;
  onBack: () => void;
  onToggleBookmark: (article: NewsArticle) => void;
  onShare: (article: NewsArticle) => void;
  copiedLink: string | null;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          <h2 className="text-base font-semibold">Reading List</h2>
          <span className="text-xs text-muted-foreground">({articles.length})</span>
        </div>
      </div>
      {articles.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <BookOpen className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No saved articles yet</p>
          <p className="text-xs text-muted-foreground/60">Bookmark articles to read later</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          {articles.map((article, i) => (
            <ArticleCard
              key={`bl-${i}`}
              article={article}
              isBookmarked={bookmarkedLinks.has(article.link)}
              onToggleBookmark={() => onToggleBookmark(article)}
              onShare={() => onShare(article)}
              copiedLink={copiedLink}
              showBookmarkDate={article.bookmarkedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Desktop column ── */
function NewsColumn({ title, articles, onManageInterests, bookmarkedLinks, onToggleBookmark, onShare, copiedLink }: {
  title: string;
  articles: NewsArticle[];
  onManageInterests?: () => void;
  bookmarkedLinks: Set<string>;
  onToggleBookmark: (article: NewsArticle) => void;
  onShare: (article: NewsArticle) => void;
  copiedLink: string | null;
}) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const hasMore = visible < articles.length;
  const remaining = articles.length - visible;

  return (
    <div className="glass rounded-2xl flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onManageInterests && (
          <button
            onClick={onManageInterests}
            className="text-[10px] text-primary font-medium hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {articles.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground">No articles found</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {articles.slice(0, visible).map((article, i) => (
              <ArticleCard
                key={i}
                article={article}
                isBookmarked={bookmarkedLinks.has(article.link)}
                onToggleBookmark={() => onToggleBookmark(article)}
                onShare={() => onShare(article)}
                copiedLink={copiedLink}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => setVisible(v => v + LOAD_MORE_INCREMENT)}
                className="w-full py-2.5 mt-1 rounded-xl text-xs font-medium text-primary hover:bg-primary/5 transition flex items-center justify-center gap-1.5"
              >
                Load More
                <span className="text-[10px] text-muted-foreground font-normal">({remaining})</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tab button (mobile) ── */
function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Article card ── */
function ArticleCard({ article, isBookmarked, onToggleBookmark, onShare, copiedLink, showBookmarkDate }: {
  article: NewsArticle;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onShare: () => void;
  copiedLink: string | null;
  showBookmarkDate?: string;
}) {
  const ago = timeAgo(article.pubDate);
  const [imgError, setImgError] = useState(false);
  const showImage = article.image && !imgError;
  const isCopied = copiedLink === article.link;

  return (
    <div className="rounded-xl px-2.5 py-2 hover:bg-muted/50 transition group">
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-pointer"
      >
        <div className={showImage ? "flex gap-3" : ""}>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium leading-snug line-clamp-2 group-hover:text-primary transition">
              {decodeHtmlEntities(article.title)}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {article.source && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {article.source}
                </span>
              )}
              {article.interest && (
                <span className="text-[10px] font-medium text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded">
                  {article.interest}
                </span>
              )}
              {ago && (
                <>
                  {article.source && <span className="text-muted-foreground/30">·</span>}
                  <span className="text-[10px] text-muted-foreground/60">{ago}</span>
                </>
              )}
              {showBookmarkDate && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[10px] text-muted-foreground/60">Saved {timeAgo(showBookmarkDate)}</span>
                </>
              )}
            </div>
          </div>
          {showImage && (
            <div className="w-20 h-14 rounded-lg overflow-hidden shrink-0 bg-muted/30">
              <img
                src={article.image}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </a>
      {/* Action buttons */}
      <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
          className={`p-1 rounded-md transition ${
            isBookmarked
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/50 hover:text-foreground hover:bg-muted"
          }`}
          title={isBookmarked ? "Remove from Reading List" : "Save to Reading List"}
        >
          {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onShare(); }}
          className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition"
          title="Share"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
        </button>
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition"
          onClick={(e) => e.stopPropagation()}
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}