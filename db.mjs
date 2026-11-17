import pg from 'pg';
export function postgres(url) {
 const pool=new pg.Pool({connectionString:url,max:5,connectionTimeoutMillis:10000});
 return {query:(...args)=>pool.query(...args),close:()=>pool.end(),transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
}
export const defaults={single_price:8,bundle_price:90,bundle_size:12};
export async function initialize(db){
 const schema=`CREATE TABLE IF NOT EXISTS settings(id INT PRIMARY KEY CHECK(id=1), prices JSONB NOT NULL, version INT NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS admin_account(id INT PRIMARY KEY CHECK(id=1), password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, expires BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, attempts INT NOT NULL, resets BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY, token TEXT UNIQUE NOT NULL, client_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, details JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);`;
 for(const statement of schema.split(';').filter(s=>s.trim())) await db.query(statement);
 await db.query('INSERT INTO settings(id,prices) VALUES(1,$1) ON CONFLICT DO NOTHING',[defaults]);
}
