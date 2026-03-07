import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { getMyLists, getSharedLists, updateMyList, updateSharedList, sendInvoiceEmail } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { ArrowLeft, Send, Link2, Copy, CheckCircle2, FileText, Loader2, Play, ExternalLink, MessageSquare, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth-context";

export function InvoiceGeneratorPage() {
  const { listId } = useParams();
  const [searchParams] = useSearchParams();
  const isSharedParam = searchParams.get("shared") === "true";
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>(listId || "");
  const [isShared, setIsShared] = useState<boolean>(isSharedParam);
  
  const [hourlyRate, setHourlyRate] = useState(50);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("50% Upfront, 50% on Completion");
  const [customItems, setCustomItems] = useState<{id: string, description: string, amount: number}[]>([]);
  const [status, setStatus] = useState<"unpaid" | "paid">("unpaid");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [governingLaw, setGoverningLaw] = useState("New South Wales, Australia");
  const [ipTransfer, setIpTransfer] = useState("Upon full payment");
  const [hasAgreement, setHasAgreement] = useState(false);
  
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [showAgreementWizard, setShowAgreementWizard] = useState(false);
  
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [my, shared] = await Promise.all([getMyLists(), getSharedLists()]);
        const allProjects = [
          ...my.filter((l: any) => l.list_type === "project").map((l: any) => ({ ...l, _isShared: false })),
          ...shared.filter((l: any) => l.list_type === "project").map((l: any) => ({ ...l, _isShared: true }))
        ];
        setProjects(allProjects);
        
        if (selectedListId && selectedListId !== "new") {
          const list = allProjects.find(p => p.id === selectedListId);
          if (list) {
            setIsShared(list._isShared);
            if (list.invoice_settings) {
              setHourlyRate(list.invoice_settings.hourlyRate || 50);
              setTaxRate(list.invoice_settings.taxRate || 0);
              setNotes(list.invoice_settings.notes || "");
              setPaymentTerms(list.invoice_settings.paymentTerms || "50% Upfront, 50% on Completion");
              setCustomItems(list.invoice_settings.customItems || []);
              setStatus(list.invoice_settings.status || "unpaid");
              setHasAgreement(!!list.invoice_settings.hasAgreement);
              if (list.invoice_settings.governingLaw) setGoverningLaw(list.invoice_settings.governingLaw);
              if (list.invoice_settings.ipTransfer) setIpTransfer(list.invoice_settings.ipTransfer);
            }
          }
        } else if (allProjects.length > 0) {
          setSelectedListId(allProjects[0].id);
          setIsShared(allProjects[0]._isShared);
        }
      } catch (e) {
        toast.error("Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedListId]);

  const selectedProject = projects.find(p => p.id === selectedListId);

  const calculateTotals = () => {
    if (!selectedProject || !selectedProject.items) return { subtotal: 0, tax: 0, total: 0, totalHours: 0 };
    let totalHours = 0;
    for (const item of selectedProject.items) {
      if (!item.is_milestone && item.allocated_hours) totalHours += item.allocated_hours;
    }
    let subtotal = totalHours * hourlyRate;
    for (const item of customItems) {
      subtotal += Number(item.amount) || 0;
    }
    const tax = subtotal * (taxRate / 100);
    return { subtotal, tax, total: subtotal + tax, totalHours };
  };

  const { subtotal, tax, total, totalHours } = calculateTotals();

  const handleSaveSettings = async () => {
    if (!selectedProject) return;
    if (!profile?.business_profile?.legal_name) {
      toast.error("Please configure your Professional Identity in Settings first.");
      return;
    }
    setGenerating(true);
    try {
      const settings = { 
        hourlyRate, 
        taxRate, 
        notes, 
        paymentTerms, 
        customItems, 
        status,
        hasAgreement,
        governingLaw,
        ipTransfer
      };
      const currentLogs = selectedProject.invoice_logs || [];
      const updatedLogs = [...currentLogs, {
        action: "updated",
        date: new Date().toISOString(),
        details: "Invoice settings updated"
      }];
      
      if (isShared) {
        await updateSharedList(selectedProject.id, { invoice_generated: true, invoice_settings: settings, invoice_logs: updatedLogs });
      } else {
        await updateMyList(selectedProject.id, { invoice_generated: true, invoice_settings: settings, invoice_logs: updatedLogs });
      }
      
      // Update local state
      const updated = [...projects];
      const idx = updated.findIndex(p => p.id === selectedProject.id);
      if (idx !== -1) {
        updated[idx].invoice_generated = true;
        updated[idx].invoice_settings = settings;
        updated[idx].invoice_logs = updatedLogs;
        setProjects(updated);
      }
      
      toast.success("Invoice generated successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate invoice");
    } finally {
      setGenerating(false);
    }
  };

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/invoice/${selectedProject?.id}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      toast.success("Link copied to clipboard!");
    } else {
      toast.error("Failed to copy link");
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail || !selectedProject) {
      toast.error("Please enter a recipient email");
      return;
    }
    setSending(true);
    try {
      await sendInvoiceEmail({
        listId: selectedProject.id,
        recipientEmail,
        recipientName,
        invoiceLink: `${window.location.origin}/invoice/${selectedProject.id}`,
        projectName: selectedProject.title,
      });
      const isAccepted = selectedProject.invoice_settings?.accepted;
      toast.success(`${isAccepted ? "Invoice" : "Quote"} sent via email!`);
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const handleReplyComment = async () => {
    if (!selectedProject || !replyText.trim()) return;
    const currentSettings = selectedProject.invoice_settings || {};
    const currentComments = currentSettings.comments || [];
    
    const newComment = {
      text: replyText,
      name: profile?.user_metadata?.name || profile?.business_profile?.owner_legal_name || profile?.business_profile?.legal_name || "Owner",
      date: new Date().toISOString(),
      isOwner: true
    };
    
    const updatedSettings = { ...currentSettings, comments: [...currentComments, newComment] };
    
    try {
      if (isShared) {
        await updateSharedList(selectedProject.id, { invoice_settings: updatedSettings });
      } else {
        await updateMyList(selectedProject.id, { invoice_settings: updatedSettings });
      }
      
      const updated = [...projects];
      const idx = updated.findIndex(p => p.id === selectedProject.id);
      if (idx !== -1) {
        updated[idx].invoice_settings = updatedSettings;
        setProjects(updated);
      }
      setReplyText("");
      setReplyingTo(null);
      toast.success("Reply posted!");
    } catch (e) {
      toast.error("Failed to post reply");
    }
  };

  const handleDeleteComment = async (index: number) => {
    if (!selectedProject) return;
    const currentSettings = selectedProject.invoice_settings || {};
    const currentComments = currentSettings.comments || [];
    const updatedComments = currentComments.filter((_: any, i: number) => i !== index);
    const updatedSettings = { ...currentSettings, comments: updatedComments };
    
    try {
      if (isShared) {
        await updateSharedList(selectedProject.id, { invoice_settings: updatedSettings });
      } else {
        await updateMyList(selectedProject.id, { invoice_settings: updatedSettings });
      }
      
      const updated = [...projects];
      const idx = updated.findIndex(p => p.id === selectedProject.id);
      if (idx !== -1) {
        updated[idx].invoice_settings = updatedSettings;
        setProjects(updated);
      }
      toast.success("Comment deleted");
    } catch (e) {
      toast.error("Failed to delete comment");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8F9FA] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate("/track?tab=tasks")}
            className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Invoice Generator
          </h1>
        </div>

        {/* Project Selection */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Project</label>
            <select
              value={selectedListId}
              onChange={(e) => {
                const p = projects.find(x => x.id === e.target.value);
                if (p) {
                  setSelectedListId(p.id);
                  setIsShared(p._isShared);
                  if (p.invoice_settings) {
                    setHourlyRate(p.invoice_settings.hourlyRate || 50);
                    setTaxRate(p.invoice_settings.taxRate || 0);
                    setNotes(p.invoice_settings.notes || "");
                    setPaymentTerms(p.invoice_settings.paymentTerms || "50% Upfront, 50% on Completion");
                    setCustomItems(p.invoice_settings.customItems || []);
                    setStatus(p.invoice_settings.status || "unpaid");
                  }
                }
              }}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            >
              <option value="" disabled>Select a project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title} {p._isShared ? "(Shared)" : ""}</option>
              ))}
            </select>
          </div>

          {selectedProject && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Hourly Rate ($)</label>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tax Rate (%)</label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition resize-none"
                  placeholder="e.g. Any special instructions..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Terms</label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                  placeholder="e.g. 50% Upfront, 50% on Completion"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700">Custom Line Items</label>
                  <button 
                    onClick={() => setCustomItems([...customItems, { id: crypto.randomUUID(), description: "", amount: 0 }])}
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {customItems.length === 0 && (
                    <p className="text-xs text-gray-500 italic">No custom items added.</p>
                  )}
                  {customItems.map((item, idx) => (
                    <div key={item.id} className="flex gap-2 items-center">
                      <input 
                        type="text"
                        value={item.description}
                        onChange={(e) => {
                          const newItems = [...customItems];
                          newItems[idx].description = e.target.value;
                          setCustomItems(newItems);
                        }}
                        placeholder="Description"
                        className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                      />
                      <input 
                        type="number"
                        value={item.amount}
                        onChange={(e) => {
                          const newItems = [...customItems];
                          newItems[idx].amount = Number(e.target.value);
                          setCustomItems(newItems);
                        }}
                        placeholder="Amount"
                        className="w-24 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                      />
                      <button 
                        onClick={() => {
                          const newItems = [...customItems];
                          newItems.splice(idx, 1);
                          setCustomItems(newItems);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="status" 
                      value="unpaid"
                      checked={status === "unpaid"}
                      onChange={() => setStatus("unpaid")}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">Unpaid</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="status" 
                      value="paid"
                      checked={status === "paid"}
                      onChange={() => setStatus("paid")}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">Paid</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Invoice Preview */}
        {selectedProject && (
          <div className="rounded overflow-hidden relative" style={{ background: "#f5eed8", boxShadow: "0 2px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)", fontFamily: "'Courier Prime', 'Courier New', Courier, monospace" }}>
            
            {/* Warning Banner for missing Identity */}
            {!profile?.business_profile?.legal_name && (
              <div className="absolute top-8 left-4 right-4 bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm flex items-start gap-2 shadow-sm z-10">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Please configure your Professional Identity in Settings first.</span>
              </div>
            )}

            {/* Perforated top edge */}
            <div style={{ height: "6px", backgroundImage: "radial-gradient(circle at 6px 6px, #f0f2f8 3px, transparent 3px)", backgroundSize: "12px 12px", backgroundPosition: "0 0" }} />

            <div className="px-6 sm:px-8 pt-6 pb-4" style={{ borderBottom: "2px dashed #d4d0c8" }}>
              <div className="flex justify-between items-start">
                <div>
                  <p style={{ fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "#999", marginBottom: "2px" }}>
                    {selectedProject?.invoice_settings?.accepted ? "INVOICE" : "QUOTE"}
                  </p>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>{selectedProject.title}</h2>
                  <p style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
                    No. CHR-{(selectedProject.id || "").slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#999", marginBottom: "2px" }}>
                    BILLED BY
                  </p>
                  {profile?.business_profile?.legal_name ? (
                    <>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                        {profile.business_profile.legal_name}
                      </p>
                      <p style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                        ABN: {profile.business_profile.abn}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                      {profile?.name || "Service Provider"}
                    </p>
                  )}
                  <p style={{ fontSize: "10px", color: "#888", marginTop: "4px", paddingTop: "4px", borderTop: "1px dotted #d4d0c8" }}>
                    {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                  <div className="mt-3 pt-3 border-t border-dotted border-gray-300">
                    <p style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#999", marginBottom: "2px" }}>TOTAL</p>
                    <p style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>${total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 sm:px-8 py-4">
              {/* Column header */}
              <div className="flex items-center gap-2 pb-2 mb-1" style={{ borderBottom: "1px solid #d4d0c8" }}>
                <span style={{ width: "28px", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "#aaa", fontWeight: 700 }}>#</span>
                <span className="flex-1" style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "#aaa", fontWeight: 700 }}>ITEM</span>
                <span style={{ width: "80px", textAlign: "right", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "#aaa", fontWeight: 700 }}>AMOUNT</span>
              </div>

              <div>
                {(() => {
                  let num = 0;
                  const allItems = selectedProject.items || [];
                  const msItems = allItems.filter((i: any) => i.is_milestone);
                  const orphanedItems = allItems.filter((i: any) => !i.is_milestone && !i.milestone_id);

                  return (
                    <div className="contents">
                      {msItems.map((milestone: any) => {
                        const mTasks = allItems.filter((i: any) => !i.is_milestone && i.milestone_id === milestone.id);
                        if (mTasks.length === 0) return null;
                        return (
                          <div key={milestone.id}>
                            <div className="pt-3 pb-1">
                              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#7c3aed" }}>
                                ■ {milestone.text}
                              </span>
                            </div>
                            {mTasks.map((task: any) => {
                              num++;
                              const amt = task.allocated_hours ? task.allocated_hours * hourlyRate : 0;
                              return (
                                <div key={task.id} className="flex items-start gap-2 py-1.5" style={{ borderBottom: "1px dotted #e0dcd4" }}>
                                  <span style={{ width: "28px", fontSize: "11px", color: "#bbb" }}>{String(num).padStart(2, "0")}</span>
                                  <span className="flex-1 text-[12px]" style={{ color: "#1a1a1a", lineHeight: 1.5 }}>{task.text}</span>
                                  <span style={{ width: "80px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "#1a1a1a" }}>
                                    {amt > 0 ? `$${amt.toFixed(2)}` : "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}

                      {orphanedItems.length > 0 && (
                        <div>
                          <div className="pt-3 pb-1">
                            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#888" }}>■ OTHER ITEMS</span>
                          </div>
                          {orphanedItems.map((task: any) => {
                            num++;
                            const amt = task.allocated_hours ? task.allocated_hours * hourlyRate : 0;
                            return (
                              <div key={task.id} className="flex items-start gap-2 py-1.5" style={{ borderBottom: "1px dotted #e0dcd4" }}>
                                <span style={{ width: "28px", fontSize: "11px", color: "#bbb" }}>{String(num).padStart(2, "0")}</span>
                                <span className="flex-1 text-[12px]" style={{ color: "#1a1a1a", lineHeight: 1.5 }}>{task.text}</span>
                                <span style={{ width: "80px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "#1a1a1a" }}>
                                  {amt > 0 ? `$${amt.toFixed(2)}` : "—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {customItems.length > 0 && (
                        <div>
                          <div className="pt-3 pb-1">
                            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#888" }}>■ ADDITIONAL ITEMS</span>
                          </div>
                          {customItems.map((ci: any) => {
                            num++;
                            return (
                              <div key={ci.id} className="flex items-start gap-2 py-1.5" style={{ borderBottom: "1px dotted #e0dcd4" }}>
                                <span style={{ width: "28px", fontSize: "11px", color: "#bbb" }}>{String(num).padStart(2, "0")}</span>
                                <span className="flex-1 text-[12px]" style={{ color: "#1a1a1a", lineHeight: 1.5 }}>{ci.description || "Unnamed Item"}</span>
                                <span style={{ width: "80px", textAlign: "right", fontSize: "12px", fontWeight: 700, color: "#1a1a1a" }}>
                                  ${ci.amount.toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Totals */}
              <div className="flex justify-end mt-4 pt-3" style={{ borderTop: "2px dashed #d4d0c8" }}>
                <div style={{ width: "220px" }}>
                  <div className="flex justify-between py-1">
                    <span style={{ fontSize: "11px", color: "#888" }}>Subtotal</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a1a" }}>${subtotal.toFixed(2)}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between py-1">
                      <span style={{ fontSize: "11px", color: "#888" }}>Tax ({taxRate}%)</span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a1a" }}>${tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 mt-1" style={{ borderTop: "2px solid #1a1a1a" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a1a", letterSpacing: "1px" }}>TOTAL</span>
                    <span style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Agreement Section Preview */}
            {hasAgreement && (
              <div className="px-6 sm:px-8 pb-4 pt-4 border-t border-dashed border-gray-300">
                <div style={{ padding: "16px", background: "#fff", border: "1px solid #d4d0c8", borderRadius: "2px", position: "relative" }}>
                  <div style={{ position: "absolute", top: "-10px", left: "16px", background: "#f5eed8", padding: "0 8px" }}>
                    <p style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#1a1a1a", margin: 0, fontWeight: 700 }}>
                      SERVICE AGREEMENT
                    </p>
                  </div>
                  
                  <div className="space-y-3 pt-2">
                    <p style={{ fontSize: "11px", color: "#444", lineHeight: 1.5, margin: 0 }}>
                      This document serves as a binding Service Agreement between <strong>{profile?.business_profile?.legal_name || "Service Provider"}</strong> and the Client.
                    </p>
                    
                    <div>
                      <h4 style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "#888", margin: "0 0 2px", fontWeight: 700 }}>1. The Works</h4>
                      <p style={{ fontSize: "11px", color: "#444", lineHeight: 1.5, margin: 0 }}>
                        The total fee for these services is <strong>${total.toFixed(2)}</strong>.
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "#888", margin: "0 0 2px", fontWeight: 700 }}>2. Intellectual Property</h4>
                      <p style={{ fontSize: "11px", color: "#444", lineHeight: 1.5, margin: 0 }}>
                        Ownership of final deliverables transfers to the Client: <strong>{ipTransfer}</strong>.
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "#888", margin: "0 0 2px", fontWeight: 700 }}>3. Governing Law</h4>
                      <p style={{ fontSize: "11px", color: "#444", lineHeight: 1.5, margin: 0 }}>
                        This agreement shall be governed by the laws of <strong>{governingLaw}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer bar */}
            <div style={{ borderTop: "1px solid #d4c8a8", padding: "10px 24px", textAlign: "center", background: "#f0e8d0" }}>
              <a href="https://chrono.knowwhatson.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <p style={{ fontSize: "9px", color: "#998a6a", letterSpacing: "2px", textTransform: "uppercase", margin: 0, fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}>
                  GENERATED VIA CHRONO
                </p>
              </a>
            </div>
            <div style={{ height: "6px", backgroundImage: "radial-gradient(circle at 6px 0px, #f0f2f8 3px, transparent 3px)", backgroundSize: "12px 12px", backgroundPosition: "0 0" }} />
          </div>
        )}

        {/* Actions */}
        {selectedProject && (
          <div className="glass rounded-2xl p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={generating}
                className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {selectedProject.invoice_generated ? "Update Settings" : "Generate Document"}
              </button>
              
              <button
                onClick={() => setShowAgreementWizard(true)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                <ShieldCheck className="w-4 h-4" />
                Agreement Wizard
              </button>
            </div>

            {selectedProject.invoice_generated && (
              <div className="pt-6 border-t border-gray-200 space-y-8">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-3">
                      {hasAgreement ? "Share Pack Public Link (Invoice & Agreement)" : "Share Public Link"}
                    </h3>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/invoice/${selectedProject.id}`}
                        className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                        <button
                          onClick={copyPublicLink}
                          className="w-full sm:w-24 justify-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2 transition"
                        >
                          <Copy className="w-4 h-4" /> Copy
                        </button>
                        <button
                          onClick={() => window.open(`/invoice/${selectedProject.id}`, "_blank")}
                          className="w-full sm:w-24 justify-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2 transition"
                        >
                          <ExternalLink className="w-4 h-4" /> Open
                        </button>
                      </div>
                    </div>
                  </div>

                  {hasAgreement && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-3">
                        Agreement Direct Link
                      </h3>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={`${window.location.origin}/agreement/${selectedProject.id}`}
                          className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => {
                              copyToClipboard(`${window.location.origin}/agreement/${selectedProject.id}`);
                              toast.success("Agreement link copied!");
                            }}
                            className="w-full sm:w-24 justify-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2 transition"
                          >
                            <Copy className="w-4 h-4" /> Copy
                          </button>
                          <button
                            onClick={() => window.open(`/agreement/${selectedProject.id}`, "_blank")}
                            className="w-full sm:w-24 justify-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2 transition"
                          >
                            <ExternalLink className="w-4 h-4" /> Open
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Send via Email</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <input
                      type="text"
                      placeholder="Recipient Name"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                    />
                    <input
                      type="email"
                      placeholder="Recipient Email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                    />
                  </div>
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !recipientEmail}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Sending..." : `Send ${selectedProject?.invoice_settings?.accepted ? "Invoice" : "Quote"}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comments from Clients */}
        {selectedProject && (selectedProject.invoice_settings?.comments?.length > 0) && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold text-gray-900">Client Comments ({selectedProject.invoice_settings.comments.length})</h3>
            </div>
            <div className="space-y-3">
              {selectedProject.invoice_settings.comments.map((c: any, i: number) => (
                <div key={i} className={`bg-white rounded-xl p-4 border shadow-sm ${c.isOwner ? 'border-primary/30' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-800">
                        {c.name || "Anonymous"} {c.isOwner && <span className="text-primary text-[10px] ml-1 bg-primary/10 px-1.5 py-0.5 rounded-full">Owner</span>}
                      </span>
                      {c.source && (
                        <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
                          {c.source}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-400">{new Date(c.date).toLocaleString()}</span>
                      <button onClick={() => handleDeleteComment(i)} className="text-gray-400 hover:text-red-500 transition">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-2">{c.text}</p>
                  
                  {replyingTo === i ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input 
                        type="text" 
                        autoFocus
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type a reply..."
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleReplyComment();
                          if (e.key === 'Escape') setReplyingTo(null);
                        }}
                      />
                      <button 
                        onClick={handleReplyComment}
                        disabled={!replyText.trim()}
                        className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg font-medium disabled:opacity-50"
                      >
                        Reply
                      </button>
                      <button onClick={() => setReplyingTo(null)} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setReplyingTo(i); setReplyText(""); }} className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 mt-1">
                      <MessageSquare className="w-3 h-3" /> Reply
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agreement Wizard Modal */}
      {showAgreementWizard && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Agreement Wizard</h2>
                  <p className="text-sm text-gray-500">Australian Service Agreement Setup</p>
                </div>
              </div>
              <button
                onClick={() => setShowAgreementWizard(false)}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-gray-50/50">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 text-sm flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p>
                  This wizard automatically pulls your current task scope and pricing to draft a compliant Service Agreement. 
                  When the client signs, the corresponding invoice is generated.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-1">1. Professional Identity</h3>
                  {profile?.business_profile?.legal_name ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 mt-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{profile.business_profile.legal_name} • ABN {profile.business_profile.abn}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-red-500 mt-2">Missing Identity in Settings!</p>
                  )}
                </div>

                <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-1">2. Scope & Commercials</h3>
                  <p className="text-sm text-gray-500 mb-3">Extracted from {selectedProject.title}</p>
                  
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Project Value</span>
                      <span className="font-bold text-gray-900">${total.toFixed(2)} {taxRate > 0 && `(inc. ${taxRate}% GST)`}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Payment Terms</span>
                      <span className="font-medium text-gray-900">{paymentTerms}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-1">3. Contract Terms</h3>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Governing Law</label>
                      <select 
                        value={governingLaw}
                        onChange={(e) => setGoverningLaw(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition"
                      >
                        <option>New South Wales, Australia</option>
                        <option>Victoria, Australia</option>
                        <option>Queensland, Australia</option>
                        <option>Western Australia</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IP Transfer</label>
                      <select 
                        value={ipTransfer}
                        onChange={(e) => setIpTransfer(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-500 transition"
                      >
                        <option>Upon full payment</option>
                        <option>Upon creation</option>
                        <option>Retained by Creator (License granted)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-white">
              <button 
                onClick={() => {
                  setHasAgreement(true);
                  // We use a timeout to let state update before saving, or we can just save directly with updated values
                  setTimeout(() => {
                    handleSaveSettings();
                    setShowAgreementWizard(false);
                    toast.success("Agreement generated and added to portal!");
                  }, 0);
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                <FileText className="w-4 h-4" />
                Generate Agreement & Sync Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}