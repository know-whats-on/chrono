import React, { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useParams, useNavigate } from "react-router";
import { getPublicInvoice, postInvoiceComment, acceptInvoice, requestInvoiceChange } from "../lib/api";
import { SplashScreen } from "./splash-screen";
import { Download, MessageSquare, Loader2, CheckCircle2, FileText, Edit3, FileBadge, Mail } from "lucide-react";
import { toast } from "sonner";

export function AgreementPage() {
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
  const [signStep, setSignStep] = useState(0);
  const [clientDetails, setClientDetails] = useState({
    legalName: "",
    abn: "",
    contactPerson: "",
    address: "",
    email: ""
  });
  const [signatureName, setSignatureName] = useState("");
  
  // Change request state
  const [isRequestingChange, setIsRequestingChange] = useState(false);
  const [changeRequestText, setChangeRequestText] = useState("");
  const [submittingChange, setSubmittingChange] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("background");

  const agreementRef = useRef<HTMLDivElement>(null);

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
        setError(err.message || "Failed to load agreement.");
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
          <h1 className="text-xl font-bold">Unable to load agreement</h1>
          <p className="text-sm text-muted-foreground">{error || "Agreement not found or no longer available."}</p>
        </div>
      </div>
    );
  }

  const { title, owner_name, items = [], invoice_settings = {}, business_profile = {} } = data;
  
  const hourlyRate = invoice_settings.hourlyRate || 50;
  const taxRate = invoice_settings.taxRate || 0;
  const customItems = invoice_settings.customItems || [];
  
  // Calculate totals
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

  const isAccepted = data?.invoice_settings?.accepted;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const agreementNo = `AGR-${(data.id || "").slice(0, 8).toUpperCase()}`;

  const handlePrint = async () => {
    if (!agreementRef.current || downloading) return;
    setDownloading(true);
    const prevTab = activeTab;
    setActiveTab("all");
    
    // Give react time to render all tabs
    await new Promise(r => setTimeout(r, 150));
    
    try {
      const el = agreementRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#f4ecd8",
        logging: false,
      });

      const imgW = canvas.width;
      const imgH = canvas.height;

      const pdfW = 210;
      const pdfH = 297;
      const margin = 10;
      const contentW = pdfW - margin * 2;
      const contentH = (imgH / imgW) * contentW;

      if (contentH <= pdfH - margin * 2) {
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        pdf.addImage(imgData, "JPEG", margin, margin, contentW, contentH);
        pdf.save(`${agreementNo}-agreement.pdf`);
      } else {
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageContentH = pdfH - margin * 2;
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
        pdf.save(`${agreementNo}-agreement.pdf`);
      }
      toast.success("PDF downloaded!");
    } catch (err) {
      console.error("PDF generation error:", err);
      window.print();
    } finally {
      setActiveTab(prevTab);
      setDownloading(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !listId) return;
    setPostingComment(true);
    try {
      const res = await postInvoiceComment(listId, commentName, comment, replyTo || undefined, "Contract");
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
      await requestInvoiceChange(listId, commentName || signatureName || "Client", changeRequestText, "Contract");
      toast.success("Change request submitted!");
      
      setData((prev: any) => ({
        ...prev,
        invoice_settings: {
          ...(prev.invoice_settings || {}),
          accepted: false,
          signature_name: null,
          accepted_at: null,
          comments: [...(prev.invoice_settings?.comments || []), {
            text: `CHANGE REQUEST: ${changeRequestText}`,
            name: commentName || signatureName || "Client",
            date: new Date().toISOString()
          }]
        }
      }));
      
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
    if (!signatureName.trim()) {
      toast.error("Please enter your name to sign");
      return;
    }
    setAccepting(true);
    try {
      await acceptInvoice(listId, signatureName.trim(), clientDetails, "Contract");
      setData((prev: any) => ({
        ...prev,
        invoice_settings: {
          ...(prev.invoice_settings || {}),
          accepted: true,
          accepted_at: new Date().toISOString(),
          signature_name: signatureName.trim(),
          client_details: clientDetails
        }
      }));
      setIsSigning(false);
      setSignStep(0);
      toast.success("Agreement accepted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept agreement");
    } finally {
      setAccepting(false);
    }
  };

  const handleSignNext = () => {
    if (signStep === 1 && !clientDetails.legalName.trim()) { toast.error("Required field"); return; }
    if (signStep === 2 && !clientDetails.abn.trim()) { toast.error("Required field"); return; }
    if (signStep === 3 && !clientDetails.contactPerson.trim()) { toast.error("Required field"); return; }
    if (signStep === 4 && !clientDetails.address.trim()) { toast.error("Required field"); return; }
    if (signStep === 5 && !clientDetails.email.trim()) { toast.error("Required field"); return; }
    
    if (signStep === 5) {
      setSignatureName(clientDetails.contactPerson);
      setSignStep(6);
    } else {
      setSignStep(s => s + 1);
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
      <div key={c.id} className={`${depth > 0 ? "ml-6 mt-3 border-l-2 border-[#d2c2a0]/50 pl-4" : "mt-4 first:mt-0"}`}>
        <div className={`bg-white/40 rounded-2xl p-4 border shadow-sm ${c.isOwner ? 'border-[#cd9a5b]/50' : 'border-white/60'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm text-[#3c2f21]">
              {c.name || "Client"} {c.isOwner && <span className="text-[#cd9a5b] text-[10px] ml-1 bg-[#cd9a5b]/10 px-1.5 py-0.5 rounded-full">Owner</span>}
            </span>
            <span className="text-[10px] text-[#8b6f4e]">{new Date(c.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
          <p className="text-sm text-[#5a4836] whitespace-pre-wrap">{c.text}</p>
          <div className="mt-2 flex justify-end">
            <button 
              onClick={() => setReplyTo(c.id)}
              className="text-[11px] text-[#8b6f4e] hover:text-[#4a3b2c] font-medium transition"
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
    <div className="h-[100dvh] overflow-y-auto p-4 sm:p-8 print:h-auto print:overflow-visible print:p-0 print:bg-transparent block" style={{ backgroundColor: "#2b1d14" }}>
      <div className="max-w-[780px] mx-auto space-y-6 pb-8 print:max-w-none print:pb-0 print:m-0 print:space-y-0">
        
        {/* Actions Bar (hidden when printing) */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-900/40 border border-amber-800/50 flex items-center justify-center text-amber-200">
              <FileBadge className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-300/70 uppercase tracking-wider">Service Agreement</p>
              <h1 className="text-lg font-bold text-amber-50 leading-tight">{title}</h1>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => navigate(`/invoice/${listId}`)}
              className="w-full sm:w-auto px-4 py-2.5 bg-amber-900/50 hover:bg-amber-800/60 text-amber-100 border border-amber-800/60 rounded-xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" /> Back to Invoice
            </button>
            <div className="flex items-center gap-3">
              <button 
                onClick={handlePrint}
                disabled={downloading}
                className="w-10 h-10 bg-amber-600 hover:bg-amber-500 text-amber-50 rounded-xl shadow-sm transition flex items-center justify-center disabled:opacity-50"
                title="Download Agreement PDF"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
              <a 
                href={`mailto:?subject=Service Agreement: ${title}&body=You can view the agreement here: ${window.location.href}`}
                className="w-10 h-10 bg-amber-600 hover:bg-amber-500 text-amber-50 rounded-xl shadow-sm transition flex items-center justify-center"
                title="Email Agreement"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* ═══ THE PAPER ═══ */}
        <div className="relative mt-8 print:mt-0">
          
          {/* Top Browser-style Tabs */}
          <div className="w-full px-2 sm:px-8 print:hidden relative z-0 -mb-1 overflow-x-auto no-scrollbar pt-2">
            <div className="flex gap-1 min-w-max">
              {[
                { id: 'background', label: 'Background', mobileLabel: 'Background' },
                { id: 'scope', label: 'Scope of Work', mobileLabel: 'Scope' },
                { id: 'terms', label: 'Terms & Conditions', mobileLabel: 'Terms' },
                { id: 'signatures', label: 'Signatures', mobileLabel: 'Sign' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)} 
                  className={`
                    px-3 sm:px-6 py-3 rounded-t-xl text-[11px] sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap border-b-0 flex-shrink-0
                    ${activeTab === tab.id || activeTab === 'all' 
                      ? 'bg-[#f4ecd8] text-[#2c2c2c] z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]' 
                      : 'bg-[#d2c2a0] text-[#5a4836] z-10 opacity-70 hover:opacity-100 hover:bg-[#dfd0b2]'
                    }
                  `}
                  style={{ 
                    boxShadow: (activeTab === tab.id || activeTab === 'all') ? '0 -4px 10px rgba(0,0,0,0.15)' : 'none',
                    fontFamily: "sans-serif"
                  }}
                >
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start">
            {/* Paper */}
            <div 
              ref={agreementRef}
              className="flex-1 relative overflow-hidden print:overflow-visible print:shadow-none print:border-none print:m-0 z-10"
              style={{
                background: "#f4ecd8",
                borderRadius: "4px",
                borderTopLeftRadius: "0px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                fontFamily: "'Times New Roman', Times, serif",
                color: "#1a1a1a",
                minHeight: "800px"
              }}
            >
              <div className="px-10 sm:px-16 py-16 sm:py-20 space-y-12">
                
                {/* Document Header (Always visible or part of background) */}
                <div className={`text-center space-y-4 border-b-2 border-black/20 pb-8 ${(activeTab === 'all' || activeTab === 'background') ? 'block' : 'hidden print:block'}`}>
                  <h1 className="text-3xl sm:text-4xl font-bold uppercase tracking-widest text-[#2c2c2c]">Service Agreement</h1>
                  <p className="text-lg text-black/60 italic">between</p>
                  <div className="grid grid-cols-2 gap-8 text-left mt-6">
                    <div>
                      <p className="font-bold text-lg">{business_profile.legal_name || owner_name}</p>
                      <p className="text-sm opacity-80 whitespace-pre-line">{business_profile.address}</p>
                      <p className="text-sm opacity-80 mt-2">{business_profile.tax_id ? `${business_profile.tax_id_label || 'Tax ID'}: ${business_profile.tax_id}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">
                        {isAccepted && invoice_settings.client_details?.legalName 
                          ? invoice_settings.client_details.legalName 
                          : "Client Legal Name"}
                      </p>
                      <p className="text-sm opacity-80 whitespace-pre-line mt-1">
                        {isAccepted && invoice_settings.client_details?.address 
                          ? invoice_settings.client_details.address 
                          : "Client Address"}
                      </p>
                      {isAccepted && invoice_settings.client_details?.abn && (
                        <p className="text-sm opacity-80 mt-1">ABN/Tax ID: {invoice_settings.client_details.abn}</p>
                      )}
                      {isAccepted && invoice_settings.client_details?.contactPerson && (
                        <p className="text-sm opacity-80 mt-1">Attn: {invoice_settings.client_details.contactPerson}</p>
                      )}
                      {isAccepted && invoice_settings.client_details?.email && (
                        <p className="text-sm opacity-80 mt-1">{invoice_settings.client_details.email}</p>
                      )}
                      <p className="text-sm opacity-80 mt-4">Date: {dateStr}</p>
                      <p className="text-sm opacity-80">Ref: {agreementNo}</p>
                    </div>
                  </div>
                </div>

                {/* Background info */}
                <div className={`text-justify text-[15px] leading-relaxed space-y-4 ${(activeTab === 'all' || activeTab === 'background') ? 'block' : 'hidden print:block'}`}>
                  <h2 className="text-2xl font-bold border-b border-black/10 pb-2 mb-4">Background</h2>
                  <p>This Master Service Agreement (the "Agreement") is made and entered into as of <strong>{dateStr}</strong> (the "Effective Date"), by and between <strong>{business_profile.legal_name || owner_name}</strong>, with its principal place of business as indicated above (hereinafter referred to as the "Service Provider"), and the receiving party (hereinafter referred to as the "Client").</p>
                  <p><strong>WHEREAS</strong>, the Service Provider possesses specialized expertise, resources, and technical capabilities in the relevant domain;</p>
                  <p><strong>WHEREAS</strong>, the Client desires to engage the Service Provider to perform certain professional services as specified herein;</p>
                  <p><strong>NOW, THEREFORE</strong>, in consideration of the mutual covenants, promises, and agreements set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree to be bound by the terms and conditions outlined in this document.</p>
                </div>

                {/* Section: Scope */}
                <div id="scope" className={`space-y-6 pt-4 scroll-mt-8 ${(activeTab === 'all' || activeTab === 'scope') ? 'block' : 'hidden print:block'}`}>
                  <h2 className="text-2xl font-bold border-b border-black/10 pb-2">1. Scope of Work</h2>
                  <p className="text-[15px] leading-relaxed">The following tasks and milestones constitute the agreed upon deliverables for this project ("{title}"):</p>
                  
                  <div className="pl-4 space-y-3">
                    {items.filter((i: any) => i.is_milestone).map((m: any, idx: number) => (
                      <div key={m.id} className="mt-4">
                        <h3 className="font-bold text-lg">{idx + 1}. {m.text}</h3>
                        <ul className="list-disc pl-8 mt-2 space-y-1">
                          {items.filter((i: any) => !i.is_milestone && i.milestone_id === m.id).map((task: any) => (
                            <li key={task.id} className="text-[15px]">{task.text}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {items.filter((i: any) => !i.is_milestone && !i.milestone_id).length > 0 && (
                      <div className="mt-4">
                        <h3 className="font-bold text-lg">General Tasks</h3>
                        <ul className="list-disc pl-8 mt-2 space-y-1">
                          {items.filter((i: any) => !i.is_milestone && !i.milestone_id).map((task: any) => (
                            <li key={task.id} className="text-[15px]">{task.text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 pt-6 border-t border-black/10 text-justify">
                    <h3 className="font-bold text-lg mb-2">1.1 Scope Alterations & Extraneous Work</h3>
                    <p className="text-[15px] leading-relaxed opacity-90">
                      The deliverables expressly enumerated above constitute the exhaustive Scope of Work. Any and all requests by the Client to modify, expand, or otherwise alter this prescribed Scope ("Out-of-Scope Work") shall be subject to immediate and independent evaluation. The Company unequivocally reserves the absolute right to refuse any such modifications at its sole and unfettered discretion. Furthermore, any accepted alterations or extensions to the Scope shall invariably incur supplementary billable fees at the Company's standard or expedited rates. Should the Client dispute or necessitate amendments to the Scope as presented, it is strictly incumbent upon the Client to formally submit a Change Request prior to the execution of this Agreement. Execution of this Agreement without prior written objection constitutes irrevocable consent to the Scope exactly as defined herein.
                    </p>
                  </div>
                </div>

                {/* Section: Terms */}
                <div id="terms" className={`space-y-6 pt-4 scroll-mt-8 ${(activeTab === 'all' || activeTab === 'terms') ? 'block' : 'hidden print:block'}`}>
                  <h2 className="text-2xl font-bold border-b border-black/10 pb-2">2. Terms & Conditions</h2>
                  
                  <div className="space-y-6 text-[15px] leading-relaxed text-justify">
                    <div>
                      <h3 className="font-bold">2.1 Structure of the Agreement & Precedence</h3>
                      <p className="mt-1">This Agreement consists of these Core Terms and any specific Solution Requirements or Deliverables attached to the Project Pack or Scope of Work. In the event of any conflict, discrepancy, or inconsistency between these Core Terms and any attached documentation, these Core Terms shall strictly prevail and govern.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.2 Client Information & Representations</h3>
                      <p className="mt-1">The Client confirms, warrants, and represents that all entity information provided—including Legal Name, Registration Numbers (e.g., ABN), Contact Persons, Addresses, and Emails—is entirely true, accurate, and not misleading. The Client acknowledges that the Service Provider relies strictly on this information to execute this binding Agreement.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.3 Performance Standards & Client Cooperation</h3>
                      <p className="mt-1">The Service Provider covenants to perform the agreed-upon services with due care, skill, and diligence, strictly consistent with relevant industry standards. The Client concurrently covenants to provide all necessary materials, accurate data, and reasonable directions required for the Service Provider to execute the work without undue delay.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.4 Compensation, Fees & Payment Terms</h3>
                      <p className="mt-1">The total compensation for the services outlined in this Agreement is <strong>${total.toFixed(2)}</strong>. The Client agrees to remit payment for the fees outlined in the linked invoice and scope. Payments must be executed via electronic funds transfer in Australian dollars (or the explicitly designated currency) within the timeframe specified: <strong>{invoice_settings.paymentTerms || "within 14 days of invoice receipt unless otherwise stated."}</strong> If the Client identifies a genuine, verifiable error in an invoice, they may withhold only the disputed portion, provided the remainder is remitted on time. Late payments may incur a compounding interest fee of 1.5% per month or the maximum rate permitted by law. In the event of non-payment, the Service Provider reserves the unilateral right to immediately pause, suspend, or abandon the project without liability.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.5 Intellectual Property, New Materials & Client Data</h3>
                      <p className="mt-1">Ownership of all "New Materials" created during the execution of this project is exclusively retained by the Service Provider. The Service Provider grants the Client a non-exclusive, non-transferable, revocable licence to utilize these materials solely in connection with the provided solution. Intellectual property in any materials developed independently or prior to this Agreement strictly remains with the original owner. The Client retains ownership of all data provided to the Service Provider; however, the Service Provider is hereby granted a perpetual, royalty-free licence to utilize this data strictly for the purpose of executing this Agreement.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.6 Confidentiality & Privacy Compliance</h3>
                      <p className="mt-1">Both parties must hold in the strictest confidence any information designated as confidential or that is inherently private. "Confidential Information" encompasses trade secrets, business strategies, financial records, and proprietary algorithms. Furthermore, the Service Provider shall manage all Personal Information in strict accordance with the Privacy Laws of the Commonwealth of Australia and the applicable governing jurisdiction.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.7 Limitation of Liability & Indemnification</h3>
                      <p className="mt-1">To the maximum extent permitted by applicable law, neither party shall be liable for an amount greater than two (2) times the total agreement value. This strict liability cap shall not apply in instances of personal injury, property damage, or gross breaches of third-party intellectual property. In no event shall either party be liable for indirect, special, incidental, punitive, or consequential damages. The Client agrees to indemnify and hold the Service Provider harmless against any claims arising from materials supplied by the Client.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.8 Term, Suspension & Termination</h3>
                      <p className="mt-1">Either party may terminate this agreement for cause if the other party commits a significant, material breach that is not remedied within fourteen (14) days of formal written notice. The Client may enact an early termination of the agreement by providing thirty (30) days' written notice; however, the Client remains absolutely and unconditionally liable for all payments due and expenses incurred up to the exact date of termination.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.9 Independent Contractor Status & Force Majeure</h3>
                      <p className="mt-1">The Service Provider is retained exclusively as an independent contractor. Neither party shall be held in breach of this Agreement if prevented from performing their respective obligations due to circumstances beyond their reasonable control, including but not limited to acts of God, pandemics, government decrees, or civil unrest.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.10 Governing Law & Dispute Resolution</h3>
                      <p className="mt-1">This Agreement shall be governed by, construed, and enforced strictly in accordance with the substantive laws of <strong>{invoice_settings.governingLaw || "the applicable governing jurisdiction"}</strong>, and both parties irrevocably submit to the exclusive jurisdiction of the courts of said region. Any controversies or disputes shall be resolved initially through good faith mediation before pursuing formal binding arbitration or litigation.</p>
                    </div>
                    <div>
                      <h3 className="font-bold">2.11 Entire Agreement & Severability</h3>
                      <p className="mt-1">This instrument embodies the complete and exclusive agreement between the parties concerning the subject matter hereof, superseding any prior oral or written agreements. If any provision is held invalid, it shall be severed, and the remaining provisions shall continue in full force and effect. Any modifications must be executed in writing and explicitly signed by authorized representatives of both parties.</p>
                    </div>
                    {invoice_settings.notes && (
                      <div>
                        <h3 className="font-bold">2.12 Additional Stipulations</h3>
                        <p className="mt-1 whitespace-pre-line">{invoice_settings.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Signature */}
                <div id="signatures" className={`pt-12 scroll-mt-8 ${(activeTab === 'all' || activeTab === 'signatures') ? 'block' : 'hidden print:block'}`}>
                  <h2 className="text-2xl font-bold border-b border-black/10 pb-2 mb-8">3. Signatures</h2>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="border-b border-black/30 pb-2 text-xl font-bold italic h-10 flex items-end" style={{ fontFamily: "cursive" }}>
                        {business_profile.owner_legal_name || owner_name}
                      </div>
                      <div>
                        <p className="font-bold text-sm uppercase tracking-wide">{business_profile.legal_name || owner_name}</p>
                        <p className="text-sm opacity-80 mt-1">Date: {dateStr}</p>
                      </div>
                    </div>
                    <div className="space-y-8">
                      <div className="border-b border-black/30 pb-2 text-xl font-bold italic h-10 flex items-end" style={{ fontFamily: "cursive" }}>
                        {isAccepted ? invoice_settings.signature_name : ""}
                      </div>
                      <div>
                        <p className="font-bold text-sm uppercase tracking-wide">
                          {isAccepted && invoice_settings.client_details?.legalName 
                            ? invoice_settings.client_details.legalName 
                            : "Client"}
                        </p>
                        <p className="text-sm opacity-80 mt-1">
                          Date: {isAccepted ? new Date(invoice_settings.accepted_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Pending"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Action Panel / Feedback */}
        <div className="print:hidden space-y-6 mt-8">
          
          {/* Accepted State Box */}
          {isAccepted && (
            <div className="bg-[#5a6449] rounded-[32px] p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-[#727d5e] max-w-2xl mx-auto">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#727d5e]/50 text-[#b4c399] mb-4 shadow-inner">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#f4ecd8]">Agreement Accepted</h3>
              <p className="text-sm text-[#d4caad] mt-1 mb-6">
                Accepted on {new Date(data.invoice_settings.accepted_at).toLocaleDateString()}
              </p>

              {!isRequestingChange ? (
                <button
                  onClick={() => setIsRequestingChange(true)}
                  className="text-sm font-medium text-[#b4c399] hover:text-[#d4caad] transition-colors inline-flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Request a change
                </button>
              ) : (
                <div className="max-w-md mx-auto mt-4 p-5 bg-black/20 rounded-2xl border border-white/10 text-left">
                  <p className="text-sm font-semibold mb-3 text-[#f4ecd8]">What needs to be changed?</p>
                  <textarea
                    value={changeRequestText}
                    onChange={(e) => setChangeRequestText(e.target.value)}
                    placeholder="Describe the changes you'd like..."
                    className="w-full h-24 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-[#f4ecd8] placeholder:text-[#d4caad]/50 outline-none focus:ring-2 focus:ring-[#b4c399]/50 resize-none mb-4"
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setIsRequestingChange(false)}
                      className="px-5 py-2.5 rounded-xl text-sm font-medium text-[#d4caad] hover:bg-white/5 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRequestChange}
                      disabled={!changeRequestText.trim() || submittingChange}
                      className="px-5 py-2.5 bg-[#4a533c] hover:bg-[#3a412f] disabled:opacity-50 text-[#f4ecd8] rounded-xl text-sm font-bold shadow-sm transition flex items-center gap-2"
                    >
                      {submittingChange ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                      Submit Request
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isAccepted && (
            <div className="bg-[#e8dfc8] rounded-3xl p-6 sm:p-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-[#d2c2a0] max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-[#4a3b2c] mb-3 font-serif">Review & Sign</h2>
              <p className="text-[15px] text-[#5a4836] mb-8 max-w-md mx-auto">
                Please provide your entity details to securely sign the Terms & Conditions and Scope of Work.
              </p>

              <button 
                onClick={() => setSignStep(1)}
                className="bg-[#cd9a5b] hover:bg-[#b8864d] text-white w-full sm:w-auto px-10 py-4 rounded-xl font-bold transition flex items-center justify-center min-w-[240px] mx-auto shadow-md text-lg"
              >
                Accept & Sign
              </button>
            </div>
          )}

          {/* Feedback & Comments */}
          <div className="bg-[#e8dfc8] rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-[#d2c2a0] max-w-2xl mx-auto">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-6 text-[#4a3b2c]">
              <MessageSquare className="w-5 h-5 text-[#8b6f4e]" />
              Feedback & Comments
            </h3>

            <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pr-2">
              {rootComments.length === 0 ? (
                <p className="text-sm text-[#8b6f4e] italic text-center py-4">No feedback yet. Feel free to leave a comment.</p>
              ) : (
                rootComments.map(c => renderComment(c))
              )}
            </div>

            <div className="space-y-3 pt-4 border-t border-[#d2c2a0]">
              {replyTo && (
                <div className="flex items-center justify-between bg-white/60 rounded-xl px-4 py-2 border border-[#cd9a5b]/40">
                  <span className="text-xs font-medium text-[#8b6f4e]">
                    Replying to a comment...
                  </span>
                  <button onClick={() => setReplyTo(null)} className="text-xs text-[#4a3b2c] hover:text-black font-bold">Cancel</button>
                </div>
              )}
              <input
                type="text"
                placeholder="Your Name (optional)"
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                className="w-full bg-white/60 border border-[#d2c2a0] rounded-xl px-4 py-2.5 text-sm text-[#3c2f21] placeholder:text-[#8b6f4e]/70 outline-none focus:ring-2 focus:ring-[#8b6f4e]/50"
              />
              <textarea
                placeholder="Type your feedback here..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full h-24 bg-white/60 border border-[#d2c2a0] rounded-xl px-4 py-3 text-sm text-[#3c2f21] placeholder:text-[#8b6f4e]/70 outline-none focus:ring-2 focus:ring-[#8b6f4e]/50 resize-none"
              />
              <button
                onClick={handleAddComment}
                disabled={!comment.trim() || postingComment}
                className="w-full py-2.5 bg-[#cd9a5b] hover:bg-[#b8864d] disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm"
              >
                {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Post Feedback
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-step Signing Modal (Spotlight Effect) */}
      {signStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-500">
          <div className="bg-[#f4ecd8] p-8 sm:p-10 rounded-3xl shadow-2xl max-w-md w-full mx-4 transform scale-105 transition-all relative">
            <button 
              onClick={() => setSignStep(0)}
              className="absolute top-4 right-4 text-black/40 hover:text-black/70 transition"
            >
              <FileText className="w-5 h-5 opacity-0" /> {/* Just for spacing or close icon if we had one. Let's add text "Cancel" */}
              <span className="text-sm font-bold tracking-widest uppercase">Cancel</span>
            </button>
            
            <div className="mb-8 mt-4">
              <p className="text-[#8b6f4e] font-bold text-xs uppercase tracking-widest mb-1">Step {Math.min(signStep, 5)} of 5</p>
              <h2 className="text-2xl font-bold text-[#2c2c2c] font-serif">
                {signStep === 1 && "What is your Legal/Entity Name?"}
                {signStep === 2 && "What is your ABN / Tax ID?"}
                {signStep === 3 && "Who is the Contact Person?"}
                {signStep === 4 && "What is your Business Address?"}
                {signStep === 5 && "What is your Contact Email?"}
                {signStep === 6 && "Review & Sign"}
              </h2>
            </div>

            <div className="space-y-6">
              {signStep === 1 && (
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Acme Corp Pty Ltd"
                  value={clientDetails.legalName}
                  onChange={(e) => setClientDetails({...clientDetails, legalName: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignNext()}
                  className="w-full bg-white/60 border-b-2 border-[#8b6f4e] px-4 py-3 text-lg text-center outline-none focus:bg-white/80 transition rounded-t-xl text-[#2c2c2c]"
                />
              )}
              {signStep === 2 && (
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. 12 345 678 901"
                  value={clientDetails.abn}
                  onChange={(e) => setClientDetails({...clientDetails, abn: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignNext()}
                  className="w-full bg-white/60 border-b-2 border-[#8b6f4e] px-4 py-3 text-lg text-center outline-none focus:bg-white/80 transition rounded-t-xl text-[#2c2c2c]"
                />
              )}
              {signStep === 3 && (
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Jane Doe"
                  value={clientDetails.contactPerson}
                  onChange={(e) => setClientDetails({...clientDetails, contactPerson: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignNext()}
                  className="w-full bg-white/60 border-b-2 border-[#8b6f4e] px-4 py-3 text-lg text-center outline-none focus:bg-white/80 transition rounded-t-xl text-[#2c2c2c]"
                />
              )}
              {signStep === 4 && (
                <textarea
                  autoFocus
                  placeholder="e.g. 123 Business Rd, Sydney NSW 2000"
                  value={clientDetails.address}
                  onChange={(e) => setClientDetails({...clientDetails, address: e.target.value})}
                  className="w-full h-24 bg-white/60 border-b-2 border-[#8b6f4e] px-4 py-3 text-lg text-center outline-none focus:bg-white/80 transition rounded-t-xl resize-none text-[#2c2c2c]"
                />
              )}
              {signStep === 5 && (
                <input
                  type="email"
                  autoFocus
                  placeholder="e.g. jane@acme.com"
                  value={clientDetails.email}
                  onChange={(e) => setClientDetails({...clientDetails, email: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignNext()}
                  className="w-full bg-white/60 border-b-2 border-[#8b6f4e] px-4 py-3 text-lg text-center outline-none focus:bg-white/80 transition rounded-t-xl text-[#2c2c2c]"
                />
              )}

              {signStep === 6 && (
                <div className="space-y-6 text-center">
                  <p className="text-sm text-[#5a4836]">
                    By typing your name below, you officially sign and agree to the Terms & Conditions and Scope of Work on behalf of <strong>{clientDetails.legalName}</strong>.
                  </p>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Type your full name to sign"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    className="w-full bg-white/40 border-b-2 border-[#8b6f4e] px-4 py-4 text-center outline-none focus:bg-white/60 transition rounded-t-xl text-[#2c2c2c]"
                    style={{
                      fontFamily: signatureName ? "cursive" : "inherit",
                      fontSize: signatureName ? "28px" : "16px",
                      lineHeight: signatureName ? "1.2" : "inherit"
                    }}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                {signStep > 1 && signStep < 6 && (
                  <button 
                    onClick={() => setSignStep(s => s - 1)}
                    className="px-6 py-3 rounded-xl font-bold text-[#8b6f4e] hover:bg-black/5 transition"
                  >
                    Back
                  </button>
                )}
                
                {signStep < 6 ? (
                  <button 
                    onClick={handleSignNext}
                    className="flex-1 bg-[#2c2c2c] hover:bg-black text-white py-3 rounded-xl font-bold transition shadow-md"
                  >
                    Next
                  </button>
                ) : (
                  <button 
                    onClick={handleAccept}
                    disabled={accepting}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-3 rounded-xl font-bold transition shadow-md flex items-center justify-center gap-2"
                  >
                    {accepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Confirm & Sign Agreement
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}