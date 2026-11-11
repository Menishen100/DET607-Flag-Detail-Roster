import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://det607flagdetail.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return respond({ error: "Sign-in is required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
  const serviceKey = Object.values(secrets).find(value => typeof value === "string") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return respond({ error: "Invalid session" }, 401);
  const { data: caller, error: callerError } = await userClient.rpc("get_my_profile").maybeSingle();
  if (callerError || caller?.admin_level !== "SUPER_ADMIN" || !caller.active) return respond({ error: "Super Admin access is required" }, 403);

  const { cadetId, email } = await request.json();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!cadetId || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) return respond({ error: "A valid cadet email address is required" }, 400);

  const admin = createClient(url, serviceKey);
  const { data: target, error: targetError } = await admin.from("profiles").select("id,email").eq("id", cadetId).maybeSingle();
  if (targetError || !target) return respond({ error: "Roster account not found" }, 404);
  if (target.email === normalizedEmail) return respond({ ok: true, email: normalizedEmail });
  const { data: duplicate } = await admin.from("profiles").select("id").eq("email", normalizedEmail).neq("id", cadetId).maybeSingle();
  if (duplicate) return respond({ error: "That email address is already assigned to another roster account" }, 409);

  const { error: authError } = await admin.auth.admin.updateUserById(cadetId, { email: normalizedEmail, email_confirm: true });
  if (authError) return respond({ error: `Sign-in email was not updated: ${authError.message}` }, 400);

  const { data: savedEmail, error: profileError } = await userClient.rpc("super_admin_update_cadet_email", { target_id: cadetId, new_email: normalizedEmail });
  if (profileError) {
    await admin.auth.admin.updateUserById(cadetId, { email: target.email, email_confirm: true });
    return respond({ error: `Email change was reversed because the roster record could not be updated: ${profileError.message}` }, 500);
  }
  return respond({ ok: true, email: savedEmail || normalizedEmail });
});
