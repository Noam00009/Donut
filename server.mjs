import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};

// This is a standalone frontend snapshot. Orders stay disabled until a separate
// merchant backend is implemented. Never send customer data to the source site.
export const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:false,message:'זהו עותק לתצוגה. קבלת הזמנות תופעל לאחר חיבור מערכת ההזמנות של העסק.'}));return;
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  try {
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/_next/image') pathname=url.searchParams.get('url') || '';
    if (!pathname.startsWith('/') || pathname.includes('\0')) throw new Error('Invalid path');
    if (pathname==='/' || pathname==='/index.html') pathname='/index.html';
    if (pathname==='/order' || pathname==='/order/') pathname='/order/index.html';
    const filename=path.resolve(root,'.'+pathname);
    if (!filename.startsWith(root)) throw new Error('Invalid path');
    let data=await readFile(filename);
    if (filename.endsWith('.html')) {
      let html=data.toString();
      // Full document navigation avoids relying on the original Next.js server.
      html=html.replace('<head>','<head><script src="/standalone.js"></script>');
      // Do not display the source merchant\'s payment number in a new deployment.
      html=html.replaceAll('0505074954', process.env.BIT_PHONE || 'לא הוגדר');
      data=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':filename.endsWith('.html')?'no-store':'public, max-age=86400'});
    res.end(req.method==='HEAD'?undefined:data);
  } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('לא נמצא');}
});
if (process.argv[1]===fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT)||3000,'0.0.0.0');
