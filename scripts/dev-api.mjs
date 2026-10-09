import { createRuntime } from './local-runtime.mjs';
const runtime = await createRuntime();
console.log(`Local Worker ready at ${await runtime.ready}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await runtime.dispose(); process.exit(0); });
