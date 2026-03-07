import React from "react";
import { EventModeToday } from "./event-mode-today";

export function EventModeDashboard() {
  return (
    <div className="flex-1 overflow-y-auto relative w-full h-full bg-gradient-to-br from-[#fef3ec] via-[#f2effb] to-[#eaf5fc] dark:from-background dark:via-background dark:to-background">
      <EventModeToday />
    </div>
  );
}