import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router";
import { TasksPage } from "./tasks-page";
import { RemindersPage } from "./reminders-page";
import { DaysSincePage } from "./days-since-page";
import { Plus, CheckSquare, Bell, Timer, List } from "lucide-react";

type Tab = "tasks" | "reminders" | "days_since";

export function TrackPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("tasks");
  const createFnRef = useRef<(() => void) | null>(null);

  // Desktop: each column has its own create fn
  const createTaskRef = useRef<(() => void) | null>(null);
  const createReminderRef = useRef<(() => void) | null>(null);
  const createCounterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "tasks" || tab === "reminders" || tab === "days-since") {
      setActiveTab(tab === "days-since" ? "days_since" : tab as Tab);
    }
  }, [searchParams]);

  const setTab = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab: tab === "days_since" ? "days-since" : tab });
  };

  const handleRegisterCreate = useCallback((fn: () => void) => {
    createFnRef.current = fn;
  }, []);

  const handleFabClick = () => {
    if (createFnRef.current) {
      createFnRef.current();
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "tasks", label: "Lists", icon: List },
    { id: "reminders", label: "Reminders", icon: Bell },
    { id: "days_since", label: "Counters", icon: Timer },
  ];

  return (
    <div className="relative min-h-full pb-20 md:pb-0">
      {/* ── Mobile: Tab bar ── */}
      <div className="md:hidden px-4 pt-4 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 border-b border-border/5">
        <div className="flex p-1 bg-muted/50 rounded-xl">
          {tabs.map((tab) => {
             const isActive = activeTab === tab.id;
             return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={isActive ? "text-primary" : ""}>{tab.label}</span>
              </button>
             );
          })}
        </div>
      </div>

      {/* ── Mobile: Single panel ── */}
      <div className="pt-2 md:hidden">
        {activeTab === "tasks" && (
          <TasksPage isEmbedded onRegisterCreate={handleRegisterCreate} />
        )}
        {activeTab === "reminders" && (
          <RemindersPage isEmbedded onRegisterCreate={handleRegisterCreate} />
        )}
        {activeTab === "days_since" && (
          <DaysSincePage isEmbedded onRegisterCreate={handleRegisterCreate} />
        )}
      </div>

      {/* ── Desktop: 3-column layout ── */}
      <div className="hidden md:flex md:flex-col px-6 lg:px-10 xl:px-14 pt-6 md:h-[calc(100dvh-56px-26px)] md:pb-0">
        <div className="grid grid-cols-3 gap-5 lg:gap-6 flex-1 min-h-0">
          {/* Tasks column */}
          <div className="glass rounded-2xl overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Lists</h2>
              </div>
              <button
                onClick={() => createTaskRef.current?.()}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TasksPage isEmbedded onRegisterCreate={(fn) => { createTaskRef.current = fn; }} />
            </div>
          </div>

          {/* Reminders column */}
          <div className="glass rounded-2xl overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Reminders</h2>
              </div>
              <button
                onClick={() => createReminderRef.current?.()}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <RemindersPage isEmbedded onRegisterCreate={(fn) => { createReminderRef.current = fn; }} />
            </div>
          </div>

          {/* Counters column */}
          <div className="glass rounded-2xl overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Counters</h2>
              </div>
              <button
                onClick={() => createCounterRef.current?.()}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DaysSincePage isEmbedded onRegisterCreate={(fn) => { createCounterRef.current = fn; }} />
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={handleFabClick}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-5 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition active:scale-95 hover:shadow-xl z-40"
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}