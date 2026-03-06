import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { getMyLists, getSharedLists, updateMyList, updateSharedList, sendInvoiceEmail } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { ArrowLeft, Send, Link2, Copy, CheckCircle2, FileText, Loader2, Play, ExternalLink, MessageSquare } from "lucide-react";
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
  const [termsLink, setTermsLink] = useState("");
  const [customItems, setCustomItems] = useState<{id: string, description: string, amount: number}[]>([]);
  const [status, setStatus] = useState<"unpaid" | "paid">("unpaid");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

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
              setTermsLink(list.invoice_settings.termsLink || "");
              setCustomItems(list.invoice_settings.customItems || []);
              setStatus(list.invoice_settings.status || "unpaid");
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
      if (item.allocated_hours) totalHours += item.allocated_hours;
    }
    let subtotal = totalHours * hourlyRate;
    for (const item of customItems) {
      subtotal += item.amount;
    }
    const tax = subtotal * (taxRate / 100);
    return { subtotal, tax, total: subtotal + tax, totalHours };
  };

  const { subtotal, tax, total, totalHours } = calculateTotals();

  const handleSaveSettings = async () => {
    if (!selectedProject) return;
    if (!termsLink.trim()) {
      toast.error("Terms & Contract Link is required to issue an invoice.");
      return;
    }
    setGenerating(true);
    try {
      const settings = { hourlyRate, taxRate, notes, termsLink, customItems, status };
      if (isShared) {
        await updateSharedList(selectedProject.id, { invoice_generated: true, invoice_settings: settings });
      } else {
        await updateMyList(selectedProject.id, { invoice_generated: true, invoice_settings: settings });
      }
      
      // Update local state
      const updated = [...projects];
      const idx = updated.findIndex(p => p.id === selectedProject.id);
      if (idx !== -1) {
        updated[idx].invoice_generated = true;
        updated[idx].invoice_settings = settings;
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
                    setTermsLink(p.invoice_settings.termsLink || "");
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes / Payment Terms</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition resize-none"
                  placeholder="e.g. Payment due within 30 days. Bank details: ..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Terms & Contract Link (Required)</label>
                <input
                  type="url"
                  value={termsLink}
                  onChange={(e) => setTermsLink(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                  placeholder="https://..."
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
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
          <div className="rounded overflow-hidden" style={{ background: "#f5eed8", boxShadow: "0 2px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)", fontFamily: "'Courier Prime', 'Courier New', Courier, monospace" }}>
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
                  <p style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#999", marginBottom: "2px" }}>TOTAL</p>
                  <p style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>${total.toFixed(2)}</p>
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
            <button
              onClick={handleSaveSettings}
              disabled={generating}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {selectedProject.invoice_generated ? "Update Invoice Settings" : "Generate Invoice"}
            </button>

            {selectedProject.invoice_generated && (
              <div className="pt-6 border-t border-gray-200 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-3">Share Public Link</h3>
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
                        className="w-full justify-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2 transition"
                      >
                        <Copy className="w-4 h-4" /> Copy
                      </button>
                      <button
                        onClick={() => window.open(`/invoice/${selectedProject.id}`, "_blank")}
                        className="w-full justify-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-700 flex items-center gap-2 transition"
                      >
                        <ExternalLink className="w-4 h-4" /> Open
                      </button>
                    </div>
                  </div>
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
                <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-800">{c.name || "Anonymous"}</span>
                    <span className="text-[10px] text-gray-400">{new Date(c.date).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}