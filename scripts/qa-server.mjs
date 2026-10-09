import { createRuntime } from './local-runtime.mjs';
import { createServer } from 'vite';
const runtime=await createRuntime({port:8787,persist:false});
const server=await createServer({server:{host:'127.0.0.1',port:5173,strictPort:true}});
await server.listen();
console.log('QA frontend http://127.0.0.1:5173/; Worker http://127.0.0.1:8787/');
console.log('Bootstrap HTTP', (await fetch('http://127.0.0.1:5173/api/bootstrap')).status);
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await server.close();await runtime.dispose();process.exit(0)});
