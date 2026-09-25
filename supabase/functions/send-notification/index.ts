import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://det607flagdetail.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const token = request.headers.get("Authorization");
    if (!token) return json({ error: "Sign in required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const secretKeyMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, unknown>;
    const serviceKey = Object.values(secretKeyMap).find(value => typeof value === "string" && value.length > 0) as string
      || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      || "";
    if (!serviceKey) return json({ error: "Notification service configuration is incomplete" }, 500);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: token } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid session" }, 401);

    const { data: caller, error: callerError } = await userClient.rpc("get_my_profile").maybeSingle();
    if (callerError) return json({ error: `Roster lookup failed: ${callerError.message}` }, 500);
    const staff = caller?.cadet_type === "POC" || ["ADMIN", "SUPER_ADMIN"].includes(caller?.admin_level || "");

    const { recipientId, subject, html, eventType, entityType, entityId } = await request.json();
    if (!recipientId || !subject || !html || !eventType || !entityType || !entityId) return json({ error: "Missing notification fields" }, 400);
    const ownAssignmentConfirmation = recipientId === user.id && eventType === "ASSIGNMENT_CONFIRMATION";
    if (!caller?.active || (!staff && !ownAssignmentConfirmation)) return json({ error: "You do not have permission to send this notification" }, 403);

    const adminClient = createClient(url, serviceKey);
    const { data: recipient, error: recipientError } = await adminClient.from("profiles").select("email,active").eq("id", recipientId).single();
    if (recipientError) return json({ error: `Recipient lookup failed: ${recipientError.message}` }, 500);
    if (!recipient?.active || !recipient.email) return json({ error: "Recipient unavailable" }, 404);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "Email provider is not configured" }, 500);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ from: "DET 607 Flag Detail <noreply@mail.det607flagdetail.com>", to: [recipient.email], subject, html }),
    });
    if (!response.ok) {
      const providerError = (await response.text()).slice(0, 300);
      console.error("Email provider rejected request", providerError);
      return json({ error: `Email provider rejected the request: ${providerError}` }, 502);
    }

    const { error: outboxError } = await adminClient.from("notification_outbox").insert({ recipient_id: recipientId, event_type: eventType, entity_type: entityType, entity_id: entityId, delivered_at: new Date().toISOString() });
    if (outboxError) console.error("Notification email sent but outbox logging failed", outboxError.message);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected notification error";
    console.error("Notification failed", error);
    return json({ error: message }, 500);
  }
});
