const app = require('../server.cjs');

console.log('✅ server.cjs successfully loaded and exported app instance!');
console.log('App stack layers:', app._router ? app._router.stack.length : 'N/A');
process.exit(0);
