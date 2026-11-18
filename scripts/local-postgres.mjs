import EmbeddedPostgres from 'embedded-postgres';
import {config} from 'dotenv';
import {existsSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..');
function isLoopbackPortBusy(port,host='127.0.0.1'){
  return new Promise(res=>{
    const s=createConnection({host,port});
    const done=v=>{s.removeAllListeners();s.destroy();res(v);};
    s.setTimeout(500,()=>done(false));
    s.once('connect',()=>done(true));
    s.once('error',()=>done(false));
  });
}
export async function startLocalPostgres(){
config({path:resolve(root,'.env'),quiet:true});
const url=new URL(process.env.DATABASE_URL||'');
if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Local PostgreSQL supports loopback URLs only. Use npm run dev:app for an external database.');
const pgPort=Number(url.port||5432);
const databaseDir=resolve(root,'.local/postgres');
mkdirSync(resolve(root,'.local'),{recursive:true});
const pg=new EmbeddedPostgres({databaseDir,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),port:pgPort,persistent:true,authMethod:'scram-sha-256',initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:message=>{if(process.env.DEBUG_POSTGRES)console.log(message);},onError:console.error});
if(!existsSync(resolve(databaseDir,'PG_VERSION')))await pg.initialise();
const windows=process.platform==='win32';
const pgCtl=resolve(root,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
let startedHere=false;
async function stop(){
  if(!startedHere)return;
  if(windows)execFileSync(pgCtl,['stop','-D',databaseDir,'-m','fast','-w','-t','20'],{stdio:'inherit',windowsHide:true});
  else await pg.stop();
  startedHere=false;
}
try{
if(windows){
  // pg_ctl creates a restricted child token, so an elevated developer terminal
  // can start PostgreSQL without users, services, or changed system privileges.
  let running=false;
  try{execFileSync(pgCtl,['status','-D',databaseDir],{stdio:'ignore',windowsHide:true});running=true;}
  catch{running=false;}
  if(!running){
    if(await isLoopbackPortBusy(pgPort)){
      throw new Error(`Port 127.0.0.1:${pgPort} is already in use by another process. Stop the conflicting PostgreSQL instance or update DATABASE_URL.`);
    }
    execFileSync(pgCtl,['start','-D',databaseDir,'-l',resolve(root,'.local/postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort}`,'-w','-t','60'],{stdio:'inherit',windowsHide:true});
    startedHere=true;
  }
}else{await pg.start();startedHere=true;}
if(!process.env.UZBITE_SKIP_CREATE_DB){
  const database=url.pathname.slice(1);
  if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(database))throw new Error('Expected a simple local database name.');
  const client=pg.getPgClient('postgres','127.0.0.1');
  try{await client.connect();try{await client.query(`CREATE DATABASE "${database}"`);}catch(error){if(error.code!=='42P04')throw error;}}
  finally{await client.end();}
}
console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port||5432}. Data persists in .local/postgres.`);
return stop;
}catch(error){await stop();throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const stopDatabase=await startLocalPostgres();
const keepAlive=setInterval(()=>{},60_000);
let stopping=false;
async function stop(){if(stopping)return;stopping=true;try{await stopDatabase();}finally{clearInterval(keepAlive);}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
