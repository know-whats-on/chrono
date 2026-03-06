import { generateSuggestions } from "./src/app/components/query-suggestions.tsx";

const mockCtx = {
  lists: [
    { id: "l1", title: "Groceries" },
    { id: "l2", title: "Project Alpha" },
    { id: "l3", title: "Reading List" }
  ],
  contacts: [
    { id: "c1", name: "Alice Smith" },
    { id: "c2", name: "Bob Jones" }
  ],
  reminders: []
};

function runTest(name: string, input: string, validate: (suggestions: any[]) => boolean | string) {
  const results = generateSuggestions(input, mockCtx);
  const isValid = validate(results);
  if (isValid === true) {
    console.log(`✅ PASS: ${name}`);
    return true;
  } else {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Input: "${input}"`);
    console.error(`   Reason: ${isValid}`);
    console.error(`   Got:`, results.map(r => r.text));
    return false;
  }
}

let failed = 0;

// /Find tests
runTest("Find - Exact match", "/Find apples in Groceries", (s) => s.some(x => x.text === "/Find apples in Groceries") || "Missing exact find");
runTest("Find - Partial find", "/f apples", (s) => s.some(x => x.text === "/Find apples in Lists") || "Missing find in lists");
runTest("Find - lowercase", "/find", (s) => s.some(x => x.text.includes("/Find ... in /Groceries")) || "Missing find base");
runTest("Find - random casing", "/FiNd car", (s) => s.some(x => x.text === "/Find car in Lists") || "Missing find with casing");
runTest("Find - f suffix", "/fi", (s) => s.some(x => x.text.includes("/Find ... in /Groceries")) || "Missing f prefix support");

// /Inside tests
runTest("Inside - Exact list", "/Inside /Groceries", (s) => s.some(x => x.text === "/Inside /Groceries") || "Missing inside groceries");
runTest("Inside - Partial list name", "/i Groc", (s) => s.some(x => x.text === "/Inside /Groceries") || "Missing partial match for Groceries");
runTest("Inside - Contact name", "/inside Alice", (s) => s.some(x => x.text === "/Inside /Alice Smith") || "Missing inside Alice Smith");
runTest("Inside - Just i", "/i", (s) => s.some(x => x.text === "/Inside /Groceries") || "Missing base i command");
runTest("Inside - Random case", "/InSiDe", (s) => s.some(x => x.text === "/Inside /Groceries") || "Missing case insensitivity");

// /Remove tests
runTest("Remove - Exact item", "/Remove milk /Groceries", (s) => s.some(x => x.text === "/Remove milk /Groceries") || "Missing exact remove");
runTest("Remove - Partial item", "/rem milk", (s) => s.some(x => x.text === "/Remove milk /Groceries") || "Missing partial remove");
runTest("Remove - No item", "/r", (s) => s.some(x => x.text === "/Remove ... /Groceries") || "Missing base remove");
runTest("Remove - lowercase", "/remove", (s) => s.some(x => x.text === "/Remove ... /Groceries") || "Missing remove base");
runTest("Remove - Random case", "/ReMoVe", (s) => s.some(x => x.text === "/Remove ... /Groceries") || "Missing remove case insensitivity");

// /Contact tests
runTest("Contact - Exact name", "/Contact Alice", (s) => s.some(x => x.text === "/Inside /Alice Smith") || "Missing inside Alice");
runTest("Contact - Partial name", "/co Ali", (s) => s.some(x => x.text === "/Inside /Alice Smith") || "Missing partial contact match");
runTest("Contact - No name", "/contact", (s) => s.some(x => x.text === "/Inside /Alice Smith") || "Missing contact base");
runTest("Contact - New contact", "/contact Charlie", (s) => s.some(x => x.text === "Add contact: Charlie") || "Missing new contact suggestion");
runTest("Contact - Random case", "/CoNtAcT", (s) => s.some(x => x.text === "/Inside /Alice Smith") || "Missing contact case insensitivity");

// /Add tests
runTest("Add - Exact item", "/Add milk /Groceries", (s) => s.some(x => x.text === "/Add milk /Groceries") || "Missing exact add");
runTest("Add - Partial item", "/a milk", (s) => s.some(x => x.text === "/Add milk /Groceries") || "Missing partial add");
runTest("Add - No item", "/add", (s) => s.some(x => x.text === "/Add ... /Groceries") || "Missing base add");
runTest("Add - lowercase", "/a", (s) => s.some(x => x.text === "/Add ... /Groceries") || "Missing a prefix");
runTest("Add - Random case", "/AdD", (s) => s.some(x => x.text === "/Add ... /Groceries") || "Missing add case insensitivity");

// Everyday questions and new queries
runTest("Free today", "When do I get free today?", (s) => s.some(x => x.text === "When am I free today?") || "Missing free today suggestion");
runTest("Next meeting", "When is my next meeting?", (s) => s.some(x => x.text === "When is my next event?") || "Missing next event suggestion");
runTest("Next meeting partial", "When is my next", (s) => s.some(x => x.text === "When is my next event?") || "Missing next event partial suggestion");

// List names typed as-is should be identified
runTest("List typed directly 1", "Groceries", (s) => s.some(x => x.text === "/Inside /Groceries") || "Missing list direct match");
runTest("List typed directly 2", "Project Alpha", (s) => s.some(x => x.text === "/Inside /Project Alpha") || "Missing list direct match");
runTest("List typed directly partial", "Project A", (s) => s.some(x => x.text === "/Inside /Project Alpha") || "Missing list direct match partial");

// Print results
console.log("\nDone!");
