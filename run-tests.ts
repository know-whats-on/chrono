import { generateSuggestions } from "./src/app/components/query-suggestions.tsx";

const mockCtx = {
  lists: [
    { id: "l1", title: "Groceries" },
    { id: "l2", title: "Project Alpha" },
    { id: "l3", title: "Reading List" },
    { id: "l4", title: "Test List" }
  ],
  contacts: [
    { id: "c1", name: "Alice Smith" },
    { id: "c2", name: "Bob Jones" },
    { id: "c3", name: "Charlie" }
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
    console.error(`   Got:`, results.map((r: any) => r.text));
    return false;
  }
}

// 5 /Find Tests
runTest("Find 1 - Start lowercase", "/f", s => s.some(x => x.text.includes("/Find ... in /Groceries")) || "Missing find base");
runTest("Find 2 - Partial command", "/fi", s => s.some(x => x.text.includes("/Find ... in /Groceries")) || "Missing find base");
runTest("Find 3 - Full command", "/find", s => s.some(x => x.text.includes("/Find ... in /Groceries")) || "Missing find base");
runTest("Find 4 - With query", "/find apples", s => s.some(x => x.text === "/Find apples in Lists") || "Missing 'in Lists'");
runTest("Find 5 - Exact match", "/find apples in Groceries", s => s.some(x => x.text === "/Find apples in Groceries") || "Missing exact find");

// 5 /Inside Tests
runTest("Inside 1 - Start lowercase", "/i", s => s.some(x => x.text === "/Inside /Groceries") || "Missing inside base");
runTest("Inside 2 - Full command", "/inside", s => s.some(x => x.text === "/Inside /Groceries") || "Missing inside base");
runTest("Inside 3 - Partial list match", "/i Groc", s => s.some(x => x.text === "/Inside /Groceries") || "Missing partial list match");
runTest("Inside 4 - Exact list match", "/inside Groceries", s => s.some(x => x.text === "/Inside /Groceries") || "Missing exact list match");
runTest("Inside 5 - Contact match", "/i Alice", s => s.some(x => x.text === "/Inside /Alice Smith") || "Missing contact match");

// 5 /Remove Tests
runTest("Remove 1 - Start lowercase", "/r", s => s.some(x => x.text === "/Remove ... /Groceries") || "Missing remove base");
runTest("Remove 2 - Full command", "/remove", s => s.some(x => x.text === "/Remove ... /Groceries") || "Missing remove base");
runTest("Remove 3 - With item", "/remove milk", s => s.some(x => x.text === "/Remove milk /Groceries") || "Missing remove with item");
runTest("Remove 4 - With list", "/remove milk /Groceries", s => s.some(x => x.text === "/Remove milk /Groceries") || "Missing exact remove");
runTest("Remove 5 - With partial list", "/remove milk Groc", s => s.some(x => x.text === "/Remove milk Groc") || "Missing remove fallback");

// 5 /Contact Tests
runTest("Contact 1 - Start", "/c", s => s.some(x => x.text === "/Contact ") || "Missing contact base");
runTest("Contact 2 - Partial command", "/co", s => s.some(x => x.text === "/Inside /Alice Smith") || "Missing contact base");
runTest("Contact 3 - Full command", "/contact", s => s.some(x => x.text === "/Inside /Alice Smith") || "Missing contact base");
runTest("Contact 4 - New contact", "/contact David", s => s.some(x => x.text === "Add contact: David") || "Missing new contact suggestion");
runTest("Contact 5 - Existing match", "/contact Alice", s => s.some(x => x.text === "/Inside /Alice Smith") || "Missing existing contact match");

// 5 /Add Tests
runTest("Add 1 - Start", "/a", s => s.some(x => x.text === "/Add ... /Groceries") || "Missing add base");
runTest("Add 2 - Full command", "/add", s => s.some(x => x.text === "/Add ... /Groceries") || "Missing add base");
runTest("Add 3 - With item", "/add milk", s => s.some(x => x.text === "/Add milk /Groceries") || "Missing add with list");
runTest("Add 4 - Exact item", "/add milk /Groceries", s => s.some(x => x.text === "/Add milk /Groceries") || "Missing exact add");
runTest("Add 5 - With contact", "/add milk /Alice", s => s.some(x => x.text === "/Add milk /Alice") || "Missing exact add");

// 5 New Everyday Tests
runTest("Everyday 1", "When do I get free today?", s => s.some(x => x.text === "When do I get free today?") || "Missing exact match");
runTest("Everyday 2", "when do i get free today", s => s.some(x => x.text === "When do I get free today?") || "Missing exact match lowercase");
runTest("Everyday 3", "When is my next meeting?", s => s.some(x => x.text === "When is my next meeting?") || "Missing exact match");
runTest("Everyday 4", "when is my next meeting", s => s.some(x => x.text === "When is my next meeting?") || "Missing exact match lowercase");
runTest("Everyday 5", "When do I finish today?", s => s.some(x => x.text === "When do I finish today?") || "Missing exact match");

// 5 List Names Typed As-Is
runTest("List As-Is 1", "Groceries", s => s[0].text === "/Inside /Groceries" || "List match should be first");
runTest("List As-Is 2", "groceries", s => s[0].text === "/Inside /Groceries" || "List match should be first");
runTest("List As-Is 3", "Project Alpha", s => s[0].text === "/Inside /Project Alpha" || "List match should be first");
runTest("List As-Is 4", "Project Al", s => s[0].text === "/Inside /Project Alpha" || "List match should be first");
runTest("List As-Is 5", "Reading", s => s[0].text === "/Inside /Reading List" || "List match should be first");

console.log("\nDone!");
