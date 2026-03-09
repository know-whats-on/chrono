import React, { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useParams, useNavigate } from "react-router";
import { getPublicInvoice, postInvoiceComment, acceptInvoice, requestInvoiceChange } from "../lib/api";
import { SplashScreen } from "./splash-screen";
import { Download, MessageSquare, Loader2, CheckCircle2, FileText, Edit3, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function InvoicePage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  
  const [commentName, setCommentName] = useState("");
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  
  // Change request state
  const [isRequestingChange, setIsRequestingChange] = useState(false);
  const [changeRequestText, setChangeRequestText] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listId) return;
    (async () => {
      try {
        const res = await getPublicInvoice(listId);
        setData(res);
        if (res.invoice_settings?.comments) {
          setComments(res.invoice_settings.comments);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load invoice.");
      } finally {
        setLoading(false);
      }
    })();
  }, [listId]);

  const isLoading = loading || showSplash;
  if (isLoading) return <SplashScreen onComplete={() => setShowSplash(false)} />;

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans text-foreground">
        <div className="max-w-md w-full glass-panel rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-xl text-destructive font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold">Unable to load invoice</h1>
          <p className="text-sm text-muted-foreground">{error || "Invoice not found or no longer available."}</p>
        </div>
      </div>
    );
  }

  const { title, owner_name, items = [], invoice_settings = {}, business_profile = {} } = data;
  
  const hourlyRate = invoice_settings.hourlyRate || 50;
  const taxRate = invoice_settings.taxRate || 0;
  const notes = invoice_settings.notes || "";
  
  const customItems = invoice_settings.customItems || [];
  
  // Calculate totals — items use allocated_hours * hourlyRate for their amount
  let itemsSubtotal = 0;
  for (const item of items) {
    if (!item.is_milestone && item.allocated_hours) {
      itemsSubtotal += item.allocated_hours * hourlyRate;
    }
  }
  let subtotal = itemsSubtotal;
  for (const item of customItems) {
    subtotal += Number(item.amount) || 0;
  }
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const status = invoice_settings.status || "unpaid";
  const isAccepted = data?.invoice_settings?.accepted;
  const docType = isAccepted ? "INVOICE" : "QUOTE";

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    return `${day} ${month}, ${year}`;
  };

  const dateStr = formatDate(new Date().toISOString());

  // Generate a stable invoice number from the list ID
  const invoiceNo = `CHR-${(data.id || "").slice(0, 8).toUpperCase()}`;

  // Count all line items for numbering
  let lineNum = 0;

  const handlePrint = async () => {
    if (!invoiceRef.current || downloading) return;
    setDownloading(true);
    try {
      const el = invoiceRef.current;

      // Capture at 2x for crisp output
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#f5eed8",
        logging: false,
      });

      const imgW = canvas.width;
      const imgH = canvas.height;

      // A4 dimensions in mm
      const pdfW = 210;
      const pdfH = 297;
      const margin = 10; // mm margin on each side
      const contentW = pdfW - margin * 2;
      const contentH = (imgH / imgW) * contentW;

      // If it fits on one page
      if (contentH <= pdfH - margin * 2) {
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        pdf.addImage(imgData, "JPEG", margin, margin, contentW, contentH);
        pdf.save(`${invoiceNo}-${docType.toLowerCase()}.pdf`);
      } else {
        // Multi-page: slice the canvas into page-sized chunks
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageContentH = pdfH - margin * 2;
        // How many source pixels per page
        const pxPerPage = (pageContentH / contentW) * imgW;
        const totalPages = Math.ceil(imgH / pxPerPage);

        for (let page = 0; page < totalPages; page++) {
          if (page > 0) pdf.addPage();
          const srcY = page * pxPerPage;
          const srcH = Math.min(pxPerPage, imgH - srcY);
          const destH = (srcH / imgW) * contentW;

          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = imgW;
          pageCanvas.height = srcH;
          const ctx = pageCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);

          pdf.addImage(pageCanvas.toDataURL("image/jpeg", 1.0), "JPEG", margin, margin, contentW, destH);
        }
        pdf.save(`${invoiceNo}-${docType.toLowerCase()}.pdf`);
      }
      toast.success("PDF downloaded!");
    } catch (err) {
      console.error("PDF generation error:", err);
      // Fallback to print dialog on failure
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !listId) return;
    setPostingComment(true);
    try {
      const res = await postInvoiceComment(listId, commentName, comment, replyTo || undefined, "Invoice");
      setComments([...comments, res.comment]);
      setComment("");
      setReplyTo(null);
      toast.success("Comment posted successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const handleRequestChange = async () => {
    if (!listId || !changeRequestText.trim()) return;
    setSubmittingChange(true);
    try {
      await requestInvoiceChange(listId, commentName || signatureName || "Client", changeRequestText, "Invoice");
      toast.success("Change request submitted!");
      
      const newComment = {
        text: `CHANGE REQUEST: ${changeRequestText}`,
        name: commentName || signatureName || "Client",
        date: new Date().toISOString()
      };

      // Update local state to void signature
      setData((prev: any) => ({
        ...prev,
        invoice_settings: {
          ...(prev.invoice_settings || {}),
          accepted: false,
          signature_name: null,
          accepted_at: null,
          comments: [...(prev.invoice_settings?.comments || []), newComment]
        }
      }));

      // Also update the comments state array so it appears immediately without refresh
      setComments((prev) => [...prev, newComment]);
      
      setIsRequestingChange(false);
      setChangeRequestText("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit change request");
    } finally {
      setSubmittingChange(false);
    }
  };

  const handleAccept = async () => {
    if (!listId) return;
    if (!isSigning) {
      setIsSigning(true);
      return;
    }
    if (!signatureName.trim()) {
      toast.error("Please enter your name to sign");
      return;
    }
    setAccepting(true);
    try {
      await acceptInvoice(listId, signatureName.trim(), undefined, "Invoice");
      setData((prev: any) => ({
        ...prev,
        invoice_settings: {
          ...(prev.invoice_settings || {}),
          accepted: true,
          accepted_at: new Date().toISOString(),
          signature_name: signatureName.trim()
        }
      }));
      toast.success("Quote accepted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept quote");
    } finally {
      setAccepting(false);
      setIsSigning(false);
    }
  };

  const processedComments = comments.map((c: any, i: number) => ({
    ...c,
    id: c.id || `legacy-${i}-${c.date}`
  }));

  const rootComments = processedComments.filter((c: any) => !c.parentId);
  const getChildren = (parentId: string) => processedComments.filter((c: any) => c.parentId === parentId);

  const renderComment = (c: any, depth = 0) => {
    const children = getChildren(c.id);
    return (
      <div key={c.id} className={`${depth > 0 ? "ml-6 mt-3 border-l-2 border-white/10 pl-4" : "mt-4 first:mt-0"}`}>
        <div className={`bg-white/5 p-4 rounded-2xl border shadow-sm ${c.isOwner ? 'border-primary/50' : 'border-white/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-xs text-foreground">
              {c.name || "Client"} {c.isOwner && <span className="text-primary text-[10px] ml-1 bg-primary/20 px-1.5 py-0.5 rounded-full">Owner</span>}
            </span>
            <span className="text-[10px] text-muted-foreground">{formatDate(c.date)}</span>
          </div>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{c.text}</p>
          <div className="mt-2 flex justify-end">
            <button 
              onClick={() => setReplyTo(c.id)}
              className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition"
            >
              Reply
            </button>
          </div>
        </div>
        {children.length > 0 && (
          <div className="space-y-3">
            {children.map(child => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] overflow-y-auto p-4 sm:p-8 print:h-auto print:overflow-visible print:p-0 print:bg-transparent block" style={{ background: "#e8e4dc" }}>
      <div className="max-w-[680px] mx-auto space-y-6 pb-8 print:max-w-none print:pb-0 print:m-0 print:space-y-0">
        
        {/* Actions Bar (hidden when printing) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/60 shadow-sm border border-white/40 flex items-center justify-center text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{docType} for</p>
              <h1 className="text-lg font-bold text-foreground leading-tight">{title}</h1>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {data?.invoice_settings?.hasAgreement && (
              <button
                onClick={() => navigate(`/agreement/${listId}`)}
                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" /> View Agreement
              </button>
            )}
            {data?.invoice_settings?.termsLink && (
              <a 
                href={data.invoice_settings.termsLink} 
                target="_blank" 
                rel="noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 bg-white/60 hover:bg-white/80 text-foreground border border-white/40 rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" /> View Terms
              </a>
            )}
            <button 
              onClick={handlePrint}
              disabled={downloading}
              className="w-10 h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm transition flex items-center justify-center disabled:opacity-60"
              title="Download PDF"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ═══ THE INVOICE PAPER ═══ */}
        <div 
          ref={invoiceRef}
          className="relative overflow-hidden print:overflow-visible print:shadow-none print:border-none print:m-0"
          style={{
            background: "#f5eed8",
            borderRadius: "4px",
            boxShadow: "0 2px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
            fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
          }}
        >
          {/* Perforated top edge */}
          <div style={{
            height: "8px",
            backgroundImage: "radial-gradient(circle at 8px 8px, #e8e4dc 4px, transparent 4px)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0",
          }} />

          {/* PAID stamp overlay */}
          {status === "paid" && (
            <div className="absolute top-16 right-8 sm:right-12 pointer-events-none select-none" style={{
              transform: "rotate(-18deg)",
              border: "4px solid #dc2626",
              borderRadius: "8px",
              padding: "4px 20px",
              opacity: 0.2,
            }}>
              <span style={{ fontSize: "48px", fontWeight: 700, letterSpacing: "6px", color: "#dc2626", fontFamily: "'Courier Prime', monospace" }}>
                PAID
              </span>
            </div>
          )}

          {/* Invoice Header */}
          <div className="px-8 sm:px-12 pt-8 pb-6" style={{ borderBottom: "2px dashed #d4d0c8" }}>
            <div className="flex flex-col sm:flex-row justify-between gap-6">
              <div>
                <p style={{ fontSize: "12px", letterSpacing: "3px", textTransform: "uppercase", color: "#999", marginBottom: "4px" }}>
                  {docType}
                </p>
                <h2 style={{ fontSize: "26px", fontWeight: 700, color: "#1a1a1a", margin: 0, letterSpacing: "-0.5px" }}>
                  {title}
                </h2>
                <p style={{ fontSize: "14px", color: "#888", marginTop: "6px" }}>
                  No. {invoiceNo}
                </p>
              </div>
              <div className="text-left sm:text-right" style={{ minWidth: "180px" }}>
                <p style={{ fontSize: "12px", letterSpacing: "3px", textTransform: "uppercase", color: "#999", marginBottom: "4px" }}>
                  BILLED BY
                </p>
                {business_profile.legal_name ? (
                  <>
                    <p style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                      {business_profile.legal_name}
                    </p>
                    <p style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                      ABN: {business_profile.abn}
                    </p>
                    {business_profile.address && (
                      <p style={{ fontSize: "12px", color: "#666", marginTop: "2px", whiteSpace: "pre-wrap" }}>
                        {business_profile.address}
                      </p>
                    )}
                    {business_profile.phone && (
                      <p style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                        {business_profile.phone}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                    {owner_name}
                  </p>
                )}
                <p style={{ fontSize: "14px", color: "#888", marginTop: "6px", paddingTop: "6px", borderTop: "1px dotted #d4d0c8" }}>
                  {dateStr}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="px-8 sm:px-12 py-6">
            {/* Column Headers */}
            <div className="flex items-center gap-3 pb-2 mb-1" style={{ borderBottom: "1px solid #d4d0c8" }}>
              <span style={{ width: "32px", fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase", color: "#aaa", fontWeight: 700 }}>
                #
              </span>
              <span className="flex-1" style={{ fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase", color: "#aaa", fontWeight: 700 }}>
                ITEM
              </span>
              <span style={{ width: "90px", textAlign: "right", fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase", color: "#aaa", fontWeight: 700 }}>
                AMOUNT
              </span>
            </div>

            {/* Milestone groups */}
            {items.filter((i: any) => i.is_milestone).length === 0 && items.filter((i: any) => !i.is_milestone).length === 0 && customItems.length === 0 ? (
              <p style={{ fontSize: "15px", color: "#999", padding: "20px 0", fontStyle: "italic" }}>
                No items on this {docType.toLowerCase()}.
              </p>
            ) : (
              <div>
                {items.filter((i: any) => i.is_milestone).map((milestone: any) => {
                  const milestoneTasks = items.filter((i: any) => !i.is_milestone && i.milestone_id === milestone.id);
                  if (milestoneTasks.length === 0) return null;
                  return (
                    <div key={milestone.id}>
                      {/* Milestone header */}
                      <div className="flex items-center gap-2 pt-5 pb-2">
                        <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#7c3aed" }}>
                          ■ {milestone.text}
                        </span>
                      </div>
                      {/* Tasks */}
                      {milestoneTasks.map((item: any) => {
                        lineNum++;
                        const amount = item.allocated_hours ? item.allocated_hours * hourlyRate : 0;
                        return (
                          <div key={item.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px dotted #e0dcd4" }}>
                            <span style={{ width: "32px", fontSize: "14px", color: "#bbb", fontWeight: 400 }}>
                              {String(lineNum).padStart(2, "0")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p style={{ fontSize: "15px", fontWeight: 400, color: "#1a1a1a", margin: 0, lineHeight: 1.5 }}>
                                {item.text}
                              </p>
                              {item.notes && (
                                <p style={{ fontSize: "13px", color: "#999", margin: "2px 0 0", lineHeight: 1.4 }}>
                                  {item.notes}
                                </p>
                              )}
                            </div>
                            <span style={{ width: "90px", textAlign: "right", fontSize: "15px", fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                              {amount > 0 ? `$${amount.toFixed(2)}` : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Orphaned tasks */}
                {items.filter((i: any) => !i.is_milestone && !i.milestone_id).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 pt-5 pb-2">
                      <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#888" }}>
                        ■ OTHER ITEMS
                      </span>
                    </div>
                    {items.filter((i: any) => !i.is_milestone && !i.milestone_id).map((item: any) => {
                      lineNum++;
                      const amount = item.allocated_hours ? item.allocated_hours * hourlyRate : 0;
                      return (
                        <div key={item.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px dotted #e0dcd4" }}>
                          <span style={{ width: "32px", fontSize: "14px", color: "#bbb" }}>
                            {String(lineNum).padStart(2, "0")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: "15px", color: "#1a1a1a", margin: 0, lineHeight: 1.5 }}>{item.text}</p>
                            {item.notes && (
                              <p style={{ fontSize: "13px", color: "#999", margin: "2px 0 0", lineHeight: 1.4 }}>{item.notes}</p>
                            )}
                          </div>
                          <span style={{ width: "90px", textAlign: "right", fontSize: "15px", fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                            {amount > 0 ? `$${amount.toFixed(2)}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Custom items */}
                {customItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 pt-5 pb-2">
                      <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#888" }}>
                        ■ ADDITIONAL ITEMS
                      </span>
                    </div>
                    {customItems.map((ci: any) => {
                      lineNum++;
                      return (
                        <div key={ci.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px dotted #e0dcd4" }}>
                          <span style={{ width: "32px", fontSize: "14px", color: "#bbb" }}>
                            {String(lineNum).padStart(2, "0")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: "15px", color: "#1a1a1a", margin: 0, lineHeight: 1.5 }}>
                              {ci.description || "Unnamed Item"}
                            </p>
                          </div>
                          <span style={{ width: "90px", textAlign: "right", fontSize: "15px", fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                            ${Number(ci.amount).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="px-8 sm:px-12 py-6" style={{ borderTop: "2px dashed #d4d0c8" }}>
            <div className="flex justify-end">
              <div style={{ width: "260px" }}>
                <div className="flex justify-between py-1.5">
                  <span style={{ fontSize: "14px", color: "#888" }}>Subtotal</span>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a" }}>${subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between py-1.5">
                    <span style={{ fontSize: "14px", color: "#888" }}>Tax ({taxRate}%)</span>
                    <span style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a" }}>${tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 mt-2" style={{ borderTop: "2px solid #1a1a1a" }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", letterSpacing: "1px", textTransform: "uppercase" }}>
                    TOTAL
                  </span>
                  <span style={{ fontSize: "26px", fontWeight: 700, color: "#1a1a1a" }}>
                    ${total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {notes && (
            <div className="px-8 sm:px-12 pb-6">
              <div style={{ padding: "14px 18px", background: "#f0e8d0", border: "1px solid #ddd4b8", borderRadius: "2px" }}>
                <p style={{ fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", color: "#806830", margin: "0 0 6px", fontWeight: 700 }}>
                  NOTES & PAYMENT TERMS
                </p>
                <p style={{ fontSize: "14px", color: "#4a3a1a", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {notes}
                </p>
              </div>
            </div>
          )}

          {/* Agreement Section */}
          {invoice_settings.hasAgreement && (
            <div className="px-8 sm:px-12 pb-6">
              <div style={{ padding: "20px", background: "#fff", border: "1px solid #d4d0c8", borderRadius: "2px", position: "relative" }}>
                <div style={{ position: "absolute", top: "-10px", left: "20px", background: "#f5eed8", padding: "0 10px" }}>
                  <p style={{ fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", color: "#1a1a1a", margin: 0, fontWeight: 700 }}>
                    SERVICE AGREEMENT
                  </p>
                </div>
                
                <div className="space-y-4 pt-2">
                  <p style={{ fontSize: "13px", color: "#444", lineHeight: 1.6, margin: 0 }}>
                    This document serves as a binding Service Agreement between <strong>{business_profile.legal_name || owner_name}</strong> ("Service Provider") and the Client.
                  </p>
                  
                  <div>
                    <h4 style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#888", margin: "0 0 4px", fontWeight: 700 }}>1. The Works</h4>
                    <p style={{ fontSize: "13px", color: "#444", lineHeight: 1.6, margin: 0 }}>
                      The Service Provider agrees to perform the items listed in the schedule above. The total fee for these services is <strong>${total.toFixed(2)}</strong>.
                    </p>
                  </div>

                  <div>
                    <h4 style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#888", margin: "0 0 4px", fontWeight: 700 }}>2. Intellectual Property</h4>
                    <p style={{ fontSize: "13px", color: "#444", lineHeight: 1.6, margin: 0 }}>
                      Ownership of final deliverables transfers to the Client: <strong>{invoice_settings.ipTransfer || "Upon full payment"}</strong>.
                    </p>
                  </div>

                  <div>
                    <h4 style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#888", margin: "0 0 4px", fontWeight: 700 }}>3. Governing Law</h4>
                    <p style={{ fontSize: "13px", color: "#444", lineHeight: 1.6, margin: 0 }}>
                      This agreement shall be governed by the laws of <strong>{invoice_settings.governingLaw || "New South Wales, Australia"}</strong>.
                    </p>
                  </div>
                  
                  <div style={{ padding: "10px", background: "#f9f9f9", borderLeft: "3px solid #7c3aed", marginTop: "16px" }}>
                    <p style={{ fontSize: "12px", color: "#555", margin: 0, fontStyle: "italic" }}>
                      By electronically signing below, you agree to these terms and authorize commencement of work.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Signature Block */}
          {isAccepted && data?.invoice_settings?.signature_name && (
            <div className="px-8 sm:px-12 pb-8 flex justify-end">
              <div style={{ width: "260px" }}>
                <p style={{ fontSize: "12px", color: "#888", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>
                  E-Signed By
                </p>
                <div style={{
                  fontFamily: "'Alex Brush', cursive",
                  fontSize: "42px",
                  lineHeight: "1.2",
                  color: "#2c3e50",
                  borderBottom: "1px solid #d4c8a8",
                  paddingBottom: "4px",
                  marginBottom: "8px",
                  wordBreak: "break-word"
                }}>
                  {data.invoice_settings.signature_name}
                </div>
                <p style={{ fontSize: "11px", color: "#888" }}>
                  {formatDate(data.invoice_settings.accepted_at)}
                </p>
              </div>
            </div>
          )}

          {/* Footer bar */}
          <div style={{ borderTop: "1px solid #d4c8a8", padding: "16px 32px", textAlign: "center", background: "#f0e8d0" }}>
            <a href="https://chrono.knowwhatson.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <p style={{ fontSize: "11px", color: "#998a6a", letterSpacing: "2px", textTransform: "uppercase", margin: 0, fontWeight: 700 }}>
                GENERATED VIA CHRONO
              </p>
            </a>
          </div>

          {/* Perforated bottom edge */}
          <div style={{
            height: "8px",
            backgroundImage: "radial-gradient(circle at 8px 0px, #e8e4dc 4px, transparent 4px)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0",
          }} />
        </div>

        {/* Acknowledge & Accept Box (if not accepted yet) */}
        {!isAccepted && (
          <div className="print:hidden glass rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl border border-white/20 transition-all duration-300">
            <h3 className="text-xl font-bold text-foreground">
              {isSigning ? "Sign to Confirm" : "Ready to proceed?"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {isSigning 
                ? "Please type your full name to electronically sign and accept this document."
                : "By accepting, you agree to the items and terms listed above."}
            </p>
            
            {isSigning && (
              <div className="max-w-xs mx-auto mt-4 mb-6">
                <input
                  type="text"
                  placeholder="Your Full Name"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full text-center px-4 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-background/50"
                  style={{
                    fontFamily: signatureName ? "'Alex Brush', cursive" : "inherit",
                    fontSize: signatureName ? "28px" : "16px",
                    lineHeight: signatureName ? "1.2" : "inherit",
                    color: "var(--foreground)"
                  }}
                  autoFocus
                />
              </div>
            )}

            <button 
              onClick={handleAccept}
              disabled={accepting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto px-8 py-3 rounded-xl font-bold transition flex items-center justify-center min-w-[240px] mx-auto shadow-sm mt-4"
            >
              {accepting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isSigning ? "Confirm Signature" : "Accept & Sign"
              )}
            </button>
            {isSigning && (
              <button 
                onClick={() => setIsSigning(false)}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground transition underline"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Accepted State Box */}
        {isAccepted && (
          <div className="print:hidden glass rounded-3xl p-6 text-center shadow-xl border border-emerald-500/30 bg-emerald-500/10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Quote Accepted</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Accepted on {formatDate(data.invoice_settings.accepted_at)}
            </p>

            {!isRequestingChange ? (
              <div className="flex flex-col items-center gap-4 mb-6">
                <button
                  onClick={() => setIsRequestingChange(true)}
                  className="text-sm text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  Request a change
                </button>
                <button
                  onClick={() => navigate(`/agreement/${listId}`)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2 mx-auto"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Proceed to Contract
                </button>
              </div>
            ) : (
              <div className="max-w-md mx-auto mt-4 p-4 bg-background/50 rounded-2xl border border-border text-left mb-6">
                <p className="text-sm font-semibold mb-2">What needs to be changed?</p>
                <textarea
                  value={changeRequestText}
                  onChange={(e) => setChangeRequestText(e.target.value)}
                  placeholder="Describe the changes you'd like..."
                  className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setIsRequestingChange(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestChange}
                    disabled={!changeRequestText.trim() || submittingChange}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center gap-2"
                  >
                    {submittingChange && <Loader2 className="w-4 h-4 animate-spin" />}
                    Submit Request
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comments Section (Hidden from Print) */}
        <div className="print:hidden glass rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl border border-white/20">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Comments</h3>
          </div>
          
          <div className="space-y-4">
            {rootComments.map(c => renderComment(c))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex-1 space-y-3">
              {replyTo && (
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2 border border-primary/20">
                  <span className="text-xs font-medium text-muted-foreground">
                    Replying to a comment...
                  </span>
                  <button onClick={() => setReplyTo(null)} className="text-xs text-primary hover:text-primary/80 font-bold">Cancel</button>
                </div>
              )}
              <input 
                type="text"
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                placeholder="Your Name (Required)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
              <input 
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Leave a comment or ask a question..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                required
              />
            </div>
            <button 
              onClick={handleAddComment}
              disabled={postingComment || !comment.trim() || !commentName.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50 flex items-center justify-center w-full"
            >
              {postingComment ? <Loader2 className="w-5 h-5 animate-spin" /> : "Post"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="print:hidden text-center pt-4 pb-8">
          <p className="text-xs text-muted-foreground font-medium">
            Created with <span className="text-red-500">&#9829;</span> by What's On!
          </p>
        </div>

      </div>
    </div>
  );
}