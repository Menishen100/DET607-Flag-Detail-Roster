import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://det607flagdetail.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return respond({ error: "POST required" }, 405);

  try {
    const token = request.headers.get("Authorization");
    if (!token) return respond({ error: "Sign-in is required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
    const serviceKey = Object.values(secretKeys).find(value => typeof value === "string") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: token } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return respond({ error: "Invalid session" }, 401);

    const { data: caller, error: callerError } = await userClient.rpc("get_my_profile").maybeSingle();
    if (callerError) return respond({ error: `Administrator lookup failed: ${callerError.message}` }, 500);
    if (!caller?.active || caller.admin_level !== "SUPER_ADMIN") {
      return respond({ error: "Only the Super Admin can send an administrative password-reset link." }, 403);
    }

    const { cadetId } = await request.json();
    if (!cadetId || cadetId === user.id) return respond({ error: "Choose an active cadet account." }, 400);

    const admin = createClient(url, serviceKey);
    const { data: cadet, error: cadetError } = await admin
      .from("profiles")
      .select("id, full_name, email, active, onboarding_complete")
      .eq("id", cadetId)
      .maybeSingle();
    if (cadetError || !cadet) return respond({ error: "Cadet account was not found." }, 404);
    if (!cadet.active || !cadet.onboarding_complete || !cadet.email) {
      return respond({ error: "Only an active cadet who has completed onboarding can receive a password-reset link." }, 400);
    }

    const { data: recovery, error: recoveryError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: cadet.email,
      options: { redirectTo: "https://det607flagdetail.com/?recovery=1" },
    });
    if (recoveryError || !recovery.properties?.action_link) {
      return respond({ error: recoveryError?.message || "A password-reset link could not be created." }, 400);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return respond({ error: "The DET 607 notification sender is not configured." }, 500);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "DET 607 Flag Detail <noreply@mail.det607flagdetail.com>",
        to: [cadet.email],
        subject: "Reset your DET 607 Flag Detail password",
        html: `<h2>DET 607 Flag Detail Management</h2><p>Hello ${String(cadet.full_name || "Cadet")},</p><p>A DET 607 Super Admin requested a password-reset link for your roster account.</p><p><a href="${recovery.properties.action_link}">Set a new password</a></p><p>If you did not expect this message, contact your DET 607 Super Admin before using the link.</p>`,
      }),
    });
    if (!emailResponse.ok) {
      return respond({ error: `The DET 607 password-reset email could not be sent: ${(await emailResponse.text()).slice(0, 300)}` }, 502);
    }
    return respond({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected password-reset error";
    return respond({ error: message }, 500);
  }
});
