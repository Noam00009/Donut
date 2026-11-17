import {initialize} from './db.mjs';
import {initializeContent} from './content.mjs';

const tables={settings:['id','prices','version','content'],admin_account:['id','password_hash'],sessions:['token_hash','expires'],rate_limits:['key','attempts','resets'],orders:['id','token','client_id','fingerprint','details','status','created_at'],media:['id','mime','bytes']};
// Run only after the deployed source is in maintenance mode and writes have drained.
// A completed receipt makes deploy retries safe; an occupied target is never replaced.
export async function migrateDatabase(source,target){
 await initialize(target);await initializeContent(target);
 await target.query('CREATE TABLE IF NOT EXISTS migration_receipt(id INT PRIMARY KEY, counts JSONB NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 return target.transaction(async out=>{
  await out.query('LOCK TABLE migration_receipt IN EXCLUSIVE MODE');
  const done=(await out.query('SELECT counts FROM migration_receipt WHERE id=1')).rows[0];
  if(done)return done.counts;
  for(const table of Object.keys(tables).filter(t=>t!=='settings'))if(Number((await out.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n))throw new Error('Migration target is not empty');
  const fresh=(await out.query('SELECT version FROM settings WHERE id=1')).rows[0];
  if(fresh.version!==1)throw new Error('Migration target settings were modified');
  const counts={};
  await source.transaction(async input=>{
   await input.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   for(const [table,columns] of Object.entries(tables)){
    const rows=(await input.query(`SELECT ${columns.join(',')} FROM ${table}`)).rows;
    if(table==='settings'&&rows.length!==1)throw new Error('Missing source settings');
    for(const row of rows){
     const values=columns.map(c=>row[c]);
     const conflict=table==='settings'?' ON CONFLICT(id) DO UPDATE SET prices=EXCLUDED.prices,version=EXCLUDED.version,content=EXCLUDED.content':'';
     await out.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})${conflict}`,values);
    }
    counts[table]=rows.length;
    if(Number((await out.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n)!==rows.length)throw new Error('Migration row count mismatch');
   }
  });
  await out.query("SELECT setval(pg_get_serial_sequence('orders','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM orders");
  await out.query('INSERT INTO migration_receipt(id,counts) VALUES(1,$1)',[counts]);
  return counts;
 });
}
