import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
function recentOtp(token:string){try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const body=JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,'=')));return Array.isArray(body.amr)&&body.amr.some((x:any)=>x.method==='otp'&&Date.now()/1000-Number(x.timestamp)<=600);}catch{return false;}}
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'Method not allowed'},405);try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim(); if(!token)return json({error:'Authentication required'},401);
  const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:{user}}=await service.auth.getUser(token); if(!user)return json({error:'Session expired'},401);
  const {data:vendor,error}=await service.from('vendors').select('id,business_name,owner_name,contact_phone,subscription_status,profile_id').eq('profile_id',user.id).maybeSingle(); if(error)throw error;if(!vendor)return json({error:'Vendor workspace not found'},404);
  const body=await req.json().catch(()=>({}));
  if(body.action==='status'){
    const {data:latest,error:statusError}=await service.from('account_deletion_requests').select('request_reference,status,requested_at,decision_reason').eq('vendor_id',vendor.id).eq('account_type','vendor').in('status',['pending','verified','processing','rejected']).order('requested_at',{ascending:false}).limit(1).maybeSingle();
    if(statusError)throw statusError;
    return json({request:latest||null});
  }
  if(!recentOtp(token))return json({error:'Verify the fresh email OTP first'},403);
  if(!(await checkRateLimit(service,`vendor-deletion:${user.id}`,3,86400)))return json({error:'Too many requests. Try again tomorrow.'},429);
  const reason=String(body.reason||'').trim().slice(0,1000);if(reason.length<5)return json({error:'Please provide a deletion reason'},400);
  const {data:existing}=await service.from('account_deletion_requests').select('request_reference').eq('vendor_id',vendor.id).in('status',['pending','verified','processing']).limit(1).maybeSingle();if(existing)return json({reference:existing.request_reference,already_requested:true});
  const reference=`VDEL-${crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase()}`;
  const {error:insertError}=await service.from('account_deletion_requests').insert({request_reference:reference,account_type:'vendor',email:(user.email||'').toLowerCase(),full_name:vendor.owner_name,phone:vendor.contact_phone,reason,requester_user_id:user.id,vendor_id:vendor.id,email_verified_at:new Date().toISOString(),status:'verified',vendor_snapshot:{business_name:vendor.business_name,owner_name:vendor.owner_name,subscription_status:vendor.subscription_status}});
  if(insertError?.code==='23505'){
    const {data:activeRequest}=await service.from('account_deletion_requests').select('request_reference').eq('vendor_id',vendor.id).in('status',['pending','verified','processing']).limit(1).maybeSingle();
    if(activeRequest)return json({reference:activeRequest.request_reference,already_requested:true});
  }
  if(insertError)throw insertError;
  return json({reference},201);
}catch(e){return json({error:e instanceof Error?e.message:'Unable to submit request'},400);}});
