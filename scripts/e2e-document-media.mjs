import {chromium} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
const state=JSON.parse(await readFile('.local-backups/media-e2e-20261025/customer.json','utf8'));
const client=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data,error}=await client.auth.signInWithPassword({email:state.email,password:state.password});
if(error) throw error;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const headers={Authorization:`Bearer ${data.session.access_token}`};
const base=process.env.EXPO_PUBLIC_SUPABASE_URL+'/functions/v1/';
const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count 0 /Kids [] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
let asset;
const result={workflow:'documents',browserUI:false};
try {
  const signed=await context.request.post(base+'media-upload-sign',{headers,data:{mimeType:'application/pdf',fileSize:pdf.length,folder:`royallagn/documents/${state.id}`}});
  result.signStatus=signed.status();
  const sign=await signed.json();
  if(!signed.ok()) throw new Error(sign.error);
  result.uploadMode=sign.uploadMode;
  const multipart={file:{name:'ROYALLAGN_DUMMY_TEST_20261025.pdf',mimeType:'application/pdf',buffer:pdf}};
  for(const key of ['folder','public_id','timestamp','overwrite','unique_filename','signature']) multipart[key]=String(sign[key]);
  multipart.api_key=sign.apiKey;
  const upload=await context.request.post(`https://api.cloudinary.com/v1_1/${sign.cloudName}/raw/upload`,{multipart});
  result.uploadStatus=upload.status(); asset=await upload.json();
  if(!upload.ok()) throw new Error(asset.error?.message||'Document upload failed');
  result.url=asset.secure_url; result.publicId=asset.public_id;
  const delivery=await context.request.get(asset.secure_url);
  result.deliveryStatus=delivery.status();result.deliveryError=delivery.headers()['x-cld-error'] ?? null;
} catch(error) {result.error=error.message;process.exitCode=1;}
finally {
  if(asset?.secure_url) {
    const deletion=await context.request.post(base+'user-media-delete',{headers,data:{url:asset.secure_url}});
    result.deleteStatus=deletion.status(); result.deleteResult=await deletion.json();
  }
  await writeFile('.local-backups/media-e2e-20261025/document-result.json',JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result));await browser.close();
}
