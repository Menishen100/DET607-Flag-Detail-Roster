import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://det607flagdetail.com",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers });

  const token = request.headers.get("Authorization");
  if (!token) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers });

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers });

  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sender } = await adminClient.from("profiles").select("active,cadet_type,admin_level").eq("id", user.id).single();
  if (!sender?.active || !(sender.cadet_type === "POC" || ["ADMIN", "SUPER_ADMIN"].includes(sender.admin_level))) {
    return new Response(JSON.stringify({ error: "Staff access required" }), { status: 403, headers });
  }

  const { recipientId, subject, html, eventType, entityType, entityId } = await request.json();
  if (!recipientId || !subject || !html || !eventType || !entityType || !entityId) {
    return new Response(JSON.stringify({ error: "Missing notification fields" }), { status: 400, headers });
  }

  const { data: recipient } = await adminClient.from("profiles").select("email,active").eq("id", recipientId).single();
  if (!recipient?.active || !recipient.email) return new Response(JSON.stringify({ error: "Recipient unavailable" }), { status: 404, headers });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "DET 607 Flag Detail <noreply@mail.det607flagdetail.com>", to: [recipient.email], subject, html }),
  });
  if (!response.ok) return new Response(JSON.stringify({ error: "Email provider rejected the request" }), { status: 502, headers });

  await adminClient.from("notification_outbox").insert({ recipient_id: recipientId, event_type: eventType, entity_type: entityType, entity_id: entityId, delivered_at: new Date().toISOString() });
  return new Response(JSON.stringify({ ok: true }), { headers });
});
