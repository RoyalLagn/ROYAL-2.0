import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Never persist or print the supplied real-account credentials.
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const directory = '.local-backups/media-e2e-20261025';
await mkdir(directory,{recursive:true});
const statePath = `${directory}/customer.json`;
let state;
try { state=JSON.parse(await readFile(statePath,'utf8')); if(state.cleanup?.accountDeleted) throw new Error('Create a fresh dummy account'); } catch {
  const email=`codex.media.${randomUUID()}@example.com`, password=`Test!${randomUUID()}9aA`;
  const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'public_user',full_name:'DUMMY MEDIA TEST 20261025',phone:'9000000099'}});
  if(error) throw error;
  state={id:data.user.id,email,password,uploads:[],results:[]};
  await writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});
}
const save = () => writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});
const own = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {error:ownAuthError}=await own.auth.signInWithPassword({email:state.email,password:state.password});
if(ownAuthError) throw ownAuthError;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(20000);
page.on('dialog', dialog => dialog.accept());
page.on('response', async response=>{
  if(response.url().includes('api.cloudinary.com') && response.request().method()==='POST') {
    const data=await response.json().catch(()=>({}));
    state.uploads.push({status:response.status(),url:data.secure_url,publicId:data.public_id}); await save();
  }
});
async function checkpoint(name, details) {state.results.push({name,...details});await save();console.log(JSON.stringify({name,...details}));}
async function choose(button, file) {
  const chooser=page.waitForEvent('filechooser'); await page.getByRole('button',{name:button,exact:true}).click(); await (await chooser).setFiles(file);
}
try {
  await page.goto('http://localhost:8081/Login');
  await page.getByRole('textbox',{name:'Email address',exact:true}).fill(state.email);
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(state.password);
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.waitForURL(url=>!url.pathname.includes('Login'));
  await page.getByText('Choose your location',{exact:true}).waitFor();
  const city=page.getByText('Pune, Maharashtra',{exact:true});
  await city.last().click();
  await page.getByText('Choose your location',{exact:true}).waitFor({state:'hidden'});
  await page.goto('http://localhost:8081/EditProfile');
  await page.getByRole('button',{name:'Change profile photo',exact:true}).waitFor();
  await checkpoint('customer profile page',{buttons:await page.getByRole('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')||e.textContent))});
  // Continue from this inspected UI in follow-up runs without recreating the account.
  if (!process.argv.includes('--reviews')) for (const variant of ['a','b']) {
    const previous=state.uploads.at(-1)?.url;
    await choose('Change profile photo',`/private/tmp/royallagn-media-test-${variant}.png`);
    const saveButton=page.getByRole('button',{name:'Save square profile photo',exact:true});
    await saveButton.click();
    await saveButton.waitFor({state:'hidden',timeout:30000});
    const {data:profile,error}=await db.from('profiles').select('profile_image').eq('id',state.id).single();
    if(error) throw error;
    if(!profile.profile_image?.startsWith('https://res.cloudinary.com/')) throw new Error('Profile URL was not saved');
    await page.reload();
    await page.getByRole('button',{name:'Change profile photo'}).waitFor();
    const image=page.locator('img').filter({visible:true});
    await page.waitForFunction(url=>[...document.images].some(img=>img.src===url&&img.complete&&img.naturalWidth>0),profile.profile_image);
    const oldStatus=previous ? (await page.request.get(previous)).status() : null;
    await checkpoint(`customer profile ${variant}`,{saved:true,refreshDisplay:true,url:profile.profile_image,previousAssetStatus:oldStatus});
  }
  if (!process.argv.includes('--reviews')) {
    const last=state.uploads.at(-1)?.url;
    await page.getByRole('button',{name:'Remove photo',exact:true}).click();
    await page.getByRole('button',{name:'Remove photo',exact:true}).waitFor({state:'hidden'});
    const {data:after}=await db.from('profiles').select('profile_image').eq('id',state.id).single();
    await checkpoint('customer profile deletion',{databaseCleared:after.profile_image===null,assetStatus:(await page.request.get(last)).status()});
  } else {
    const {data:vendor}=await db.from('vendors').select('slug').eq('id','fcd040b3-8caa-4d1a-9c5c-bb287db4e015').single();
    await page.goto(`http://localhost:8081/vendor/${vendor.slug}`);
    await page.getByRole('button',{name:'Write a Review',exact:true}).waitFor();
    await page.getByRole('button',{name:'Close app download reminder',exact:true}).click({timeout:7000});
    const token=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.includes('auth-token')); return JSON.parse(localStorage.getItem(k)).access_token;});
    const {data:existingReview}=await own.from('reviews').select('id,image_urls').eq('profile_id',state.id).maybeSingle();
    for(const upload of state.uploads.filter(item=>item.publicId?.startsWith(`royallagn/reviews/${state.id}/`) && !existingReview?.image_urls?.includes(item.url))) {
      const cleanup=await page.request.post(`${process.env.SUPABASE_URL}/functions/v1/review-photo-delete`,{headers:{Authorization:`Bearer ${token}`},data:{publicId:upload.publicId}});
      if(!cleanup.ok()) throw new Error('Unable to clean up earlier dummy review upload');
    }
    await checkpoint('review page',{url:page.url(),buttons:await page.getByRole('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')||e.textContent))});
    if(!existingReview) {
    await page.getByRole('button',{name:'Write a Review',exact:true}).click();
    await page.getByRole('radio',{name:'5 stars',exact:true}).click();
    await page.getByRole('textbox',{name:'Review comment',exact:true}).fill('DUMMY MEDIA TEST 20261025 — temporary photo integration test.');
    const chooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Add review photos',exact:true}).click();
    await (await chooser).setFiles(['/private/tmp/royallagn-media-test-a.png','/private/tmp/royallagn-media-test-b.png']);
    await page.getByRole('button',{name:'Remove review photo 2',exact:true}).waitFor({timeout:30000});
    await page.getByRole('button',{name:'Submit review',exact:true}).click();
    await page.getByRole('textbox',{name:'Review comment',exact:true}).waitFor({state:'hidden',timeout:30000});
    }
    const {data:review,error}=await own.from('reviews').select('id,image_urls,review,status').eq('profile_id',state.id).single();
    if(error) throw error;
    state.reviewId=review.id; await save();
    await page.reload();
    await page.getByText('DUMMY MEDIA TEST 20261025 — temporary photo integration test.',{exact:true}).first().waitFor();
    await checkpoint('review images saved',{id:review.id,photos:review.image_urls,status:review.status,refreshDisplay:true});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Write a Review',exact:true}).click();
    await page.getByRole('button',{name:'Remove review photo 1',exact:true}).click();
    await page.getByRole('button',{name:'Update review',exact:true}).click();
    await page.getByRole('textbox',{name:'Review comment',exact:true}).waitFor({state:'hidden',timeout:30000});
    const {data:edited}=await own.from('reviews').select('image_urls').eq('id',review.id).single();
    await checkpoint('review image edit',{remaining:edited.image_urls.length,mobile:true});
    await checkpoint('review controls',{buttons:await page.getByRole('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')||e.textContent).filter(x=>/edit|delete|review/i.test(x||'')))});
    await page.getByRole('button',{name:'Delete review',exact:true}).click();
    await page.getByText('Delete',{exact:true}).last().click();
    await page.getByRole('button',{name:'Delete review',exact:true}).waitFor({state:'hidden',timeout:30000});
    const {data:deleted,error:deletionError}=await own.from('reviews').select('id').eq('id',review.id);
    if(deletionError) throw deletionError;
    await checkpoint('review deletion',{removed:deleted.length===0,urlsToVerify:review.image_urls});
  }
  await page.screenshot({path:'/private/tmp/royallagn-customer-media.png'});
} catch(error) {
  await checkpoint('blocked',{message:error.message,url:page.url(),text:(await page.locator('body').innerText()).slice(-2500)});
  await page.screenshot({path:'/private/tmp/royallagn-customer-media-failed.png'});
  process.exitCode=1;
} finally {await browser.close();}
