import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const text = (value: unknown) => String(value ?? "").trim();
const optionalText = (value: unknown) => text(value) || null;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });

  try {
    const body = await request.json().catch(() => ({}));
    const required = {
      fullName: text(body.full_name),
      email: text(body.email).toLowerCase(),
      phone: text(body.phone),
      businessName: text(body.business_name),
      categoryId: text(body.category_id),
      description: text(body.description),
      pincode: text(body.pincode),
      cityId: text(body.city_id),
    };
    if (Object.values(required).some((value) => !value)) throw new Error("Complete all required Vendor application fields.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.email)) throw new Error("Enter a valid email address.");
    if (!/^[+0-9][0-9\s-]{6,14}$/.test(required.phone)) throw new Error("Enter a valid mobile number.");
    if (!/^[1-9][0-9]{5}$/.test(required.pincode)) throw new Error("Enter a valid six-digit Indian PIN code.");
    const experience = Number(body.experience);
    if (!Number.isInteger(experience) || experience < 0 || experience > 100) throw new Error("Enter a valid number of years of experience.");
    if (!body.terms_accepted) throw new Error("Accept the Terms & Conditions to continue.");

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [{ data: city, error: cityError }, { data: category, error: categoryError }] = await Promise.all([
      service.from("supported_cities").select("id,name,state,is_active").eq("id", required.cityId).eq("is_active", true).maybeSingle(),
      service.from("categories").select("id").eq("id", required.categoryId).maybeSingle(),
    ]);
    if (cityError) throw cityError;
    if (categoryError) throw categoryError;
    if (!city) throw new Error("This city is not currently supported by RoyalLagn.");
    if (!category) throw new Error("Choose an active RoyalLagn category.");

    const areaId = optionalText(body.area_id);
    const serviceAreaIds = Array.isArray(body.service_area_ids)
      ? [...new Set(body.service_area_ids.map(text).filter(Boolean))]
      : [];
    const requestedAreaIds = [...new Set([areaId, ...serviceAreaIds].filter(Boolean))] as string[];
    if (requestedAreaIds.length) {
      const { data: supportedAreas, error: areaError } = await service
        .from("supported_areas")
        .select("id")
        .eq("city_id", city.id)
        .eq("is_active", true)
        .in("id", requestedAreaIds);
      if (areaError) throw areaError;
      if ((supportedAreas ?? []).length !== requestedAreaIds.length) {
        throw new Error("One or more service areas are not active in the selected city.");
      }
    }

    let lookupResponse: Response | null = null;
    let lookup: any = {};
    try {
      lookupResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/lookup-india-pincode`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pincode: required.pincode }),
        signal: AbortSignal.timeout(10000),
      });
      lookup = await lookupResponse.json().catch(() => ({}));
    } catch {
      if (body.location_fallback !== true) {
        return Response.json({ error: "PIN-code lookup is temporarily unavailable. Choose a supported location manually and try again." }, { status: 503, headers: cors });
      }
    }
    if (lookupResponse?.status === 503) {
      if (body.location_fallback !== true) {
        return Response.json({ error: "PIN-code lookup is temporarily unavailable. Choose a supported location manually and try again." }, { status: 503, headers: cors });
      }
    } else if (lookupResponse && !lookupResponse.ok && lookupResponse.status !== 404) {
      throw new Error("Unable to verify this PIN code right now.");
    } else if (lookupResponse && lookup.supported !== true) {
      throw new Error(lookup.message || "RoyalLagn is not yet available in this PIN-code location.");
    } else if (lookupResponse && lookup.city?.id !== city.id) {
      throw new Error(`This PIN code belongs to ${lookup.city?.name || lookup.detected?.district || "another city"}, not the selected city.`);
    }

    const { data: existing, error: existingError } = await service
      .from("vendor_applications")
      .select("id")
      .eq("email", required.email)
      .eq("status", "pending")
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length) return Response.json({ error: "A pending application already exists for this email." }, { status: 409, headers: cors });

    const selectedArea = areaId
      ? await service.from("supported_areas").select("name").eq("id", areaId).single()
      : { data: null, error: null };
    if (selectedArea.error) throw selectedArea.error;
    const address = optionalText(body.address) || selectedArea.data?.name || city.name;
    const { data: application, error: insertError } = await service
      .from("vendor_applications")
      .insert({
        profile_id: null,
        full_name: required.fullName,
        email: required.email,
        phone: required.phone,
        business_name: required.businessName,
        category_id: required.categoryId,
        description: required.description,
        experience,
        address,
        area: selectedArea.data?.name || city.name,
        city: city.name,
        state: city.state,
        country: "India",
        pincode: required.pincode,
        city_id: city.id,
        area_id: areaId,
        service_area_ids: serviceAreaIds,
        instagram: optionalText(body.instagram),
        facebook: optionalText(body.facebook),
        website: optionalText(body.website),
        logo_url: optionalText(body.logo_url),
        cover_image_url: optionalText(body.cover_image_url),
        business_documents: Array.isArray(body.business_documents) ? body.business_documents.slice(0, 5) : [],
        terms_accepted_at: new Date().toISOString(),
        status: "pending",
      })
      .select("id,status,submitted_at")
      .single();
    if (insertError) throw insertError;
    return Response.json({ application }, { status: 201, headers: cors });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : "Unable to submit the Vendor application.";
    return Response.json({ error: message }, { status: 400, headers: cors });
  }
});
