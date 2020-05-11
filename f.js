const CacheableLookup = require('.');
const cacheable = new CacheableLookup();

cacheable.servers = ['127.0.0.1'];

setInterval(() => {
	cacheable.lookup(`${Math.random().toString().substr(2)}.test`, () => {});
}, 1);

setInterval(() => {
	console.log(cacheable._cache.size, Object.keys(cacheable._pending).length, cacheable._nextRemovalTime);
}, 1000);
