import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getMyLists, createMyList, deleteMyList, updateMyList,
  addMyListItem, toggleMyListItem, deleteMyListItem, convertToSharedList,
  editMyListItem,
  getMyContacts,
  getSharedLists, createSharedList, deleteSharedList, leaveSharedList, updateSharedList,
  getSharedListInvites, respondToSharedListInvite,
  addSharedListItem, toggleSharedListItem, deleteSharedListItem,
  editSharedListItem,
  supabase, joinSharedListViaLink,
  getTasks, migrateTasksToLists,
  createDaysSince,
} from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import {
  Plus, X, Check, Clock, Trash2, Loader2,
  Users, Mail, User, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, LogOut, Send, ListPlus, UserPlus, Link2,
  ArrowRightLeft, List, Contact, ArrowUpFromLine, FileText, Download, Upload, FileDown, Timer,
  Globe, Palette, Megaphone, Briefcase, Edit2
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import {
  SharedListItem as TypedSharedListItem,
  AddItemForm,
  ListTypeSelector,
  LIST_TYPE_META,
  type ListType,
} from "./shared-list-items";

const PROJECT_TEMPLATES = [
  {
    id: "web-dev",
    title: "Website Design & Dev",
    icon: Globe,
    items: [
      { text: "Discovery & Planning", is_milestone: true, notes: "" },
      { text: "Stakeholder interviews", is_milestone: false, allocated_hours: 4, notes: "Gather requirements" },
      { text: "Competitive analysis", is_milestone: false, allocated_hours: 3, notes: "Review 5 competitor sites" },
      { text: "Project brief & scope", is_milestone: false, allocated_hours: 2, notes: "Define deliverables" },
      { text: "Design", is_milestone: true, notes: "" },
      { text: "Wireframes", is_milestone: false, allocated_hours: 6, notes: "Low-fi layouts for 8 pages" },
      { text: "Visual mockups", is_milestone: false, allocated_hours: 10, notes: "High-fi designs in Figma" },
      { text: "Development", is_milestone: true, notes: "" },
      { text: "Frontend build", is_milestone: false, allocated_hours: 20, notes: "React + Tailwind" },
      { text: "Backend & API integration", is_milestone: false, allocated_hours: 14, notes: "Auth + database" },
      { text: "Testing & Launch", is_milestone: true, notes: "" },
      { text: "QA & cross-browser testing", is_milestone: false, allocated_hours: 8, notes: "Chrome / Safari / Firefox / mobile" },
      { text: "Launch & DNS cutover", is_milestone: false, allocated_hours: 2, notes: "Go live" },
    ]
  },
  {
    id: "brand-identity",
    title: "Brand Identity",
    icon: Palette,
    items: [
      { text: "Discovery", is_milestone: true, notes: "" },
      { text: "Brand Questionnaire", is_milestone: false, allocated_hours: 2, notes: "Send to client and review" },
      { text: "Strategy & Moodboards", is_milestone: false, allocated_hours: 5, notes: "2 distinct directions" },
      { text: "Logo Design", is_milestone: true, notes: "" },
      { text: "Primary logo concepts", is_milestone: false, allocated_hours: 10, notes: "3 initial concepts" },
      { text: "Revisions", is_milestone: false, allocated_hours: 4, notes: "Up to 2 rounds" },
      { text: "Secondary logos & marks", is_milestone: false, allocated_hours: 3, notes: "Favicon, submarks" },
      { text: "Brand Assets", is_milestone: true, notes: "" },
      { text: "Color palette & typography", is_milestone: false, allocated_hours: 3, notes: "Selection and guidelines" },
      { text: "Brand guidelines document", is_milestone: false, allocated_hours: 6, notes: "PDF export" },
      { text: "Final Handoff", is_milestone: true, notes: "" },
      { text: "Export all file types", is_milestone: false, allocated_hours: 2, notes: "EPS, SVG, PNG, JPG" },
    ]
  },
  {
    id: "marketing-campaign",
    title: "Marketing Campaign",
    icon: Megaphone,
    items: [
      { text: "Strategy", is_milestone: true, notes: "" },
      { text: "Campaign planning", is_milestone: false, allocated_hours: 4, notes: "Target audience & messaging" },
      { text: "Channel selection & budget", is_milestone: false, allocated_hours: 2, notes: "FB/IG, Google, Email" },
      { text: "Asset Creation", is_milestone: true, notes: "" },
      { text: "Copywriting", is_milestone: false, allocated_hours: 6, notes: "Ad copy and landing page" },
      { text: "Graphics & Videos", is_milestone: false, allocated_hours: 12, notes: "4 graphic variations, 1 video" },
      { text: "Execution", is_milestone: true, notes: "" },
      { text: "Campaign setup in Ads Manager", is_milestone: false, allocated_hours: 3, notes: "Audience targeting & tracking" },
      { text: "Landing page build", is_milestone: false, allocated_hours: 5, notes: "" },
      { text: "Review & Analytics", is_milestone: true, notes: "" },
      { text: "Mid-campaign optimization", is_milestone: false, allocated_hours: 2, notes: "Adjust bids & creatives" },
      { text: "Final reporting", is_milestone: false, allocated_hours: 4, notes: "ROI and performance summary" },
    ]
  },
  {
    id: "consulting-retainer",
    title: "Consulting Retainer",
    icon: Briefcase,
    items: [
      { text: "Month 1 Strategy", is_milestone: true, notes: "" },
      { text: "Kickoff call", is_milestone: false, allocated_hours: 1, notes: "Align on month goals" },
      { text: "Deep dive audit", is_milestone: false, allocated_hours: 5, notes: "Review current processes" },
      { text: "Strategic roadmap", is_milestone: false, allocated_hours: 4, notes: "Deliver 90-day plan" },
      { text: "Ongoing Support", is_milestone: true, notes: "" },
      { text: "Weekly check-ins (x4)", is_milestone: false, allocated_hours: 4, notes: "1 hour each" },
      { text: "Ad-hoc advisory", is_milestone: false, allocated_hours: 6, notes: "Email/Slack support" },
      { text: "Implementation reviews", is_milestone: false, allocated_hours: 4, notes: "Review team's work" },
      { text: "Review & Renew", is_milestone: true, notes: "" },
      { text: "Monthly performance review", is_milestone: false, allocated_hours: 2, notes: "Report on KPIs" },
    ]
  }
];

type SubTab = "my_lists" | "shared_lists";

export function TasksPage({ isEmbedded, onRegisterCreate }: { isEmbedded?: boolean; onRegisterCreate?: (fn: () => void) => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<SubTab>("my_lists");

  // Title edit state
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // ── My Lists state ──
  const [myLists, setMyLists] = useState<any[]>([]);
  const [loadingMyLists, setLoadingMyLists] = useState(true);
  const [showCreateMyList, setShowCreateMyList] = useState(false);
  const [mlTitle, setMlTitle] = useState("");
  const [mlListType, setMlListType] = useState<ListType>("todo");
  const [creatingML, setCreatingML] = useState(false);
  const [expandedMyListId, setExpandedMyListId] = useState<string | null>(null);

  // ── Convert to shared modal ──
  const [convertingListId, setConvertingListId] = useState<string | null>(null);
  const [convertCollabs, setConvertCollabs] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [converting, setConverting] = useState(false);

  // ── CSV Import state ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingListId, setImportingListId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // ── Shared lists state ──
  const [sharedLists, setSharedLists] = useState<any[]>([]);
  const [sharedInvites, setSharedInvites] = useState<any[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [showCreateShared, setShowCreateShared] = useState(false);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // ── Shared list create form ──
  const [slTitle, setSlTitle] = useState("");
  const [slCollabs, setSlCollabs] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [slListType, setSlListType] = useState<ListType>("todo");
  const [creatingSL, setCreatingSL] = useState(false);

  // ── Contacts (people) ──
  const [contacts, setContacts] = useState<{ name: string; email: string }[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);

const renderItems = (items: any[], list: any, isShared: boolean) => {
    if (list.list_type !== "project") {
      return items.map((item: any) => (
        <TypedSharedListItem
          key={item.id} item={item} listType={list.list_type} listId={list.id}
          onToggle={() => isShared ? handleToggleSharedItem(list.id, item.id) : handleToggleMyItem(list.id, item.id)}
          onDelete={() => isShared ? handleDeleteSharedItem(list.id, item.id) : handleDeleteMyItem(list.id, item.id)}
          onEdit={async (data: any) => {
            if (isShared) {
              await editSharedListItem(list.id, item.id, data);
              broadcastChange(list.id);
              await loadShared();
            } else {
              await editMyListItem(list.id, item.id, data);
              await loadMyLists_();
            }
          }}
          existingItems={list.items || []}
        />
      ));
    }

    // For projects, group by milestone
    const allMilestones = (list.items || []).filter((i: any) => i.is_milestone);
    const milestones = allMilestones.filter((m: any) => 
      items.some((i: any) => i.id === m.id) || 
      items.some((i: any) => !i.is_milestone && i.milestone_id === m.id)
    );

    const orphanedTasks = items.filter((i: any) => !i.is_milestone && !i.milestone_id);
    const tasksByMilestone = new Map();
    items.filter((i: any) => !i.is_milestone && i.milestone_id).forEach((task: any) => {
      if (!tasksByMilestone.has(task.milestone_id)) tasksByMilestone.set(task.milestone_id, []);
      tasksByMilestone.get(task.milestone_id).push(task);
    });

    return (
      <div className="space-y-2">
        {milestones.map((milestone: any) => (
          <div key={milestone.id} className="space-y-1">
            <TypedSharedListItem
              item={milestone} listType={list.list_type} listId={list.id}
              onToggle={() => isShared ? handleToggleSharedItem(list.id, milestone.id) : handleToggleMyItem(list.id, milestone.id)}
              onDelete={() => isShared ? handleDeleteSharedItem(list.id, milestone.id) : handleDeleteMyItem(list.id, milestone.id)}
              onEdit={async (data: any) => {
                if (isShared) { await editSharedListItem(list.id, milestone.id, data); broadcastChange(list.id); await loadShared(); }
                else { await editMyListItem(list.id, milestone.id, data); await loadMyLists_(); }
              }}
              existingItems={list.items || []}
            />
            <div className="pl-6 border-l-2 border-border/30 ml-3 space-y-1 mt-1">
              {(tasksByMilestone.get(milestone.id) || []).map((task: any) => (
                <TypedSharedListItem
                  key={task.id} item={task} listType={list.list_type} listId={list.id}
                  onToggle={() => isShared ? handleToggleSharedItem(list.id, task.id) : handleToggleMyItem(list.id, task.id)}
                  onDelete={() => isShared ? handleDeleteSharedItem(list.id, task.id) : handleDeleteMyItem(list.id, task.id)}
                  onEdit={async (data: any) => {
                    if (isShared) { await editSharedListItem(list.id, task.id, data); broadcastChange(list.id); await loadShared(); }
                    else { await editMyListItem(list.id, task.id, data); await loadMyLists_(); }
                  }}
                  existingItems={list.items || []}
                />
              ))}
            </div>
          </div>
        ))}
        {orphanedTasks.length > 0 && (
          <div className="space-y-1 mt-3 pt-2 border-t border-border/20">
            {orphanedTasks.map((task: any) => (
              <TypedSharedListItem
                key={task.id} item={task} listType={list.list_type} listId={list.id}
                onToggle={() => isShared ? handleToggleSharedItem(list.id, task.id) : handleToggleMyItem(list.id, task.id)}
                onDelete={() => isShared ? handleDeleteSharedItem(list.id, task.id) : handleDeleteMyItem(list.id, task.id)}
                onEdit={async (data: any) => {
                  if (isShared) { await editSharedListItem(list.id, task.id, data); broadcastChange(list.id); await loadShared(); }
                  else { await editMyListItem(list.id, task.id, data); await loadMyLists_(); }
                }}
                existingItems={list.items || []}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Migration: old tasks → My Lists ──
  const [oldTaskCount, setOldTaskCount] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [migrationChecked, setMigrationChecked] = useState(false);

  // ═════════════ LOADERS ═════════════

  const loadMyLists_ = useCallback(async () => {
    try {
      const lists = await getMyLists();
      setMyLists(lists);
    } catch (e) {
      console.error("Failed to load personal lists:", e);
    } finally {
      setLoadingMyLists(false);
    }
  }, []);

  const loadShared = useCallback(async () => {
    setLoadingShared(true);
    try {
      const [lists, invites] = await Promise.all([getSharedLists(), getSharedListInvites()]);
      setSharedLists(lists);
      setSharedInvites(invites);
    } catch (e) {
      console.error("Failed to load shared lists:", e);
    } finally {
      setLoadingShared(false);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    if (contactsLoaded) return;
    try {
      const c = await getMyContacts();
      setContacts(c);
      setContactsLoaded(true);
    } catch (e) {
      console.error("Failed to load contacts:", e);
    }
  }, [contactsLoaded]);

  useEffect(() => { loadMyLists_(); }, [loadMyLists_]);
  useEffect(() => { if (subTab === "shared_lists") loadShared(); }, [subTab, loadShared]);

  // Eagerly load invite count for badge
  useEffect(() => {
    getSharedListInvites().then(inv => setSharedInvites(inv)).catch(() => {});
  }, []);

  // Load contacts when shared list create form or convert modal opens
  useEffect(() => {
    if (showCreateShared || convertingListId) loadContacts();
  }, [showCreateShared, convertingListId, loadContacts]);

  // Check for old tasks that need migration
  useEffect(() => {
    if (migrationChecked) return;
    getTasks().then((tasks: any[]) => {
      setOldTaskCount(Array.isArray(tasks) ? tasks.length : 0);
      setMigrationChecked(true);
    }).catch(() => { setMigrationChecked(true); });
  }, [migrationChecked]);

  const handleMigrateTasks = async () => {
    setMigrating(true);
    try {
      const result = await migrateTasksToLists();
      toast.success(result.message || `Migrated ${result.migrated} tasks!`);
      setOldTaskCount(0);
      await loadMyLists_();
    } catch (e: any) {
      console.error("Migration failed:", e);
      toast.error(e.message || "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  // ── Auto-join via shared link ──
  const joinedRef = useRef(false);
  useEffect(() => {
    const raw = sessionStorage.getItem("chrono_pending_join");
    if (!raw || joinedRef.current) return;
    joinedRef.current = true;
    const pending = JSON.parse(raw);
    sessionStorage.removeItem("chrono_pending_join");
    setSubTab("shared_lists");
    (async () => {
      try {
        const result = await joinSharedListViaLink(pending.listId);
        if (result.status === "joined") toast.success(`You've joined "${pending.listTitle}"!`);
        else if (result.status === "already_member") toast("You're already a member of this list", { icon: "📋" });
        else if (result.status === "owner") toast("You're the owner of this list", { icon: "📋" });
        setExpandedListId(pending.listId);
        await loadShared();
      } catch (e: any) {
        console.error("Auto-join failed:", e);
        toast.error(e.message || "Failed to join the shared list");
      }
    })();
  }, [loadShared]);

  // ── Supabase Realtime: broadcast channels for shared lists ──
  const channelsRef = useRef<Map<string, any>>(new Map());
  const loadSharedRef = useRef(loadShared);
  loadSharedRef.current = loadShared;

  const broadcastChange = useCallback((listId: string) => {
    const channel = channelsRef.current.get(listId);
    if (channel) channel.send({ type: "broadcast", event: "list-updated", payload: { listId, ts: Date.now() } });
  }, []);

  useEffect(() => {
    if (subTab !== "shared_lists" || sharedLists.length === 0) return;
    const currentIds = new Set(sharedLists.map((l: any) => l.id));
    const existingIds = new Set(channelsRef.current.keys());
    for (const list of sharedLists) {
      if (!existingIds.has(list.id)) {
        const channel = supabase.channel(`shared-list-${list.id}`, { config: { broadcast: { self: false } } });
        channel.on("broadcast", { event: "list-updated" }, () => loadSharedRef.current());
        channel.subscribe();
        channelsRef.current.set(list.id, channel);
      }
    }
    for (const [id, channel] of channelsRef.current.entries()) {
      if (!currentIds.has(id)) { supabase.removeChannel(channel); channelsRef.current.delete(id); }
    }
    return () => {
      for (const [, channel] of channelsRef.current.entries()) supabase.removeChannel(channel);
      channelsRef.current.clear();
    };
  }, [subTab, sharedLists]);

  // ═════════════ FAB/CREATE OPEN ═════════════

  const openCreate = () => {
    if (subTab === "shared_lists") setShowCreateShared(true);
    else setShowCreateMyList(true);
  };

  useEffect(() => {
    if (onRegisterCreate) { onRegisterCreate(openCreate); return () => onRegisterCreate(() => {}); }
  }, [onRegisterCreate, subTab]);

  // ═════════════ EXPORT CSV HANDLER ═════════════

  const handleExportCsv = (list: any) => {
    if (!list || !list.items) {
      toast.error("No items to export");
      return;
    }
    const items = list.items;
    const milestones = items.filter((i: any) => i.is_milestone);
    const tasks = items.filter((i: any) => !i.is_milestone);

    // Headers
    let csvContent = "Type,Milestone,Task,Status,Allocated Hours,Due Date,Notes\n";

    // Rows
    const getRow = (type: string, milestoneName: string, taskName: string, status: string, hours: string, dueDate: string, notes: string) => {
      const escape = (str: string) => `"${(str || "").replace(/"/g, '""')}"`;
      return [escape(type), escape(milestoneName), escape(taskName), escape(status), escape(hours), escape(dueDate), escape(notes)].join(",") + "\n";
    };

    // Add milestones and their tasks
    milestones.forEach((m: any) => {
      csvContent += getRow("Milestone", m.text, "", "", "", "", m.notes);
      const mTasks = tasks.filter((t: any) => t.milestone_id === m.id);
      mTasks.forEach((t: any) => {
        csvContent += getRow("Task", m.text, t.text, t.completed ? "Completed" : "Pending", t.allocated_hours?.toString() || "", t.due_date || "", t.notes);
      });
    });

    // Add orphaned tasks
    const orphaned = tasks.filter((t: any) => !t.milestone_id);
    orphaned.forEach((t: any) => {
      csvContent += getRow("Task", "", t.text, t.completed ? "Completed" : "Pending", t.allocated_hours?.toString() || "", t.due_date || "", t.notes);
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${list.title || "export"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    setShowTemplateModal(true);
  };

  const doDownloadTemplate = () => {
    const csvContent = "Type,Milestone,Task,Allocated Hours,Due Date,Notes\nMilestone,Discovery & Planning,,,,\nTask,Discovery & Planning,Stakeholder interviews,4,2026-03-09,Gather requirements from key stakeholders\nTask,Discovery & Planning,Competitive analysis,3,2026-03-11,Review 5 competitor sites\nTask,Discovery & Planning,Project brief & scope,2,2026-03-13,$500 retainer / Define deliverables\nMilestone,Design,,,,\nTask,Design,Wireframes,6,2026-03-18,Low-fi layouts for 8 pages\nTask,Design,Visual mockups,10,2026-03-25,$1200 / High-fi designs in Figma\nTask,Design,Design review & revisions,4,2026-03-28,Up to 2 rounds of revisions\nMilestone,Development,,,,\nTask,Development,Frontend build,20,2026-04-10,$3000 / React + Tailwind\nTask,Development,Backend & API integration,14,2026-04-17,Supabase auth + database\nTask,Development,CMS setup,6,2026-04-21,Content migration & training\nMilestone,Testing & Launch,,,,\nTask,Testing & Launch,QA & cross-browser testing,8,2026-04-25,Chrome / Safari / Firefox / mobile\nTask,Testing & Launch,Performance optimization,4,2026-04-28,Target Lighthouse 90+\nTask,Testing & Launch,Launch & DNS cutover,2,2026-04-30,$200 hosting / Go live\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Chrono_Project_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowTemplateModal(false);
  };

  const triggerImportCsv = (listId: string) => {
    setImportingListId(listId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const parseCSV = (text: string) => {
    const result = [];
    let row = [];
    let col = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') { col += '"'; i++; }
          else inQuotes = false;
        } else { col += char; }
      } else {
        if (char === '"') inQuotes = true;
        else if (char === ',') { row.push(col); col = ""; }
        else if (char === '\n' || char === '\r') {
          row.push(col); result.push(row); row = []; col = "";
          if (char === '\r' && text[i + 1] === '\n') i++;
        } else col += char;
      }
    }
    if (col || row.length) { row.push(col); result.push(row); }
    return result;
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importingListId) return;

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error("Invalid CSV format");
        return;
      }
      
      const headers = rows[0].map((h: string) => h.trim().toLowerCase());
      const typeIdx = headers.indexOf("type");
      const milestoneIdx = headers.indexOf("milestone");
      const taskIdx = headers.indexOf("task");
      const hoursIdx = headers.indexOf("allocated hours");
      const dueIdx = headers.indexOf("due date");
      const notesIdx = headers.indexOf("notes");

      if (typeIdx === -1 || taskIdx === -1) {
        toast.error("CSV must contain 'Type' and 'Task' columns");
        return;
      }

      // We need to determine if list is shared or not. Check existing ids:
      const isShared = sharedLists.some((l: any) => l.id === importingListId);
      
      let milestoneMap: Record<string, string> = {}; 

      // Milestone Pass
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row.length || (row.length === 1 && !row[0])) continue;
        
        const type = typeIdx !== -1 ? (row[typeIdx] || "").trim() : "";
        const milestoneName = milestoneIdx !== -1 ? (row[milestoneIdx] || "").trim() : "";
        const taskName = taskIdx !== -1 ? (row[taskIdx] || "").trim() : "";
        const notes = notesIdx !== -1 ? (row[notesIdx] || "").trim() : "";

        if (!type || type.toLowerCase() === "milestone") {
           const name = taskName || milestoneName;
           if (!name) continue;
           
           if (isShared) {
             const res = await addSharedListItem(importingListId, { text: name, is_milestone: true, notes: notes });
             if (res) milestoneMap[name] = res.id;
           } else {
             const res = await addMyListItem(importingListId, { text: name, is_milestone: true, notes: notes });
             if (res) milestoneMap[name] = res.id;
           }
        }
      }

      // Task Pass
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row.length || (row.length === 1 && !row[0])) continue;
        
        const type = typeIdx !== -1 ? (row[typeIdx] || "").trim() : "";
        const milestoneName = milestoneIdx !== -1 ? (row[milestoneIdx] || "").trim() : "";
        const taskName = taskIdx !== -1 ? (row[taskIdx] || "").trim() : "";
        const hoursStr = hoursIdx !== -1 ? row[hoursIdx] : "";
        const hours = hoursStr ? parseFloat(hoursStr) : undefined;
        const due = dueIdx !== -1 ? (row[dueIdx] || "").trim() : "";
        const notes = notesIdx !== -1 ? (row[notesIdx] || "").trim() : "";

        if (type.toLowerCase() === "task" || (type === "" && taskName)) {
           if (!taskName) continue;
           const mId = milestoneName ? milestoneMap[milestoneName] : undefined;
           
           const itemData: any = {
               text: taskName,
               milestone_id: mId,
               notes: notes || undefined
           };
           if (!isNaN(hours as number)) itemData.allocated_hours = hours;
           if (due) itemData.due_date = due;

           if (isShared) {
             await addSharedListItem(importingListId, itemData);
           } else {
             await addMyListItem(importingListId, itemData);
           }
        }
      }

      toast.success("Import successful");
      if (isShared) loadSharedRef.current(); else loadMyLists_();
    } catch (err) {
      console.error(err);
      toast.error("Failed to import CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImportingListId(null);
    }
  };

  // ═════════════ DAYS TO/UNTIL COUNTER HANDLER ═════════════

  const handleCreateDaysTo = async (list: any) => {
    const lt = list.list_type || "todo";
    const items = list.items || [];

    if (lt === "grocery") return; // No option for grocery

    if (lt === "trip") {
      // Trip: create ONE counter — "Days to <list title>" using earliest item date
      const dates = items
        .map((i: any) => i.date || i.due_date)
        .filter(Boolean)
        .sort();
      if (dates.length === 0) {
        toast.error("No dates found in this trip list. Add dates to items first.");
        return;
      }
      const earliest = dates[0]; // yyyy-MM-dd
      try {
        await createDaysSince({
          label: `${list.title}`,
          type: "to",
          target_date: earliest,
          last_date: earliest,
        });
        toast.success(`Counter created: Days to ${list.title}`);
      } catch (e: any) {
        toast.error(e.message || "Failed to create counter");
      }
      return;
    }

    if (lt === "project") {
      // Project: create a counter for EACH milestone that has a due_date
      const milestones = items.filter((i: any) => i.is_milestone && i.due_date);
      if (milestones.length === 0) {
        toast.error("No milestones with dates found. Add due dates to milestones first.");
        return;
      }
      let created = 0;
      for (const ms of milestones) {
        try {
          await createDaysSince({
            label: `${ms.text}`,
            type: "to",
            target_date: ms.due_date,
            last_date: ms.due_date,
          });
          created++;
        } catch (e: any) {
          console.error("Failed to create counter for milestone:", ms.text, e);
        }
      }
      if (created > 0) {
        toast.success(`${created} milestone counter${created > 1 ? "s" : ""} created`);
      } else {
        toast.error("Failed to create any milestone counters");
      }
      return;
    }

    if (lt === "todo") {
      // To-Do: create a counter for EACH task that has a due_date
      const datedTasks = items.filter((i: any) => i.due_date && !i.completed);
      if (datedTasks.length === 0) {
        toast.error("No tasks with due dates found. Add due dates to tasks first.");
        return;
      }
      let created = 0;
      for (const task of datedTasks) {
        try {
          await createDaysSince({
            label: `${task.text}`,
            type: "to",
            target_date: task.due_date,
            last_date: task.due_date,
          });
          created++;
        } catch (e: any) {
          console.error("Failed to create counter for task:", task.text, e);
        }
      }
      if (created > 0) {
        toast.success(`${created} task counter${created > 1 ? "s" : ""} created`);
      } else {
        toast.error("Failed to create any task counters");
      }
      return;
    }
  };

  // ═════════════ MY LIST HANDLERS ═════════════

  const handleSaveTitle = async (e: React.MouseEvent | React.FormEvent, listId: string, isShared: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim()) {
      setEditingListId(null);
      return;
    }
    setSavingTitle(true);
    try {
      if (isShared) {
        await updateSharedList(listId, { title: editTitle.trim() });
        setSharedLists(prev => prev.map(l => l.id === listId ? { ...l, title: editTitle.trim() } : l));
      } else {
        await updateMyList(listId, { title: editTitle.trim() });
        setMyLists(prev => prev.map(l => l.id === listId ? { ...l, title: editTitle.trim() } : l));
      }
      setEditingListId(null);
      toast.success("List name updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update title");
    } finally {
      setSavingTitle(false);
    }
  };

  const renderListTitle = (list: any, isShared: boolean) => {
    if (editingListId === list.id) {
      return (
        <form 
          className="flex-1 min-w-0 mr-2 flex items-center gap-2" 
          onSubmit={(e) => handleSaveTitle(e, list.id, isShared)}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full bg-white/5 border border-black/10 dark:border-white/10 rounded-md px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
            disabled={savingTitle}
          />
          <button 
            type="submit" 
            disabled={savingTitle}
            className="p-1 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30 transition disabled:opacity-50 shrink-0"
          >
            {savingTitle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setEditingListId(null); }}
            disabled={savingTitle}
            className="p-1 rounded bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground transition disabled:opacity-50 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      );
    }

    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{list.title}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditingListId(list.id);
            setEditTitle(list.title);
          }}
          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center justify-center shrink-0"
          title="Edit list name"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const handleCreateMyList = async () => {
    if (!mlTitle.trim()) { toast.error("Please enter a list title"); return; }
    setCreatingML(true);
    try {
      await createMyList({ title: mlTitle.trim(), list_type: mlListType });
      toast.success("List created!");
      setShowCreateMyList(false); setMlTitle(""); setMlListType("todo");
      await loadMyLists_();
    } catch (e: any) {
      toast.error(e.message || "Failed to create list");
    } finally {
      setCreatingML(false);
    }
  };

  const handleDeleteMyList = async (listId: string) => {
    try {
      await deleteMyList(listId);
      toast.success("List deleted");
      await loadMyLists_();
    } catch (e: any) { toast.error(e.message || "Failed to delete list"); }
  };

  const handleAddMyItem = async (listId: string, data: any) => {
    try {
      await addMyListItem(listId, data);
      await loadMyLists_();
    } catch (e: any) { toast.error(e.message || "Failed to add item"); throw e; }
  };

  const handleToggleMyItem = async (listId: string, itemId: string) => {
    try { await toggleMyListItem(listId, itemId); await loadMyLists_(); }
    catch (e: any) { toast.error(e.message || "Failed to update item"); }
  };

  const handleDeleteMyItem = async (listId: string, itemId: string) => {
    try { await deleteMyListItem(listId, itemId); await loadMyLists_(); }
    catch (e: any) { toast.error(e.message || "Failed to delete item"); }
  };

  const handleConvertToShared = async () => {
    if (!convertingListId) return;
    const validCollabs = convertCollabs.filter(c => c.email.trim() && c.email.includes("@"));
    setConverting(true);
    try {
      await convertToSharedList(convertingListId, validCollabs);
      toast.success("Converted to shared list!");
      setConvertingListId(null); setConvertCollabs([{ name: "", email: "" }]);
      await Promise.all([loadMyLists_(), loadShared()]);
      setSubTab("shared_lists");
    } catch (e: any) {
      toast.error(e.message || "Failed to convert list");
    } finally {
      setConverting(false);
    }
  };

  // ═════════════ SHARED LIST HANDLERS ═════════════

  const handleCreateSharedList = async () => {
    if (!slTitle.trim()) { toast.error("Please enter a list title"); return; }
    const validCollabs = slCollabs.filter(c => c.email.trim() && c.email.includes("@"));
    setCreatingSL(true);
    try {
      await createSharedList({ title: slTitle.trim(), collaborators: validCollabs, list_type: slListType });
      toast.success("Shared list created!");
      setShowCreateShared(false); setSlTitle(""); setSlListType("todo");
      setSlCollabs([{ name: "", email: "" }]);
      await loadShared();
    } catch (e: any) { toast.error(e.message || "Failed to create shared list"); }
    finally { setCreatingSL(false); }
  };

  const handleRespondInvite = async (listId: string, action: "accept" | "reject") => {
    setRespondingId(listId);
    try {
      await respondToSharedListInvite(listId, action);
      toast.success(action === "accept" ? "You've joined the list!" : "Invitation declined");
      await loadShared();
    } catch (e: any) { toast.error(e.message || "Failed to respond"); }
    finally { setRespondingId(null); }
  };

  const handleAddSharedItem = async (listId: string, data: any) => {
    try {
      await addSharedListItem(listId, data);
      broadcastChange(listId);
      await loadShared();
    } catch (e: any) { toast.error(e.message || "Failed to add item"); throw e; }
  };

  const handleToggleSharedItem = async (listId: string, itemId: string) => {
    try { await toggleSharedListItem(listId, itemId); broadcastChange(listId); await loadShared(); }
    catch (e: any) { toast.error(e.message || "Failed to update item"); }
  };

  const handleDeleteSharedItem = async (listId: string, itemId: string) => {
    try { await deleteSharedListItem(listId, itemId); broadcastChange(listId); await loadShared(); }
    catch (e: any) { toast.error(e.message || "Failed to delete item"); }
  };

  const handleDeleteSharedList = async (listId: string) => {
    try { broadcastChange(listId); await deleteSharedList(listId); toast.success("Shared list deleted"); await loadShared(); }
    catch (e: any) { toast.error(e.message || "Failed to delete list"); }
  };

  const handleLeaveList = async (listId: string) => {
    try { broadcastChange(listId); await leaveSharedList(listId); toast.success("You've left the list"); await loadShared(); }
    catch (e: any) { toast.error(e.message || "Failed to leave list"); }
  };

  // ═════════════ RENDER ═════════════

  if (loadingMyLists && subTab === "my_lists") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "px-3 sm:px-4 py-2" : "max-w-lg mx-auto px-3 sm:px-4 py-4"}>
      {/* Hidden file input for CSV import */}
      <input 
        type="file" 
        accept=".csv" 
        ref={fileInputRef} 
        style={{ display: "none" }} 
        onChange={handleImportCsv} 
      />

      {/* ── Sub-tabs: My Lists | Shared Lists ── */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl mb-3">
        <button
          onClick={() => setSubTab("my_lists")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
            subTab === "my_lists"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="w-3 h-3" /> My Lists
        </button>
        <button
          onClick={() => setSubTab("shared_lists")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all relative ${
            subTab === "shared_lists"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-3 h-3" /> Shared Lists
          {sharedInvites.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
              {sharedInvites.length}
            </span>
          )}
        </button>
      </div>

      {!isEmbedded && (
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">
            {subTab === "my_lists" ? "My Lists" : "Shared Lists"}
          </h1>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 glass-btn-primary rounded-xl text-sm font-medium min-h-[2.75rem]">
            <Plus className="w-4 h-4" /> New list
          </button>
        </div>
      )}

      {/* ════════════════ MIGRATION BANNER ════════════════ */}
      {oldTaskCount > 0 && subTab === "my_lists" && (
        <div className="glass rounded-xl border border-primary/20 p-3 mb-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(196,160,255,0.15))" }}>
            <ArrowUpFromLine className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Migrate {oldTaskCount} old task{oldTaskCount !== 1 ? "s" : ""}</p>
            <p className="text-[11px] text-muted-foreground">
              Your old tasks can be converted into a "Migrated Tasks" list with all data preserved.
            </p>
          </div>
          <button
            onClick={handleMigrateTasks}
            disabled={migrating}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition disabled:opacity-50"
            style={{ background: migrating ? "rgba(92,58,32,0.5)" : "linear-gradient(135deg, #5c3a20, #7a5234)" }}
          >
            {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
            {migrating ? "Migrating..." : "Migrate"}
          </button>
        </div>
      )}

      {/* ════════════════ MY LISTS TAB ════════════════ */}
      {subTab === "my_lists" && (
        <>
          {myLists.length === 0 ? (
            <div className="text-center py-16">
              <List className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No lists yet</p>
              <button onClick={() => setShowCreateMyList(true)} className="text-primary text-sm font-medium mt-2 hover:underline">
                Create your first list
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {myLists.map((list: any) => {
                const isExpanded = expandedMyListId === list.id;
                const lt = (list.list_type || "todo") as ListType;
                const tm = LIST_TYPE_META[lt];
                const openItems = (list.items || []).filter((i: any) => !i.completed);
                const doneItems = (list.items || []).filter((i: any) => i.completed);

                return (
                  <div key={list.id} className="glass rounded-xl overflow-hidden">
                    {/* List header */}
                    <div
                      onClick={() => setExpandedMyListId(isExpanded ? null : list.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition text-left group cursor-pointer"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: tm?.gradient, color: tm?.color }}
                      >
                        {tm ? React.cloneElement(tm.icon as React.ReactElement, { className: "w-4 h-4" }) : <List className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {renderListTitle(list, false)}
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5"
                            style={{ background: tm?.gradient, color: tm?.color }}
                          >
                            {React.cloneElement(tm.icon as React.ReactElement, { className: "w-2.5 h-2.5" })}
                            {tm.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {openItems.length} open · {doneItems.length} done
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-border/30 px-3 pb-3">
                        <AddItemForm listType={lt} listId={list.id} onAdd={handleAddMyItem} existingItems={list.items || []} />

                        {(list.items || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-3">No items yet. Add one above!</p>
                        ) : (
                          <div className="space-y-1.5">
                            {renderItems(openItems, list, false)}
                            {doneItems.length > 0 && (
                              <>
                                <div className="flex items-center gap-2 pt-2 pb-1">
                                  <div className="h-px flex-1 bg-border/40" />
                                  <span className="text-[9px] uppercase tracking-wider text-emerald-600 font-semibold">Completed</span>
                                  <div className="h-px flex-1 bg-border/40" />
                                </div>
                                {renderItems(doneItems, list, false)}
                              </>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border/30">
                          <button
                            onClick={() => { setConvertingListId(list.id); setConvertCollabs([{ name: "", email: "" }]); }}
                            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                          >
                            <ArrowRightLeft className="w-3 h-3" /> Convert to Shared
                          </button>
                          {list.list_type === "project" && (
                            <>
                              {(list.items || []).length > 0 && (
                                <>
                                  <button
                                    onClick={() => handleExportCsv(list)}
                                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                                  >
                                    <Download className="w-3 h-3" />
                                    Export
                                  </button>
                                  {!list.invoice_generated ? (
                                    <button
                                      onClick={() => navigate(`/invoice-generator/${list.id}?shared=false`)}
                                      className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition"
                                    >
                                      <FileText className="w-3 h-3" />
                                      Invoice Setup
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => navigate(`/invoice-generator/${list.id}?shared=false`)}
                                      className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition"
                                    >
                                      <Link2 className="w-3 h-3" /> View Invoice
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => handleDownloadTemplate()}
                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                                title="Download CSV Template"
                              >
                                <FileDown className="w-3 h-3" />
                                Template
                              </button>
                              <button
                                onClick={() => triggerImportCsv(list.id)}
                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                                title="Import CSV"
                              >
                                <Upload className="w-3 h-3" />
                                Import
                              </button>
                            </>
                          )}
                          {list.list_type !== "grocery" && (
                            <button
                              onClick={() => handleCreateDaysTo(list)}
                              className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium transition"
                            >
                              <Timer className="w-3 h-3" /> Days To
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteMyList(list.id)}
                            className="flex items-center gap-1 text-[11px] text-destructive hover:text-destructive/80 font-medium transition"
                          >
                            <Trash2 className="w-3 h-3" /> Delete list
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════ SHARED LISTS TAB ════════════════ */}
      {subTab === "shared_lists" && (
        <div className="space-y-4">
          {/* Pending Invitations */}
          {sharedInvites.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> Pending Invitations ({sharedInvites.length})
              </h3>
              {sharedInvites.map((inv: any) => (
                <div key={inv.list_id} className="glass rounded-xl p-3 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Users className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{inv.list_title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        From <span className="font-medium text-foreground">{inv.owner_name}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pl-11">
                    <button
                      onClick={() => handleRespondInvite(inv.list_id, "accept")}
                      disabled={respondingId === inv.list_id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #5c3a20, #7a5234)" }}
                    >
                      {respondingId === inv.list_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Accept
                    </button>
                    <button
                      onClick={() => handleRespondInvite(inv.list_id, "reject")}
                      disabled={respondingId === inv.list_id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active shared lists */}
          {loadingShared && sharedLists.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sharedLists.length === 0 && sharedInvites.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No shared lists yet</p>
              <button onClick={() => setShowCreateShared(true)} className="text-primary text-sm font-medium mt-2 hover:underline">
                Create your first shared list
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sharedLists.map((list: any) => {
                const isExpanded = expandedListId === list.id;
                const isOwner = list._role === "owner";
                const lt = (list.list_type || "todo") as ListType;
                const tm = LIST_TYPE_META[lt];
                const activeCollabs = (list.collaborators || []).filter((c: any) => c.status === "accepted");
                const pendingCollabs = (list.collaborators || []).filter((c: any) => c.status === "pending");
                const openItems = (list.items || []).filter((i: any) => !i.completed);
                const doneItems = (list.items || []).filter((i: any) => i.completed);

                return (
                  <div key={list.id} className="glass rounded-xl overflow-hidden">
                    <div
                      onClick={() => setExpandedListId(isExpanded ? null : list.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition text-left group cursor-pointer"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: tm?.gradient, color: tm?.color }}
                      >
                        {tm ? React.cloneElement(tm.icon as React.ReactElement, { className: "w-4 h-4" }) : <Users className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderListTitle(list, true)}
                          {isOwner && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 shrink-0">
                              Owner
                            </span>
                          )}
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5"
                            style={{ background: tm?.gradient, color: tm?.color }}
                          >
                            {React.cloneElement(tm.icon as React.ReactElement, { className: "w-2.5 h-2.5" })}
                            {tm.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {openItems.length} open · {doneItems.length} done
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            · {activeCollabs.length + 1} member{activeCollabs.length > 0 ? "s" : ""}
                          </span>
                          {pendingCollabs.length > 0 && (
                            <span className="text-[10px] text-amber-600">· {pendingCollabs.length} pending</span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border/30 px-3 pb-3">
                        <AddItemForm listType={lt} listId={list.id} onAdd={handleAddSharedItem} existingItems={list.items || []} />

                        {(list.items || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-3">No items yet. Add one above!</p>
                        ) : (
                          <div className="space-y-1.5">
                            {renderItems(openItems, list, true)}
                            {doneItems.length > 0 && (
                              <>
                                <div className="flex items-center gap-2 pt-2 pb-1">
                                  <div className="h-px flex-1 bg-border/40" />
                                  <span className="text-[9px] uppercase tracking-wider text-emerald-600 font-semibold">Completed</span>
                                  <div className="h-px flex-1 bg-border/40" />
                                </div>
                                {renderItems(doneItems, list, true)}
                              </>
                            )}
                          </div>
                        )}

                        {/* Collaborators */}
                        <div className="mt-3 pt-2 border-t border-border/30">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Collaborators</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-full text-[10px] font-medium">
                              {list.owner_name} <span className="text-muted-foreground">({isOwner ? "you, owner" : "owner"})</span>
                            </span>
                            {(list.collaborators || []).map((c: any, i: number) => (
                              <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                                c.status === "accepted" ? "bg-emerald-500/10 text-emerald-700" :
                                c.status === "pending" ? "bg-amber-500/10 text-amber-700" :
                                "bg-muted/30 text-muted-foreground line-through"
                              }`}>
                                {c.name || c.email.split("@")[0]}
                                {c.status === "pending" && <Clock className="w-2.5 h-2.5" />}
                                {c.status === "accepted" && <Check className="w-2.5 h-2.5" />}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border/30">
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/join/${list.id}`;
                              copyToClipboard(url).then((ok) => {
                                if (ok) toast.success("Invite link copied!");
                                else toast.error("Failed to copy link");
                              });
                            }}
                            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                          >
                            <Link2 className="w-3 h-3" /> Share link
                          </button>
                          {list.list_type === "project" && (
                            <>
                              {(list.items || []).length > 0 && (
                                <>
                                  <button
                                    onClick={() => handleExportCsv(list)}
                                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                                  >
                                    <Download className="w-3 h-3" />
                                    Export
                                  </button>
                                  {!list.invoice_generated ? (
                                    <button
                                      onClick={() => navigate(`/invoice-generator/${list.id}?shared=true`)}
                                      className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition"
                                    >
                                      <FileText className="w-3 h-3" />
                                      Invoice Setup
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => navigate(`/invoice-generator/${list.id}?shared=true`)}
                                      className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition"
                                    >
                                      <Link2 className="w-3 h-3" /> View Invoice
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => handleDownloadTemplate()}
                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                                title="Download CSV Template"
                              >
                                <FileDown className="w-3 h-3" />
                                Template
                              </button>
                              <button
                                onClick={() => triggerImportCsv(list.id)}
                                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition"
                                title="Import CSV"
                              >
                                <Upload className="w-3 h-3" />
                                Import
                              </button>
                            </>
                          )}
                          {list.list_type !== "grocery" && (
                            <button
                              onClick={() => handleCreateDaysTo(list)}
                              className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium transition"
                            >
                              <Timer className="w-3 h-3" /> Days To
                            </button>
                          )}
                          {isOwner ? (
                            <button
                              onClick={() => handleDeleteSharedList(list.id)}
                              className="flex items-center gap-1 text-[11px] text-destructive hover:text-destructive/80 font-medium transition"
                            >
                              <Trash2 className="w-3 h-3" /> Delete list
                            </button>
                          ) : (
                            <button
                              onClick={() => handleLeaveList(list.id)}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition"
                            >
                              <LogOut className="w-3 h-3" /> Leave list
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ CREATE MY LIST SHEET ════════════════ */}
      {showCreateMyList && createPortal(
        <div className="modal-overlay" onClick={() => setShowCreateMyList(false)}>
          <div className="modal-sheet p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ListPlus className="w-4 h-4 text-primary" /> New List
              </h3>
              <button onClick={() => setShowCreateMyList(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">List title *</label>
                <input
                  value={mlTitle}
                  onChange={(e) => setMlTitle(e.target.value)}
                  placeholder="e.g. Weekly groceries, Japan trip..."
                  className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  autoFocus
                />
              </div>
              <ListTypeSelector value={mlListType} onChange={setMlListType} />
              
              {mlListType === "project" && (
                <div className="pt-2">
                  <label className="text-xs text-muted-foreground mb-2 block">Or start from a template</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PROJECT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          if (creatingML) return;
                          setCreatingML(true);
                          const promise = (async () => {
                            const newList = await createMyList({ title: tpl.title, list_type: "project" });
                            let currentMilestoneId = "";
                            for (const item of tpl.items) {
                              const itemData = { ...item };
                              if (!itemData.is_milestone && currentMilestoneId) {
                                itemData.milestone_id = currentMilestoneId;
                              }
                              const res = await addMyListItem(newList.id, itemData);
                              if (itemData.is_milestone && res) {
                                currentMilestoneId = res.id;
                              }
                            }
                            setShowCreateMyList(false);
                            setMlTitle("");
                            setMlListType("todo");
                            await loadMyLists_();
                          })();
                          
                          toast.promise(promise, {
                            loading: `Creating project "${tpl.title}"...`,
                            success: `Project "${tpl.title}" created!`,
                            error: 'Failed to create project from template'
                          });

                          promise.finally(() => setCreatingML(false));
                        }}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-xl border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition text-left cursor-pointer ${creatingML ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <tpl.icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex flex-col items-start">
                          <span className="text-xs font-semibold text-foreground truncate">{tpl.title}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{tpl.items.length} default tasks</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleCreateMyList}
                disabled={creatingML || !mlTitle.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: creatingML ? "rgba(92,58,32,0.5)" : "linear-gradient(135deg, #5c3a20, #7a5234)" }}
              >
                {creatingML ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creatingML ? "Creating..." : "Create list"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ CREATE SHARED LIST SHEET ════════════════ */}
      {showCreateShared && createPortal(
        <div className="modal-overlay" onClick={() => setShowCreateShared(false)}>
          <div className="modal-sheet p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ListPlus className="w-4 h-4 text-primary" /> New Shared List
              </h3>
              <button onClick={() => setShowCreateShared(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">List title *</label>
                <input
                  value={slTitle}
                  onChange={(e) => setSlTitle(e.target.value)}
                  placeholder="e.g. Grocery list, Party planning..."
                  className="w-full px-3 py-2.5 rounded-lg border bg-input-background text-sm"
                  autoFocus
                />
              </div>

              {/* Contact picker + manual invite */}
              <CollaboratorPicker
                collaborators={slCollabs}
                onChange={setSlCollabs}
                contacts={contacts}
                label="Invite collaborators"
              />

              <ListTypeSelector value={slListType} onChange={setSlListType} />

              {slListType === "project" && (
                <div className="pt-2">
                  <label className="text-xs text-muted-foreground mb-2 block">Or start from a template</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PROJECT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          if (creatingSL) return;
                          setCreatingSL(true);
                          const promise = (async () => {
                            const newList = await createSharedList({
                              title: tpl.title,
                              list_type: "project",
                              collaborators: slCollabs.filter(c => c.email.trim() !== ""),
                            });
                            let currentMilestoneId = "";
                            for (const item of tpl.items) {
                              const itemData = { ...item };
                              if (!itemData.is_milestone && currentMilestoneId) {
                                itemData.milestone_id = currentMilestoneId;
                              }
                              const res = await addSharedListItem(newList.id, itemData);
                              if (itemData.is_milestone && res) {
                                currentMilestoneId = res.id;
                              }
                            }
                            setShowCreateShared(false);
                            setSlTitle("");
                            setSlListType("todo");
                            setSlCollabs([{ name: "", email: "" }]);
                            await loadShared();
                          })();

                          toast.promise(promise, {
                            loading: `Creating project "${tpl.title}"...`,
                            success: `Project "${tpl.title}" created!`,
                            error: 'Failed to create project from template'
                          });

                          promise.finally(() => setCreatingSL(false));
                        }}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-xl border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition text-left cursor-pointer ${creatingSL ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <tpl.icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex flex-col items-start">
                          <span className="text-xs font-semibold text-foreground truncate">{tpl.title}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{tpl.items.length} default tasks</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleCreateSharedList}
                disabled={creatingSL || !slTitle.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: creatingSL ? "rgba(92,58,32,0.5)" : "linear-gradient(135deg, #5c3a20, #7a5234)" }}
              >
                {creatingSL ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {creatingSL ? "Creating..." : "Create & Invite"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ CONVERT TO SHARED MODAL ════════════════ */}
      {convertingListId && createPortal(
        <div className="modal-overlay" onClick={() => setConvertingListId(null)}>
          <div className="modal-sheet p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" /> Convert to Shared List
              </h3>
              <button onClick={() => setConvertingListId(null)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This will move your list to <strong>Shared Lists</strong> and optionally invite collaborators. All existing items will be kept.
            </p>

            <CollaboratorPicker
              collaborators={convertCollabs}
              onChange={setConvertCollabs}
              contacts={contacts}
              label="Invite collaborators (optional)"
            />

            <button
              onClick={handleConvertToShared}
              disabled={converting}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: converting ? "rgba(92,58,32,0.5)" : "linear-gradient(135deg, #5c3a20, #7a5234)" }}
            >
              {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              {converting ? "Converting..." : "Convert & Share"}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════ TEMPLATE INFO MODAL ════════════════ */}
      {showTemplateModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-sheet p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <FileDown className="w-4 h-4 text-primary" /> CSV Template Guide
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                The template comes pre-filled with a sample project so you can see the expected format. Replace the sample data with your own before importing.
              </p>

              <div className="space-y-2">
                <p className="font-medium text-foreground">How to use:</p>
                <ol className="list-decimal list-inside space-y-1.5 pl-1">
                  <li>Open the downloaded <strong>Chrono_Project_Template.csv</strong> in any spreadsheet app (Excel, Google Sheets, etc.).</li>
                  <li>Set the <strong>Type</strong> column to <code className="px-1 py-0.5 rounded bg-muted text-xs">Milestone</code> or <code className="px-1 py-0.5 rounded bg-muted text-xs">Task</code>.</li>
                  <li>For tasks, enter the <strong>Milestone</strong> name they belong to — this links tasks to their milestone.</li>
                  <li>Fill in <strong>Task</strong> name, <strong>Allocated Hours</strong>, <strong>Due Date</strong> (YYYY-MM-DD), and <strong>Notes</strong> (costs, descriptions, etc.).</li>
                  <li>Save as CSV, then use the <strong>Import</strong> button on your project list to upload.</li>
                </ol>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">Tips:</p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>Tasks without a milestone name will be added as standalone items.</li>
                  <li>Use the Notes column for budgets, descriptions, or any extra context.</li>
                  <li>Milestones only need the Type and Milestone columns filled in.</li>
                </ul>
              </div>
            </div>

            <button
              onClick={doDownloadTemplate}
              className="w-full mt-5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition"
              style={{ background: "linear-gradient(135deg, #5c3a20, #7a5234)" }}
            >
              <Download className="w-4 h-4" /> Download Template
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CollaboratorPicker — contact chips + manual name/email inputs
   ═══════════════════════════════════════════════════════════════ */
function CollaboratorPicker({
  collaborators,
  onChange,
  contacts,
  label,
}: {
  collaborators: { name: string; email: string }[];
  onChange: (collabs: { name: string; email: string }[]) => void;
  contacts: { name: string; email: string }[];
  label: string;
}) {
  const addedEmails = new Set(collaborators.map(c => c.email.toLowerCase()).filter(Boolean));
  const availableContacts = contacts.filter(c => !addedEmails.has(c.email.toLowerCase()));

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1.5">
        <UserPlus className="w-3 h-3" /> {label}
      </label>

      {/* Quick-add contact chips */}
      {availableContacts.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Contact className="w-2.5 h-2.5" /> Your contacts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableContacts.map((contact) => (
              <button
                key={contact.email}
                type="button"
                onClick={() => {
                  // Add the contact, removing an empty row if one exists
                  const hasEmptyRow = collaborators.some(c => !c.name.trim() && !c.email.trim());
                  const filtered = hasEmptyRow
                    ? collaborators.filter(c => c.name.trim() || c.email.trim())
                    : collaborators;
                  onChange([...filtered, { name: contact.name, email: contact.email }]);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-primary/8 text-primary border border-primary/20 hover:bg-primary/15 transition"
              >
                <User className="w-2.5 h-2.5" />
                {contact.name}
                <Plus className="w-2.5 h-2.5 opacity-60" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual entry rows */}
      <div className="space-y-2">
        {collaborators.map((c, i) => (
          <div key={i} className="flex gap-2 items-center">
            <div className="relative flex-1">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={c.name}
                onChange={(e) => {
                  const updated = [...collaborators];
                  updated[i] = { ...updated[i], name: e.target.value };
                  onChange(updated);
                }}
                placeholder="Name"
                className="w-full pl-8 pr-3 py-2 rounded-lg border bg-input-background text-sm"
              />
            </div>
            <div className="relative flex-1">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={c.email}
                onChange={(e) => {
                  const updated = [...collaborators];
                  updated[i] = { ...updated[i], email: e.target.value };
                  onChange(updated);
                }}
                placeholder="Email"
                type="email"
                className="w-full pl-8 pr-3 py-2 rounded-lg border bg-input-background text-sm"
              />
            </div>
            {collaborators.length > 1 && (
              <button
                onClick={() => onChange(collaborators.filter((_, j) => j !== i))}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => onChange([...collaborators, { name: "", email: "" }])}
          className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
        >
          <Plus className="w-3 h-3" /> Add another person
        </button>
      </div>
    </div>
  );
}