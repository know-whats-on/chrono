import { projectId, publicAnonKey } from "../../../utils/supabase/info";

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-09a7e7d0`;

const getHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
});

export const get = async (key: string): Promise<any> => {
  const res = await fetch(`${BASE_URL}/kv/${encodeURIComponent(key)}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    console.error(`[kv.get] Failed for key "${key}": ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.value;
};

export const set = async (key: string, value: any): Promise<void> => {
  const res = await fetch(`${BASE_URL}/kv`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[kv.set] Failed for key "${key}": ${res.status} ${err}`);
    throw new Error(`Failed to set KV: ${res.status}`);
  }
};

export const del = async (key: string): Promise<void> => {
  const res = await fetch(`${BASE_URL}/kv/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    console.error(`[kv.del] Failed for key "${key}": ${res.status}`);
    throw new Error(`Failed to delete KV: ${res.status}`);
  }
};

export const getByPrefix = async (prefix: string): Promise<any[]> => {
  const res = await fetch(`${BASE_URL}/kv/prefix/${encodeURIComponent(prefix)}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    console.error(`[kv.getByPrefix] Failed for prefix "${prefix}": ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.values ?? [];
};