export const defaultContent={title1:'דונאטס',title2:'שנמסים בפה',tagline:'בוחרים, מזמינים ואוספים ממשמר דוד.',address:'כנרת 11, משמר דוד',hero_image:'/images/hero-donut.webp',flavors:[{id:'9ba29b24-0038-442f-a0f9-feb9b586e117',name:'אוראו עם מילוי וניל',description:'בצק רך ואוורירי, פירורי אוראו מלמעלה וקרם וניל חלק בפנים.',image_url:'/images/flavors/oreo.webp',is_sold_out:false},{id:'60a3eccb-5a39-4fc2-9ac0-3b2cab3ae58e',name:'דובדבן עם מילוי דובדבן',description:'בצק רך ואוורירי עם מילוי עסיסי בטעם דובדבן.',image_url:'/images/flavors/cherry.webp',is_sold_out:false}],hours:[{open:'15:30',close:'18:00',closed:false},{open:'15:30',close:'21:00',closed:false},{open:'14:30',close:'21:00',closed:false},{open:'15:30',close:'21:00',closed:true},{open:'16:30',close:'21:00',closed:false},{open:'12:30',close:'16:00',closed:false},{open:'17:20',close:'22:00',closed:false}]};
export async function initializeContent(db){await db.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS content JSONB');await db.query('UPDATE settings SET content=$1 WHERE content IS NULL',[defaultContent]);await db.query('CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BYTEA NOT NULL)');}
const bad=()=>{throw Object.assign(new Error('פרטי התוכן אינם תקינים. בדקו את הטקסט, התמונות ושעות הפתיחה.'),{status:400});};
export function validateContent(input){
 const text=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>n||/[<>\u0000-\u0008]/.test(v))bad();return v.trim();};
 const image=v=>{if(typeof v!=='string'||!/^\/(?:images\/(?:hero-donut|flavors\/(?:oreo|cherry))\.webp|media\/[a-f0-9]{32})$/.test(v))bad();return v;};
 const c={title1:text(input.title1,50),title2:text(input.title2,80),tagline:text(input.tagline,180),address:text(input.address,160),hero_image:image(input.hero_image)};
 if(!Array.isArray(input.flavors)||input.flavors.length!==2)bad();
 c.flavors=defaultContent.flavors.map(original=>{const f=input.flavors.find(f=>f.id===original.id);if(!f||typeof f.is_sold_out!=='boolean')bad();return {id:original.id,name:text(f.name,70),description:text(f.description,350),image_url:image(f.image_url),is_sold_out:f.is_sold_out};});
 if(!Array.isArray(input.hours)||input.hours.length!==7)bad();
 c.hours=input.hours.map(h=>{if(typeof h.closed!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.open)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.close)||(!h.closed&&h.open>=h.close))bad();return {open:h.open,close:h.close,closed:h.closed};});return c;
}
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function patchContent(html,c){
 const replacements=new Map(['title1','title2','tagline','address','hero_image'].map(k=>[defaultContent[k],c[k]]));
 for(let i=0;i<2;i++)for(const k of ['name','description','image_url'])replacements.set(defaultContent.flavors[i][k],c.flavors[i][k]);
 function walk(v,key){
  if(key==='hours')return c.hours;
  if(key==='pickup_address')return c.address;
  if(typeof v==='string')return replacements.get(v)??v;
  if(Array.isArray(v))return v.map(x=>walk(x));
  if(v&&typeof v==='object'){
   const flavor=c.flavors.find(f=>f.id===v.id);if(flavor)return {...v,...flavor};
   return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,k)]));
  }return v;
 }
 // Patch actual React flight records, preserving references and streamed SVG data.
 const scripts=[];html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,script=>{
  script=script.replace(/self\.__next_f\.push\((.*?)\)<\/script>/s,(all,raw)=>{try{const payload=JSON.parse(raw);if(typeof payload[1]==='string')payload[1]=payload[1].split('\n').map(line=>{const at=line.indexOf(':');if(at<0)return line;try{return line.slice(0,at+1)+JSON.stringify(walk(JSON.parse(line.slice(at+1))));}catch{return line;}}).join('\n');return 'self.__next_f.push('+JSON.stringify(payload).replace(/</g,'\\u003c')+')</script>';}catch{return all;}});
  scripts.push(script);return `<!--DONUT_SCRIPT_${scripts.length-1}-->`;
 });
 html=html.replace(/>([^<>]+)</g,(all,txt)=>'>'+ (replacements.has(txt)?esc(replacements.get(txt)):txt)+'<');
 for(const [old,next] of replacements)if(old.startsWith('/images/'))html=html.split(old).join(esc(next)).split(encodeURIComponent(old)).join(encodeURIComponent(next));
 return html.replace(/<!--DONUT_SCRIPT_(\d+)-->/g,(_,i)=>scripts[Number(i)]);
}
