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

    const { data: registrationSetting, error: registrationSettingError } = await service
      .from("application_settings")
      .select("value")
      .eq("key", "vendor_registration_enabled")
      .maybeSingle();
    if (registrationSettingError) throw registrationSettingError;
    if (registrationSetting?.value === false) {
      return Response.json(
        { error: "Vendor registrations are temporarily unavailable." },
        { status: 403, headers: cors },
      );
    }

    // Identify the caller (if any) from this request's own Authorization
    // header -- supabase.functions.invoke() forwards the caller's access
    // token automatically, so an authenticated Vendor Login -> BecomeVendor
    // submission always carries one. An unauthenticated caller (legacy /
    // direct API use) still works: the application is matched to a profile
    // later, by email, in claim_vendor_workspace() once they sign in.
    let callerId: string | null = null;
    const authHeader = request.headers.get("Authorization") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearerToken) {
      const { data: callerData } = await service.auth.getUser(bearerToken);
      callerId = callerData?.user?.id ?? null;
    }

    const cityId = optionalText(body.city_id);
    const [{ data: city, error: cityError }, { data: category, error: categoryError }] = await Promise.all([
      cityId
        ? service.from("supported_cities").select("id,name,state,is_active").eq("id", cityId).eq("is_active", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      service.from("categories").select("id").eq("id", required.categoryId).maybeSingle(),
    ]);
    if (cityError) throw cityError;
    if (categoryError) throw categoryError;
    if (cityId && !city) throw new Error("This city is not currently supported by RoyalLagn.");
    if (!category) throw new Error("Choose an active RoyalLagn category.");

    const areaId = optionalText(body.area_id);
    const geoLocalityId = optionalText(body.geo_pincode_locality_id);
    const serviceAreaIds = Array.isArray(body.service_area_ids)
      ? [...new Set(body.service_area_ids.map(text).filter(Boolean))]
      : [];
    const requestedAreaIds = [...new Set([areaId, ...serviceAreaIds].filter(Boolean))] as string[];
    if (requestedAreaIds.length && !city) throw new Error("Service areas require a supported primary city.");
    if (requestedAreaIds.length && city) {
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
      if (!lookup.geo?.localities?.length) {
        throw new Error(lookup.message || "RoyalLagn is not yet available in this PIN-code location.");
      }
    } else if (lookupResponse && city && lookup.city?.id !== city.id) {
      throw new Error(`This PIN code belongs to ${lookup.city?.name || lookup.detected?.district || "another city"}, not the selected city.`);
    }

    const localityOptions = Array.isArray(lookup.geo?.localities) ? lookup.geo.localities : [];
    if (localityOptions.length > 1 && !geoLocalityId) {
      throw new Error("Choose the post office or locality that matches the business address.");
    }
    const selectedGeoLocality = geoLocalityId
      ? localityOptions.find((item: any) => item.id === geoLocalityId)
      : localityOptions.length === 1 ? localityOptions[0] : null;
    if (geoLocalityId && !selectedGeoLocality) {
      throw new Error("The selected locality does not belong to this PIN code.");
    }

    // A vendor is identified first by their authenticated profile (stable
    // across email changes), falling back to email for the legacy
    // unauthenticated-submission path. This single lookup decides whether
    // this is a fresh application or a resubmission.
    const existingQuery = service
      .from("vendor_applications")
      .select("id,status,profile_id")
      .order("submitted_at", { ascending: false })
      .limit(1);
    const { data: existingRows, error: existingError } = await (
      callerId
        ? existingQuery.or(`profile_id.eq.${callerId},email.eq.${required.email}`)
        : existingQuery.eq("email", required.email)
    );
    if (existingError) throw existingError;
    const existing = existingRows?.[0] ?? null;

    if (existing?.status === "pending") {
      return Response.json({ error: "A pending application already exists for this email." }, { status: 409, headers: cors });
    }
    if (existing?.status === "approved") {
      return Response.json({ error: "An approved Vendor account already exists for this email. Sign in instead." }, { status: 409, headers: cors });
    }

    const selectedArea = areaId
      ? await service.from("supported_areas").select("name").eq("id", areaId).single()
      : { data: null, error: null };
    if (selectedArea.error) throw selectedArea.error;
    const canonicalState = selectedGeoLocality?.state?.name || lookup.geo?.state?.name || city?.state || "";
    const canonicalDistrict = selectedGeoLocality?.district?.name || lookup.geo?.district?.name || city?.name || "";
    const address = optionalText(body.address) || selectedGeoLocality?.name || selectedArea.data?.name || canonicalDistrict;
    const record = {
      profile_id: callerId,
      full_name: required.fullName,
      email: required.email,
      phone: required.phone,
      business_name: required.businessName,
      category_id: required.categoryId,
      description: required.description,
      experience,
      address,
      area: selectedArea.data?.name || selectedGeoLocality?.name || canonicalDistrict,
      city: canonicalDistrict,
      state: canonicalState,
      country: "India",
      pincode: required.pincode,
      city_id: city?.id ?? null,
      area_id: areaId,
      service_area_ids: serviceAreaIds,
      geo_pincode_locality_id: selectedGeoLocality?.id ?? null,
      instagram: optionalText(body.instagram),
      facebook: optionalText(body.facebook),
      website: optionalText(body.website),
      logo_url: optionalText(body.logo_url),
      cover_image_url: optionalText(body.cover_image_url),
      business_documents: Array.isArray(body.business_documents) ? body.business_documents.slice(0, 5) : [],
      terms_accepted_at: new Date().toISOString(),
    };

    // Rejected vendors resubmitting must update their existing row, never
    // create a second one -- a second row would leave a stale rejected
    // application and a new pending one both matching this vendor, which
    // corrupts claim_vendor_workspace()'s "most recent matching
    // application" lookup and the admin approvals queue.
    if (existing?.status === "rejected") {
      const { data: updated, error: updateError } = await service
        .from("vendor_applications")
        .update({
          ...record,
          status: "pending",
          submitted_at: new Date().toISOString(),
          reviewed_at: null,
          reviewed_by: null,
          rejection_reason: null,
        })
        .eq("id", existing.id)
        .select("id,status,submitted_at")
        .single();
      if (updateError) throw updateError;
      return Response.json({ application: updated }, { status: 200, headers: cors });
    }

    const { data: application, error: insertError } = await service
      .from("vendor_applications")
      .insert({ ...record, status: "pending" })
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
