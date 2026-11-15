import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";
import { checkRateLimitPersistent, rateLimitResponse } from "../_shared/rate-limiter.ts";
import {
  buildCommissionHtml,
  type CommissionBrandingPdf,
  type CommissionItemPdf,
  type CommissionPeriodPdf,
} from "./commission-html.ts";

const US_PROJECT_REF = "ykducvvcjzdpoojxlsig";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function imageToDataUri(rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${US_PROJECT_REF}.supabase.co` ||
    !url.pathname.startsWith("/storage/v1/object/public/")
  ) return null;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    redirect: "error",
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) return null;
  const bytes = await readBodyLimited(response, MAX_IMAGE_BYTES);
  if (!bytes?.length) return null;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function readBodyLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let runtimeHost = "";
  try { runtimeHost = new URL(supabaseUrl).hostname; } catch { /* handled below */ }
  if (runtimeHost !== `${US_PROJECT_REF}.supabase.co`) {
    return json(503, { error: "This function is restricted to the US test project" });
  }
  if (!anonKey || !serviceRoleKey) return json(500, { error: "Supabase credentials not configured" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt || jwt === anonKey) return json(401, { error: "Authentication required" });

  try {
    const payload = await req.json() as { period_id?: unknown };
    const periodId = typeof payload.period_id === "string" ? payload.period_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(periodId)) {
      return json(400, { error: "A valid period_id is required" });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    const userId = userData.user?.id;
    if (userError || !userId) return json(401, { error: "Invalid session" });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: roleRows, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin.from("profiles").select("id, company_id").eq("id", userId).maybeSingle(),
    ]);
    if (rolesError || profileError) return json(500, { error: "Could not validate access" });
    const roles = new Set((roleRows ?? []).map((row: { role: string }) => row.role));
    const allowed = ["super_admin", "admin", "financiero", "supervisor", "auditor", "vendedor"]
      .some((role) => roles.has(role));
    if (!allowed) return json(403, { error: "Forbidden" });

    const limit = await checkRateLimitPersistent(`commission-pdf:${userId}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 10,
      persistent: true,
    });
    if (!limit.allowed) return rateLimitResponse(corsHeaders, limit.retryAfterMs);

    const { data: period, error: periodError } = await admin
      .from("commission_periods")
      .select("id, company_id, salesperson_id, liquidation_number, period_start, period_end, status, concept, total_amount, currency_code, salesperson_name")
      .eq("id", periodId)
      .maybeSingle();
    if (periodError) return json(500, { error: "Could not load commission period" });
    if (!period) return json(404, { error: "Commission period not found" });
    if (!["cerrada", "pagada"].includes(period.status)) {
      return json(409, { error: "Only closed or paid periods can be rendered" });
    }
    if (period.currency_code !== "PYG") {
      return json(409, { error: "Amount-in-words rendering currently supports PYG only" });
    }
    if (!roles.has("super_admin") && profile?.company_id !== period.company_id) {
      return json(403, { error: "Company access denied" });
    }
    if (roles.has("vendedor") && !["super_admin", "admin", "financiero", "supervisor", "auditor"].some((role) => roles.has(role)) && period.salesperson_id !== userId) {
      return json(403, { error: "Salesperson access denied" });
    }

    const [{ data: items, error: itemsError }, { data: company }, { data: settings }] = await Promise.all([
      admin.from("commission_items")
        .select("item_number, group_type, sale_type, sale_date, commission_amount, client_display_id, client_sequence, client_name, plan_name, percent, concept")
        .eq("period_id", periodId)
        .order("item_number", { ascending: true }),
      admin.from("companies").select("name, address, phone").eq("id", period.company_id).single(),
      admin.from("company_settings").select("pdf_header_image_url, pdf_footer_image_url").eq("company_id", period.company_id).maybeSingle(),
    ]);
    if (itemsError) return json(500, { error: "Could not load commission items" });
    if (!items?.length) return json(409, { error: "The period has no commission items" });

    const [headerDataUri, footerDataUri] = await Promise.all([
      imageToDataUri(settings?.pdf_header_image_url ?? null),
      imageToDataUri(settings?.pdf_footer_image_url ?? null),
    ]);
    const branding: CommissionBrandingPdf = {
      company_name: company?.name ?? "Empresa",
      company_address: company?.address ?? null,
      company_phone: company?.phone ?? null,
      header_data_uri: headerDataUri,
      footer_data_uri: footerDataUri,
    };
    const html = buildCommissionHtml(
      period as CommissionPeriodPdf,
      items as CommissionItemPdf[],
      branding,
    );

    const renderUrl = Deno.env.get("RENDER_URL") ?? "";
    const renderKey = Deno.env.get("RENDER_KEY") ?? "";
    if (!renderUrl || !renderKey) return json(500, { error: "PDF renderer not configured" });
    const renderResponse = await fetch(renderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RENDER-KEY": renderKey },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        html,
        options: {
          format: "A4",
          landscape: true,
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
          waitUntil: "networkidle0",
        },
      }),
    });
    if (!renderResponse.ok) return json(502, { error: "PDF renderer failed" });
    const pdf = await readBodyLimited(renderResponse, MAX_PDF_BYTES);
    if (!pdf) return json(502, { error: "Renderer response exceeded the PDF size limit" });
    const isPdf = pdf.length >= 5 && new TextDecoder().decode(pdf.slice(0, 5)) === "%PDF-";
    if (!isPdf) return json(502, { error: "Renderer returned an invalid PDF" });

    const pdfBody = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(pdfBody, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="liquidacion-${period.liquidation_number.replace(/[^a-z0-9_-]/gi, "-")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "Operation timed out"
      : "Internal server error";
    console.error("generate-commission-pdf failed", error instanceof Error ? error.name : "unknown");
    return json(message === "Operation timed out" ? 504 : 500, { error: message });
  }
});
