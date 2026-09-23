import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://det607flagdetail.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  const token = request.headers.get("Authorization");
  if (!token) return new Response(JSON.stringify({ error: "Sign-in is required" }), { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
  const service = Object.values(secretKeys).find(value => typeof value === "string") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: token } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers });
  const { data: caller, error: callerError } = await userClient.rpc("get_my_profile").maybeSingle();
  if (callerError) return new Response(JSON.stringify({ error: `Administrator lookup failed: ${callerError.message}` }), { status: 500, headers });
  if (!caller?.active || !["ADMIN", "SUPER_ADMIN"].includes(caller.admin_level)) return new Response(JSON.stringify({ error: "Administrator access is required" }), { status: 403, headers });

  const { cadetId } = await request.json();
  if (!cadetId) return new Response(JSON.stringify({ error: "Cadet record is required" }), { status: 400, headers });
  const admin = createClient(url, service);
  const { error: authError } = await admin.auth.admin.deleteUser(cadetId);
  if (authError) return new Response(JSON.stringify({ error: authError.message }), { status: 400, headers });
  const { error: profileError } = await userClient.rpc("admin_delete_pending_invite", { target_id: cadetId });
  if (profileError) return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers });
  return new Response(JSON.stringify({ ok: true }), { headers });
});
