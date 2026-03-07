import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../lib/auth-context";
import {
  updateMe, getRules, updateRules, signout,
  getCalendarConnections, connectGoogleCalendar, syncGoogleCalendar, deleteCalendarConnection, updateCalendarConnection,
  connectIcsCalendar, syncIcsCalendar,
  connectCaldavCalendar, syncCaldavCalendar,
  getContacts, createContact, updateContact, deleteContact, validateContact,
  getRssFeeds, addRssFeed, removeRssFeed,
  getFriends, sendCalendarShareRequest, getIncomingShareRequests, getOutgoingShareRequests, respondToShareRequest, unshareCalendar,
  getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification,
  getPushPreferences, updatePushPreferences, sendTestPush,
  getMyLists, getSharedLists,
  createBookingLink, getBookingLinks, deleteBookingLink,
} from "../lib/api";
import {
  isPushSupported, subscribeToPush, unsubscribeFromPush, isSubscribedToPush,
  PUSH_CATEGORIES, getPermissionState,
} from "../lib/push-notifications";
import { supabase } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import {
  Globe, Clock, Shield, Bell, LogOut, ChevronRight,
  Save, Loader2, Plus, X, Trash2, RefreshCw, Unlink, Link2, MapPin, Copy, Mail,
  Users, Link as LinkIcon, ExternalLink, AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck,
  CloudSun, Search, Server, Eye, EyeOff, User, Rss, UserPlus, Calendar, Send, Phone, MessageSquare,
  UtensilsCrossed, FileText, Pencil, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { getDeviceTimezone } from "../lib/timezone-utils";
import { InviteModal } from "./invite-modal";
import {
  getWeatherLocation, setWeatherLocation, clearWeatherLocation, searchCities,
  type WeatherLocation,
} from "../lib/weather-location";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export function SettingsPage() {
  const { profile, setProfile, refreshProfile, user } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("");
  const [rules, setRules] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [unreadUpdatesCount, setUnreadUpdatesCount] = useState(0);
  const [appMode, setAppMode] = useState(() => localStorage.getItem("chrono_mode") || "business");

  useEffect(() => {
    const handleStorageChange = () => setAppMode(localStorage.getItem("chrono_mode") || "business");
    window.addEventListener("chrono_mode_changed", handleStorageChange);
    return () => window.removeEventListener("chrono_mode_changed", handleStorageChange);
  }, []);

  const toggleAppMode = (mode: string) => {
    localStorage.setItem("chrono_mode", mode);
    setAppMode(mode);
    window.dispatchEvent(new Event("chrono_mode_changed"));
    if (mode === "host") toast.success("Switched to Event Host mode");
    else toast.success("Switched to Business mode");
  };

  // Fetch unread notification count for the badge on My Updates
  useEffect(() => {
    getNotifications().then((data: any[]) => {
      if (Array.isArray(data)) setUnreadUpdatesCount(data.filter((n) => !n.read).length);
    }).catch(() => {});
  }, [activeSection]); // re-fetch when navigating back from updates section

  // Handle URL param for deep-linking (e.g. /settings?section=rss-feeds)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section) setActiveSection(section);
  }, []);

  useEffect(() => {
    if (profile) setTimezone(profile.timezone || "");
  }, [profile]);

  useEffect(() => {
    getRules().then(setRules).catch(console.error);
  }, []);

  const handleSaveTimezone = async () => {
    setSaving(true);
    try {
      const updatedProfile = await updateMe({ timezone });
      setProfile(updatedProfile);
      toast.success("Timezone updated");
    } catch (e) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRules = async () => {
    setSaving(true);
    try {
      await updateRules(rules);
      toast.success("Timeframes saved");
    } catch (e) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signout();
    navigate("/login");
  };

  const groupedSections = [
    {
      title: "Profile & Preferences",
      items: [
        { id: "app-mode", label: "App Mode", icon: Users, desc: appMode === "host" ? "Event Host" : "Business / Work" },
        { id: "timezone", label: "Timezone", icon: Globe, desc: timezone || "Not set" },
        { id: "weather", label: "Weather Location", icon: CloudSun, desc: getWeatherLocation()?.city || "Not set — uses device location" },
        { id: "notifications", label: "Notifications", icon: Bell, desc: "Push notification settings" },
      ]
    },
    {
      title: "Business & Legal",
      items: [
        { id: "professional", label: "Professional Identity", icon: Briefcase, desc: "Business details for invoices & agreements" },
        { id: "invoices", label: "Agreements & Invoices", icon: FileText, desc: "Manage generated invoices & agreements" },
      ]
    },
    {
      title: "Calendar & Scheduling",
      items: [
        { id: "connections", label: "My Calendars", icon: Shield, desc: "Google, Microsoft, ICS" },
        { id: "timeframes", label: "Timeframes & Rules", icon: Clock, desc: "Work hours, focus blocks, buffers" },
        { id: "booking", label: "Meeting Booking Link", icon: LinkIcon, desc: "Public scheduling link for visitors" },
      ]
    },
    {
      title: "Network & Content",
      items: [
        { id: "contacts", label: "My Contacts", icon: Users, desc: "Friends, calendar sharing & scheduling" },
        { id: "updates", label: "My Updates", icon: Bell, desc: "Friend activity & notifications", badge: unreadUpdatesCount },
        { id: "rss-feeds", label: "RSS Feeds", icon: Rss, desc: "Custom RSS feed subscriptions" },
      ]
    }
  ];

  return (
    <div className="max-w-lg mx-auto px-3 sm:px-4 py-4 pb-20">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      {!activeSection ? (
        <div className="space-y-6">
          {/* User info */}
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{timezone}</p>
              </div>
              <button
                onClick={() => setActiveSection("contacts")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition hover:bg-white/15 shrink-0"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.08), rgba(99,102,241,0.08))" }}
                title="Share your calendar with friends"
              >
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className="text-primary whitespace-nowrap">Share my calendar</span>
              </button>
            </div>
          </div>

          {groupedSections.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-2">{group.title}</h2>
              <div className="glass rounded-2xl overflow-hidden">
                {group.items.map((s, iIdx) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-white/10 transition text-left ${iIdx !== group.items.length - 1 ? 'border-b border-border/5' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <s.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{s.label}</p>
                        {(s as any).badge > 0 && (
                          <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold shrink-0">{(s as any).badge}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-2">Account</h2>
            {/* Invite friends */}
            <button
              onClick={() => setInviteOpen(true)}
              className="w-full glass rounded-2xl p-4 flex items-center gap-3 hover:bg-white/10 transition text-left"
              style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(99,102,241,0.06))" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, rgba(196,160,255,0.25), rgba(160,196,255,0.25))" }}
              >
                <UserPlus className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Invite Friends</p>
                <p className="text-xs text-muted-foreground">Share Chrono with people you know</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            <button
              onClick={handleSignOut}
              className="w-full bg-card border rounded-xl p-4 flex items-center gap-3 hover:bg-destructive/5 transition text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4 text-destructive" />
              </div>
              <p className="text-sm font-medium text-destructive">Sign out</p>
            </button>
          </div>

          {/* Legal footer */}
          <p className="text-center text-[11px] font-light tracking-wide mt-6 pb-2" style={{ color: "var(--muted-foreground)" }}>
            <Link to="/privacy" className="hover:underline" style={{ color: "inherit" }} onClick={() => sessionStorage.setItem("chrono_skip_splash", "1")}>Privacy Policy</Link>
            <span className="mx-1.5">|</span>
            <Link to="/terms" className="hover:underline" style={{ color: "inherit" }} onClick={() => sessionStorage.setItem("chrono_skip_splash", "1")}>Terms of Use</Link>
          </p>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setActiveSection(null)}
            className="text-sm text-primary font-medium mb-4 hover:underline"
          >
            &larr; Back to settings
          </button>

          {activeSection === "app-mode" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">App Mode</h2>
              <p className="text-sm text-muted-foreground">Choose your primary experience in Chrono. This affects your navigation and calendar view.</p>
              <div className="space-y-3">
                <button
                  onClick={() => toggleAppMode("business")}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${appMode === "business" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/10 glass hover:bg-white/5"}`}
                >
                  <div className="font-medium">Business / Work</div>
                  <div className="text-xs text-muted-foreground mt-1">Focus on tasks, standard calendar, and client communication.</div>
                </button>
                <button
                  onClick={() => toggleAppMode("host")}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${appMode === "host" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/10 glass hover:bg-white/5"}`}
                >
                  <div className="font-medium">Event Host</div>
                  <div className="text-xs text-muted-foreground mt-1">Focus on Open Scheduling, event management, and attendee bookings.</div>
                </button>
              </div>
            </div>
          )}

          {activeSection === "timezone" && (
            <TimezoneSection
              timezone={timezone}
              setTimezone={setTimezone}
              onSave={handleSaveTimezone}
              saving={saving}
            />
          )}

          {activeSection === "weather" && <WeatherLocationSection />}
          {activeSection === "professional" && <ProfessionalIdentitySection />}
          {activeSection === "timeframes" && rules && (
            <TimeframesSection
              rules={rules}
              setRules={setRules}
              onSave={handleSaveRules}
              saving={saving}
            />
          )}

          {activeSection === "connections" && <ConnectionsSection />}
          {activeSection === "contacts" && <ContactsSection />}
          {activeSection === "rss-feeds" && <RssFeedsSection />}
          {activeSection === "updates" && <MyUpdatesSection onNavigateSection={setActiveSection} />}
          {activeSection === "invoices" && <MyInvoicesSection />}
          {activeSection === "booking" && <BookingLinkSection />}
          {activeSection === "notifications" && <NotificationsSection />}
        </div>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} senderName={profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "You"} />
    </div>
  );
}

function TimezoneSection({ timezone, setTimezone, onSave, saving }: any) {
  const deviceTz = getDeviceTimezone();
  const commonTimezones = [
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin",
    "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
    "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
  ];
  // Ensure the device timezone and current timezone are always in the list
  const allTimezones = Array.from(new Set([deviceTz, timezone, ...commonTimezones].filter(Boolean)));

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="font-semibold mb-3">Timezone</h3>
      {deviceTz && deviceTz !== timezone && (
        <button
          onClick={() => setTimezone(deviceTz)}
          className="w-full flex items-center gap-2 p-2.5 mb-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary hover:bg-primary/10 transition"
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Use detected: <span className="font-medium">{deviceTz}</span></span>
        </button>
      )}
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm mb-3"
      >
        {allTimezones.map((tz) => (
          <option key={tz} value={tz}>{tz}{tz === deviceTz ? " (device)" : ""}</option>
        ))}
      </select>
      <button
        onClick={onSave}
        disabled={saving}
        className="w-full py-2.5 glass-btn-primary rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save timezone
      </button>
    </div>
  );
}

function WeatherLocationSection() {
  const [location, setLocation] = useState<WeatherLocation | null>(getWeatherLocation());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<WeatherLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState(!!getWeatherLocation());

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const results = await searchCities(searchTerm.trim());
      setSearchResults(results);
    } catch (e) {
      toast.error("Failed to search cities");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectLocation = (loc: WeatherLocation) => {
    setLocation(loc);
    setSearchTerm("");
    setSearchResults([]);
    setSaved(false);
  };

  const handleClear = () => {
    clearWeatherLocation();
    setLocation(null);
    setSearchTerm("");
    setSearchResults([]);
    setSaved(false);
    toast.success("Weather location cleared — will use device location");
  };

  const handleSave = () => {
    if (!location) return;
    setWeatherLocation(location);
    setSaved(true);
    toast.success(`Weather location set to ${location.city}`);
  };

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="font-semibold mb-1">Weather Location</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Enter your city so the Day Rundown shows local weather without needing browser location access. Uses <span className="font-medium text-foreground">Open-Meteo</span> (free, no API key).
      </p>

      {/* Current location */}
      {location && (
        <div className="flex items-center gap-2 p-2.5 mb-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{location.city}</p>
            <p className="text-[11px] text-muted-foreground">{location.country} &middot; {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)}</p>
          </div>
          {saved && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-destructive/10 rounded-lg transition shrink-0"
            title="Clear"
          >
            <X className="w-3.5 h-3.5 text-destructive" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search city (e.g. Toronto, London, Tokyo)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchTerm.trim()}
          className="px-3 py-2 glass-btn-primary rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Search
        </button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="space-y-1.5 mt-3">
          <p className="text-[11px] text-muted-foreground font-medium">Select a city:</p>
          {searchResults.map((loc, i) => (
            <button
              key={`${loc.latitude}-${loc.longitude}-${i}`}
              onClick={() => handleSelectLocation(loc)}
              className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-sm hover:bg-primary/10 transition text-left"
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="flex-1 truncate">{loc.city}, {loc.country}</span>
            </button>
          ))}
        </div>
      )}

      {/* Save button */}
      {location && !saved && (
        <button
          onClick={handleSave}
          className="w-full mt-3 py-2.5 glass-btn-primary rounded-xl text-sm font-medium flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save weather location
        </button>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        If no city is set, the Day Rundown will ask for browser location permission instead.
      </p>
    </div>
  );
}

function TimeframesSection({ rules, setRules, onSave, saving }: any) {
  const updateHours = (type: "work_hours" | "outside_work_hours", day: string, field: "start" | "end", value: string) => {
    setRules((prev: any) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [day]: { ...prev[type]?.[day], [field]: value },
      },
    }));
  };

  const toggleDayHours = (type: "work_hours" | "outside_work_hours", day: string) => {
    setRules((prev: any) => {
      const current = prev[type] || {};
      if (current[day]) {
        const { [day]: _, ...rest } = current;
        return { ...prev, [type]: rest };
      } else {
        return {
          ...prev,
          [type]: {
            ...current,
            [day]: type === "work_hours" ? { start: "09:00", end: "17:00" } : { start: "18:00", end: "22:00" },
          },
        };
      }
    });
  };

  const addBlock = (type: "no_booking_hours" | "focus_blocks" | "meal_hours") => {
    const defaults: Record<string, any> = {
      no_booking_hours: { dow: "mon", start: "12:00", end: "13:00" },
      focus_blocks: { dow: "mon", start: "12:00", end: "13:00" },
      meal_hours: { dow: "mon", start: "12:00", end: "13:00", label: "Lunch" },
    };
    setRules((prev: any) => ({
      ...prev,
      [type]: [...(prev[type] || []), defaults[type]],
    }));
  };

  const updateBlock = (type: "no_booking_hours" | "focus_blocks" | "meal_hours", idx: number, field: string, value: string) => {
    setRules((prev: any) => ({
      ...prev,
      [type]: prev[type].map((b: any, i: number) => i === idx ? { ...b, [field]: value } : b),
    }));
  };

  const removeBlock = (type: "no_booking_hours" | "focus_blocks" | "meal_hours", idx: number) => {
    setRules((prev: any) => ({
      ...prev,
      [type]: prev[type].filter((_: any, i: number) => i !== idx),
    }));
  };

  const duplicateBlock = (type: "no_booking_hours" | "focus_blocks" | "meal_hours", idx: number) => {
    setRules((prev: any) => {
      const blocks = [...(prev[type] || [])];
      const source = blocks[idx];
      // Duplicate with the next day of week
      const nextDowIndex = (DAYS.indexOf(source.dow) + 1) % DAYS.length;
      const dup = { ...source, dow: DAYS[nextDowIndex] };
      blocks.splice(idx + 1, 0, dup);
      return { ...prev, [type]: blocks };
    });
  };

  return (
    <div className="space-y-4">
      {/* Work Hours */}
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Work Hours</h3>
        <div className="space-y-2">
          {DAYS.map((day) => {
            const hours = rules.work_hours?.[day];
            return (
              <div key={day} className="flex items-center gap-2">
                <button
                  onClick={() => toggleDayHours("work_hours", day)}
                  className={`w-16 text-xs py-1 rounded text-center font-medium ${
                    hours ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {DAY_LABELS[day].slice(0, 3)}
                </button>
                {hours ? (
                  <>
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) => updateHours("work_hours", day, "start", e.target.value)}
                      className="px-2 py-1 rounded border bg-input-background text-xs flex-1"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) => updateHours("work_hours", day, "end", e.target.value)}
                      className="px-2 py-1 rounded border bg-input-background text-xs flex-1"
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Outside Work Hours */}
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Outside Work Hours</h3>
        <div className="space-y-2">
          {DAYS.map((day) => {
            const hours = rules.outside_work_hours?.[day];
            return (
              <div key={day} className="flex items-center gap-2">
                <button
                  onClick={() => toggleDayHours("outside_work_hours", day)}
                  className={`w-16 text-xs py-1 rounded text-center font-medium ${
                    hours ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {DAY_LABELS[day].slice(0, 3)}
                </button>
                {hours ? (
                  <>
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) => updateHours("outside_work_hours", day, "start", e.target.value)}
                      className="px-2 py-1 rounded border bg-input-background text-xs flex-1"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) => updateHours("outside_work_hours", day, "end", e.target.value)}
                      className="px-2 py-1 rounded border bg-input-background text-xs flex-1"
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* No-Booking Hours */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">No-Booking Hours</h3>
          <button onClick={() => addBlock("no_booking_hours")} className="text-xs text-primary font-medium flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {(rules.no_booking_hours || []).map((block: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <select
              value={block.dow}
              onChange={(e) => updateBlock("no_booking_hours", idx, "dow", e.target.value)}
              className="px-2 py-1 rounded border bg-input-background text-xs"
            >
              {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d].slice(0, 3)}</option>)}
            </select>
            <input type="time" value={block.start} onChange={(e) => updateBlock("no_booking_hours", idx, "start", e.target.value)} className="px-2 py-1 rounded border bg-input-background text-xs flex-1" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="time" value={block.end} onChange={(e) => updateBlock("no_booking_hours", idx, "end", e.target.value)} className="px-2 py-1 rounded border bg-input-background text-xs flex-1" />
            <button onClick={() => removeBlock("no_booking_hours", idx)} className="p-1 hover:bg-destructive/10 rounded">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
            <button onClick={() => duplicateBlock("no_booking_hours", idx)} className="p-1 hover:bg-primary/10 rounded">
              <Copy className="w-3.5 h-3.5 text-primary" />
            </button>
          </div>
        ))}
        {(rules.no_booking_hours || []).length === 0 && (
          <p className="text-xs text-muted-foreground">No rules set</p>
        )}
      </div>

      {/* Focus Blocks */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Focus Blocks</h3>
          <button onClick={() => addBlock("focus_blocks")} className="text-xs text-primary font-medium flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {(rules.focus_blocks || []).map((block: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <select
              value={block.dow}
              onChange={(e) => updateBlock("focus_blocks", idx, "dow", e.target.value)}
              className="px-2 py-1 rounded border bg-input-background text-xs"
            >
              {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d].slice(0, 3)}</option>)}
            </select>
            <input type="time" value={block.start} onChange={(e) => updateBlock("focus_blocks", idx, "start", e.target.value)} className="px-2 py-1 rounded border bg-input-background text-xs flex-1" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="time" value={block.end} onChange={(e) => updateBlock("focus_blocks", idx, "end", e.target.value)} className="px-2 py-1 rounded border bg-input-background text-xs flex-1" />
            <button onClick={() => removeBlock("focus_blocks", idx)} className="p-1 hover:bg-destructive/10 rounded">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
            <button onClick={() => duplicateBlock("focus_blocks", idx)} className="p-1 hover:bg-primary/10 rounded">
              <Copy className="w-3.5 h-3.5 text-primary" />
            </button>
          </div>
        ))}
        {(rules.focus_blocks || []).length === 0 && (
          <p className="text-xs text-muted-foreground">No blocks set</p>
        )}
      </div>

      {/* Meal Hours */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold">Meal Hours</h3>
          </div>
          <button onClick={() => addBlock("meal_hours")} className="text-xs text-primary font-medium flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Protected time for meals — no meetings can be booked here.</p>
        {(rules.meal_hours || []).map((block: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <select
              value={block.dow}
              onChange={(e) => updateBlock("meal_hours", idx, "dow", e.target.value)}
              className="px-2 py-1 rounded border bg-input-background text-xs"
            >
              {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d].slice(0, 3)}</option>)}
            </select>
            <input type="time" value={block.start} onChange={(e) => updateBlock("meal_hours", idx, "start", e.target.value)} className="px-2 py-1 rounded border bg-input-background text-xs flex-1" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="time" value={block.end} onChange={(e) => updateBlock("meal_hours", idx, "end", e.target.value)} className="px-2 py-1 rounded border bg-input-background text-xs flex-1" />
            <input
              type="text"
              value={block.label || ""}
              placeholder="Lunch"
              onChange={(e) => updateBlock("meal_hours", idx, "label", e.target.value)}
              className="px-2 py-1 rounded border bg-input-background text-xs w-20"
            />
            <button onClick={() => removeBlock("meal_hours", idx)} className="p-1 hover:bg-destructive/10 rounded">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
            <button onClick={() => duplicateBlock("meal_hours", idx)} className="p-1 hover:bg-primary/10 rounded">
              <Copy className="w-3.5 h-3.5 text-primary" />
            </button>
          </div>
        ))}
        {(rules.meal_hours || []).length === 0 && (
          <p className="text-xs text-muted-foreground">No meal hours set. Add blocks to protect your eating time.</p>
        )}
      </div>

      {/* Buffers */}
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Buffer Time</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Before events (min)</label>
            <input
              type="number"
              value={rules.buffer_before_minutes || 0}
              onChange={(e) => setRules((prev: any) => ({ ...prev, buffer_before_minutes: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">After events (min)</label>
            <input
              type="number"
              value={rules.buffer_after_minutes || 0}
              onChange={(e) => setRules((prev: any) => ({ ...prev, buffer_after_minutes: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm"
            />
          </div>
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full py-2.5 glass-btn-primary rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save all timeframes
      </button>
    </div>
  );
}

function ConnectionsSection() {
  const [connections, setConnections] = useState<any[]>([]);
  const [showIcsForm, setShowIcsForm] = useState(false);
  const [icsUrl, setIcsUrl] = useState("");
  const [icsName, setIcsName] = useState("");
  const [icsLoading, setIcsLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // CalDAV state
  const [showCaldavForm, setShowCaldavForm] = useState(false);
  const [caldavUrl, setCaldavUrl] = useState("");
  const [caldavUsername, setCaldavUsername] = useState("");
  const [caldavPassword, setCaldavPassword] = useState("");
  const [caldavName, setCaldavName] = useState("");
  const [caldavLoading, setCaldavLoading] = useState(false);
  const [showCaldavPassword, setShowCaldavPassword] = useState(false);

  const refreshConnections = () => {
    getCalendarConnections().then(setConnections).catch(console.error);
  };

  useEffect(() => {
    refreshConnections();

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "google-calendar-connected") {
        toast.success("Google Calendar connected!");
        refreshConnections();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const data = await connectGoogleCalendar(window.location.href);
      if (data?.url) {
        const popup = window.open(data.url, "google-oauth", "width=600,height=700,popup=yes");
        if (!popup) {
          window.location.href = data.url;
        }
      }
    } catch (e) {
      toast.error("Failed to connect Google Calendar");
    }
  };

  const handleSync = async (conn: any) => {
    setSyncingId(conn.id);
    try {
      if (conn.provider === "ics") {
        await syncIcsCalendar(conn.id);
      } else if (conn.provider === "caldav") {
        await syncCaldavCalendar(conn.id);
      } else {
        await syncGoogleCalendar(conn.id);
      }
      refreshConnections();
      const label = conn.provider === "ics" ? "ICS" : conn.provider === "caldav" ? "CalDAV" : "Google";
      toast.success(`${label} Calendar synced`);
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message || "Unknown error"}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const active = connections.filter((c: any) => c.is_active);
      let synced = 0;
      for (const conn of active) {
        try {
          if (conn.provider === "ics") {
            await syncIcsCalendar(conn.id);
          } else if (conn.provider === "caldav") {
            await syncCaldavCalendar(conn.id);
          } else {
            await syncGoogleCalendar(conn.id);
          }
          synced++;
        } catch (e: any) {
          console.warn(`Sync failed for ${conn.display_name}:`, e);
        }
      }
      refreshConnections();
      toast.success(`Re-synced ${synced} calendar${synced !== 1 ? "s" : ""}`);
    } catch (e: any) {
      toast.error(`Re-sync failed: ${e.message || "Unknown error"}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      await deleteCalendarConnection(id);
      setConnections(connections.filter((c) => c.id !== id));
      toast.success("Connection removed");
    } catch (e) {
      toast.error("Failed to remove connection");
    }
  };

  const handleUpdateColor = async (id: string, color: string) => {
    try {
      setConnections(connections.map((c) => c.id === id ? { ...c, color } : c));
      await updateCalendarConnection(id, { color });
      toast.success("Calendar color updated");
    } catch (e) {
      toast.error("Failed to update color");
      refreshConnections();
    }
  };

  const handleConnectIcs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!icsUrl.trim()) {
      toast.error("Please enter an ICS URL");
      return;
    }
    setIcsLoading(true);
    try {
      const result = await connectIcsCalendar(icsUrl.trim(), icsName.trim() || undefined);
      toast.success(`ICS calendar connected! ${result.event_count || 0} events found.`);
      setIcsUrl("");
      setIcsName("");
      setShowIcsForm(false);
      refreshConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to connect ICS calendar");
    } finally {
      setIcsLoading(false);
    }
  };

  const handleConnectCaldav = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caldavUrl.trim() || !caldavUsername.trim() || !caldavPassword.trim()) {
      toast.error("Please fill in URL, username, and password");
      return;
    }
    setCaldavLoading(true);
    try {
      // Auto-prefix https:// if user just types a hostname like caldav.spacemail.com
      let finalUrl = caldavUrl.trim();
      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = `https://${finalUrl}`;
      const result = await connectCaldavCalendar({
        url: finalUrl,
        username: caldavUsername.trim(),
        password: caldavPassword.trim(),
        name: caldavName.trim() || undefined,
      });
      toast.success(`CalDAV calendar connected! ${result.event_count || 0} events synced.`);
      setCaldavUrl("");
      setCaldavUsername("");
      setCaldavPassword("");
      setCaldavName("");
      setShowCaldavForm(false);
      refreshConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to connect CalDAV calendar");
    } finally {
      setCaldavLoading(false);
    }
  };

  const activeConns = connections.filter((c: any) => c.is_active);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-3">My Calendars</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your calendars to sync events and power availability queries.
        </p>

        {/* Existing connections */}
        {activeConns.length > 0 && (
          <div className="space-y-2 mb-4">
            {activeConns.map((conn: any) => (
              <div key={conn.id} className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    conn.provider === "google"
                      ? "bg-[#4285F4]/10 text-[#4285F4]"
                      : conn.provider === "caldav"
                      ? "bg-teal-500/10 text-teal-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}>
                    {conn.provider === "google" ? "G" : conn.provider === "caldav" ? "DAV" : "ICS"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conn.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {conn.last_sync_at
                        ? `Synced ${new Date(conn.last_sync_at).toLocaleString()}`
                        : "Not synced yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="relative flex items-center justify-center p-1.5 hover:bg-muted/50 rounded-lg cursor-pointer">
                      <input
                        type="color"
                        value={conn.color || (conn.provider === "google" ? "#4285F4" : conn.provider === "caldav" ? "#14b8a6" : "#f59e0b")}
                        onChange={(e) => handleUpdateColor(conn.id, e.target.value)}
                        className="w-5 h-5 opacity-0 absolute inset-0 cursor-pointer"
                        title="Pick color"
                      />
                      <div 
                        className="w-4 h-4 rounded-full border border-border pointer-events-none" 
                        style={{ backgroundColor: conn.color || (conn.provider === "google" ? "#4285F4" : conn.provider === "caldav" ? "#14b8a6" : "#f59e0b") }} 
                      />
                    </div>
                    <button
                      onClick={() => handleSync(conn)}
                      disabled={syncingId === conn.id}
                      className="p-1.5 hover:bg-muted rounded-lg transition disabled:opacity-50"
                      title="Sync now"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${syncingId === conn.id ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleDeleteConnection(conn.id)}
                      className="p-1.5 hover:bg-destructive/10 rounded-lg transition"
                      title="Remove"
                    >
                      <Unlink className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
                {conn.provider === "ics" && conn.ics_url && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 truncate pl-11" title={conn.ics_url}>
                    {conn.ics_url}
                  </p>
                )}
                {conn.provider === "caldav" && conn.caldav_url && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 truncate pl-11" title={conn.caldav_url}>
                    CalDAV · {conn.external_account_id || conn.caldav_url}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Connect buttons */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg opacity-50 cursor-not-allowed">
            <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 flex items-center justify-center text-[#4285F4] text-xs font-bold">G</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Google Calendar</p>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg opacity-50 cursor-not-allowed">
            <div className="w-8 h-8 rounded-lg bg-[#0078D4]/10 flex items-center justify-center text-[#0078D4] text-xs font-bold">M</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Microsoft Outlook</p>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </div>
          </div>

          {/* CalDAV */}
          {!showCaldavForm ? (
            <button
              onClick={() => setShowCaldavForm(true)}
              className="w-full flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600 text-xs font-bold">DAV</div>
              <div className="flex-1">
                <p className="text-sm font-medium">Add CalDAV Calendar</p>
                <p className="text-xs text-muted-foreground">Spacemail, Namecheap, Nextcloud, SOGo, etc.</p>
              </div>
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : (
            <form onSubmit={handleConnectCaldav} className="p-3 bg-teal-500/5 border border-teal-500/20 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-teal-600" />
                  <span className="text-sm font-medium">Add CalDAV Calendar</span>
                </div>
                <button type="button" onClick={() => { setShowCaldavForm(false); setCaldavUrl(""); setCaldavUsername(""); setCaldavPassword(""); setCaldavName(""); }} className="p-1 hover:bg-muted rounded">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Server URL */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Server URL</label>
                <input
                  type="text"
                  placeholder="caldav.spacemail.com or https://caldav.privateemail.com/..."
                  value={caldavUrl}
                  onChange={(e) => setCaldavUrl(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
                  autoFocus
                />
              </div>

              {/* Credentials — always visible with labels */}
              <div className="p-2.5 bg-teal-500/5 rounded-lg space-y-2 border border-teal-500/10">
                <p className="text-xs font-medium text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                  <Shield className="w-3 h-3" /> Login credentials <span className="text-muted-foreground font-normal">(required)</span>
                </p>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    type="text"
                    placeholder="Username (usually your email)"
                    value={caldavUsername}
                    onChange={(e) => setCaldavUsername(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    type={showCaldavPassword ? "text" : "password"}
                    placeholder="Password or app-specific password"
                    value={caldavPassword}
                    onChange={(e) => setCaldavPassword(e.target.value)}
                    required
                    className="w-full pl-9 pr-9 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCaldavPassword(!showCaldavPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded"
                  >
                    {showCaldavPassword ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="Display name (optional)"
                value={caldavName}
                onChange={(e) => setCaldavName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
              />
              <p className="text-[11px] text-muted-foreground">
                Just enter the server hostname — Chrono auto-discovers calendar paths. Examples: <span className="font-mono text-[10px]">caldav.spacemail.com</span>, <span className="font-mono text-[10px]">caldav.privateemail.com</span>, <span className="font-mono text-[10px]">nextcloud.example.com/remote.php/dav</span>
              </p>
              <button
                type="submit"
                disabled={caldavLoading || !caldavUrl.trim() || !caldavUsername.trim() || !caldavPassword.trim()}
                className="w-full py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {caldavLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                {caldavLoading ? "Validating & connecting..." : "Connect CalDAV"}
              </button>
            </form>
          )}

          {/* ICS */}
          {!showIcsForm ? (
            <button
              onClick={() => setShowIcsForm(true)}
              className="w-full flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 text-xs font-bold">ICS</div>
              <div className="flex-1">
                <p className="text-sm font-medium">Add ICS / iCal URL</p>
                <p className="text-xs text-muted-foreground">Paste any .ics or webcal:// link</p>
              </div>
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : (
            <form onSubmit={handleConnectIcs} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium">Add ICS / iCal URL</span>
                </div>
                <button type="button" onClick={() => { setShowIcsForm(false); setIcsUrl(""); setIcsName(""); }} className="p-1 hover:bg-muted rounded">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <input
                type="url"
                placeholder="https://example.com/calendar.ics"
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
                autoFocus
              />
              <input
                type="text"
                placeholder="Display name (optional)"
                value={icsName}
                onChange={(e) => setIcsName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
              />
              <p className="text-[11px] text-muted-foreground">
                Supports https://, http://, and webcal:// URLs. The server will validate the feed before connecting.
              </p>
              <button
                type="submit"
                disabled={icsLoading || !icsUrl.trim()}
                className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {icsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {icsLoading ? "Validating & connecting..." : "Connect ICS feed"}
              </button>
            </form>
          )}
        </div>

        {/* Re-sync all button */}
        {activeConns.length > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="w-full mt-4 py-2.5 bg-primary/10 text-primary rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/20 transition"
          >
            {syncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Re-sync all calendars
          </button>
        )}
      </div>

      {/* Outlook Quick-Switch accounts */}
      <OutlookAccountsCard />

      {/* Gmail Quick-Switch accounts */}
      <GmailAccountsCard />
    </div>
  );
}

function OutlookAccountsCard() {
  const { profile, setProfile } = useAuth();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccounts(profile?.outlook_accounts || []);
  }, [profile]);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || accounts.includes(email)) return;
    const updated = [...accounts, email];
    setSaving(true);
    try {
      const updatedProfile = await updateMe({ outlook_accounts: updated });
      setProfile(updatedProfile);
      setNewEmail("");
      toast.success("Account saved");
    } catch {
      toast.error("Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (email: string) => {
    const updated = accounts.filter((a) => a !== email);
    try {
      const updatedProfile = await updateMe({ outlook_accounts: updated });
      setProfile(updatedProfile);
      toast.success("Account removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[#0078D4]/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-[#0078D4]" />
        </div>
        <h3 className="font-semibold">Outlook Quick-Switch</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4 mt-1">
        Save your Outlook email addresses here. Every event in Chrono will then show a targeted <span className="font-medium text-foreground">"Open as…"</span> button so you land in the right account immediately — no manual switching.
      </p>

      {accounts.length > 0 && (
        <div className="space-y-2 mb-3">
          {accounts.map((email) => (
            <div
              key={email}
              className="flex items-center gap-2.5 p-2.5 bg-[#0078D4]/5 border border-[#0078D4]/15 rounded-lg"
            >
              <div className="w-7 h-7 rounded-full bg-[#0078D4]/15 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-[#0078D4]">
                  {email[0].toUpperCase()}
                </span>
              </div>
              <span className="flex-1 text-sm truncate">{email}</span>
              <button
                onClick={() => handleRemove(email)}
                className="p-1.5 hover:bg-destructive/10 rounded-lg transition"
                title="Remove"
              >
                <X className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          placeholder="staff@university.edu"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1 px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newEmail.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 transition"
          style={{ background: "#0078D4", color: "#fff" }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Works with Microsoft 365, Outlook.com, and university Exchange accounts.
      </p>
    </div>
  );
}

// ── Gmail Quick-Switch ──────────────────────��─────────────────────────────────

function GmailAccountsCard() {
  const { profile, setProfile } = useAuth();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccounts(profile?.gmail_accounts || []);
  }, [profile]);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || accounts.includes(email)) return;
    const updated = [...accounts, email];
    setSaving(true);
    try {
      const updatedProfile = await updateMe({ gmail_accounts: updated });
      setProfile(updatedProfile);
      setNewEmail("");
      toast.success("Account saved");
    } catch {
      toast.error("Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (email: string) => {
    const updated = accounts.filter((a) => a !== email);
    try {
      const updatedProfile = await updateMe({ gmail_accounts: updated });
      setProfile(updatedProfile);
      toast.success("Account removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-[#EA4335]/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-[#EA4335]" />
        </div>
        <h3 className="font-semibold">Gmail Quick-Switch</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4 mt-1">
        Save your Gmail / Google Workspace addresses here. Every event in Chrono will then show a targeted <span className="font-medium text-foreground">"Open as..."</span> button so you land in the right Google Calendar account immediately.
      </p>

      {accounts.length > 0 && (
        <div className="space-y-2 mb-3">
          {accounts.map((email) => (
            <div
              key={email}
              className="flex items-center gap-2.5 p-2.5 bg-[#EA4335]/5 border border-[#EA4335]/15 rounded-lg"
            >
              <div className="w-7 h-7 rounded-full bg-[#EA4335]/15 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-[#EA4335]">
                  {email[0].toUpperCase()}
                </span>
              </div>
              <span className="flex-1 text-sm truncate">{email}</span>
              <button
                onClick={() => handleRemove(email)}
                className="p-1.5 hover:bg-destructive/10 rounded-lg transition"
                title="Remove"
              >
                <X className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          placeholder="you@gmail.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1 px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newEmail.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 transition"
          style={{ background: "#EA4335", color: "#fff" }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Works with Gmail, Google Workspace, and university Google accounts.
      </p>
    </div>
  );
}

// ── Calendar Contacts ─────────────────────────────────────────────────────────

function CalendarSharingGuide({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 space-y-2.5 ${className || ""}`}>
      <div className="flex items-start gap-2">
        <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900">How to Share Your Calendar</p>
          <p className="text-[12px] text-amber-800/80 mt-0.5">
            Your contact needs to share their calendar&apos;s iCal link with you. Both public and secret/private links work.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <a
          href="https://support.google.com/calendar/answer/37082?hl=en#zippy=%2Cshare-your-calendar-with-anyone"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 p-2 rounded-lg bg-white/70 border border-amber-200/50 hover:bg-white transition group"
        >
          
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-amber-900">Google Calendar</p>
            <p className="text-[11px] text-amber-700/70">Settings &rarr; Share &rarr; Get shareable link</p>
          </div>
          <ExternalLink className="w-3 h-3 text-amber-400 group-hover:text-amber-600 transition shrink-0" />
        </a>

        <a
          href="https://support.microsoft.com/en-au/office/share-an-outlook-calendar-as-view-only-with-others-353ed2c1-3ec5-449d-8c73-6931a0adab88"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 p-2 rounded-lg bg-white/70 border border-amber-200/50 hover:bg-white transition group"
        >
          
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-amber-900">Outlook / Microsoft 365</p>
            <p className="text-[11px] text-amber-700/70">Share &rarr; Publish &rarr; Copy ICS link</p>
          </div>
          <ExternalLink className="w-3 h-3 text-amber-400 group-hover:text-amber-600 transition shrink-0" />
        </a>
      </div>

      <div className="flex items-start gap-1.5 pt-0.5">
        <ShieldCheck className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700/70 leading-relaxed">
          <span className="font-medium text-amber-800">Secret links are recommended</span> — they work without making the calendar publicly visible. Public links require the owner to enable public sharing first.
        </p>
      </div>
    </div>
  );
}

function ContactsSection() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<{ type: string; message: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [validating, setValidating] = useState<Record<string, boolean>>({});
  const [validationResults, setValidationResults] = useState<Record<string, { valid: boolean; message?: string; event_count?: number }>>({});
  const [requestingShare, setRequestingShare] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondIcalUrl, setRespondIcalUrl] = useState("");
  const [showRespondForm, setShowRespondForm] = useState<string | null>(null);
  const [tab, setTab] = useState<"friends" | "calendars">("friends");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [unsharingId, setUnsharingId] = useState<string | null>(null);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [c, f, inReqs, outReqs] = await Promise.all([
        getContacts().catch(() => []),
        getFriends().catch(() => []),
        getIncomingShareRequests().catch(() => []),
        getOutgoingShareRequests().catch(() => []),
      ]);
      setContacts(c);
      setFriends(f);
      setIncomingRequests(inReqs);
      setOutgoingRequests(outReqs);
    } catch (e) {
      console.error("Contacts refresh error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    setAddError(null);
    try {
      if (editingContactId) {
        await updateContact(editingContactId, { name: name.trim(), ical_url: url.trim(), notes: notes.trim() });
        toast.success(`${name.trim()} updated`);
      } else {
        await createContact({ name: name.trim(), ical_url: url.trim(), notes: notes.trim() });
        toast.success(`${name.trim()} added`);
      }
      setName(""); setUrl(""); setNotes(""); setShowForm(false); setAddError(null); setEditingContactId(null);
      refreshAll();
    } catch (err: any) {
      const msg = err.message || "Failed to add contact";
      if (msg.includes("Could not reach") || msg.includes("not be publicly shared") || msg.includes("network error") || msg.includes("timed out")) {
        setAddError({ type: "unreachable", message: msg });
      } else if (msg.includes("valid calendar data") || msg.includes("iCal (.ics) link") || msg.includes("HTML page instead")) {
        setAddError({ type: "invalid", message: msg });
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async (id: string, contactName: string) => {
    setValidating((v) => ({ ...v, [id]: true }));
    try {
      const result = await validateContact(id);
      setValidationResults((v) => ({ ...v, [id]: result }));
      if (result.valid) {
        toast.success(`${contactName}'s calendar is reachable (${result.event_count ?? 0} events found)`);
      }
    } catch (err: any) {
      toast.error(`Failed to validate: ${err.message}`);
    } finally {
      setValidating((v) => ({ ...v, [id]: false }));
    }
  };

  const handleDelete = async (id: string, contactName: string) => {
    try {
      await deleteContact(id);
      toast.success(`${contactName} removed`);
      setValidationResults((v) => { const next = { ...v }; delete next[id]; return next; });
      refreshAll();
    } catch {
      toast.error("Failed to remove contact");
    }
  };

  const handleRequestShare = async (friend: any) => {
    setRequestingShare(friend.id);
    try {
      await sendCalendarShareRequest(friend.id, friend.email, friend.name);
      toast.success(`Calendar share request sent to ${friend.name}`);
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to send request");
    } finally {
      setRequestingShare(null);
    }
  };

  const handleRespondToRequest = async (req: any, action: "accept" | "decline") => {
    setRespondingId(req.id);
    try {
      const result = await respondToShareRequest(req.id, action);
      if (action === "accept") {
        const count = result?.shared_count || 0;
        toast.success(`All ${count} calendar${count !== 1 ? "s" : ""} shared with ${req.from_name}`);
      } else {
        toast.success("Request declined");
      }
      setShowRespondForm(null);
      setRespondIcalUrl("");
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to respond");
    } finally {
      setRespondingId(null);
    }
  };

  const handleUnshare = async (friendId: string, friendName: string) => {
    setUnsharingId(friendId);
    try {
      await unshareCalendar(friendId);
      toast.success(`Stopped sharing calendars with ${friendName}`);
      refreshAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to unshare");
    } finally {
      setUnsharingId(null);
    }
  };

  const initials = (n: string) => n.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
  const colorFor = (n: string) => avatarColors[n.charCodeAt(0) % avatarColors.length];

  const pendingIncoming = incomingRequests.filter((r) => r.status === "pending");
  const hasOutgoingPending = (friendId: string) => outgoingRequests.some((r) => r.to_id === friendId && r.status === "pending");
  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const pendingFriends = friends.filter((f) => f.status === "pending");

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-xl">
        <button
          onClick={() => setTab("friends")}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${tab === "friends" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Friends {pendingIncoming.length > 0 && <span className="w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">{pendingIncoming.length}</span>}
          </div>
        </button>
        <button
          onClick={() => setTab("calendars")}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${tab === "calendars" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Calendar Links
          </div>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "friends" ? (
        <div className="contents">
          {/* Incoming calendar share requests */}
          {pendingIncoming.length > 0 && (
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Bell className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <h3 className="text-sm font-semibold">Calendar Share Requests</h3>
              </div>
              <div className="space-y-2">
                {pendingIncoming.map((req) => (
                  <div key={req.id} className="rounded-xl border border-amber-200/50 bg-amber-50/40 p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: colorFor(req.from_name) }}>
                        {initials(req.from_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{req.from_name}</p>
                        <p className="text-[11px] text-muted-foreground">{req.from_email}</p>
                        <p className="text-[11px] text-amber-700 mt-1">Wants to see your calendar for scheduling</p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleRespondToRequest(req, "accept")}
                          disabled={respondingId === req.id}
                          className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {respondingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Accept & Share All
                        </button>
                        <button
                          onClick={() => handleRespondToRequest(req, "decline")}
                          disabled={respondingId === req.id}
                          className="flex-1 py-2 bg-muted text-muted-foreground rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {respondingId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          Decline
                        </button>
                      </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends list */}
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold">My Friends</h3>
              </div>
              <button
                onClick={() => setInviteOpen(true)}
                className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
              >
                <UserPlus className="w-3 h-3" /> Invite
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4 mt-1">
              People you've invited to Chrono. Once they join, you can request to view their calendar for easy scheduling.
            </p>

            {acceptedFriends.length === 0 && pendingFriends.length === 0 ? (
              <div className="text-center py-6">
                <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No friends yet</p>
                <button onClick={() => setInviteOpen(true)} className="mt-2 text-xs text-primary font-medium hover:underline">
                  Invite someone to Chrono
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Accepted friends */}
                {acceptedFriends.map((f) => {
                  const isPendingReq = hasOutgoingPending(f.id);
                  return (
                    <div key={f.id} className="rounded-xl border border-border/40 p-3 bg-muted/25">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: colorFor(f.name) }}>
                          {initials(f.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{f.name}</p>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium shrink-0">On Chrono</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{f.email}</p>
                          {(() => {
                            const linkedContact = contacts.find((c: any) => c.id === f.contact_id || c.name.toLowerCase() === f.name.toLowerCase());
                            if (linkedContact?.notes) {
                              return (
                                <div className="mt-1.5 p-2 bg-background/50 rounded-lg text-[11px] text-muted-foreground border border-border/30">
                                  <p className="flex items-start gap-1.5">
                                    <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                                    <span className="whitespace-pre-wrap">{linkedContact.notes}</span>
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {f.has_calendar ? (
                            <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                              <Calendar className="w-3 h-3" /> {f.shared_calendar_count ? `${f.shared_calendar_count} Shared` : "Shared"}
                            </div>
                          ) : isPendingReq ? (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                              <Clock className="w-3 h-3" /> Pending
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRequestShare(f)}
                              disabled={requestingShare === f.id}
                              className="text-[10px] px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20 transition flex items-center gap-1 disabled:opacity-50"
                            >
                              {requestingShare === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                              Request Calendar
                            </button>
                          )}
                        </div>
                      </div>
                      {f.i_shared && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
                          <p className="text-[10px] text-muted-foreground">
                            You shared {f.i_shared_count || "your"} calendar{f.i_shared_count !== 1 ? "s" : ""} with {f.name.split(" ")[0]}
                          </p>
                          <button
                            onClick={() => handleUnshare(f.id, f.name)}
                            disabled={unsharingId === f.id}
                            className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 font-medium hover:bg-red-500/20 transition flex items-center gap-1 disabled:opacity-50"
                          >
                            {unsharingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                            Unshare
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Pending invites */}
                {pendingFriends.length > 0 && (
                  <div className="contents">
                    {acceptedFriends.length > 0 && (
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pt-2">Pending Invites</p>
                    )}
                    {pendingFriends.map((f) => (
                      <div key={f.id} className="rounded-xl border border-border/30 p-3 bg-muted/15 opacity-70">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground text-xs font-bold">
                            {initials(f.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{f.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              {f.type === "sms" ? <Phone className="w-2.5 h-2.5 shrink-0" /> : <Mail className="w-2.5 h-2.5 shrink-0" />}
                              {f.email || f.phone}
                            </p>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
                            {f.type === "sms" ? "SMS sent" : "Email sent"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <InviteModal open={inviteOpen} onClose={() => { setInviteOpen(false); refreshAll(); }} senderName={user?.user_metadata?.name || user?.email?.split("@")[0] || "You"} />
        </div>
      ) : (
        <div className="contents">
          {/* Calendar contacts tab */}
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold">Calendar Links</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGuide((v) => !v)}
                  className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 hover:text-foreground transition"
                  title="How to share your calendar"
                >
                  <HelpCircle className="w-3 h-3" /> Guide
                </button>
                <button
                  onClick={() => { setShowForm((v) => !v); setAddError(null); }}
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 mt-1">
              iCal links for friends' calendars. Cal-e uses these to find mutual free slots: <span className="font-medium text-foreground">"Is Liam free Tuesday?"</span>
            </p>

            {showGuide && <CalendarSharingGuide className="mb-4" />}

            {showForm && (
              <form onSubmit={handleAdd} className="p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-2.5 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" /> {editingContactId ? "Edit Contact" : "Add Contact"}
                  </span>
                  <button type="button" onClick={() => { setShowForm(false); setName(""); setUrl(""); setNotes(""); setAddError(null); setEditingContactId(null); }} className="p-1 hover:bg-muted rounded">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                <input type="text" placeholder="Name (e.g. Liam)" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60" />
                <input type="url" placeholder="iCal / webcal URL (https://... or webcal://...)" value={url} onChange={(e) => { setUrl(e.target.value); setAddError(null); }} required className={`w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60 ${addError ? "border-red-400" : ""}`} />
                <textarea placeholder="Notes about this contact" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border bg-input-background text-sm placeholder:text-muted-foreground/60 resize-none" />
                <p className="text-[11px] text-muted-foreground">
                  Supports Google Calendar, Outlook/Microsoft 365, Apple iCloud, webcal:// links, and any .ics URL.
                </p>

                {addError && (
                  <div className="rounded-lg border border-red-200 bg-red-50/70 p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[12px] font-semibold text-red-800">
                          {addError.type === "unreachable" ? "Calendar link not reachable" : "Invalid calendar data"}
                        </p>
                        <p className="text-[11px] text-red-700/80 mt-0.5">{addError.message}</p>
                      </div>
                    </div>
                    <CalendarSharingGuide className="!border-red-200/60 !bg-red-50/40" />
                  </div>
                )}

                <button type="submit" disabled={saving || !name.trim() || !url.trim()} className="w-full py-2 glass-btn-primary rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? (editingContactId ? "Updating..." : "Validating & adding...") : (editingContactId ? "Save changes" : "Add contact")}
                </button>
              </form>
            )}

            {contacts.length === 0 ? (
              <div className="text-center py-6">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No calendar links yet</p>
                <p className="text-[11px] text-muted-foreground mt-1">Add iCal links manually, or request a friend to share theirs from the Friends tab</p>
                <button onClick={() => setShowForm(true)} className="mt-2 text-xs text-primary font-medium hover:underline">
                  Add your first calendar link
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c: any) => {
                  const vr = validationResults[c.id];
                  const isValidating = validating[c.id];
                  return (
                    <div key={c.id} className="rounded-xl border border-border/40 overflow-hidden">
                      <div className="flex items-start gap-3 p-3 bg-muted/25">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: colorFor(c.name) }}>
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium">{c.name}</p>
                            {c.source === "share_request" && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">via request</span>}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <LinkIcon className="w-2.5 h-2.5 shrink-0" />
                            {c.ical_url}
                          </p>
                          {c.notes && (
                            <div className="mt-1.5 p-2 bg-background/50 rounded-lg text-[11px] text-muted-foreground border border-border/30">
                              <p className="flex items-start gap-1.5">
                                <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="whitespace-pre-wrap">{c.notes}</span>
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { setEditingContactId(c.id); setName(c.name); setUrl(c.ical_url); setNotes(c.notes || ""); setShowForm(true); setAddError(null); }} disabled={isValidating} className="p-1.5 hover:bg-muted rounded-lg transition" title="Edit">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleValidate(c.id, c.name)} disabled={isValidating} className="p-1.5 hover:bg-primary/10 rounded-lg transition" title="Validate">
                            {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <RefreshCw className="w-3.5 h-3.5 text-primary" />}
                          </button>
                          <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 hover:bg-destructive/10 rounded-lg transition" title="Remove">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </div>
                      {vr && (
                        <div className={`px-3 py-2 flex items-start gap-2 text-[11px] ${vr.valid ? "bg-emerald-50/70 border-t border-emerald-200/50" : "bg-red-50/70 border-t border-red-200/50"}`}>
                          {vr.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            {vr.valid ? (
                              <p className="text-emerald-800">Calendar is reachable — <span className="font-medium">{vr.event_count} event{vr.event_count !== 1 ? "s" : ""}</span> found</p>
                            ) : (
                              <div className="space-y-1.5">
                                <p className="text-red-800 font-medium">Calendar link is not reachable</p>
                                {vr.message && <p className="text-red-700/80">{vr.message}</p>}
                              </div>
                            )}
                          </div>
                          <button onClick={() => setValidationResults((v) => { const next = { ...v }; delete next[c.id]; return next; })} className="p-0.5 hover:bg-black/5 rounded shrink-0">
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Wake words hint */}
          {contacts.length > 0 && (
            <div className="glass rounded-2xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Try asking Cal-e</p>
              <div className="space-y-1.5">
                {[
                  `"Is ${contacts[0].name.split(" ")[0]} free Tuesday at 3pm?"`,
                  `"Find a time to meet with ${contacts[0].name.split(" ")[0]} next week"`,
                  `"When is ${contacts[0].name.split(" ")[0]} available this week?"`,
                  `"Are ${contacts[0].name.split(" ")[0]} and I both free Friday afternoon?"`,
                ].map((q) => (
                  <p key={q} className="text-[12px] text-primary/80 italic bg-primary/5 px-2.5 py-1.5 rounded-lg">{q}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RssFeedsSection() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [lastResolved, setLastResolved] = useState<{ from: string; to: string; platform: string | null; validated: boolean } | null>(null);

  const PLATFORM_COLORS: Record<string, string> = {
    Substack: "#FF6719", Medium: "#000000", YouTube: "#FF0000",
    Tumblr: "#36465D", WordPress: "#21759B", Blogger: "#FF5722", Reddit: "#FF4500",
  };

  // Detect platform from input for live hint
  const detectedPlatform = React.useMemo(() => {
    const u = newUrl.trim().toLowerCase();
    if (!u) return null;
    if (u.includes("substack.com")) return { platform: "Substack", hint: "Substack detected — will auto-convert to /feed" };
    if (u.includes("medium.com")) return { platform: "Medium", hint: "Medium detected — will auto-convert to /feed/..." };
    if (u.includes("youtube.com")) return { platform: "YouTube", hint: "YouTube detected — will convert to channel RSS feed" };
    if (u.includes("tumblr.com")) return { platform: "Tumblr", hint: "Tumblr detected — will auto-convert to /rss" };
    if (u.includes("wordpress.com")) return { platform: "WordPress", hint: "WordPress detected — will auto-convert to /feed" };
    if (u.includes("blogspot.com") || u.includes("blogger.com")) return { platform: "Blogger", hint: "Blogger detected — will auto-convert to RSS" };
    if (u.includes("reddit.com")) return { platform: "Reddit", hint: "Reddit detected — will auto-convert to .rss" };
    return null;
  }, [newUrl]);

  const loadFeeds = async () => {
    try {
      setLoading(true);
      const data = await getRssFeeds();
      setFeeds(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load RSS feeds:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFeeds(); }, []);

  const handleAdd = async () => {
    if (!newUrl.trim()) return;
    setAdding(true);
    setLastResolved(null);
    try {
      const result = await addRssFeed(newUrl.trim(), newName.trim() || undefined);
      if (result.feeds) setFeeds(result.feeds);
      else await loadFeeds();
      if (result.resolved) setLastResolved(result.resolved);
      setNewUrl("");
      setNewName("");
      const platform = result.resolved?.platform;
      const wasConverted = result.resolved?.from !== result.resolved?.to;
      toast.success(wasConverted ? `${platform || "Feed"} added! URL auto-resolved.` : "Feed added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add feed");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const result = await removeRssFeed(id);
      if (result.feeds) setFeeds(result.feeds);
      else await loadFeeds();
      toast.success("Feed removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to remove feed");
    }
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
          <Rss className="w-4 h-4 text-orange-500" />
        </div>
        <h3 className="font-semibold">RSS Feeds</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-3 mt-1">
        Paste any website or blog URL. Chrono auto-detects RSS feeds from Substack, Medium, WordPress, YouTube, Reddit, Tumblr, Blogger, and more.
      </p>

      {/* Supported platforms */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["Substack", "Medium", "WordPress", "YouTube", "Reddit", "Tumblr", "Blogger"].map((p) => (
          <span key={p} className="text-[10px] font-medium px-2 py-0.5 rounded-full border" style={{ color: PLATFORM_COLORS[p], borderColor: `${PLATFORM_COLORS[p]}30`, background: `${PLATFORM_COLORS[p]}08` }}>
            {p}
          </span>
        ))}
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground">
          + any RSS/Atom
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {feeds.length > 0 && (
            <div className="space-y-2 mb-4">
              {feeds.map((feed) => {
                const color = feed.platform ? PLATFORM_COLORS[feed.platform] || "#f97316" : "#f97316";
                return (
                  <div key={feed.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border" style={{ background: `${color}08`, borderColor: `${color}18` }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
                      {feed.platform ? (
                        <span className="text-[9px] font-bold" style={{ color }}>{feed.platform[0]}</span>
                      ) : (
                        <Rss className="w-3.5 h-3.5" style={{ color }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{feed.name}</p>
                        {feed.platform && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ color, background: `${color}12` }}>
                            {feed.platform}
                          </span>
                        )}
                        {feed.validated && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{feed.url}</p>
                      {feed.originalUrl && feed.originalUrl !== feed.url && (
                        <p className="text-[9px] text-muted-foreground/50 truncate">Resolved from: {feed.originalUrl}</p>
                      )}
                    </div>
                    <button onClick={() => handleRemove(feed.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Last resolved info */}
          {lastResolved && lastResolved.from !== lastResolved.to && (
            <div className="mb-3 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {lastResolved.platform ? `${lastResolved.platform} URL auto-resolved` : "Feed URL auto-discovered"}
                </span>
              </div>
              <p className="text-muted-foreground text-[10px] truncate">
                <span className="line-through opacity-50">{lastResolved.from}</span>
              </p>
              <p className="text-muted-foreground text-[10px] truncate">
                {lastResolved.to}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="relative">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Paste any URL — blog, newsletter, subreddit..."
                className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm pr-20"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              {detectedPlatform && (
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: PLATFORM_COLORS[detectedPlatform.platform] || "#f97316", background: `${PLATFORM_COLORS[detectedPlatform.platform] || "#f97316"}15` }}
                >
                  {detectedPlatform.platform}
                </span>
              )}
            </div>
            {detectedPlatform && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                {detectedPlatform.hint}
              </p>
            )}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Feed name (optional — auto-detected)"
              className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newUrl.trim()}
              className="w-full py-2.5 glass-btn-primary rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? "Discovering feed..." : "Add Feed"}
            </button>
          </div>

          {/* Help text */}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Tips</p>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              <li>For <span className="font-medium text-foreground">Substack</span>: paste the newsletter URL (e.g. <span className="font-mono text-[10px]">name.substack.com</span>)</li>
              <li>For <span className="font-medium text-foreground">Medium</span>: paste the publication or user URL</li>
              <li>For <span className="font-medium text-foreground">Reddit</span>: paste a subreddit URL (e.g. <span className="font-mono text-[10px]">reddit.com/r/technology</span>)</li>
              <li>For any site, paste its URL — Chrono will try to auto-discover the feed</li>
              <li>You can also paste a direct RSS/Atom feed URL</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

const NOTIF_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  friend_joined: { icon: UserPlus, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  friend_shared_cal: { icon: Calendar, color: "text-blue-600", bg: "bg-blue-500/10" },
  friend_updated_cal: { icon: Calendar, color: "text-blue-500", bg: "bg-blue-500/10" },
  friend_requested_cal: { icon: Calendar, color: "text-amber-600", bg: "bg-amber-500/10" },
  friend_shared_list: { icon: Users, color: "text-violet-600", bg: "bg-violet-500/10" },
  friend_updated_list: { icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10" },
  friend_left_list: { icon: LogOut, color: "text-red-500", bg: "bg-red-500/10" },
  invoice_viewed: { icon: Eye, color: "text-primary", bg: "bg-primary/10" },
  invoice_accepted: { icon: FileText, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  invoice_comment: { icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-500/10" },
  invoice_change_requested: { icon: FileText, color: "text-amber-600", bg: "bg-amber-500/10" },
  invoice_invalidated: { icon: X, color: "text-red-500", bg: "bg-red-500/10" },
};

function MyUpdatesSection({ onNavigateSection }: { onNavigateSection: (section: string | null) => void }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (e) {
      console.error("Failed to load notifications:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("All marked as read");
    } catch { toast.error("Failed to mark all as read"); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch { toast.error("Failed to delete"); }
  };

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch { /* silent */ }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const handleNotifClick = async (n: any) => {
    if (!n.read) handleRead(n.id);
    // Navigate based on notification type
    switch (n.type) {
      case "friend_joined":
      case "friend_shared_cal":
      case "friend_updated_cal":
      case "friend_requested_cal":
        onNavigateSection("contacts");
        break;
      case "friend_shared_list":
      case "friend_updated_list":
      case "friend_left_list":
        navigate("/");
        break;
      case "invoice_viewed":
      case "invoice_accepted":
      case "invoice_comment":
      case "invoice_change_requested":
      case "invoice_invalidated":
        if (n.meta?.listId || n.meta?.list_id) {
          navigate(`/invoice-generator/${n.meta.listId || n.meta.list_id}`);
        } else {
          onNavigateSection("invoices");
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold">My Updates</h3>
            {unreadCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">{unreadCount}</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="text-[11px] text-primary font-medium hover:underline">
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No updates yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Friend activity and notifications will appear here</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {notifications.map((n) => {
              const config = NOTIF_ICONS[n.type] || { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" };
              const Icon = config.icon;
              return (
                <div
                  key={n.id}
                  className={`rounded-xl p-3 flex items-start gap-3 transition cursor-pointer hover:ring-1 hover:ring-primary/20 ${n.read ? "bg-muted/20 opacity-70" : "bg-primary/5 border border-primary/10"}`}
                  onClick={() => handleNotifClick(n)}
                >
                  <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.read ? "" : "font-medium"}`}>{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                      className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground/50 hover:text-red-500 transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MyInvoicesSection() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [my, shared] = await Promise.all([getMyLists(), getSharedLists()]);
        const allProjects = [
          ...(my || []).filter((l: any) => l.list_type === "project" && l.invoice_generated).map((l: any) => ({ ...l, _isShared: false })),
          ...(shared || []).filter((l: any) => l.list_type === "project" && l.invoice_generated).map((l: any) => ({ ...l, _isShared: true }))
        ];
        
        // Sort by most recently updated or accepted
        allProjects.sort((a, b) => {
          const aDate = a.invoice_settings?.accepted_at || a.updated_at || a.created_at;
          const bDate = b.invoice_settings?.accepted_at || b.updated_at || b.created_at;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
        
        setInvoices(allProjects);
      } catch (e) {
        console.error("Failed to load invoices", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center">
        <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-foreground">No agreements or invoices yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Generate agreements and invoices from your project milestones to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {invoices.map((inv) => {
        const isPaid = inv.invoice_settings?.status === "paid";
        const isAccepted = inv.invoice_settings?.accepted;
        const totalComments = inv.invoice_settings?.comments?.length || 0;
        
        let statusText = "Pending";
        let statusColor = "text-amber-600 bg-amber-50 border-amber-200";
        if (isPaid) {
          statusText = "Paid";
          statusColor = "text-emerald-600 bg-emerald-50 border-emerald-200";
        } else if (isAccepted) {
          statusText = "Accepted";
          statusColor = "text-blue-600 bg-blue-50 border-blue-200";
        }
        
        const logs = inv.invoice_logs || [];
        const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        return (
          <div key={inv.id} className="glass rounded-2xl p-5 hover:bg-white/40 transition">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold text-foreground truncate">{inv.title}</h4>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>{inv._isShared ? "Shared Project" : "Personal Project"}</span>
                  {totalComments > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {totalComments}
                    </span>
                  )}
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shrink-0 ${statusColor}`}>
                {statusText}
              </div>
            </div>
            
            <details className="mt-4 pt-4 border-t border-black/5 group">
              <summary className="flex items-center justify-between cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                <div className="flex items-center gap-2">
                  <span className="group-open:hidden">View Activity Log</span>
                  <span className="hidden group-open:inline">Hide Activity Log</span>
                </div>
                <div className="flex items-center gap-4">
                  {isAccepted && inv.invoice_settings?.accepted_at ? (
                    <span>Accepted on {new Date(inv.invoice_settings.accepted_at).toLocaleDateString()}</span>
                  ) : (
                    <span>Last updated {new Date(inv.updated_at || inv.created_at).toLocaleDateString()}</span>
                  )}
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/invoice-generator/${inv.id}${inv._isShared ? '?shared=true' : ''}`);
                    }}
                    className="font-semibold text-primary flex items-center gap-1 hover:underline"
                  >
                    Manage <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </summary>
              
              <div className="mt-4 space-y-3 pl-2 border-l-2 border-black/10 dark:border-white/10 ml-1">
                {sortedLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic pl-3">No activity recorded yet.</p>
                ) : (
                  sortedLogs.map((log: any, i: number) => (
                    <div key={i} className="relative pl-4 pb-1">
                      <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-black/20 dark:bg-white/20 border-2 border-[#e8e4dc] dark:border-zinc-900" />
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] text-foreground font-medium capitalize">
                          {log.action.replace('_', ' ')}
                        </p>
                        {log.details?.includes('Invoice') && !log.details?.includes('Contract') && (
                          <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Invoice</span>
                        )}
                        {(log.details?.includes('Contract') || log.details?.includes('Agreement')) && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Contract</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{log.details}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(log.date).toLocaleString()}</p>
                    </div>
                  ))
                )}
                {/* Always show created event at the end */}
                <div className="relative pl-4">
                  <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-black/20 dark:bg-white/20 border-2 border-[#e8e4dc] dark:border-zinc-900" />
                  <p className="text-[13px] text-foreground font-medium">Invoice Generated</p>
                  <p className="text-xs text-muted-foreground">Original creation</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(inv.created_at).toLocaleString()}</p>
                </div>
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function BookingLinkSection() {
  const [bookingLink, setBookingLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getBookingLinks().then((links: any[]) => {
      if (Array.isArray(links) && links.length > 0) setBookingLink(links[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const link = await createBookingLink();
      setBookingLink(link);
      toast.success("Booking link created!");
    } catch (e: any) {
      toast.error(e.message || "Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!bookingLink) return;
    try {
      await deleteBookingLink(bookingLink.code);
      setBookingLink(null);
      toast.success("Booking link deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const handleCopy = async () => {
    if (!bookingLink) return;
    const url = `${window.location.origin}/book/${bookingLink.code}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const bookingUrl = bookingLink ? `${window.location.origin}/book/${bookingLink.code}` : "";

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Meeting Booking Link</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Share a public link so anyone can book time on your calendar. They'll see your available slots without accessing your events.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : bookingLink ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
              <LinkIcon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-mono text-primary truncate flex-1">{bookingUrl}</span>
              <button onClick={handleCopy}
                className="shrink-0 p-1.5 rounded-lg hover:bg-primary/10 transition">
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-primary" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy}
                className="flex-1 py-2 rounded-xl text-sm font-medium glass-btn-primary flex items-center justify-center gap-2">
                <Copy className="w-3.5 h-3.5" /> Copy Link
              </button>
              <button onClick={handleDelete}
                className="py-2 px-4 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 transition flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Created {new Date(bookingLink.created_at).toLocaleDateString()}. Visitors can select a date, duration, and time slot, then submit their name and email. You'll receive an email to accept or decline.
            </p>
          </div>
        ) : (
          <button onClick={handleCreate} disabled={creating}
            className="w-full py-3 rounded-xl text-sm font-medium glass-btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Booking Link
          </button>
        )}
      </div>
    </div>
  );
}

function ProfessionalIdentitySection() {
  const { profile, setProfile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    owner_legal_name: "",
    legal_name: "",
    abn: "",
    bsb: "",
    account_no: "",
    address: "",
    phone: "",
    website: "",
  });

  useEffect(() => {
    if (profile?.business_profile) {
      setFormData(profile.business_profile);
    }
  }, [profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedProfile = await updateMe({ business_profile: formData });
      setProfile(updatedProfile);
      toast.success("Professional identity saved");
    } catch (e) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4 sm:p-5">
        <h3 className="font-semibold mb-1">Business Details</h3>
        <p className="text-sm text-muted-foreground mb-4">
          This information will be dynamically rendered on all your generated invoices and agreements.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1.5 ml-1">Business Owner Legal Name *</label>
            <input
              type="text"
              name="owner_legal_name"
              value={formData.owner_legal_name || ""}
              onChange={handleChange}
              placeholder="e.g. Jane Doe"
              className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 ml-1">Legal Entity Name *</label>
            <input
              type="text"
              name="legal_name"
              value={formData.legal_name}
              onChange={handleChange}
              placeholder="e.g. Acme Corp Pty Ltd"
              className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5 ml-1">ABN *</label>
              <input
                type="text"
                name="abn"
                value={formData.abn}
                onChange={handleChange}
                placeholder="11-digit ABN"
                className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 ml-1">Phone *</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Primary contact number"
                className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 ml-1">Business Address *</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Registered physical or postal address"
              className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5 ml-1">BSB *</label>
              <input
                type="text"
                name="bsb"
                value={formData.bsb}
                onChange={handleChange}
                placeholder="6-digit BSB"
                className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 ml-1">Account No. *</label>
              <input
                type="text"
                name="account_no"
                value={formData.account_no}
                onChange={handleChange}
                placeholder="Bank Account Number"
                className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 ml-1">Business Website (Optional)</label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://..."
              className="w-full bg-background/50 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !formData.legal_name || !formData.abn || !formData.address || !formData.bsb || !formData.account_no || !formData.phone}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Details
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const supported = isPushSupported();
  const permission = getPermissionState();

  useEffect(() => {
    // Check subscription state
    isSubscribedToPush().then(setSubscribed);
    // Load preferences
    getPushPreferences().then(setPrefs).catch(() => {});
  }, []);

  const handleToggleSubscription = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) { toast.error("Not authenticated"); return; }

      if (subscribed) {
        const ok = await unsubscribeFromPush(token);
        if (ok) {
          setSubscribed(false);
          toast.success("Push notifications disabled");
        } else {
          toast.error("Failed to unsubscribe");
        }
      } else {
        const result = await subscribeToPush(token);
        if (result.ok) {
          setSubscribed(true);
          toast.success("Push notifications enabled!");
          // Reload preferences
          getPushPreferences().then(setPrefs).catch(() => {});
        } else {
          if (result.error === "permission_denied") {
            toast.error("Notification permission denied. Please enable in browser settings.");
          } else if (result.error === "permission_dismissed") {
            toast.error("Notification permission was dismissed. Please try again and allow notifications.");
          } else {
            toast.error(result.error || "Failed to subscribe to push notifications");
          }
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Error toggling push");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePref = async (key: string, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await updatePushPreferences({ [key]: value });
    } catch {
      // Revert on error
      setPrefs(prefs);
      toast.error("Failed to update preference");
    }
  };

  const handleTestPush = async () => {
    setTesting(true);
    try {
      await sendTestPush();
      toast.success("Test notification sent!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send test notification");
    } finally {
      setTesting(false);
    }
  };

  if (!supported) {
    return (
      <div className="glass rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Push Notifications</h3>
        <div className="flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Push notifications are not supported in this browser. Try Chrome, Edge, or Firefox on desktop/Android.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Master toggle */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="contents">
            <h3 className="font-semibold">Push Notifications</h3>
          </div>
          <button
            onClick={handleToggleSubscription}
            disabled={loading}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              subscribed ? "bg-emerald-500" : "bg-[var(--switch-background)]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                subscribed ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {subscribed
            ? "You're receiving push notifications on this device."
            : "Enable to receive alerts for reminders, shared lists, friend activity, and more -- even when Chrono is closed."}
        </p>

        {subscribed && (
          <button
            onClick={handleTestPush}
            disabled={testing}
            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-medium glass-btn-primary"
          >
            {testing ? (
              <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Sending...</span>
            ) : (
              "Send test notification"
            )}
          </button>
        )}

        {permission === "denied" && !subscribed && (
          <div className="mt-3 flex items-start gap-2 text-amber-600 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Notification permission is blocked. Open browser settings to allow notifications for this site.</span>
          </div>
        )}
      </div>

      {/* Category toggles */}
      {subscribed && prefs && (
        <div className="glass rounded-2xl p-4">
          <h4 className="text-sm font-semibold mb-3">Notification Categories</h4>
          <p className="text-xs text-muted-foreground mb-4">
            Choose which types of notifications you want to receive.
          </p>
          <div className="space-y-3">
            {PUSH_CATEGORIES.map((cat, i) => {
              const SECTION_STARTS: Record<string, string> = {
                reminders: "General",
                calendar_share_requests: "Social & Calendar",
                shared_list_invites: "Shared Lists",
                invoice_viewed: "Invoices & Quotes",
              };
              const sectionLabel = SECTION_STARTS[cat.key];
              return (
                <div className="contents" key={cat.key}>
                  {sectionLabel && (
                    <div className={i > 0 ? "pt-2" : ""}>
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 mb-1">{sectionLabel}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-[11px] text-muted-foreground">{cat.desc}</p>
                    </div>
                    <button
                      onClick={() => handleTogglePref(cat.key, !(prefs[cat.key] !== false))}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                        prefs[cat.key] !== false ? "bg-emerald-500" : "bg-[var(--switch-background)]"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          prefs[cat.key] !== false ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}