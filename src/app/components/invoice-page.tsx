import React, { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useParams } from "react-router";
import { getPublicInvoice, postInvoiceComment, acceptInvoice } from "../lib/api";
import { SplashScreen } from "./splash-screen";
import { Download, MessageSquare, Loader2, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";

export function InvoicePage() {
  const { listId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  
  const [commentName, setCommentName] = useState("");
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<{text: string, name?: string, date: string}[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [accepting, setAccepting] = useState(false);
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

  if (loading) return <SplashScreen />;

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

  const { title, owner_name, items = [], invoice_settings = {} } = data;
  
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
    subtotal += item.amount;
  }
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const status = invoice_settings.status || "unpaid";
  const isAccepted = data?.invoice_settings?.accepted;
  const docType = isAccepted ? "INVOICE" : "QUOTE";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

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

      const imgData = canvas.toDataURL("image/png");
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
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        pdf.addImage(imgData, "PNG", margin, margin, contentW, contentH);
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

          // Create a sub-canvas for this page slice
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = imgW;
          pageCanvas.height = srcH;
          const ctx = pageCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);

          pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, contentW, destH);
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
      const res = await postInvoiceComment(listId, commentName, comment);
      setComments([...comments, res.comment]);
      setComment("");
      toast.success("Comment posted successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const handleAccept = async () => {
    if (!listId) return;
    setAccepting(true);
    try {
      await acceptInvoice(listId);
      setData((prev: any) => ({
        ...prev,
        invoice_settings: {
          ...(prev.invoice_settings || {}),
          accepted: true,
          accepted_at: new Date().toISOString()
        }
      }));
      toast.success("Quote accepted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept quote");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto p-4 sm:p-8" style={{ background: "#e8e4dc" }}>
      <div className="max-w-[680px] mx-auto space-y-6 pb-8">
        
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
              className="w-full sm:w-auto px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>

        {/* ═══ THE INVOICE PAPER ═══ */}
        <div 
          ref={invoiceRef}
          className="relative overflow-hidden print:shadow-none print:border-none print:m-0"
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
                <p style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                  {owner_name}
                </p>
                <p style={{ fontSize: "14px", color: "#888", marginTop: "6px" }}>
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
          <div className="print:hidden glass rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl border border-white/20">
            <h3 className="text-xl font-bold text-foreground">Ready to proceed?</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              By accepting, you agree to the items and terms listed above.
            </p>
            <button 
              onClick={handleAccept}
              disabled={accepting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto px-8 py-3 rounded-xl font-bold transition flex items-center justify-center min-w-[240px] mx-auto shadow-sm"
            >
              {accepting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accept & Acknowledge"}
            </button>
          </div>
        )}

        {/* Accepted State Box */}
        {isAccepted && (
          <div className="print:hidden glass rounded-3xl p-6 text-center shadow-xl border border-emerald-500/30 bg-emerald-500/10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Quote Accepted</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Accepted on {new Date(data.invoice_settings.accepted_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Comments Section (Hidden from Print) */}
        <div className="print:hidden glass rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl border border-white/20">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Comments</h3>
          </div>
          
          <div className="space-y-4">
            {comments.map((c, i) => (
              <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-sm">
                <p className="text-xs font-bold text-foreground mb-1">{c.name || "Anonymous"}</p>
                <p className="text-sm text-foreground/80">{c.text}</p>
                <p className="text-xs text-muted-foreground mt-2">{new Date(c.date).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex-1 space-y-3">
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