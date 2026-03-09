# Chrono Module: Agreements, Invoices & Business Identity

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

## 2. Agreement Flow & Logic
This feature converts "Client Project" To-Do lists into legally binding Australian Service Agreements instantly.

### **The System Prompt (Logic & Mapping)**
"Act as a Legal Operations Assistant for an Australian freelance platform. Map data from a 'Client Project' To-Do list into a structured Agreement Template.

**1. Data Extraction:**
* **Scope:** Group all 'Incomplete' tasks into 'Milestones'.
* **Commercials:** Fetch pricing per milestone and determine payment logic (Upfront, in parts, at milestones, or before milestones).
* **Deadlines:** Map 'Due Dates' from the To-Do list to 'Delivery Dates' in the contract.

**2. Template Injection:**
* Inject data into Australian-compliant templates (Service Agreement/IP Transfer).
* **Variables:** Calculate GST based on the total fetched from the Invoice module.

**3. Inclusive Client Entry:**
* Provide a secure link for the recipient to enter their details. 
* The UI must toggle based on entity type:
    * **Individual:** Name, Email, Phone, Address.
    * **Business:** Business Name, Authorized Rep Name, ABN/ACN, GST/TFN, Address."

---

## 3. Lifecycle & Amendment Protocol
A specialized "Reverse Signature" mechanism ensures the original issuer maintains total control over the contract versioning and legal validity.

### **State Management Flow**
1. **Initiation:** Issuer converts To-Do list to Agreement → Status: `AWAITING_SIGNATURE`.
2. **Client Feedback:** Client adds comments or requests a change via the web-view → Status: `PENDING_AMENDMENT`.
3. **The "Reverse":** Upon a change request, any existing Digital Signature is **automatically voided**. The document is unlocked for the Issuer to edit.
4. **Amendment Power:**
   * **Issuer Only:** Only the Original Issuer can "Accept" a change or reply to comments.
   * **Re-issue:** Issuer amends tasks/pricing and clicks "Re-issue".
5. **Execution:** Client reviews the new version and signs → Status: `EXECUTED` (Generates Final PDF with all Business Details from Settings).

---

## 4. Implementation Directives (Supabase/Vercel)
* **Identity Injection:** All 7 fields from the Business Profile must be automatically mapped to the "Service Provider" block of every PDF/Web-view.
* **Security:** The signature must be cryptographically tied to the document version ID; if the version ID changes (via amendment), the signature hash becomes invalid.
* **Communication:** The comment thread on the invoice page is a restricted zone—Clients can post, but only the **Original Issuer** can resolve or accept changes.