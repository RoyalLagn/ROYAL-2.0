import {chromium} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
const title='DUMMY MEDIA RETEST 20261025';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(20000);
const result={workflow:'category',uploads:[]};
if(process.argv.includes('--resume')) result.uploads=JSON.parse(await readFile('.local-backups/media-e2e-20261025/category-result.json','utf8')).uploads;
page.on('response',async r=>{if(r.url().includes('api.cloudinary.com')&&r.request().method()==='POST'){const x=await r.json().catch(()=>({}));result.uploads.push({status:r.status(),url:x.secure_url,publicId:x.public_id});}});
try {
  await page.goto('http://localhost:8081/AdminLogin');
  await page.getByRole('textbox',{name:'Email address',exact:true}).fill(process.env.MEDIA_E2E_ADMIN_EMAIL);
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(process.env.MEDIA_E2E_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.waitForURL('**/admin-dashboard');
  await page.goto('http://localhost:8081/AdminCategories');
  if(!process.argv.includes('--resume')) {
  await page.getByRole('button',{name:'Add New Category',exact:true}).click();
  await page.getByPlaceholder('e.g. Wedding Cars').fill(title);
  for(const [button,variant,complete] of [['Choose icon image','a','Change icon image'],['Upload image','b','Change category image']]) {
    const chooser=page.waitForEvent('filechooser');
    await page.getByText(button,{exact:true}).click();
    await (await chooser).setFiles(`/private/tmp/royallagn-media-test-${variant}.png`);
    await page.getByText(complete,{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Add Category',exact:true}).click();
  await page.getByText('OK',{exact:true}).click();
  }
  const {data:category,error}=await db.from('categories').select('id,icon_url,fallback_image_url').eq('name',title).single();
  if(error) throw error; result.category=category;
  if(!category.icon_url||!category.fallback_image_url) throw new Error('Missing category media URL');
  await page.reload();
  await page.getByRole('button',{name:`Delete ${title}`,exact:true}).waitFor();result.refreshPersisted=true;
  await page.goto('http://localhost:8081/Categories');
  const card=page.getByRole('button',{name:`Browse ${title}`,exact:true});
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(id=>[...document.images].some(img=>img.src.includes(id)&&img.complete&&img.naturalWidth>0),result.uploads[1].publicId.split('/').at(-1));
  result.desktopDisplayed=true;
  await page.setViewportSize({width:390,height:844});await page.reload();await card.waitFor();await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(id=>[...document.images].some(img=>img.src.includes(id)&&img.complete&&img.naturalWidth>0),result.uploads[1].publicId.split('/').at(-1));
  result.mobileDisplayed=true;
  await page.screenshot({path:'/private/tmp/royallagn-category-test-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:8081/AdminCategories');
  await page.getByRole('button',{name:`Delete ${title}`,exact:true}).click();
  await page.getByText('Checking whether this category is in use…',{exact:true}).waitFor({state:'hidden'});
  await page.getByText('Delete Category',{exact:true}).click();
  await page.getByText('Delete Category?',{exact:true}).waitFor({state:'hidden'});
  const {data:remaining}=await db.from('categories').select('id').eq('id',category.id);
  result.databaseDeleted=remaining.length===0;
} catch(error) {result.error=error.message;process.exitCode=1;}
finally {
  await writeFile('.local-backups/media-e2e-20261025/category-result.json',JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result)); await browser.close();
}
