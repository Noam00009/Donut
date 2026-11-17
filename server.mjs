import http from 'node:http';
import {defaultContent,initializeContent,validateContent,patchContent} from './content.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,timingSafeEqual,scrypt as scryptCb} from 'node:crypto';
import {promisify} from 'node:util';
import {postgres,initialize,defaults} from './db.mjs';
const scrypt=promisify(scryptCb), root=fileURLToPath(new URL('./public/',import.meta.url));
const flavors={'9ba29b24-0038-442f-a0f9-feb9b586e117':'אוראו עם מילוי וניל','60a3eccb-5a39-4fc2-9ac0-3b2cab3ae58e':'דובדבן עם מילוי דובדבן'};
const hours=[[930,1080],[930,1260],[870,1260],null,[990,1260],[750,960],[1040,1320]];
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
export async function passwordHash(p){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(p,salt,64)).toString('hex');}
async function passwordValid(p,s){if(typeof p!=='string'||p.length>200||!s)return false;const [salt,key]=s.split(':');return equal((await scrypt(p,salt,64)).toString('hex'),key);}
const fail=(message,status=400,field)=>{throw Object.assign(new Error(message),{status,field});};
async function body(req,max=32000){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>max)fail('הבקשה גדולה מדי',413);}try{return JSON.parse(text);}catch{fail('בקשה לא תקינה');}}
function israelNow(now=new Date()){return new Date(now.toLocaleString('en-US',{timeZone:'Asia/Jerusalem'}));}
export function validateOrder(b,now=new Date(),content=defaultContent){
 if(typeof b.name!=='string'||b.name.trim().length<2||b.name.trim().length>80)fail('נא להזין שם מלא');
 const phone=String(b.phone||'').replace(/[\s-]/g,'').replace(/^\+972/,'0');if(!/^05\d{8}$/.test(phone))fail('מספר הטלפון אינו תקין');
 if(b.website)fail('הבקשה לא התקבלה');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>2)fail('הסל אינו תקין');
 const flavors=Object.fromEntries(content.flavors.filter(f=>!f.is_sold_out).map(f=>[f.id,f.name]));const hours=content.hours.map(h=>h.closed?null:[h.open,h.close].map(t=>{const [a,b]=t.split(':').map(Number);return a*60+b;}));const seen=new Set();let count=0;
 const items=b.items.map(x=>{if(!flavors[x.flavor_id]||seen.has(x.flavor_id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>48)fail('הסל אינו תקין');seen.add(x.flavor_id);count+=x.quantity;return {flavor_id:x.flavor_id,name:flavors[x.flavor_id],quantity:x.quantity};});
 if(count>48)fail('אפשר להזמין עד 48 דונאטס');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.pickup_date||'')||!/^\d{2}:\d{2}$/.test(b.pickup_time||''))fail('נא לבחור מועד איסוף',400,'pickup');
 const date=new Date(b.pickup_date+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==b.pickup_date)fail('תאריך לא תקין',400,'pickup');
 const current=israelNow(now),today=Date.UTC(current.getFullYear(),current.getMonth(),current.getDate());const diff=(+date-today)/86400000;
 const [h,m]=b.pickup_time.split(':').map(Number), minute=h*60+m, schedule=hours[date.getUTCDay()];
 if(diff<0||diff>6||!schedule||h>23||m>59||minute<schedule[0]||minute>=schedule[1]||minute%15!==0||(diff===0&&minute<current.getHours()*60+current.getMinutes()+30))fail('המועד אינו זמין. בחרו זמן איסוף אחר.',400,'pickup');
 if(!['cash','bit'].includes(b.payment_method))fail('אמצעי תשלום לא תקין');
 if(typeof b.note!=='string'||b.note.length>1000)fail('ההערה ארוכה מדי');
 return {name:b.name.trim(),phone,items,count,pickup_date:b.pickup_date,pickup_time:b.pickup_time,payment_method:b.payment_method,bit_paid:b.payment_method==='bit'&&b.bit_paid===true,note:b.note.trim()};
}
export function totalFor(count,p){return Math.floor(count/p.bundle_size)*Math.round(p.bundle_price*100)+(count%p.bundle_size)*Math.round(p.single_price*100);}
export function patchHtml(html,pricing,bitPhone=''){
 html=html.replace(/self\.__next_f\.push\((.*?)\)<\/script>/gs,(all,payload)=>{
  try{const a=JSON.parse(payload);if(typeof a[1]==='string'){
   for(const [key,value] of Object.entries(pricing.prices))a[1]=a[1].replace(new RegExp('"'+key+'":\\d+(?:\\.\\d+)?','g'),'"'+key+'":'+value);
   a[1]=a[1].replace(/"bit_phone":"[^"]*"/g,'"bit_phone":'+JSON.stringify(bitPhone)).replace(/"contact_phone":"[^"]*"/g,'"contact_phone":""');
  }return 'self.__next_f.push('+JSON.stringify(a).replace(/</g,'\\u003c')+')</script>';}catch{return all;}
 });
 const fmt=n=>Number(n).toLocaleString('he-IL',{maximumFractionDigits:2});
 html=html.replace(/8 ₪/g,fmt(pricing.prices.single_price)+' ₪').replace(/90 ₪/g,fmt(pricing.prices.bundle_price)+' ₪').replace(/96 ₪/g,fmt(pricing.prices.single_price*12)+' ₪');
 return html.replace('<head>','<head><script>window.DONUT_CONFIG='+JSON.stringify({version:pricing.version,bitEnabled:!!bitPhone})+';</script><script src="/standalone.js"></script>');
}
export async function createApp({db=null,setupToken='',secure=false,bitPhone='',now=()=>new Date(),maintenance=false}={}){
 if(db){await initialize(db);await initializeContent(db);}
 const settings=async()=>db?(await db.query('SELECT prices,version,content FROM settings WHERE id=1')).rows[0]:{prices:defaults,version:1,content:defaultContent};
 async function limit(key,max,ms){const n=Date.now();await db.query('DELETE FROM rate_limits WHERE resets < $1',[n]);const r=await db.query(`INSERT INTO rate_limits(key,attempts,resets) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=rate_limits.attempts+1 RETURNING attempts`,[key,n+ms]);if(r.rows[0].attempts>max)fail('יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.',429);}
 return http.createServer(async(req,res)=>{
  const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  try{
   const u=new URL(req.url,'http://localhost'),p=u.pathname,mutating=!['GET','HEAD'].includes(req.method);
   if(mutating){const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)fail('הבקשה נדחתה',403);if(req.headers['sec-fetch-site']==='cross-site')fail('הבקשה נדחתה',403);if(!req.headers['content-type']?.startsWith('application/json'))fail('נדרש JSON',415);}
   if(p==='/health')return send(200,{ok:true,database:!!db,maintenance});
   if(maintenance&&mutating&&p.startsWith('/api/')){res.setHeader('Retry-After','120');fail('המערכת מתעדכנת כרגע. נסו שוב בעוד מספר דקות.',503);}
   if(p==='/api/settings'&&req.method==='GET')return send(200,await settings());
   if(p.startsWith('/api/')&&!db)fail('מערכת ההזמנות עדיין בתהליך חיבור. נסו שוב מאוחר יותר.',503);
   const ip=hash(req.headers['x-forwarded-for']?.split(',').pop()?.trim()||req.socket.remoteAddress||'');
   const cookie=/\bdonut_session=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];
   const auth=async()=>{if(!cookie||!(await db.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND expires>$2',[hash(cookie),Date.now()])).rows.length)fail('יש להתחבר לניהול',401);};
   const session=async()=>{await db.query('DELETE FROM sessions WHERE expires<$1',[Date.now()]);const t=randomBytes(32).toString('hex');await db.query('INSERT INTO sessions(token_hash,expires) VALUES($1,$2)',[hash(t),Date.now()+43200000]);res.setHeader('Set-Cookie',`donut_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`);};
   if(p==='/api/admin/session'&&req.method==='GET'){const setup=!(await db.query('SELECT 1 FROM admin_account')).rows.length;try{await auth();return send(200,{authenticated:true,setup:false});}catch{return send(200,{authenticated:false,setup});}}
   if(p==='/api/admin/setup'&&req.method==='POST'){
    await limit('login:'+ip,10,900000);const b=await body(req);
    if(!setupToken||typeof b.code!=='string'||!equal(b.code,setupToken))fail('קוד ההקמה אינו נכון',403);
    if(typeof b.password!=='string'||b.password.length<12||b.password.length>200)fail('בחרו סיסמה באורך 12 תווים לפחות');
    const r=await db.query('INSERT INTO admin_account(id,password_hash) VALUES(1,$1) ON CONFLICT DO NOTHING RETURNING id',[await passwordHash(b.password)]);if(!r.rows.length)fail('חשבון המנהל כבר הוגדר',409);
    await session();return send(201,{ok:true});
   }
   if(p==='/api/admin/login'&&req.method==='POST'){await limit('login:'+ip,10,900000);const b=await body(req),a=(await db.query('SELECT password_hash FROM admin_account WHERE id=1')).rows[0];if(!await passwordValid(b.password,a?.password_hash))fail('הסיסמה אינה נכונה',401);await session();return send(200,{ok:true});}
   if(p.startsWith('/api/admin/')){
    await auth();
    if(p==='/api/admin/content'&&req.method==='PUT'){const b=await body(req);const content=validateContent(b.content);for(const url of [content.hero_image,...content.flavors.map(f=>f.image_url)])if(url.startsWith('/media/')&&!(await db.query('SELECT 1 FROM media WHERE id=$1',[url.split('/').pop()])).rows.length)fail('התמונה לא נמצאה. העלו אותה שוב.');const r=await db.query('UPDATE settings SET content=$1,version=version+1 WHERE id=1 AND version=$2 RETURNING prices,version,content',[content,b.version]);if(!r.rows.length)fail('התוכן עודכן בחלון אחר. רעננו ונסו שוב.',409);return send(200,r.rows[0]);}
    if(p==='/api/admin/media'&&req.method==='POST'){const b=await body(req,2900000);if(typeof b.data!=='string'||(b.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)))fail('קובץ לא תקין');const bytes=Buffer.from(b.data,'base64');if(!bytes.length||bytes.length>2*1024*1024)fail('התמונה צריכה להיות עד 2MB');const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;if(!type)fail('ניתן להעלות JPG, PNG או WebP בלבד');const id=randomBytes(16).toString('hex');await db.query('INSERT INTO media(id,mime,bytes) VALUES($1,$2,$3)',[id,type,bytes]);return send(201,{url:'/media/'+id});}
    if(p==='/api/admin/logout'&&req.method==='POST'){await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(cookie)]);res.setHeader('Set-Cookie',`donut_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);return send(200,{ok:true});}
    if(p==='/api/admin/settings'&&req.method==='PUT'){const b=await body(req);for(const k of ['single_price','bundle_price'])if(typeof b[k]!=='number'||!Number.isFinite(b[k])||b[k]<1||b[k]>10000||Math.abs(b[k]*100-Math.round(b[k]*100))>1e-7)fail('המחיר חייב להיות בין 1 ל־10,000 ₪, עד שתי ספרות אחרי הנקודה');if(b.bundle_price>b.single_price*12)fail('מחיר מארז לא יכול להיות גבוה ממחיר 12 יחידות');const r=await db.query('UPDATE settings SET prices=$1, version=version+1 WHERE id=1 AND version=$2 RETURNING prices,version',[{single_price:b.single_price,bundle_price:b.bundle_price,bundle_size:12},b.version]);if(!r.rows.length)fail('המחירים השתנו בחלון אחר. רעננו ונסו שוב.',409);return send(200,r.rows[0]);}
    if(p==='/api/admin/orders'&&req.method==='GET'){const before=Number(u.searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)fail('עמוד לא תקין');const rows=(await db.query('SELECT id,details,status,created_at FROM orders WHERE id<$1 ORDER BY id DESC LIMIT 101',[before])).rows;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());const summary=(await db.query("SELECT MAX(id) AS latest, COUNT(*) FILTER(WHERE status='new') AS new_count, COUNT(*) FILTER(WHERE status IN ('new','preparing','ready')) AS active_count, COALESCE(SUM((details->>'count')::int) FILTER(WHERE details->>'pickup_date'=$1 AND status NOT IN ('cancelled','collected')),0) AS donut_count FROM orders",[today])).rows[0];return send(200,{orders:rows.slice(0,100),hasMore:rows.length>100,latest:Number(summary.latest||0),summary});}
    if(/^\/api\/admin\/orders\/\d+$/.test(p)&&req.method==='PATCH'){const b=await body(req);if(!['new','preparing','ready','collected','cancelled'].includes(b.status))fail('מצב לא תקין');const r=await db.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING id',[b.status,p.split('/').pop()]);if(!r.rows.length)fail('הזמנה לא נמצאה',404);return send(200,{ok:true});}
    fail('לא נמצא',404);
   }
   if(p==='/api/orders'&&req.method==='POST'){
    await limit('order:'+ip,20,600000);if(!(await db.query('SELECT 1 FROM admin_account')).rows.length)fail('החנות עדיין אינה פתוחה לקבלת הזמנות',503);
    const b=await body(req);if(!/^[a-f0-9-]{36}$/.test(b.client_id||''))fail('נא לרענן את הדף ולנסות שוב');
    const current=await settings();const details=validateOrder(b,now(),current.content);details.pickup_address=current.content.address;if(details.payment_method==='bit'&&!bitPhone)fail('תשלום בביט טרם הוגדר. ניתן לשלם במזומן באיסוף.');
    const fingerprint=hash(JSON.stringify(details));
    const r=await db.transaction(async c=>{
     const existing=(await c.query('SELECT id,token,fingerprint FROM orders WHERE client_id=$1',[b.client_id])).rows[0];if(existing){if(existing.fingerprint!==fingerprint)fail('מזהה הזמנה כבר בשימוש',409);return existing;}
     const s=(await c.query('SELECT prices,version,content FROM settings WHERE id=1 FOR SHARE')).rows[0];if(b.price_version!==s.version)fail('המחירים עודכנו. רעננו את הדף כדי לאשר את המחיר החדש.',409);
     details.total_cents=totalFor(details.count,s.prices);details.prices=s.prices;
     const token=randomBytes(24).toString('hex');
     const result=await c.query('INSERT INTO orders(token,client_id,fingerprint,details) VALUES($1,$2,$3,$4) ON CONFLICT(client_id) DO NOTHING RETURNING id,token,fingerprint',[token,b.client_id,fingerprint,details]);
     const saved=result.rows[0]||(await c.query('SELECT id,token,fingerprint FROM orders WHERE client_id=$1',[b.client_id])).rows[0];if(saved.fingerprint!==fingerprint)fail('מזהה הזמנה כבר בשימוש',409);return saved;
    });return send(201,{ok:true,token:r.token,orderNumber:Number(r.id)});
   }
   if(/^\/api\/order\/[a-f0-9]{48}$/.test(p)&&req.method==='GET'){const r=(await db.query('SELECT id,details,status,created_at FROM orders WHERE token=$1',[p.split('/').pop()])).rows[0];if(!r)fail('ההזמנה לא נמצאה',404);return send(200,r);}
   if(p.startsWith('/api/'))fail('לא נמצא',404);
   if(!['GET','HEAD'].includes(req.method))fail('פעולה לא נתמכת',405);
   let pathname=decodeURIComponent(p);
   if(p==='/_next/image')pathname=u.searchParams.get('url')||'';
   if(/^\/media\/[a-f0-9]{32}$/.test(pathname)){const image=db?(await db.query('SELECT mime,bytes FROM media WHERE id=$1',[pathname.split('/').pop()])).rows[0]:null;if(!image)fail('תמונה לא נמצאה',404);res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'public, max-age=31536000, immutable'});return res.end(Buffer.from(image.bytes));}
   if(pathname==='/')pathname='/index.html';
   if(['/order','/order/'].includes(pathname))pathname='/order/index.html';
   if(['/admin','/admin/'].includes(pathname))pathname='/admin.html';
   if(/^\/o\/[a-f0-9]{48}$/.test(pathname))pathname='/confirmation.html';
   if(!pathname.startsWith('/')||pathname.includes('\0'))fail('לא נמצא',404);
   const filename=path.resolve(root,'.'+pathname);if(!filename.startsWith(root))fail('לא נמצא',404);
   let data=await readFile(filename);
   if(filename===root+'index.html'||filename===root+'order/index.html'){const config=await settings();data=Buffer.from(patchContent(patchHtml(data.toString(),config,bitPhone),config.content));}
   res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':/\.(html|js)$/.test(filename)?'no-store':'public, max-age=86400'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(res.headersSent){res.end();return;}const status=e.status||(e.code==='ENOENT'?404:500);if(status===500)console.error('Request failed:',e.code||e.name);send(status,{ok:false,message:status===500?'אירעה תקלה זמנית. נסו שוב.':e.message,field:e.field});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let db=process.env.DATABASE_URL?postgres(process.env.DATABASE_URL):null;
 if(process.env.MIGRATION_TARGET_URL){
  if(process.env.MAINTENANCE_MODE!=='true'||!db)throw new Error('Migration requires maintenance and source database');
  const target=postgres(process.env.MIGRATION_TARGET_URL);
  const {migrateDatabase}=await import('./migrate.mjs');
  console.log('Database migration verified:',JSON.stringify(await migrateDatabase(db,target)));
  await db.close();db=target;
 }
 const server=await createApp({db,setupToken:process.env.ADMIN_SETUP_TOKEN,secure:process.env.NODE_ENV==='production',bitPhone:process.env.BIT_PHONE||'',maintenance:process.env.MAINTENANCE_MODE==='true'});
 server.listen(Number(process.env.PORT)||3000,'0.0.0.0');process.on('SIGTERM',()=>server.close(async()=>{if(db)await db.close();process.exit(0);}));
}
