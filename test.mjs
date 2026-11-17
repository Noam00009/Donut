import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {server} from './server.mjs';
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(()=>server.close());
test('Home and checkout use local assets and standalone navigation',async()=>{
  for(const route of ['/', '/order']) {
    const res=await fetch(base+route);assert.equal(res.status,200);
    const html=await res.text();assert.ok(html.includes('/standalone.js'));
    assert.ok(!html.includes('0505074954'));
    const assets=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(x=>x.startsWith('/')&&!x.startsWith('/order'));
    for(const asset of new Set(assets)) assert.equal((await fetch(base+asset)).status,200,asset);
  }
});
test('Demo does not accept or forward orders',async()=>{
  const res=await fetch(base+'/api/orders',{method:'POST',body:'{}'});
  assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
});
test('Missing files are 404',async()=>assert.equal((await fetch(base+'/missing-file')).status,404));
