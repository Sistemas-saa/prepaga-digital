import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard: require service-role key or valid JWT
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;
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
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { template_id, template_version_id, sale_id, role } = await req.json();

    if (!template_id) {
      return new Response(JSON.stringify({ error: "template_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load template blocks ordered by page + sort_order
    const { data: blocks, error: blocksErr } = await supabase
      .from("template_blocks")
      .select("*")
      .eq("template_id", template_id)
      .order("page", { ascending: true })
      .order("sort_order", { ascending: true });

    if (blocksErr) throw blocksErr;
    if (!blocks || blocks.length === 0) {
      return new Response(JSON.stringify({ error: "No blocks found for template" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load template fields for overlay
    const { data: fields } = await supabase
      .from("template_fields")
      .select("*")
      .eq("template_id", template_id);

    // 3. Load sale data for placeholder resolution (if sale_id provided)
    let saleData: Record<string, string> = {};
    if (sale_id) {
      const { data: sale } = await supabase
        .from("sales")
        .select("*, clients(*), plans(*)")
        .eq("id", sale_id)
        .single();
      if (sale) {
        saleData = flattenSaleData(sale);
      }
    }

    // 4. Build the composed PDF
    const outputPdf = await PDFDocument.create();

    for (const block of blocks) {
      if (!block.is_visible) continue;

      const content = block.content as Record<string, any>;

      switch (block.block_type) {
        case "pdf_embed": {
          // Fetch original PDF from storage and extract selected pages
          const assetId = content.asset_id;
          if (!assetId) break;

          const { data: asset } = await supabase
            .from("template_assets")
            .select("*")
            .eq("id", assetId)
            .single();

          if (!asset || asset.status !== "ready") {
            break;
          }

          // Download the original PDF from storage
          const storagePath = asset.file_url;
          const { data: fileData, error: dlErr } = await supabase.storage
            .from("documents")
            .download(storagePath);

          if (dlErr || !fileData) {
            console.error(`Failed to download asset ${assetId}:`, dlErr);
            break;
          }

          const sourceBytes = new Uint8Array(await fileData.arrayBuffer());
          const sourcePdf = await PDFDocument.load(sourceBytes);

          // Determine which pages to include
          const selectedPages: number[] = content.page_selection?.pages ||
            Array.from({ length: sourcePdf.getPageCount() }, (_, i) => i + 1);

          // Copy pages (pdf-lib uses 0-based indices)
          const pageIndices = selectedPages.map((p: number) => p - 1).filter(
            (i: number) => i >= 0 && i < sourcePdf.getPageCount()
          );

          const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
          for (const page of copiedPages) {
            outputPdf.addPage(page);
          }
          break;
        }

        case "docx_embed": {
          // For DOCX, use the converted PDF if available
          const assetId = content.asset_id;
          if (!assetId) break;

          const { data: asset } = await supabase
            .from("template_assets")
            .select("*")
            .eq("id", assetId)
            .single();

          if (!asset) break;

          // Use converted_asset_id if available
          const pdfAssetId = asset.converted_asset_id || assetId;
          const { data: pdfAsset } = await supabase
            .from("template_assets")
            .select("*")
            .eq("id", pdfAssetId)
            .single();

          if (!pdfAsset || !pdfAsset.file_url) break;

          const { data: fileData } = await supabase.storage
            .from("documents")
            .download(pdfAsset.file_url);

          if (!fileData) break;

          const sourceBytes = new Uint8Array(await fileData.arrayBuffer());
          const sourcePdf = await PDFDocument.load(sourceBytes);
          const allPages = await outputPdf.copyPages(
            sourcePdf,
            sourcePdf.getPageIndices()
          );
          for (const page of allPages) {
            outputPdf.addPage(page);
          }
          break;
        }

        case "text":
        case "heading":
        case "signature_block":
        case "table":
        case "placeholder_chip": {
          // For HTML-based blocks, create a simple page with text content
          // Full HTML rendering requires a headless browser; for now we create
          // placeholder pages that will be replaced by the Render service in Phase 4
          const page = outputPdf.addPage([595.28, 841.89]); // A4
          const { rgb } = await import("https://esm.sh/pdf-lib@1.17.1");

          let text = "";
          if (block.block_type === "text") {
            text = stripHtml(content.html || "");
          } else if (block.block_type === "heading") {
            text = content.text || "Título";
          } else if (block.block_type === "signature_block") {
            text = `[Firma: ${content.label || "Firma"} — ${content.signer_role || "titular"}]`;
          } else if (block.block_type === "table") {
            text = `[Tabla: ${(content.columns || []).map((c: any) => c.label).join(" | ")}]`;
          } else if (block.block_type === "placeholder_chip") {
            const key = content.placeholder_key || "variable";
            text = saleData[key] || `{{${key}}}`;
          }

          // Resolve placeholders in text
          text = resolvePlaceholders(text, saleData);

          page.drawText(text.substring(0, 2000), {
            x: 50,
            y: 791,
            size: block.block_type === "heading" ? 18 : 12,
            maxWidth: 495,
          });
          break;
        }

        case "page_break": {
          // Page break — the next block starts on a new page
          // (handled implicitly since each block creates its own page)
          break;
        }

        default:
          break;
      }
    }

    // 5. Apply field overlays as annotations (placeholder rectangles)
    if (fields && fields.length > 0) {
      const pages = outputPdf.getPages();
      for (const field of fields) {
        const meta = field.meta as Record<string, any>;
        const pageNum = (meta?.sourcePageNumber || field.page || 1) - 1;
        if (pageNum < 0 || pageNum >= pages.length) continue;

        const page = pages[pageNum];
        const { width, height } = page.getSize();
        const norm = meta?.normalized || { x: field.x, y: field.y, w: field.w, h: field.h };

        const x = norm.x * width;
        const y = height - (norm.y * height) - (norm.h * height);
        const w = norm.w * width;
        const h = norm.h * height;

        const { rgb } = await import("https://esm.sh/pdf-lib@1.17.1");
        page.drawRectangle({
          x, y, width: w, height: h,
          borderColor: rgb(0.15, 0.39, 0.92),
          borderWidth: 1,
          opacity: 0.1,
        });

        // Draw field label
        page.drawText(field.field_type || "field", {
          x: x + 2,
          y: y + h - 10,
          size: 8,
          color: rgb(0.15, 0.39, 0.92),
        });
      }
    }

    // 6. Serialize and return
    const pdfBytes = await outputPdf.save();

    // If sale_id provided, upload to storage
    if (sale_id) {
      const path = `sales/${sale_id}/composed-template-${template_id}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadErr) {
        console.error("Failed to upload composed PDF:", uploadErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          storage_path: path,
          page_count: outputPdf.getPageCount(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return PDF directly if no sale_id
    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="composed-template-${template_id}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("compose-template-pdf error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Helpers ---

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function resolvePlaceholders(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}

function flattenSaleData(sale: any): Record<string, string> {
  const result: Record<string, string> = {};
  const formatDateLocal = (dateValue: string | null | undefined) => {
    if (!dateValue) return "";
    return new Date(dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`).toLocaleDateString("es-AR");
  };

  // Sale fields
  if (sale) {
    result["contract_number"] = sale.contract_number || "";
    result["sale_date"] = sale.created_at ? new Date(sale.created_at).toLocaleDateString("es-AR") : "";
    result["contract_start_date"] = formatDateLocal(sale.contract_start_date);
    result["fecha_inicio_contrato"] = result["contract_start_date"];
    result["status"] = sale.status || "";
    result["total_amount"] = sale.total_amount?.toString() || "";
  }

  // Client fields
  const client = sale?.clients;
  if (client) {
    result["client_first_name"] = client.first_name || "";
    result["client_last_name"] = client.last_name || "";
    result["client_full_name"] = `${client.first_name || ""} ${client.last_name || ""}`.trim();
    result["client_dni"] = client.dni || "";
    result["client_email"] = client.email || "";
    result["client_phone"] = client.phone || "";
    result["client_address"] = client.address || "";
    result["client_city"] = client.city || "";
    result["client_province"] = client.province || "";
  }

  // Plan fields
  const plan = sale?.plans;
  if (plan) {
    result["plan_name"] = plan.name || "";
    result["plan_price"] = plan.price?.toString() || "";
    result["plan_description"] = plan.description || "";
  }

  return result;
}
