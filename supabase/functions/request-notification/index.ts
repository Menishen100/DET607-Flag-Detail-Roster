import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "https://det607flagdetail.com", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fullDate = (date: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const militaryTime = (value: string) => value.slice(0, 5).replace(":", "");

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "POST required" }, 405);
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return reply({ error: "Sign in required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return reply({ error: "Invalid session" }, 401);
    const { requestId, action } = await request.json();
    if (!requestId || !["CREATED", "RESOLVED"].includes(action)) return reply({ error: "Invalid request notification" }, 400);

    const admin = createClient(url, service);
    const { data: requestRow, error } = await admin.from("shift_requests").select("id,request_type,requester_id,accepted_by,status,reason,source_assignment_id,profiles!shift_requests_requester_id_fkey(full_name,cadet_type),assignments!shift_requests_source_assignment_id_fkey(detail_id,position,details(detail_date,detail_type,report_time,ceremony_time))").eq("id", requestId).single();
    if (error || !requestRow) return reply({ error: "Request not found" }, 404);
    const requester = requestRow.profiles as unknown as { full_name: string; cadet_type: string };
    const assignment = requestRow.assignments as unknown as { detail_id: string; position: string; details: { detail_date: string; detail_type: string; report_time: string; ceremony_time: string } };
    const detail = assignment.details;
    const callerIsAdmin = await admin.from("profiles").select("admin_level").eq("id", user.id).single();
    const staff = ["ADMIN", "SUPER_ADMIN"].includes(callerIsAdmin.data?.admin_level || "");
    const requestKind = requestRow.request_type === "SWAP" ? "shift swap" : "coverage request";
    let recipientIds: string[] = [];
    let subject = "";
    let html = "";

    if (action === "CREATED") {
      if (requestRow.requester_id !== user.id) return reply({ error: "Only the requester may announce this request" }, 403);
      const { data: candidates } = await admin.from("profiles").select("id").eq("active", true).eq("cadet_type", requester.cadet_type).neq("id", user.id);
      const { data: sameDay } = await admin.from("assignments").select("cadet_id,details!inner(detail_date)").is("removed_at", null).eq("details.detail_date", detail.detail_date);
      const blocked = new Set((sameDay || []).map((row: { cadet_id: string }) => row.cadet_id));
      recipientIds = (candidates || []).map(row => row.id).filter(id => !blocked.has(id));
      subject = `DET 607 ${requestKind} available — ${fullDate(detail.detail_date)}`;
      html = `<h2>${requestKind === "shift swap" ? "Shift swap" : "Coverage"} available</h2><p><strong>${requester.full_name}</strong> has posted a ${requestKind} for <strong>${detail.detail_type === "REVEILLE" ? "Reveille" : "Retreat"}</strong> on <strong>${fullDate(detail.detail_date)}</strong>.</p><p>Report: <strong>${militaryTime(detail.report_time)}</strong>. Ceremony: <strong>${militaryTime(detail.ceremony_time)}</strong>.</p><p><strong>Reason:</strong> ${requestRow.reason}</p><p>Sign in to DET 607 Flag Detail Management to review and respond.</p>`;
    } else {
      if (!staff && requestRow.accepted_by !== user.id) return reply({ error: "Only the accepting cadet or an administrator may announce the result" }, 403);
      recipientIds = [requestRow.requester_id, requestRow.accepted_by].filter(Boolean) as string[];
      subject = `DET 607 ${requestKind} confirmed — ${fullDate(detail.detail_date)}`;
      html = `<h2>${requestKind === "shift swap" ? "Shift swap" : "Coverage"} confirmed</h2><p>The ${requestKind} for <strong>${detail.detail_type === "REVEILLE" ? "Reveille" : "Retreat"}</strong> on <strong>${fullDate(detail.detail_date)}</strong> has been confirmed.</p><p>Report: <strong>${militaryTime(detail.report_time)}</strong>. Ceremony: <strong>${militaryTime(detail.ceremony_time)}</strong>.</p><p>Sign in to review your updated schedule.</p>`;
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return reply({ error: "Email provider is not configured" }, 500);
    const { data: recipients } = await admin.from("profiles").select("id,email").in("id", recipientIds);
    await Promise.all((recipients || []).filter(item => item.email).map(async recipient => {
      const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "DET 607 Flag Detail <noreply@mail.det607flagdetail.com>", to: [recipient.email], subject, html }) });
      if (!sent.ok) console.error("Request email failed", await sent.text());
      await admin.from("notification_outbox").insert({ recipient_id: recipient.id, event_type: `REQUEST_${action}`, entity_type: "SHIFT_REQUEST", entity_id: requestRow.id, scheduled_for: new Date().toISOString(), delivered_at: new Date().toISOString() });
    }));
    return reply({ ok: true, recipients: recipients?.length || 0 });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected request notification error" }, 500);
  }
});
