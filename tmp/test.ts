import { projectId, publicAnonKey } from "./utils/supabase/info.tsx";

async function test() {
  console.log("ProjectId:", projectId);
  
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-d1909ddd/health`, {
    headers: { Authorization: `Bearer ${publicAnonKey}` }
  });
  console.log("Health status:", res.status);
  console.log("Health body:", await res.text());
  
  const openRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-d1909ddd/open-events`, {
    headers: { Authorization: `Bearer ${publicAnonKey}` }
  });
  console.log("Open events status:", openRes.status);
  console.log("Open events body:", (await openRes.text()).slice(0, 100));
}

test();