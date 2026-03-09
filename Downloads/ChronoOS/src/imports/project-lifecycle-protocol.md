# Chrono Module: Unified Project Lifecycle (Post-To-Do Execution)

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

## 2. Post-To-Do Transition Logic (The System Prompt)
"Act as a Project-to-Legal Transformer. The user has already created a 'Client Project' To-Do list. Your task is to transition this existing data into a formal Agreement and Invoice.

**Step 1: Data Pull**
* **Identify Source:** Locate the active `todo_list_id`.
* **Scope Extraction:** Pull all task titles and descriptions. Map them as 'The Works' (Schedule 1) in the Australian Service Agreement template.
* **Costing:** Aggregate all task-level pricing to calculate the Subtotal, GST (10%), and Total.

**Step 2: Agreement Wrapping**
* **Template Injection:** Insert the extracted tasks and the User's 'Professional Identity' into the legal prose.
* **Payment Terms:** Apply the User's preferred logic (e.g., '50% Upfront, 50% on Completion').

**Step 3: Client Hand-off**
* **Unified Portal:** Generate a single URL for the Client.
* **Action Requirement:** The Client cannot pay the Invoice until they provide their entity details (Name, ABN, Address) and digitally sign the Agreement."

---

## 3. Lifecycle & Amendment Protocol (The "Reverse")
This mechanism handles revisions to the existing To-Do list after the Agreement has been shared.

1. **Client Feedback:** Client requests a change (e.g., "Change scope of Task 3").
2. **Signature Reversal:** The system detects the edit request, voids any 'Draft' signatures, and unlocks the original To-Do list for the Issuer.
3. **Issuer Amendment:** The Issuer updates the existing To-Do list.
4. **Auto-Sync:** Changes made to the To-Do list automatically propagate to the Agreement and the pending Invoice.
5. **Re-issue:** Issuer clicks 'Re-issue'. Client is notified to review 'Version 2'.
6. **Execution:** Client signs → Agreement is locked → Invoice becomes payable.

---

## 4. Implementation Directives (Supabase/Vercel)
* **Relational Mapping:** Ensure the `agreements` and `invoices` tables share a `project_id` with the `todos` table to maintain a single source of truth.
* **State Management:** Use a `version_number` column. Any update to a task in the To-Do list increments the version and invalidates the current `signature_hash`.
* **UI Constraint:** On the Invoice/Agreement page, the "Accept Change" and "Edit To-Do" actions are strictly visible only to the `owner_id`.