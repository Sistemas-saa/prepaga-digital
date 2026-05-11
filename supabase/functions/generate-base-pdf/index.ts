import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface BrandingInfo {
  companyName: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  headerImageUrl: string | null;
  footerImageUrl: string | null;
}

/**
 * Build the header/footer templates for Puppeteer's displayHeaderFooter feature.
 * These render natively on every PDF page — no CSS tricks needed.
 */
function buildPuppeteerTemplates(branding: BrandingInfo): { headerTemplate: string; footerTemplate: string } {
  // Puppeteer header/footer templates require EXPLICIT dimensions (height:100% resolves to 0
  // because the parent has no explicit height in Puppeteer's rendering context).
  // font-size must also be explicit (default is 0).
  const headerTemplate = branding.headerImageUrl
    ? `<div style="font-size:10px;width:100%;height:24mm;padding:0 15mm;margin:0;text-align:center;"><img src="${branding.headerImageUrl}" style="display:inline-block;max-width:100%;max-height:24mm;width:auto;height:auto;object-fit:contain;" /></div>`
    : `<div style="font-size:10px;width:100%;height:24mm;"></div>`;

  const footerTemplate = branding.footerImageUrl
    ? `<div style="font-size:10px;width:100%;height:18mm;padding:0 15mm;margin:0;text-align:center;"><img src="${branding.footerImageUrl}" style="display:inline-block;max-width:100%;max-height:18mm;width:auto;height:auto;object-fit:contain;" /></div>`
    : `<div style="font-size:10px;width:100%;height:18mm;"></div>`;

  return { headerTemplate, footerTemplate };
}

function buildWrappedHtml(
  bodyContent: string,
  _branding: BrandingInfo,
  _documentName: string
): string {
  // Header/footer are handled via Puppeteer's displayHeaderFooter + headerTemplate/footerTemplate.
  // This function only wraps the body content with styling.
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #222;
  }

  /* ── Main content ── */
  .content {
    width: 100%;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  /* Ensure images in content don't overflow */
  .content img,
  .content svg,
  .content canvas,
  .content iframe {
    max-width: 100% !important;
    height: auto !important;
  }

  .content img[style*="width"],
  .content img[width] {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Table styling for content tables */
  .content table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .content table td, .content table th {
    padding: 4px 6px;
    word-break: break-word;
  }

  .content > *,
  .content .ProseMirror,
  .content [style*="width"] {
    max-width: 100% !important;
  }
</style>
</head>
<body>
  <div class="content">
    ${bodyContent}
  </div>
</body>
</html>`;
}

/**
 * Strip embedded branding images (cabecera/zócalo) from template content
 * since the wrapper already adds proper header/footer via CSS fixed positioning.
 * This prevents duplicate headers/footers in the generated PDF.
 */
function normalizeLegacyContractHeader(html: string): string {
  if (!html) return html;

  // Remove leading branding images (cabecera) — the wrapper header already shows the logo
  html = html.replace(
    /^\s*(<p[^>]*>\s*)?<img\b[^>]*src="[^"]*\/company-assets\/[^"]*\/branding\/[^"]*"[^>]*\/?>\s*(<\/p>)?\s*/i,
    ''
  );

  // Remove trailing branding images (zócalo/footer) at the end of content
  html = html.replace(
    /\s*(<p[^>]*>\s*)?<img\b[^>]*src="[^"]*\/company-assets\/[^"]*\/branding\/[^"]*"[^>]*\/?>\s*(<\/p>)?\s*$/i,
    ''
  );

  return html;
}

/**
 * Resolve expired Supabase Storage signed URLs in HTML content.
 */
async function resolveContentImages(
  html: string,
  supabaseAdmin: any,
  bucket: string
): Promise<string> {
  if (!html) return html;
  html = normalizeLegacyContractHeader(html);

  const imgRegex = /<img\s[^>]*>/gi;
  const matches = html.match(imgRegex);
  if (!matches) return html;

  let result = html;

  for (const imgTag of matches) {
    const spMatch = imgTag.match(/data-storage-path="([^"]+)"/);
    if (spMatch) {
      const storagePath = spMatch[1];
      const { data } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) {
        const updatedTag = imgTag.replace(/src="[^"]*"/, `src="${data.signedUrl}"`);
        result = result.replace(imgTag, updatedTag);
      }
      continue;
    }

    const srcMatch = imgTag.match(/src="([^"]+)"/);
    if (!srcMatch) continue;
    const src = srcMatch[1];

    if (src.includes('.supabase.co/storage/v1/')) {
      const pathMatch = src.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
      if (pathMatch) {
        const srcBucket = pathMatch[1];
        const storagePath = decodeURIComponent(pathMatch[2]);
        const { data } = await supabaseAdmin.storage
          .from(srcBucket)
          .createSignedUrl(storagePath, 3600);
        if (data?.signedUrl) {
          const updatedTag = imgTag.replace(/src="[^"]*"/, `src="${data.signedUrl}"`);
          result = result.replace(imgTag, updatedTag);
        }
      }
    }
  }

  return normalizeLegacyContractHeader(result);
}

/**
 * Fetch an image URL and return a base64 data URI for reliable rendering.
 * Falls back to the original URL if fetching fails.
 */
async function imageUrlToDataUri(url: string): Promise<string> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return url;
    const contentType = resp.headers.get("content-type") || "image/png";
    const buffer = new Uint8Array(await resp.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch {
    return url;
  }
}

/**
 * Resolve a storage or public URL to a fresh signed URL.
 */
async function resolveStorageUrl(
  url: string | null,
  supabaseAdmin: any
): Promise<string | null> {
  if (!url) return null;

  if (url.includes('.supabase.co/storage/v1/')) {
    // If it's a public URL, return as-is (public bucket)
    if (url.includes('/object/public/')) return url;
    
    const pathMatch = url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
    if (pathMatch) {
      const bucket = pathMatch[1];
      const storagePath = decodeURIComponent(pathMatch[2]);
      const { data } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) return data.signedUrl;
    }
  }

  return url;
}

function isMissingPrintVersionsTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message || "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes('relation "document_print_versions" does not exist') ||
    message.includes("Could not find the table")
  );
}

function formatDatePy(dateValue: string | null | undefined): string {
  if (!dateValue) return "";
  const date = new Date(dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`);
  return date.toLocaleDateString("es-PY");
}

function formatDateLongPy(dateValue: string | null | undefined): string {
  if (!dateValue) return "";
  const date = new Date(dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`);
  return date.toLocaleDateString("es-PY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ensureContractStartDateInBilling(html: string, contractStartDate: string | null | undefined): string {
  if (!html) return html;
  const formattedDate = contractStartDate ? formatDateLongPy(contractStartDate) : "";

  // 1. Reemplazar placeholder literal {{fecha_inicio_contrato}} (con o sin espacios)
  let result = html.replace(/\{\{\s*fecha_inicio_contrato\s*\}\}/gi, formattedDate);

  // 2. Si el contenido NO menciona "Fecha de inicio de contrato" pero tiene "DATOS DE FACTURACIÓN",
  //    inyectarla después del título (solo si hay fecha disponible)
  if (formattedDate && !result.includes("Fecha de inicio de contrato") && result.includes("DATOS DE FACTURACIÓN")) {
    result = result.replace(
      "<h3>DATOS DE FACTURACIÓN</h3>",
      `<h3>DATOS DE FACTURACIÓN</h3><p>Fecha de inicio de contrato: <strong>${formattedDate}</strong></p>`
    );
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;
    let authenticatedUserId: string | null = null;
    if (!isServiceCall) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authenticatedUserId = data.user.id;
    }

    const { document_id, admin_regeneration, reason } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch document
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("id, sale_id, content, name")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!doc.content) {
      return new Response(JSON.stringify({ error: "Document has no HTML content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch company info via sale
    let branding: BrandingInfo = {
      companyName: "",
      logoUrl: null,
      phone: null,
      address: null,
      email: null,
      headerImageUrl: null,
      footerImageUrl: null,
    };

    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("company_id, contract_start_date")
      .eq("id", doc.sale_id)
      .single();

    if (sale?.company_id) {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("name, logo_url, phone, address, email")
        .eq("id", sale.company_id)
        .single();
      if (comp) {
        branding.companyName = comp.name;
        branding.logoUrl = comp.logo_url;
        branding.phone = comp.phone;
        branding.address = comp.address;
        branding.email = comp.email;
      }

      // Fetch dedicated PDF branding images from company_settings
      const { data: settings } = await supabaseAdmin
        .from("company_settings")
        .select("pdf_header_image_url, pdf_footer_image_url")
        .eq("company_id", sale.company_id)
        .single();

      if (settings) {
        branding.headerImageUrl = settings.pdf_header_image_url || null;
        branding.footerImageUrl = settings.pdf_footer_image_url || null;
      }
    }

    // 2b. Resolve all branding URLs then convert to data URIs for reliable rendering
    branding.logoUrl = await resolveStorageUrl(branding.logoUrl, supabaseAdmin);
    branding.headerImageUrl = await resolveStorageUrl(branding.headerImageUrl, supabaseAdmin);
    branding.footerImageUrl = await resolveStorageUrl(branding.footerImageUrl, supabaseAdmin);

    // Convert branding images to base64 data URIs to avoid network loading issues in renderer
    if (branding.headerImageUrl) {
      branding.headerImageUrl = await imageUrlToDataUri(branding.headerImageUrl);
    }
    if (branding.footerImageUrl) {
      branding.footerImageUrl = await imageUrlToDataUri(branding.footerImageUrl);
    }
    if (branding.logoUrl) {
      branding.logoUrl = await imageUrlToDataUri(branding.logoUrl);
    }

    // 2c. Resolve expired image URLs in document content
    const bucket = Deno.env.get("STORAGE_BUCKET") || "documents";
    const contentWithContractStart = ensureContractStartDateInBilling(doc.content, sale?.contract_start_date);
    const resolvedContent = await resolveContentImages(contentWithContractStart, supabaseAdmin, bucket);

    // 3. Build wrapped HTML and Puppeteer header/footer templates
    const wrappedHtml = buildWrappedHtml(resolvedContent, branding, doc.name || "Documento");
    const { headerTemplate, footerTemplate } = buildPuppeteerTemplates(branding);

    // 4. Call render service
    const renderUrl = Deno.env.get("RENDER_URL");
    const renderKey = Deno.env.get("RENDER_KEY");
    if (!renderUrl || !renderKey) {
      return new Response(JSON.stringify({ error: "RENDER_URL or RENDER_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const renderResponse = await fetch(renderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RENDER-KEY": renderKey,
      },
      body: JSON.stringify({
        html: wrappedHtml,
        options: {
          format: "A4",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate,
          footerTemplate,
          margin: { top: "28mm", right: "15mm", bottom: "20mm", left: "15mm" },
          waitUntil: "networkidle0",
        },
      }),
    });

    if (!renderResponse.ok) {
      const errText = await renderResponse.text();
      console.error("Render service error:", errText);
      return new Response(JSON.stringify({ error: "Render service failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBytes = new Uint8Array(await renderResponse.arrayBuffer());

    // 5. Calculate SHA-256
    const hash = await sha256Hex(pdfBytes);

    // 6. Determine mode: versioned print or standard base PDF
    if (admin_regeneration) {
      // === Versioned print mode ===
      // Get next version number
      const { data: lastVersion, error: lastVersionError } = await supabaseAdmin
        .from("document_print_versions")
        .select("version_number")
        .eq("document_id", document_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastVersionError) {
        const details = isMissingPrintVersionsTable(lastVersionError)
          ? "document_print_versions table is missing in this environment"
          : lastVersionError.message;

        return new Response(JSON.stringify({ error: "Print version infrastructure is not available", details }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const nextVersion = (lastVersion?.version_number || 0) + 1;
      const versionPath = `contracts/print-versions/${doc.sale_id}/${doc.id}/v${nextVersion}.pdf`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(versionPath, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
        return new Response(JSON.stringify({ error: "Storage upload failed", details: uploadErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark previous versions as not current
      const { error: resetVersionsError } = await supabaseAdmin
        .from("document_print_versions")
        .update({ is_current: false })
        .eq("document_id", document_id);

      if (resetVersionsError) {
        const details = isMissingPrintVersionsTable(resetVersionsError)
          ? "document_print_versions table is missing in this environment"
          : resetVersionsError.message;

        return new Response(JSON.stringify({ error: "Could not update previous print versions", details }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert new version record
      const versionPdfUrl = `${bucket}:${versionPath}`;
      const { error: insertErr } = await supabaseAdmin
        .from("document_print_versions")
        .insert({
          document_id,
          sale_id: doc.sale_id,
          version_number: nextVersion,
          pdf_url: versionPdfUrl,
          pdf_hash: hash,
          reason: reason || null,
          generated_by: authenticatedUserId,
          is_current: true,
        });

      if (insertErr) {
        const details = isMissingPrintVersionsTable(insertErr)
          ? "document_print_versions table is missing in this environment"
          : insertErr.message;

        return new Response(JSON.stringify({ error: "Could not persist the print version", details }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: "versioned_print",
          document_id,
          version_number: nextVersion,
          pdf_url: versionPdfUrl,
          note: `Versión de impresión v${nextVersion} generada. El PDF firmado original no fue modificado.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === Standard base PDF mode ===
    const storagePath = `contracts/base/${doc.sale_id}/${doc.id}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return new Response(JSON.stringify({ error: "Storage upload failed", details: uploadErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Update document record
    const basePdfUrl = `${bucket}:${storagePath}`;
    const { error: updateErr } = await supabaseAdmin
      .from("documents")
      .update({
        base_pdf_url: basePdfUrl,
        base_pdf_hash: hash,
      })
      .eq("id", document_id);

    if (updateErr) {
      console.error("Document update error:", updateErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        base_pdf_url: basePdfUrl,
        base_pdf_hash: hash,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("generate-base-pdf error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
