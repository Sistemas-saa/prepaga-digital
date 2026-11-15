import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function urlToBase64DataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const ct = resp.headers.get("Content-Type") || "image/png";
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${ct};base64,${btoa(binary)}`;
  } catch (e) {
    console.warn("urlToBase64DataUrl failed:", url, e);
    return null;
  }
}

async function resolveStorageUrl(url: string | null, admin: any): Promise<string | null> {
  if (!url) return null;
  if (!url.includes(".supabase.co/storage/v1/")) return url;
  if (url.includes("/object/public/")) return url;
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
  if (!m) return url;
  const { data } = await admin.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 3600);
  return data?.signedUrl || url;
}

function stripKnownBrandingUrls(html: string, knownUrls: string[]): string {
  if (!html || !knownUrls.length) return html;
  let result = html;
  for (const url of knownUrls) {
    const esc = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`<p[^>]*>\\s*<img[^>]*src="${esc}"[^>]*\\s*/?>\\s*<\/p>`, "gi"), "");
    result = result.replace(new RegExp(`<img[^>]*src="${esc}"[^>]*\\s*/?>`, "gi"), "");
  }
  return result.trim();
}

async function resolveContentImages(
  html: string,
  admin: any,
  bucket: string,
  brandingUrls: string[]
): Promise<string> {
  if (!html) return html;
  html = stripKnownBrandingUrls(html, brandingUrls);
  const matches = html.match(/<img\s[^>]*>/gi);
  if (!matches) return html;
  let result = html;
  for (const imgTag of matches) {
    const srcM = imgTag.match(/src="([^"]+)"/);
    if (!srcM || srcM[1].startsWith("data:")) continue;
    const spM = imgTag.match(/data-storage-path="([^"]+)"/);
    if (spM) {
      const { data } = await admin.storage.from(bucket).createSignedUrl(spM[1], 3600);
      if (data?.signedUrl) {
        const b64 = await urlToBase64DataUrl(data.signedUrl);
        result = result.replace(imgTag, imgTag.replace(/src="[^"]*"/, `src="${b64 || data.signedUrl}"`));
      }
      continue;
    }
    if (srcM[1].includes(".supabase.co/storage/v1/")) {
      const m = srcM[1].match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
      if (m) {
        const { data } = await admin.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 3600);
        if (data?.signedUrl) {
          const b64 = await urlToBase64DataUrl(data.signedUrl);
          result = result.replace(imgTag, imgTag.replace(/src="[^"]*"/, `src="${b64 || data.signedUrl}"`));
        }
      }
    }
  }
  return result;
}

function buildHtml(
  bodyContent: string,
  headerDataUrl: string | null,
  footerDataUrl: string | null,
  logoDataUrl: string | null,
  companyName: string,
  address: string | null,
  phone: string | null,
): string {
  let headerCellContent: string;
  if (headerDataUrl) {
    headerCellContent = `<img src="${headerDataUrl}" style="display:block;width:100%;height:20mm;object-fit:fill;object-position:center;" />`;
  } else if (logoDataUrl) {
    headerCellContent = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 18mm;height:20mm;">
        <img src="${logoDataUrl}" style="height:16mm;width:auto;object-fit:contain;display:block;" />
        <span style="font-family:'Times New Roman',serif;font-size:11px;color:#1a3a5c;font-style:italic;">${companyName}</span>
      </div>`;
  } else {
    headerCellContent = `<div style="display:flex;align-items:center;justify-content:center;height:20mm;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#1a3a5c;">${companyName}</div>`;
  }

  let footerCellContent: string;
  if (footerDataUrl) {
    footerCellContent = `
      <div style="display:flex;align-items:center;justify-content:center;width:100%;height:9mm;padding:0 14mm;box-sizing:border-box;">
        <img src="${footerDataUrl}" style="display:block;max-height:8mm;width:100%;object-fit:contain;object-position:center center;" />
      </div>`;
  } else {
    const parts: string[] = [];
    if (address) parts.push(address);
    if (phone) parts.push(`Tel: ${phone}`);
    const text = parts.join("  •  ") || companyName;
    footerCellContent = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 18mm;height:9mm;font-family:Arial,sans-serif;font-size:8px;color:#555;">
        <span>${text}</span>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<style>
  @media print { @page { size: A4; margin: 0; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; background: #fff; line-height: 1.45; }
  table.print-shell { width: 100%; border-collapse: collapse; border-spacing: 0; table-layout: fixed; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  .header-cell { padding: 0; height: 20mm; vertical-align: middle; border-bottom: 1px solid #bbb; overflow: hidden; }
  .footer-cell { padding: 0; height: 9mm; vertical-align: middle; border-top: 1px solid #ccc; }
  .content-cell { padding: 5mm 18mm 8mm 18mm; vertical-align: top; width: 100%; }
  .content-cell p { text-align: justify; margin-bottom: 4pt; orphans: 3; widows: 3; }
  .content-cell p[style*="font-size:11px"],
  .content-cell p[style*="font-size: 11px"],
  .content-cell p[style*="font-weight:bold"],
  .content-cell p[style*="font-weight: bold"] { text-align: left !important; }
  .content-cell h1 { font-size: 13pt; text-align: center; text-transform: uppercase; margin-bottom: 8pt; }
  .content-cell h2 { font-size: 12pt; margin-top: 8pt; margin-bottom: 4pt; }
  .content-cell h3 { font-size: 11pt; margin-top: 6pt; margin-bottom: 3pt; }
  .content-cell table { width: 100%; border-collapse: collapse; margin: 5pt 0; font-size: 10pt; }
  .content-cell table td, .content-cell table th { border: 1px solid #777 !important; padding: 4px 7px; vertical-align: top; }
  .content-cell table th { background-color: #f0f0f0; font-weight: 600; text-align: left; }
  .content-cell thead { display: table-header-group; }
  .content-cell tfoot { display: table-footer-group; }
  .content-cell img { max-width: 100% !important; height: auto !important; }
  .content-cell img[alt="Firma digital"] { max-width: 260px !important; max-height: 110px !important; }
  .no-break { break-inside: avoid; page-break-inside: avoid; }
  .page-break { break-before: page; page-break-before: always; }
  [class*="firma"], [class*="sign"], [class*="signature"] { break-inside: avoid !important; page-break-inside: avoid !important; }
  .content-cell > div:last-child, .content-cell > section:last-child, .content-cell > table:last-child { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; }
</style>
</head>
<body>
<table class="print-shell">
  <thead><tr><th class="header-cell">${headerCellContent}</th></tr></thead>
  <tfoot><tr><td class="footer-cell">${footerCellContent}</td></tr></tfoot>
  <tbody><tr><td class="content-cell">${bodyContent}</td></tr></tbody>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let authenticatedUserId: string | null = null;

    if (authHeader !== `Bearer ${serviceKey}`) {
      const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await uc.auth.getUser();
      if (error || !data?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      authenticatedUserId = data.user.id;
    }

    const { document_id, admin_regeneration, reason } = await req.json();
    if (!document_id) return new Response(JSON.stringify({ error: "document_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: doc } = await admin.from("documents").select("id,sale_id,content,name").eq("id", document_id).single();
    if (!doc?.content) return new Response(JSON.stringify({ error: "Document not found or no content" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    let logoDataUrl: string | null = null;
    let headerDataUrl: string | null = null;
    let footerDataUrl: string | null = null;
    const brandingUrls: string[] = [];
    let companyName = "", phone: string | null = null, address: string | null = null;

    const { data: sale } = await admin.from("sales").select("company_id").eq("id", doc.sale_id).single();
    if (sale?.company_id) {
      const [compRes, csRes] = await Promise.all([
        admin.from("companies").select("name,logo_url,phone,address").eq("id", sale.company_id).single(),
        admin.from("company_settings").select("pdf_header_image_url,pdf_footer_image_url").eq("company_id", sale.company_id).single(),
      ]);
      if (compRes.data) {
        companyName = compRes.data.name || "";
        phone = compRes.data.phone || null;
        address = compRes.data.address || null;
        const logoUrl = await resolveStorageUrl(compRes.data.logo_url, admin);
        if (logoUrl) logoDataUrl = await urlToBase64DataUrl(logoUrl);
      }
      if (csRes.data) {
        const hOrig = (csRes.data as any).pdf_header_image_url as string | null;
        const fOrig = (csRes.data as any).pdf_footer_image_url as string | null;
        if (hOrig) brandingUrls.push(hOrig);
        if (fOrig) brandingUrls.push(fOrig);
        const hUrl = await resolveStorageUrl(hOrig, admin);
        const fUrl = await resolveStorageUrl(fOrig, admin);
        if (hUrl) { headerDataUrl = await urlToBase64DataUrl(hUrl); console.log("[header]", headerDataUrl ? `OK ${headerDataUrl.length}b` : "FAIL"); }
        if (fUrl) { footerDataUrl = await urlToBase64DataUrl(fUrl); console.log("[footer]", footerDataUrl ? `OK ${footerDataUrl.length}b` : "FAIL"); }
      }
    }

    const bucket = Deno.env.get("STORAGE_BUCKET") || "documents";
    const resolvedContent = await resolveContentImages(doc.content, admin, bucket, brandingUrls);
    const html = buildHtml(resolvedContent, headerDataUrl, footerDataUrl, logoDataUrl, companyName, address, phone);

    const renderUrl = Deno.env.get("RENDER_URL");
    const renderKey = Deno.env.get("RENDER_KEY");
    if (!renderUrl || !renderKey) return new Response(JSON.stringify({ error: "RENDER_URL/KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const rr = await fetch(renderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RENDER-KEY": renderKey },
      body: JSON.stringify({
        html,
        options: {
          format: "A4",
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        },
      }),
    });

    if (!rr.ok) return new Response(JSON.stringify({ error: "Render failed", details: await rr.text() }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const pdf = new Uint8Array(await rr.arrayBuffer());
    const hash = await sha256Hex(pdf);

    if (admin_regeneration) {
      const { data: lastVersion } = await admin
        .from("document_print_versions").select("version_number")
        .eq("document_id", document_id).order("version_number", { ascending: false }).limit(1).maybeSingle();
      const nextVersion = (lastVersion?.version_number || 0) + 1;
      const versionPath = `contracts/print-versions/${doc.sale_id}/${doc.id}/v${nextVersion}.pdf`;
      await admin.storage.from(bucket).upload(versionPath, pdf, { contentType: "application/pdf", upsert: true });
      await admin.from("document_print_versions").update({ is_current: false }).eq("document_id", document_id);
      await admin.from("document_print_versions").insert({
        document_id, sale_id: doc.sale_id, version_number: nextVersion,
        pdf_url: `${bucket}:${versionPath}`, pdf_hash: hash,
        reason: reason || null, generated_by: authenticatedUserId, is_current: true,
      });
      return new Response(JSON.stringify({
        success: true, mode: "versioned_print", document_id,
        version_number: nextVersion, pdf_url: `${bucket}:${versionPath}`,
        note: `Version v${nextVersion} generada.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const path = `contracts/base/${doc.sale_id}/${doc.id}.pdf`;
    await admin.storage.from(bucket).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    const url = `${bucket}:${path}`;
    await admin.from("documents").update({ base_pdf_url: url, base_pdf_hash: hash }).eq("id", document_id);
    return new Response(JSON.stringify({ success: true, document_id, mode: "base_pdf", base_pdf_url: url, base_pdf_hash: hash }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: unknown) {
    console.error("generate-base-pdf error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
