# Chrono Module: Unified Project Lifecycle (To-Do > Agreement > Invoice)

## 1. Professional Identity (User Settings)
The "Source of Truth" for all financial and legal documents. All documents are dynamically rendered as **"Billed by: [User Name]"**.

### **Business Owner Profile Schema**
| Field | Requirement | Validation/Notes |
| :--- | :--- | :--- |
| **Legal Entity Name** | Mandatory | Name of Company or Sole Trader Legal Name |
| **ABN** | Mandatory | 11-digit Australian Business Number |
| **BSB** | Mandatory | 6-digit Bank State Branch code |
| **Account No.** | Mandatory | Bank Account Number |
| **Business Address** | Mandatory | Registered physical or postal address |
| **Business Phone** | Mandatory | Primary contact number |
| **Business Website** | Optional | Professional URL |

---

## 2. Optimized Project Flow
This sequence bridges the gap between task management and legal execution, ensuring the scope is locked before payment is requested.

**Phase 1: Scope Definition**
* **Create To-Do List:** Map out milestones, specific tasks, and associated pricing within the Chrono interface.

**Phase 2: Agreement Generation**
* **Generate Agreement:** Convert the To-Do list into a legal document.
* **Data Mapping:** Tasks become "The Works," prices become "Fees," and due dates become "Delivery Milestones."
* **Payment Logic:** Issuer decides payment structure (Upfront, Milestone-based, or Completion).

**Phase 3: Unified Client Review**
* **Share Unified Link:** Client receives one portal containing the Agreement and a pending Invoice.
* **Client Data Entry:** Client enters their own details (Individual vs. Business, ABN/ACN, Address) which auto-fills the document.
* **Sign to Unlock:** Once the Client signs the Agreement, the Invoice is officially "Issued" and becomes payable.

---

## 3. Lifecycle & Amendment Protocol (The "Reverse")
A specialized mechanism to handle changes without losing professional friction.

1. **Client Feedback:** Client adds comments or requests a change via the web-view.
2. **Signature Reversal:** Any existing digital signature is **automatically voided**. The document returns to `DRAFT` and is unlocked for the Issuer.
3. **Issuer Authority:**
   * **Only the Original Issuer** can "Accept" a change or reply to comments.
   * **Amendment:** Issuer modifies the original To-Do list or pricing.
4. **Re-issue:** Issuer clicks "Re-issue." Client is notified of "Version 2."
5. **Execution:** Client signs the updated Agreement → Invoice is updated and becomes active for payment.

---

## 4. Implementation Directives (Supabase/Vercel)
* **Identity Injection:** All 7 Business Profile fields must map to the "Service Provider" block of every PDF/Web-view.
* **Data Integrity:** The Invoice must be a "slave" to the Agreement; if a price changes in the Agreement during amendment, the Invoice total must update automatically.
* **Security:** Signatures are version-locked. Any edit to the underlying To-Do list or Agreement text kills the current signature hash.
* **UI Constraint:** The "Accept Change" and "Edit" actions are strictly gated to the `owner_id`.