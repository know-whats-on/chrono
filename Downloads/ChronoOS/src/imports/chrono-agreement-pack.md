# Chrono Module: The Professional "Pack" (Agreements & Invoices)

## 1. The Agreement Wizard: System Prompt
"Act as an Expert Legal Drafter for the Australian market. Your goal is to generate a modular Service Agreement based on an existing Invoice/To-Do structure.

**Step 1: Sectional Generation**
Divide the Agreement into distinct 'Clipboard Sections':
* **Section 1: The Parties:** Fetch 'Billed By' from User Settings and 'Client Details' from the Invoice.
* **Section 2: The Works:** Fetch Tasks and Milestones from the linked To-Do list.
* **Section 3: Commercials:** Fetch Pricing, GST, and Payment Schedule from the Invoice.
* **Section 4: Legal Terms:** Standard Australian Clauses (IP Ownership, Liability, Jurisdiction).

**Step 2: Injection Logic**
* DO NOT generate prose for the User's business details; pull directly from the 'Professional Identity' settings.
* Identify variables for Client Input: Name, ABN/ACN, Address. These remain blank until the Client accesses the link.

**Step 3: Signature Anchor**
* Append a legally binding signature block at the final section. The signature is valid only for the current 'Document Hash'."

---

## 2. Aesthetic UI: The "Leather Clipboard" View
The Agreement interface departs from the clean-tech look of the Invoice to provide a "Classic Professional" tactile feel.

* **Canvas:** Sepia-toned digital paper.
* **Typography:** Formal Serif (Times New Roman) or Clean Sans (Arial).
* **Navigation:** The "Edge of Paper" features interactive tabs (Section 1, 2, 3, etc.) for quick jumping.
* **Logic:** Clicking a tab "slides" the clipboard pages.
* **Integration:** * **Invoice View:** Contains a primary button: `[ View Agreement ]`.
    * **Agreement View:** Contains a primary button: `[ View Invoice ]`.

---

## 3. The Unified Pack Flow (Lifecycle)
All documents are bundled into a single "Public Link" for the client.

1. **Setup:** User defines Business Details in Settings (ABN, BSB, etc.).
2. **Generation:** User generates an Invoice -> User triggers "Create Agreement" (Wizard).
3. **Dispatch:** A "Public Pack" link is sent to the Client.
4. **Client Action:** * **Option A (Feedback):** Client leaves a comment on the Clipboard/Invoice.
    * **Option B (Execution):** Client enters their ABN/Details and signs.
5. **Conflict Resolution:** * If Feedback is left, the Signature is voided.
    * Issuer (User) receives notification to **Accept/Reject** feedback.
    * Once Accepted, the Invoice/Agreement updates, and the Client is notified to re-review.
6. **Finalization:** Upon signature, the "Pack" is locked. Both parties can download as PDF.

---

## 4. Storage & Export (Agreements and Invoices)
* **Central Hub:** The "My Invoices" tab is renamed to **"Agreements and Invoices"**.
* **Audit Trail:** Every action (Generated, Shared, Feedback Left, Re-issued, Signed) is logged in a chronological 'Activity Feed' per Pack.
* **PDF Logic:**
    * The **Download** button triggers a server-side PDF generation (via Puppeteer/Edge Functions).
    * **Constraint:** Must trigger a direct file download (`Content-Disposition: attachment`), NOT a browser print command (`window.print()`).

---

## 5. Implementation Directives (Supabase)
* **Table Rename:** Alter table `invoices` to `billing_packs` (or maintain a 1:1 join between `invoices` and `agreements`).
* **Relational Key:** Both documents must share a `pack_id` and `version_id`.
* **Security:** Public links are read-only until the Client authenticates via the unique link token. Client details entered during signing must persist to the `client_profiles` table for future use."