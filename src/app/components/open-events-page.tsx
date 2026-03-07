import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { Plus, Calendar as CalendarIcon, ArrowRight, Download } from "lucide-react";
import { supabase, request } from "../lib/api";

export function OpenEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const data = await request("/open-events");
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request("/open-events", {
        method: "POST",
        body: JSON.stringify({ title, description })
      });
      setShowModal(false);
      setTitle("");
      setDescription("");
      fetchEvents();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-4 pb-20 md:pb-6 relative w-full h-full">
      <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 sm:mb-6 shrink-0">
          <div className="text-center md:text-left">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Open Scheduling</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Manage events, mini-workshops, and open booking sessions.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button 
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 glass-btn-primary rounded-xl font-medium w-full sm:w-auto"
            >
              <Plus size={18} />
              <span>New Event</span>
            </button>
          </div>
        </div>

      {loading ? (
        <div className="text-muted-foreground animate-pulse">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl shadow-sm">
          <CalendarIcon size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No events yet</h3>
          <p className="text-muted-foreground mt-1 mb-2">Create your first event to start accepting bookings.</p>
          <p className="text-sm text-primary">Click the New Event button above to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <Link 
              key={event.id} 
              to={`/open-events/${event.id}`}
              className="block glass p-5 sm:p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group"
            >
              <h3 className="text-lg sm:text-xl font-semibold tracking-tight mb-2">{event.title}</h3>
              <p className="text-muted-foreground text-sm mb-4 line-clamp-2">{event.description}</p>
              <div className="flex items-center text-sm font-medium text-primary">
                <span>Manage Event</span>
                <ArrowRight size={16} className="ml-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6 rounded-2xl shadow-xl">
            <h2 className="text-xl font-semibold mb-4 tracking-tight">Create New Event</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Event Title</label>
                <input 
                  type="text" 
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="e.g. Annual Design Conference 2024"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
                <textarea 
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="Briefly describe the event..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 glass-btn-primary rounded-xl font-medium"
                >
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
