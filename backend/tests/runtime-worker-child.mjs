/** Independent process for disposable runtime concurrency/crash verification. */
import {InterviewRuntime} from '../dist/runtime/worker.js';
import {pool} from '../dist/config/db.js';
import redis from '../dist/config/redisConfig.js';
if(process.env.NODE_ENV!=='test' || !process.env.DATABASE_URL?.includes('@127.0.0.1:15432/techvera_phase5_') || process.env.REDIS_URL!=='redis://127.0.0.1:16379/14')throw new Error('Disposable fixture required');
const runtime=new InterviewRuntime({leaseMs:400,pollMs:50,retryMs:50});await runtime.start();
process.send?.({ready:true,owner:runtime.owner});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await runtime.stop(true);redis.disconnect();await pool.end();process.exit(0);}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
process.on('message',message=>{if(message?.operationId)void runtime.process(message.operationId).then(()=>process.send?.({processed:message.operationId}));});
