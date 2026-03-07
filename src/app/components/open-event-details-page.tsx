import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { Plus, Users, Clock, Link as LinkIcon, ArrowLeft, ChevronDown, ChevronUp, Trash2, Edit2, Zap, MapPin, Download, Upload, Mail, QrCode } from "lucide-react";
import { supabase, request } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { ExpandableDescription } from "./expandable-description";
import Papa from "papaparse";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

export function OpenEventDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [showEditEventModal, setShowEditEventModal] = useState(false);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDesc, setEditEventDesc] = useState("");

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDesc, setSessionDesc] = useState("");
  const [sessionDuration, setSessionDuration] = useState<string | number>(15);
  const [sessionHost, setSessionHost] = useState("");
  const [sessionOrg, setSessionOrg] = useState("");
  const [sessionLocation, setSessionLocation] = useState("");
  
  const [showEditSessionModal, setShowEditSessionModal] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState("");
  const [editSessionDesc, setEditSessionDesc] = useState("");
  const [editSessionDuration, setEditSessionDuration] = useState<string | number>(15);
  const [editSessionHost, setEditSessionHost] = useState("");
  const [editSessionOrg, setEditSessionOrg] = useState("");
  const [editSessionLocation, setEditSessionLocation] = useState("");

  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  
  const [showQRModal, setShowQRModal] = useState<{id: string, title: string} | null>(null);
  
  const [showSlotModal, setShowSlotModal] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("");
  const [slotCapacity, setSlotCapacity] = useState(1);

  const [showBulkSlotModal, setShowBulkSlotModal] = useState<string | null>(null);
  const [bulkSlotDate, setBulkSlotDate] = useState("");
  const [bulkStartTime, setBulkStartTime] = useState("");
  const [bulkEndTime, setBulkEndTime] = useState("");
  const [bulkSlotDuration, setBulkSlotDuration] = useState(15);
  const [bulkIncludeBuffer, setBulkIncludeBuffer] = useState(false);
  const [bulkBufferTime, setBulkBufferTime] = useState(5);
  const [bulkSlotCapacity, setBulkSlotCapacity] = useState(1);

  const [showBlastModal, setShowBlastModal] = useState(false);
  const [blastSubject, setBlastSubject] = useState("");
  const [blastMessage, setBlastMessage] = useState("");
  const [isBlasting, setIsBlasting] = useState(false);

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

  const fetchEventDetails = async () => {
    try {
      const data = await request(`/open-events/${id}`);
      setEvent(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSessionTemplate = () => {
    const content = "Name,Host/Speaker,Organization,Room / Location,Description,Duration (minutes),Slot 1 Date (YYYY-MM-DD),Slot 1 Time (HH:MM),Slot 1 Capacity,Slot 2 Date (YYYY-MM-DD),Slot 2 Time (HH:MM),Slot 2 Capacity\nExample Session,Jane Doe,Acme Corp,Conference Room A,Detailed description of the session,30,2024-10-15,09:00,10,2024-10-15,10:00,10\nSecond Session,John Smith,Tech LLC,Room B,Another detailed description,45,2024-10-16,14:00,20,,,";
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', "bulk_session_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [importStatus, setImportStatus] = useState<{
    active: boolean;
    stage: string;
    detail: string;
    progress: number;
    error: string;
  }>({ active: false, stage: '', detail: '', progress: 0, error: '' });

  const handleImportSessionsCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ active: true, stage: 'Uploading...', detail: 'Reading CSV file...', progress: 10, error: '' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const sessions = results.data;
          
          setImportStatus(prev => ({ ...prev, stage: 'Processing...', detail: 'Validating data...', progress: 30 }));
          
          let successCount = 0;
          let totalCount = sessions.filter((s: any) => s['Name']).length;

          if (totalCount === 0) {
            setImportStatus({ active: true, stage: 'Failed', detail: '', progress: 0, error: 'No valid sessions found in CSV. Make sure there is a "Name" column.' });
            return;
          }

          for (let index = 0; index < sessions.length; index++) {
            const s = sessions[index];
            const row = s as any;
            if (!row['Name']) continue;

            setImportStatus(prev => ({ 
              ...prev, 
              stage: `Adding Sessions...`, 
              detail: `Creating: ${row['Name']}`, 
              progress: 30 + (successCount / totalCount) * 70 
            }));

            try {
              const sessRes = await request(`/open-events/${id}/sessions`, {
                method: "POST",
                body: JSON.stringify({ 
                  title: row['Name'] || "Untitled", 
                  description: row['Description'] || "",
                  duration: Number(row['Duration (minutes)']) || 15,
                  host: row['Host/Speaker'] || "",
                  organization: row['Organization'] || "",
                  location: row['Room / Location'] || ""
                })
              });

              // Find slots recursively
              const slots = [];
              for (let i = 1; i <= 20; i++) {
                const d = row[`Slot ${i} Date (YYYY-MM-DD)`];
                const t = row[`Slot ${i} Time (HH:MM)`];
                const c = row[`Slot ${i} Capacity`];
                if (d && t) {
                  const start = new Date(`${d}T${t}`);
                  if (isNaN(start.getTime())) {
                     throw new Error(`Invalid date/time format in Row ${index + 1}, Slot ${i}`);
                  }
                  const duration = Number(row['Duration (minutes)']) || 15;
                  const end = new Date(start.getTime() + duration * 60000);
                  slots.push({
                    start_time: start.toISOString(),
                    end_time: end.toISOString(),
                    capacity: Number(c) || 1
                  });
                }
              }

              if (slots.length > 0 && sessRes && sessRes.id) {
                await request(`/open-sessions/${sessRes.id}/slots`, {
                  method: "POST",
                  body: JSON.stringify({ slots })
                });
              }
              successCount++;
            } catch (err: any) {
              setImportStatus({ active: true, stage: 'Failed', detail: '', progress: 0, error: `Error on Row ${index + 1} (${row['Name']}): ${err.message || 'Unknown error'}` });
              return;
            }
          }
          await fetchEventDetails();
          setImportStatus({ active: true, stage: 'Success!', detail: 'All sessions imported.', progress: 100, error: '' });
          setTimeout(() => {
            setImportStatus({ active: false, stage: '', detail: '', progress: 0, error: '' });
          }, 2000);
        } catch (err: any) {
          console.error("Import error:", err);
          setImportStatus({ active: true, stage: 'Failed', detail: '', progress: 0, error: `Import failed: ${err.message}` });
        }
      },
      error: (error) => {
        console.error(error);
        setImportStatus({ active: true, stage: 'Failed', detail: '', progress: 0, error: `Error parsing CSV: ${error.message}` });
      }
    });
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request(`/open-events/${id}/sessions`, {
        method: "POST",
        body: JSON.stringify({ 
          title: sessionTitle, 
          description: sessionDesc,
          duration: Number(sessionDuration) || 15,
          host: sessionHost,
          organization: sessionOrg,
          location: sessionLocation
        })
      });
      setShowSessionModal(false);
      setSessionTitle("");
      setSessionDesc("");
      setSessionHost("");
      setSessionOrg("");
      setSessionLocation("");
      setSessionDuration(15);
      fetchEventDetails();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSlotModal) return;
    try {
      const start = new Date(`${slotDate}T${slotTime}`);
      const sessionObj = event.sessions.find((s:any) => s.id === showSlotModal);
      const end = new Date(start.getTime() + (sessionObj?.duration || 15) * 60000);

      await request(`/open-sessions/${showSlotModal}/slots`, {
        method: "POST",
        body: JSON.stringify({ 
          slots: [{
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            capacity: slotCapacity
          }]
        })
      });
      setShowSlotModal(null);
      setSlotDate("");
      setSlotTime("");
      fetchEventDetails();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSlot = async (sessionId: string, slotId: string) => {
    if (!window.confirm("Are you sure you want to delete this time slot?")) return;
    try {
      await request(`/open-sessions/${sessionId}/slots/${slotId}/delete`, {
        method: "POST"
      });
      fetchEventDetails();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request(`/open-events/${id}/update`, {
        method: "POST",
        body: JSON.stringify({ title: editEventTitle, description: editEventDesc })
      });
      setShowEditEventModal(false);
      fetchEventDetails();
    } catch (e) { console.error(e); }
  };

  const handleDeleteEvent = async () => {
    if (!window.confirm("Are you sure you want to delete this event? This action cannot be undone.")) return;
    try {
      await request(`/open-events/${id}/delete`, { method: "POST" });
      navigate("/open-events");
    } catch (e) { console.error(e); }
  };

  const handleEditSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditSessionModal) return;
    try {
      await request(`/open-sessions/${showEditSessionModal}/update`, {
        method: "POST",
        body: JSON.stringify({ 
          title: editSessionTitle, 
          description: editSessionDesc, 
          duration: Number(editSessionDuration) || 15,
          host: editSessionHost,
          organization: editSessionOrg,
          location: editSessionLocation
        })
      });
      setShowEditSessionModal(null);
      fetchEventDetails();
    } catch (e) { console.error(e); }
  };

  const handleSendBlast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blastSubject || !blastMessage) return;
    
    setIsBlasting(true);
    try {
      const response = await request(`/open-events/${id}/blast`, {
        method: "POST",
        body: JSON.stringify({
          subject: blastSubject,
          message: blastMessage
        })
      });
      
      if (response.success) {
        alert(`Successfully sent email to ${response.sentCount} attendees.`);
        setShowBlastModal(false);
        setBlastSubject("");
        setBlastMessage("");
      } else {
        alert(response.error || "Failed to send emails");
      }
    } catch (e) {
      console.error(e);
      alert("Error sending emails");
    } finally {
      setIsBlasting(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("Are you sure you want to delete this session?")) return;
    try {
      await request(`/open-sessions/${sessionId}/delete`, { method: "POST" });
      fetchEventDetails();
    } catch (e) { console.error(e); }
  };

  const handleAddBulkSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showBulkSlotModal) return;
    try {
      const slots = [];
      let currentStart = new Date(`${bulkSlotDate}T${bulkStartTime}`);
      const endLimit = new Date(`${bulkSlotDate}T${bulkEndTime}`);
      
      while (currentStart < endLimit) {
        const currentEnd = new Date(currentStart.getTime() + bulkSlotDuration * 60000);
        if (currentEnd > endLimit) break;
        
        slots.push({
          start_time: currentStart.toISOString(),
          end_time: currentEnd.toISOString(),
          capacity: bulkSlotCapacity
        });
        
        const buffer = bulkIncludeBuffer ? bulkBufferTime : 0;
        currentStart = new Date(currentEnd.getTime() + buffer * 60000);
      }

      if (slots.length > 0) {
        await request(`/open-sessions/${showBulkSlotModal}/slots`, {
          method: "POST",
          body: JSON.stringify({ slots })
        });
      } else {
        alert("No slots could be generated within the given time frame.");
      }
      
      setShowBulkSlotModal(null);
      fetchEventDetails();
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="p-8 text-stone-500">Loading event details...</div>;
  if (!event) return <div className="p-8 text-red-500">Event not found.</div>;

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-4 pb-20 md:pb-6 relative w-full h-full">
      <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
      <Link to="/open-events" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors font-medium text-sm">
        <ArrowLeft size={16} className="mr-1" />
        Back to Events
      </Link>
      
      <div className="glass p-5 sm:p-8 rounded-2xl shadow-sm relative group">
        <div className="absolute top-5 right-5 sm:top-8 sm:right-8 flex gap-2 z-10">
          <button 
            onClick={() => { setEditEventTitle(event.title); setEditEventDesc(event.description); setShowEditEventModal(true); }} 
            className="p-2 text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            title="Edit event"
          >
            <Edit2 size={16}/>
          </button>
          <button 
            onClick={handleDeleteEvent} 
            className="p-2 text-muted-foreground hover:text-red-500 bg-white/5 hover:bg-red-500/10 rounded-full transition-colors"
            title="Delete event"
          >
            <Trash2 size={16}/>
          </button>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-2 pr-20">{event.title}</h1>
        <ExpandableDescription 
          text={event.description} 
          maxLength={300}
          className="mb-4 pr-20"
          textClassName="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-3xl"
        />
        <div className="flex flex-wrap gap-3">
          {event.code && (
            <button 
              onClick={async () => { 
                await copyToClipboard(`${window.location.origin}/open-event/${event.code}`); 
                toast.success("Event public link copied!"); 
              }}
              className="inline-flex items-center gap-2 text-primary hover:opacity-80 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium transition-colors"
            >
              <LinkIcon size={16} /> Copy Event Public Link
            </button>
          )}
          <button 
            onClick={() => setShowBlastModal(true)}
            className="inline-flex items-center gap-2 text-amber-700 hover:opacity-80 bg-amber-500/10 px-4 py-2 rounded-full text-sm font-medium transition-colors"
          >
            <Mail size={16} /> Email Attendees
          </button>
          
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-white/5 border border-black/5 dark:border-white/5 ml-auto sm:ml-0">
            <span className="text-sm font-medium text-muted-foreground">Waitlist Full</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await request(`/open-events/${event.id}/toggle-waitlist-full`, { method: "POST" });
                  fetchEventDetails();
                } catch(e) { console.error(e) }
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${event.waitlist_full ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${event.waitlist_full ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">Sessions & Workshops</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImportSessionsCsv} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-foreground border border-border/20 rounded-xl font-medium shadow-sm transition-colors"
          >
            <Upload size={18} />
            <span>Import CSV</span>
          </button>
          <button 
            onClick={() => setShowSessionModal(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 glass-btn-primary rounded-xl font-medium shadow-sm"
          >
            <Plus size={18} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {event.sessions && event.sessions.length === 0 && (
          <div className="text-center py-12 glass rounded-2xl border-dashed border-border/50 border-2">
            <p className="text-muted-foreground">No sessions created yet. Create a session to start adding time slots.</p>
          </div>
        )}
        
        {event.sessions && event.sessions.map((sess: any) => {
          const isExpanded = expandedSession === sess.id;
          const publicLink = `${window.location.origin}/open-book/${sess.code}`;
          
          return (
            <div key={sess.id} className="glass rounded-2xl shadow-sm overflow-hidden transition-all mb-4">
              <div 
                className="p-4 sm:p-6 cursor-pointer hover:bg-white/5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                onClick={() => setExpandedSession(isExpanded ? null : sess.id)}
              >
                <div className="flex-1 min-w-0 relative">
                  <div className="absolute right-0 top-0 sm:hidden mt-1">
                    {isExpanded ? <ChevronUp className="text-muted-foreground" /> : <ChevronDown className="text-muted-foreground" />}
                  </div>
                  <h3 className="text-xl font-semibold text-primary tracking-tight mb-1 pr-8 sm:pr-0">{sess.title}</h3>
                  {sess.host && sess.organization && (
                    <div className="text-sm font-medium text-foreground/80 mb-2">
                      {sess.host} &middot; {sess.organization}
                    </div>
                  )}
                  {sess.description && (
                    <div className="mb-3 mt-1" onClick={(e) => e.stopPropagation()}>
                      <ExpandableDescription 
                        text={sess.description} 
                        maxLength={150}
                        textClassName="text-muted-foreground text-sm"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                    <span className="flex items-center gap-1"><Clock size={14} /> {sess.duration} min</span>
                    <span className="flex items-center gap-1"><Users size={14} /> {sess.slots?.length || 0} slots</span>
                    {sess.location && (
                      <span className="flex items-center gap-1"><MapPin size={14} /> {sess.location}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-border/10 sm:border-0">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        setEditSessionTitle(sess.title);
                        setEditSessionDesc(sess.description || "");
                        setEditSessionHost(sess.host || "");
                        setEditSessionOrg(sess.organization || "");
                        setEditSessionLocation(sess.location || "");
                        setEditSessionDuration(sess.duration);
                        setShowEditSessionModal(sess.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5"
                      title="Edit session"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQRModal({ id: sess.id, title: sess.title });
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5"
                      title="Feedback QR"
                    >
                      <QrCode size={16} />
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        handleDeleteSession(sess.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10"
                      title="Delete session"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border/20" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Waitlist Full</span>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await request(`/open-sessions/${sess.id}/toggle-waitlist-full`, { method: "POST" });
                            fetchEventDetails();
                          } catch(err) { console.error(err) }
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${sess.waitlist_full ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        title="Toggle Waitlist Full"
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sess.waitlist_full ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={async (e) => { 
                        e.stopPropagation(); 
                        await copyToClipboard(publicLink); 
                        toast.success("Session public link copied!"); 
                      }}
                      className="inline-flex items-center gap-2 text-primary hover:opacity-80 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      <LinkIcon size={16} /> <span>Copy Link</span>
                    </button>
                    <div className="hidden sm:block">
                      {isExpanded ? <ChevronUp className="text-muted-foreground" /> : <ChevronDown className="text-muted-foreground" />}
                    </div>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-border/10 bg-black/5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">Time Slots</h4>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => {
                          setBulkSlotDuration(sess.duration);
                          setShowBulkSlotModal(sess.id);
                        }}
                        className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:opacity-80 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-md transition-colors"
                      >
                        <Zap size={14} /> Bulk Add
                      </button>
                      <button 
                        onClick={() => setShowSlotModal(sess.id)}
                        className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:opacity-80 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-md transition-colors"
                      >
                        <Plus size={14} /> Add Slot
                      </button>
                    </div>
                  </div>
                  
                  {sess.slots && sess.slots.length > 0 ? (
                    <div className="space-y-3">
                      {sess.slots.sort((a:any,b:any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).map((slot:any) => {
                        const start = new Date(slot.start_time);
                        const end = new Date(slot.end_time);
                        const slotBookings = sess.bookings?.filter((b:any) => b.slot_id === slot.id) || [];
                        const confirmed = slotBookings.filter((b:any) => b.status === "confirmed");
                        const waitlist = slotBookings.filter((b:any) => b.status === "waitlist");
                        
                        return (
                          <div key={slot.id} className="glass p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <div className="font-medium">
                                {start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                <span>Capacity: {slot.capacity}</span>
                                <div className="flex items-center gap-2 border-l border-border/20 pl-4">
                                  <span className="text-xs font-medium">Waitlist Full</span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await request(`/open-slots/${slot.id}/toggle-waitlist-full`, { method: "POST" });
                                        fetchEventDetails();
                                      } catch(e) { console.error(e) }
                                    }}
                                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${slot.waitlist_full ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                  >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${slot.waitlist_full ? 'translate-x-4' : 'translate-x-1'}`} />
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col gap-2 min-w-[200px]">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-green-700 dark:text-green-400 text-sm">{confirmed.length} Confirmed</span>
                                <button 
                                  onClick={() => handleDeleteSlot(sess.id, slot.id)}
                                  className="text-muted-foreground hover:text-red-500 transition-colors"
                                  title="Delete slot"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <div className="text-sm">
                                {confirmed.map((b:any) => (
                                  <div key={b.id} className="text-muted-foreground ml-2 border-l-2 border-green-500/30 pl-2 mt-1">
                                    {b.name} <span className="text-xs text-muted-foreground/60">({b.email})</span>
                                  </div>
                                ))}
                              </div>
                              {waitlist.length > 0 && (
                                <div className="text-sm">
                                  <span className="font-medium text-amber-600 dark:text-amber-400">{waitlist.length} Waitlisted</span>
                                  {waitlist.map((b:any) => (
                                    <div key={b.id} className="text-muted-foreground ml-2 border-l-2 border-amber-500/30 pl-2 mt-1">
                                      {b.name} <span className="text-xs text-muted-foreground/60">({b.email})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No time slots added yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showSessionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Create Session</h2>
              <button 
                type="button"
                onClick={handleDownloadSessionTemplate}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Download bulk import template"
              >
                <Download size={14} />
                <span>Session CSV Template</span>
              </button>
            </div>
            <form onSubmit={handleCreateSession}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Name *</label>
                <input 
                  type="text" required value={sessionTitle} onChange={e => setSessionTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="e.g. 1-on-1 Portfolio Review"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Host/Speaker *</label>
                <input 
                  type="text" required value={sessionHost} onChange={e => setSessionHost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Organization *</label>
                <input 
                  type="text" required value={sessionOrg} onChange={e => setSessionOrg(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Room / Location (Optional)</label>
                <input 
                  type="text" value={sessionLocation} onChange={e => setSessionLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="e.g. Conference Room A"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Description (Optional)</label>
                <textarea 
                  value={sessionDesc} onChange={e => setSessionDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  rows={2}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Duration (minutes)</label>
                <input 
                  type="number" min="1" required
                  value={sessionDuration} onChange={e => setSessionDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  placeholder="e.g. 20"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowSessionModal(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 glass-btn-primary rounded-xl font-medium transition-colors">Create Session</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSlotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-sm p-6 rounded-2xl shadow-xl">
            <h2 className="text-xl font-semibold mb-4 tracking-tight">Add Time Slot</h2>
            <form onSubmit={handleAddSlot}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input 
                  type="date" required value={slotDate} onChange={e => setSlotDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Start Time</label>
                <input 
                  type="time" required value={slotTime} onChange={e => setSlotTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Capacity</label>
                <input 
                  type="number" min="1" required value={slotCapacity} onChange={e => setSlotCapacity(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">Number of people who can book this exact slot.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowSlotModal(null)} className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 glass-btn-primary rounded-xl font-medium transition-colors">Add Slot</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showEditEventModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6 rounded-2xl shadow-xl">
            <h2 className="text-xl font-semibold mb-4 tracking-tight">Edit Event</h2>
            <form onSubmit={handleEditEvent}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Event Title</label>
                <input 
                  type="text" required value={editEventTitle} onChange={e => setEditEventTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
                <textarea 
                  required value={editEventDesc} onChange={e => setEditEventDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowEditEventModal(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 glass-btn-primary rounded-xl font-medium transition-colors">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importStatus.active && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-sm p-6 rounded-2xl shadow-xl">
            <h2 className="text-xl font-semibold mb-2 tracking-tight">{importStatus.stage}</h2>
            {importStatus.error ? (
              <div className="mb-4 text-sm text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                <p className="font-medium">Import Failed</p>
                <p className="mt-1">{importStatus.error}</p>
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-3">{importStatus.detail}</p>
                <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${Math.max(5, importStatus.progress)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              {(importStatus.error || importStatus.progress === 100) && (
                <button 
                  onClick={() => setImportStatus({ active: false, stage: '', detail: '', progress: 0, error: '' })}
                  className="px-4 py-2 glass-btn-primary rounded-xl font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showQRModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowQRModal(null)}>
          <div className="glass w-full max-w-sm p-8 rounded-[32px] shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Feedback QR</h2>
            <p className="text-muted-foreground text-sm mb-8">Scan to leave a review for<br/><span className="font-medium text-foreground">{showQRModal.title}</span></p>
            
            <div className="bg-white p-6 rounded-3xl inline-block shadow-sm mb-8 mx-auto">
              <QRCodeCanvas 
                value={`${window.location.origin}/feedback/${showQRModal.id}`} 
                size={200}
                level="H"
                includeMargin={false}
                fgColor="#0f172a"
              />
            </div>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={async () => {
                  const success = await copyToClipboard(`${window.location.origin}/feedback/${showQRModal.id}`);
                  if (success) {
                    toast.success("Feedback link copied!");
                  } else {
                    toast.error("Failed to copy link");
                  }
                }}
                className="w-full py-3 glass-btn-primary rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <LinkIcon size={18} />
                Copy Feedback Link
              </button>
              <button 
                onClick={() => setShowQRModal(null)}
                className="w-full py-3 text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditSessionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Edit Session</h2>
              <button 
                type="button"
                onClick={handleDownloadSessionTemplate}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Download bulk import template"
              >
                <Download size={14} />
                <span>Session CSV Template</span>
              </button>
            </div>
            <form onSubmit={handleEditSession}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Name *</label>
                <input 
                  type="text" required value={editSessionTitle} onChange={e => setEditSessionTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Host/Speaker *</label>
                <input 
                  type="text" required value={editSessionHost} onChange={e => setEditSessionHost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Organization *</label>
                <input 
                  type="text" required value={editSessionOrg} onChange={e => setEditSessionOrg(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Room / Location (Optional)</label>
                <input 
                  type="text" value={editSessionLocation} onChange={e => setEditSessionLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Description (Optional)</label>
                <textarea 
                  value={editSessionDesc} onChange={e => setEditSessionDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  rows={2}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Duration (minutes)</label>
                <input 
                  type="number" min="1" required
                  value={editSessionDuration} onChange={e => setEditSessionDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowEditSessionModal(null)} className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 glass-btn-primary rounded-xl font-medium transition-colors">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBlastModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="glass w-full max-w-md p-6 rounded-2xl shadow-xl my-8">
            <h2 className="text-xl font-semibold mb-2 tracking-tight">Email All Attendees</h2>
            <p className="text-sm text-muted-foreground mb-4">Send an update or instructions to everyone who booked a session in this event.</p>
            <form onSubmit={handleSendBlast}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Subject *</label>
                <input 
                  type="text" required value={blastSubject} onChange={e => setBlastSubject(e.target.value)}
                  placeholder="e.g. Important update regarding tomorrow's sessions"
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Message *</label>
                <textarea 
                  required value={blastMessage} onChange={e => setBlastMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={5}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowBlastModal(false)}
                  className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-white/5 transition-colors"
                  disabled={isBlasting}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isBlasting || !blastSubject || !blastMessage}
                  className="px-4 py-2 rounded-xl font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isBlasting ? "Sending..." : <><Mail size={16} /> Send Email</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkSlotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="glass w-full max-w-md p-6 rounded-2xl shadow-xl my-8">
            <h2 className="text-xl font-semibold mb-4 tracking-tight">Bulk Add Time Slots</h2>
            <form onSubmit={handleAddBulkSlots}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input 
                  type="date" required value={bulkSlotDate} onChange={e => setBulkSlotDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Start Time</label>
                  <input 
                    type="time" required value={bulkStartTime} onChange={e => setBulkStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">End Time Limit</label>
                  <input 
                    type="time" required value={bulkEndTime} onChange={e => setBulkEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Slot Duration (min)</label>
                  <input 
                    type="number" min="5" required value={bulkSlotDuration} onChange={e => setBulkSlotDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Capacity Per Slot</label>
                  <input 
                    type="number" min="1" required value={bulkSlotCapacity} onChange={e => setBulkSlotCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                  />
                </div>
              </div>
              
              <div className="mb-6 bg-black/10 p-4 rounded-xl">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input 
                    type="checkbox" 
                    checked={bulkIncludeBuffer} 
                    onChange={e => setBulkIncludeBuffer(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium">Add buffer time between slots</span>
                </label>
                
                {bulkIncludeBuffer && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Buffer Time (minutes)</label>
                    <input 
                      type="number" min="1" required value={bulkBufferTime} onChange={e => setBulkBufferTime(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl glass-input focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowBulkSlotModal(null)} className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 glass-btn-primary rounded-xl font-medium transition-colors flex items-center gap-2">
                  <Zap size={16} /> Generate Slots
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
