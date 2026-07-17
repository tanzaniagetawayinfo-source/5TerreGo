import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*
  Supabase Edge Function: partner-backend

  Required custom secret:
  SERVICE_ROLE_KEY

  IMPORTANT:
  - SERVICE_ROLE_KEY must contain the LEGACY service_role API key from:
    Project Settings → API → Legacy anon, service_role API keys → service_role
  - Do NOT put sb_publishable_... here.
  - Do NOT create custom secrets starting with SUPABASE_. Supabase blocks that.

  public.pois fields used:
  id, name, type, emails, discount, discount_info, active_codes
*/

const PROJECT_URL_FALLBACK = "https://jpflcbktcnhmlvaibzcw.supabase.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

type ActiveCode = {
  code: string;
  user_id: string;
  user_email: string;
  discount: number;
  discount_info: string;
  discount_title?: string;
  discount_description?: string;
  created_at: string;
  expires_at: string;
  status: "active" | "used" | "expired";
  used_at?: string;
  validated_by?: string;
  validated_by_email?: string;
};

type PoiRow = {
  id: string | number;
  name?: string;
  type?: string;
  coords?: string | null;
  emails?: string | null;
  discount?: number | string | null;
  discount_info?: string | null;
  active_codes?: ActiveCode[] | string | null;
  description?: string | null;
  phone?: string | null;
  images?: string[] | string | null;
  partner_profile?: JsonRecord | null;
  [key: string]: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function normalizeCode(code: unknown): string {
  return String(code || "").trim().toUpperCase();
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseAuthorizedEmails(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeEmail).filter(Boolean);
  return String(value).split(",").map(normalizeEmail).filter(Boolean);
}

function uniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))];
}

function emailsToStorageString(emails: string[]): string {
  return uniqueEmails(emails).join(",");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function ensureValidEmailList(emails: string[]): string[] {
  const clean = uniqueEmails(emails);
  const invalid = clean.filter((email) => !isValidEmail(email));
  if (invalid.length > 0) throw new Error(`Invalid email(s): ${invalid.join(", ")}`);
  return clean;
}

function isAuthorized(poi: PoiRow, email: string): boolean {
  return parseAuthorizedEmails(poi.emails).includes(normalizeEmail(email));
}

function getActiveCodes(value: unknown): ActiveCode[] {
  if (Array.isArray(value)) return value as ActiveCode[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ActiveCode[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getDiscount(value: unknown): number {
  const discount = Number(value || 0);
  if (!Number.isFinite(discount)) return 0;
  return Math.max(0, Math.min(100, Math.round(discount)));
}

function parseOfferInfo(value: unknown): { title: string; description: string; raw: string } {
  const raw = String(value || "").trim();
  if (!raw) return { title: "", description: "", raw: "" };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      return {
        title: String(parsed.title || parsed.discount_title || parsed.offer_title || "").trim(),
        description: String(parsed.description || parsed.discount_description || parsed.offer_description || parsed.text || "").trim(),
        raw,
      };
    }
  } catch {
    // Backward compatibility: old discount_info values were plain text.
  }

  return { title: raw, description: "", raw };
}

function createCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const random = Array.from(bytes).map((value) => alphabet[value % alphabet.length]).join("");
  return `5T-${random}`;
}

function cleanCodes(codes: ActiveCode[], now: Date): ActiveCode[] {
  return codes
    .filter((item) => item && typeof item === "object" && item.code)
    .map((item) => {
      if (item.status === "active" && item.expires_at) {
        const expired = new Date(item.expires_at).getTime() <= now.getTime();
        if (expired) return { ...item, status: "expired" as const };
      }
      return item;
    })
    .filter((item) => {
      if (item.status !== "expired") return true;
      if (!item.expires_at) return false;
      const expiredAt = new Date(item.expires_at).getTime();
      const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      return expiredAt > sevenDaysAgo;
    });
}

async function readJsonBody(req: Request): Promise<JsonRecord> {
  try {
    return (await req.json()) as JsonRecord;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function getPoiIdFromBody(body: JsonRecord): string {
  const nestedPoi = body.poi && typeof body.poi === "object" ? (body.poi as JsonRecord) : null;
  return String(
    body.poi_id ??
    body.poiId ??
    body.id ??
    body.poi_id_text ??
    nestedPoi?.id ??
    nestedPoi?.id_text ??
    "",
  ).trim();
}

function getPoiNameFromBody(body: JsonRecord): string {
  const nestedPoi = body.poi && typeof body.poi === "object" ? (body.poi as JsonRecord) : null;
  return String(body.poi_name ?? nestedPoi?.name ?? "").trim();
}

async function findPoiByBody(supabaseAdmin: ReturnType<typeof createClient>, body: JsonRecord): Promise<PoiRow | null> {
  const rawId = getPoiIdFromBody(body);
  const rawName = getPoiNameFromBody(body);
  let result;

  if (rawId) {
    result = await supabaseAdmin.from("pois").select("*").eq("id", rawId).maybeSingle();
    if (!result.error && result.data) return result.data as PoiRow;

    if (/^[0-9]+$/.test(rawId)) {
      result = await supabaseAdmin.from("pois").select("*").eq("id", Number(rawId)).maybeSingle();
      if (!result.error && result.data) return result.data as PoiRow;
    }
  }

  if (rawName) {
    result = await supabaseAdmin.from("pois").select("*").eq("name", rawName).limit(20);
    if (!result.error && Array.isArray(result.data) && result.data.length === 1) return result.data[0] as PoiRow;
    if (!result.error && Array.isArray(result.data) && result.data.length > 1) {
      const exact = result.data.find((row: PoiRow) => normalizeText(row.name) === normalizeText(rawName));
      return (exact || result.data[0]) as PoiRow;
    }

    result = await supabaseAdmin.from("pois").select("*").ilike("name", rawName).limit(20);
    if (!result.error && Array.isArray(result.data) && result.data.length === 1) return result.data[0] as PoiRow;
    if (!result.error && Array.isArray(result.data) && result.data.length > 1) {
      const exact = result.data.find((row: PoiRow) => normalizeText(row.name) === normalizeText(rawName));
      return (exact || result.data[0]) as PoiRow;
    }
  }

  // Last resort: compare in TypeScript to avoid id type-cast edge cases.
  result = await supabaseAdmin.from("pois").select("*").limit(1000);
  if (!result.error && Array.isArray(result.data)) {
    const rows = result.data as PoiRow[];
    if (rawId) {
      const byId = rows.find((row) => String(row.id).trim() === rawId);
      if (byId) return byId;
    }
    if (rawName) {
      const byName = rows.find((row) => normalizeText(row.name) === normalizeText(rawName));
      if (byName) return byName;
    }
  }

  return null;
}

async function getPoiDebugInfo(supabaseAdmin: ReturnType<typeof createClient>) {
  const result = await supabaseAdmin.from("pois").select("id,name,discount,emails,active_codes").limit(20);
  if (result.error) {
    return {
      read_error: result.error.message,
      read_code: result.error.code || null,
      read_details: result.error.details || null,
      read_hint: result.error.hint || null,
      sample_count: null,
      sample: [],
    };
  }
  return {
    read_error: null,
    read_code: null,
    read_details: null,
    read_hint: null,
    sample_count: Array.isArray(result.data) ? result.data.length : 0,
    sample: result.data || [],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || PROJECT_URL_FALLBACK;
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("5TerreGo-ByRosettaVentures");

  if (!serviceRoleKey) {
    return jsonResponse({
      ok: false,
      error: "Missing service role secret. Create SERVICE_ROLE_KEY with the legacy service_role key, then redeploy partner-backend.",
    }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
  });

  const authApiKey =
    req.headers.get("apikey") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    serviceRoleKey;

  let body: JsonRecord;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Invalid request" }, 400);
  }

  const action = String(body.action || "").trim();
  if (!action) return jsonResponse({ ok: false, error: "Missing action" }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const allowCanvasPreview = body.allow_canvas_preview === true || body.canvas_preview === true;

  let user: { id: string; email?: string | null } | null = null;
  let userEmail = normalizeEmail(body.user_email);

  // generate_code can fall back to user_email, because it only creates a customer code.
  // Manager-only actions below still require a real valid Supabase session.
  if (allowCanvasPreview && userEmail) {
    user = { id: "canvas-preview-user", email: userEmail };
  } else if (token) {
    const supabaseAuth = createClient(supabaseUrl, authApiKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await supabaseAuth.auth.getUser();
    if (!error && data?.user) {
      user = data.user;
      userEmail = normalizeEmail(user.email);
    } else if (action === "generate_code" && userEmail) {
      user = { id: "discount-user-" + userEmail, email: userEmail };
    } else {
      return jsonResponse({
        ok: false,
        error: "Invalid user session",
        debug: {
          action,
          auth_error: error?.message || null,
          token_prefix: token ? token.slice(0, 12) : null,
          allow_canvas_preview: allowCanvasPreview,
          received_user_email: userEmail,
        },
      }, 401);
    }
  } else if (action === "generate_code" && userEmail) {
    user = { id: "discount-user-" + userEmail, email: userEmail };
  } else {
    return jsonResponse({ ok: false, error: "Missing Authorization token" }, 401);
  }

  try {
    if (action === "debug_pois") {
      const rawId = getPoiIdFromBody(body);
      const rawName = getPoiNameFromBody(body);
      const byIdText = rawId ? await supabaseAdmin.from("pois").select("id,name,discount,emails,active_codes").eq("id", rawId).limit(5) : null;
      const byIdNumber = rawId && /^[0-9]+$/.test(rawId) ? await supabaseAdmin.from("pois").select("id,name,discount,emails,active_codes").eq("id", Number(rawId)).limit(5) : null;
      const byName = rawName ? await supabaseAdmin.from("pois").select("id,name,discount,emails,active_codes").eq("name", rawName).limit(5) : null;
      const all = await supabaseAdmin.from("pois").select("id,name,discount,emails,active_codes").limit(50);

      return jsonResponse({
        ok: true,
        received: { rawId, rawName, userEmail },
        environment: {
          supabase_url: supabaseUrl,
          has_service_role_key: Boolean(serviceRoleKey),
          service_role_key_prefix: serviceRoleKey.slice(0, 18),
          service_role_key_length: serviceRoleKey.length,
          pois_check: await getPoiDebugInfo(supabaseAdmin),
        },
        byIdText: { error: byIdText?.error?.message || null, code: byIdText?.error?.code || null, rows: byIdText?.data || [] },
        byIdNumber: { error: byIdNumber?.error?.message || null, code: byIdNumber?.error?.code || null, rows: byIdNumber?.data || [] },
        byName: { error: byName?.error?.message || null, code: byName?.error?.code || null, rows: byName?.data || [] },
        sample: { error: all.error?.message || null, code: all.error?.code || null, count: Array.isArray(all.data) ? all.data.length : null, rows: all.data || [] },
      });
    }

    if (action === "get_partner_pois") {
      const { data: pois, error } = await supabaseAdmin
        .from("pois")
        .select("id,name,type,coords,description,phone,images,emails,discount,discount_info,partner_profile")
        .not("emails", "is", null);
      if (error) throw new Error(error.message);
      const partnerPois = ((pois || []) as PoiRow[]).filter((poi) => isAuthorized(poi, userEmail));
      return jsonResponse({ ok: true, user_email: userEmail, pois: partnerPois });
    }

    if (action === "get_partner_stats") {
      const poi = await findPoiByBody(supabaseAdmin, body);
      if (!poi) return jsonResponse({ ok: false, error: "POI not found" }, 404);
      const managers = parseAuthorizedEmails(poi.emails);
      if (!managers.length || managers[0] !== userEmail) {
        return jsonResponse({ ok: false, error: "Only the business manager can view analytics" }, 403);
      }

      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const eventCount = async (type: string, since?: string) => {
        let query = supabaseAdmin.from("poi_partner_events").select("id", { count: "exact", head: true })
          .eq("poi_id", poi.id).eq("event_type", type);
        if (since) query = query.gte("created_at", since);
        const result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.count || 0;
      };
      const [viewsTotal, views30, views7, whatsappTotal, whatsapp30, whatsapp7] = await Promise.all([
        eventCount("profile_view"), eventCount("profile_view", since30), eventCount("profile_view", since7),
        eventCount("whatsapp_click"), eventCount("whatsapp_click", since30), eventCount("whatsapp_click", since7),
      ]);
      return jsonResponse({
        ok: true,
        stats: {
          views_total: viewsTotal,
          views_7d: views7,
          views_30d: views30,
          whatsapp_total: whatsappTotal,
          whatsapp_7d: whatsapp7,
          whatsapp_30d: whatsapp30,
        },
      });
    }

    if (action === "upload_business_asset") {
      const poi = await findPoiByBody(supabaseAdmin, body);
      if (!poi) return jsonResponse({ ok: false, error: "POI not found" }, 404);
      const managers = parseAuthorizedEmails(poi.emails);
      if (!managers.length || managers[0] !== userEmail) {
        return jsonResponse({ ok: false, error: "Only the business manager can upload files" }, 403);
      }

      const mimeType = String(body.mime_type || "").toLowerCase();
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(mimeType)) return jsonResponse({ ok: false, error: "Unsupported file type" }, 400);
      const rawBase64 = String(body.base64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!rawBase64) return jsonResponse({ ok: false, error: "Missing file data" }, 400);
      const binary = Uint8Array.from(atob(rawBase64), (char) => char.charCodeAt(0));
      if (binary.byteLength > 6 * 1024 * 1024) return jsonResponse({ ok: false, error: "File exceeds 6 MB" }, 400);
      const extension = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1].replace("jpeg", "jpg");
      const path = `poi-${poi.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabaseAdmin.storage.from("business-assets").upload(path, binary, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error) throw new Error(upload.error.message);
      const publicUrl = supabaseAdmin.storage.from("business-assets").getPublicUrl(path).data.publicUrl;
      return jsonResponse({ ok: true, url: publicUrl, path, mime_type: mimeType });
    }

    if (action === "update_business_profile") {
      const poi = await findPoiByBody(supabaseAdmin, body);
      if (!poi) return jsonResponse({ ok: false, error: "POI not found" }, 404);
      const managers = parseAuthorizedEmails(poi.emails);
      if (!managers.length || managers[0] !== userEmail) {
        return jsonResponse({ ok: false, error: "Only the business manager can edit the profile" }, 403);
      }

      const description = String(body.description || "").trim().slice(0, 5000);
      const phone = String(body.phone || "").trim().slice(0, 80);
      const images = Array.isArray(body.images)
        ? body.images.map((value) => String(value || "").trim()).filter((value) => {
          return /^https:\/\//i.test(value) || (/^data:image\/(jpeg|png|webp);base64,/i.test(value) && value.length <= 2500000);
        }).slice(0, 10)
        : [];
      const profile = body.partner_profile && typeof body.partner_profile === "object"
        ? body.partner_profile as JsonRecord
        : {};
      if (JSON.stringify(profile).length > 100000) return jsonResponse({ ok: false, error: "Menu data is too large" }, 400);
      const { error } = await supabaseAdmin.from("pois").update({
        description,
        phone,
        images,
        partner_profile: profile,
      }).eq("id", poi.id);
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true, poi_id: poi.id, description, phone, images, partner_profile: profile });
    }

    if (action === "generate_code") {
      const poi = await findPoiByBody(supabaseAdmin, body);
      if (!poi) {
        const debugInfo = await getPoiDebugInfo(supabaseAdmin);
        return jsonResponse({
          ok: false,
          error:
            "POI not found. Received id=" + getPoiIdFromBody(body) +
            " name=" + getPoiNameFromBody(body) +
            ". Table sample count=" + ((debugInfo as any).sample_count ?? "?") +
            ". Read error=" + (((debugInfo as any).read_error) || "none") +
            ". Read code=" + (((debugInfo as any).read_code) || "none") +
            ". First rows=" + JSON.stringify(((debugInfo as any).sample || []).slice(0, 5)),
          debug: {
            received_poi_id: getPoiIdFromBody(body),
            received_poi_name: getPoiNameFromBody(body),
            table_check: debugInfo,
          },
        }, 404);
      }

      const discount = getDiscount(poi.discount);
      const offer = parseOfferInfo(poi.discount_info);
      if (discount <= 0 && !offer.title && !offer.description) {
        return jsonResponse({ ok: false, error: "This POI has no active offer" }, 400);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const currentCodes = cleanCodes(getActiveCodes(poi.active_codes), now);

      const existingCode = currentCodes.find((item) => {
        return item.status === "active" &&
          normalizeEmail(item.user_email) === userEmail &&
          item.expires_at &&
          new Date(item.expires_at).getTime() > now.getTime();
      });

      if (existingCode) {
        const existingOffer = parseOfferInfo(existingCode.discount_info);
        return jsonResponse({
          ok: true,
          reused: true,
          poi_id: poi.id,
          poi_name: poi.name || "",
          discount: existingCode.discount,
          discount_info: existingCode.discount_info || "",
          discount_title: existingCode.discount_title || existingOffer.title || "",
          discount_description: existingCode.discount_description || existingOffer.description || "",
          code: existingCode,
        });
      }

      const newCode: ActiveCode = {
        code: createCode(),
        user_id: user?.id || "",
        user_email: userEmail,
        discount,
        discount_info: offer.raw,
        discount_title: offer.title,
        discount_description: offer.description,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: "active",
      };

      const { error: updateError } = await supabaseAdmin
        .from("pois")
        .update({ active_codes: [...currentCodes, newCode] })
        .eq("id", poi.id);

      if (updateError) throw new Error(updateError.message);
      return jsonResponse({
        ok: true,
        reused: false,
        poi_id: poi.id,
        poi_name: poi.name || "",
        discount,
        discount_info: newCode.discount_info,
        discount_title: newCode.discount_title || "",
        discount_description: newCode.discount_description || "",
        code: newCode,
      });
    }

    if (action === "validate_code") {
      const code = normalizeCode(body.code);
      if (!code) return jsonResponse({ ok: false, error: "Missing code" }, 400);

      const { data: pois, error } = await supabaseAdmin.from("pois").select("*").not("active_codes", "is", null);
      if (error) throw new Error(error.message);

      const now = new Date();
      let targetPoi: PoiRow | null = null;
      let targetCode: ActiveCode | null = null;

      for (const poi of (pois || []) as PoiRow[]) {
        const found = getActiveCodes(poi.active_codes).find((item) => normalizeCode(item.code) === code);
        if (found) {
          targetPoi = poi;
          targetCode = found;
          break;
        }
      }

      if (!targetPoi || !targetCode) return jsonResponse({ ok: false, error: "Code not found" }, 404);
      if (!isAuthorized(targetPoi, userEmail)) return jsonResponse({ ok: false, error: "You are not authorized for this POI" }, 403);
      if (targetCode.status === "used") return jsonResponse({ ok: false, error: "Code already used" }, 400);

      if (!targetCode.expires_at || new Date(targetCode.expires_at).getTime() <= now.getTime()) {
        const expiredCodes = getActiveCodes(targetPoi.active_codes).map((item) => {
          if (normalizeCode(item.code) !== code) return item;
          return { ...item, status: "expired" as const };
        });
        await supabaseAdmin.from("pois").update({ active_codes: expiredCodes }).eq("id", targetPoi.id);
        return jsonResponse({ ok: false, error: "Code expired" }, 400);
      }

      const updatedCode: ActiveCode = {
        ...targetCode,
        status: "used",
        used_at: now.toISOString(),
        validated_by: user?.id || "",
        validated_by_email: userEmail,
      };

      const updatedCodes = getActiveCodes(targetPoi.active_codes).map((item) => {
        if (normalizeCode(item.code) !== code) return item;
        return updatedCode;
      });

      const { error: updateError } = await supabaseAdmin.from("pois").update({ active_codes: updatedCodes }).eq("id", targetPoi.id);
      if (updateError) throw new Error(updateError.message);

      const validatedOffer = parseOfferInfo(updatedCode.discount_info);

      return jsonResponse({
        ok: true,
        message: "Offer validated",
        poi_id: targetPoi.id,
        poi_name: targetPoi.name || "",
        poi_type: targetPoi.type || "",
        discount: updatedCode.discount,
        discount_info: updatedCode.discount_info || "",
        discount_title: updatedCode.discount_title || validatedOffer.title || "",
        discount_description: updatedCode.discount_description || validatedOffer.description || "",
        poi: { id: targetPoi.id, name: targetPoi.name || "", type: targetPoi.type || "" },
        code: updatedCode,
      });
    }

    if (action === "update_discount" || action === "update_emails" || action === "update_partner_settings") {
      const poi = await findPoiByBody(supabaseAdmin, body);
      if (!poi) return jsonResponse({ ok: false, error: "POI not found" }, 404);

      const existingEmails = parseAuthorizedEmails(poi.emails);
      if (existingEmails.length === 0) return jsonResponse({ ok: false, error: "This POI has no authorized emails" }, 403);
      if (!existingEmails.includes(userEmail)) return jsonResponse({ ok: false, error: "You are not authorized for this POI" }, 403);
      if (existingEmails[0] !== userEmail) {
        return jsonResponse({ ok: false, error: "Only the business manager can change settings" }, 403);
      }

      const patch: Record<string, unknown> = {};

      if (action === "update_discount" || action === "update_partner_settings") {
        if ("discount" in body) patch.discount = getDiscount(body.discount);
        if ("discount_info" in body) patch.discount_info = String(body.discount_info || "").trim();
      }

      if (action === "update_emails" || action === "update_partner_settings") {
        let nextEmails: string[] = existingEmails;
        if (Array.isArray(body.emails)) nextEmails = body.emails.map(normalizeEmail);
        else if (typeof body.emails === "string") nextEmails = parseAuthorizedEmails(body.emails);
        if (Array.isArray(body.add_emails)) nextEmails = [...nextEmails, ...body.add_emails.map(normalizeEmail)];
        if (Array.isArray(body.remove_emails)) {
          const toRemove = new Set(body.remove_emails.map(normalizeEmail));
          nextEmails = nextEmails.filter((email) => !toRemove.has(email));
        }
        nextEmails = [existingEmails[0], ...nextEmails.filter((email) => email !== existingEmails[0])];
        patch.emails = emailsToStorageString(ensureValidEmailList(nextEmails));
      }

      if (Object.keys(patch).length === 0) return jsonResponse({ ok: false, error: "Nothing to update" }, 400);

      const { error: updateError } = await supabaseAdmin.from("pois").update(patch).eq("id", poi.id);
      if (updateError) throw new Error(updateError.message);

      return jsonResponse({ ok: true, poi_id: poi.id, updated: patch });
    }

    return jsonResponse({ ok: false, error: "Invalid action" }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unexpected backend error" }, 500);
  }
});
