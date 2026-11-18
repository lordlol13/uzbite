import {config} from 'dotenv';
import pg from 'pg';
config({quiet:true});
const url=new URL(process.env.DATABASE_URL);
const database=url.pathname.slice(1);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(database))throw new Error('Expected a local database name.');
url.pathname='/postgres';
const client=new pg.Client({connectionString:url.toString()});
await client.connect();
try{await client.query(`CREATE DATABASE "${database}"`);}catch(error){if(error.code!=='42P04')throw error;}
await client.end();console.log('Local database is ready.');
