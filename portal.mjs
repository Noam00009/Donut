import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./public/',import.meta.url));
export function createPortal(shop,{redirectOnly=false}={}){
 const upstream=new URL(shop);if(!['https:','http:'].includes(upstream.protocol))throw Error('Invalid shop origin');
 return http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
  if(redirectOnly){res.writeHead(302,{Location:upstream.origin+'/admin','Cache-Control':'no-store'});return res.end();}
  if(u.pathname.startsWith('/api/admin/')||u.pathname==='/api/settings'||/^\/media\/[a-f0-9]{32}$/.test(u.pathname)){
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);return res.end('{"message":"הבקשה נדחתה"}');}
   let body=Buffer.alloc(0);for await(const chunk of req){body=Buffer.concat([body,chunk]);if(body.length>2900000){res.writeHead(413);return res.end('{"message":"הקובץ גדול מדי"}');}}
   const r=await fetch(new URL(u.pathname+u.search,upstream),{method:req.method,headers:{'Content-Type':'application/json',Origin:upstream.origin,...(req.headers.cookie?{Cookie:req.headers.cookie}:{})},body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'error',signal:AbortSignal.timeout(60000)});
   res.statusCode=r.status;res.setHeader('Content-Type',r.headers.get('content-type')||'application/json');res.setHeader('Cache-Control',u.pathname.startsWith('/media/')?'public,max-age=86400':'no-store');const cookie=r.headers.get('set-cookie');if(cookie)res.setHeader('Set-Cookie',cookie);return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let p=u.pathname;if(p==='/'||p==='/admin'||p==='/admin/')p='/admin.html';
  if(!/^\/(admin\.(html|js|css)|editor\.js|icon\.svg|images\/[a-zA-Z0-9/._-]+|_next\/static\/immutable\/media\/[a-zA-Z0-9._-]+)$/.test(p)){res.writeHead(404);return res.end();}
  const file=path.resolve(root,'.'+p);if(!file.startsWith(root)){res.writeHead(404);return res.end();}
  let data=await readFile(file);if(p==='/admin.html')data=Buffer.from(data.toString().replaceAll('href="/"','href="'+upstream.origin+'/"'));
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'});res.end('{"message":"החנות מתחברת. נסו שוב בעוד רגע."}');}});
}
if(process.argv[1]===fileURLToPath(import.meta.url))createPortal(process.env.SHOP_URL||'https://donutan-site.onrender.com',{redirectOnly:process.env.REDIRECT_ADMIN==='true'}).listen(Number(process.env.PORT)||3000,'0.0.0.0');
