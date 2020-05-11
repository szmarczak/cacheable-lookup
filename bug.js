const {Resolver} = require('dns').promises;

const resolver = new Resolver();

resolver.setServers([
	'127.0.0.1'
]);

const withTtl = {ttl: true};

let pending = 0;

const resolve4 = async hostname => {
	pending++;

	const result = await resolver.resolve4(hostname, withTtl);

	pending--;

	return result;
};

setInterval(() => {
	resolve4(`${Math.random().toString().substr(2)}.test`);
}, 1);

setInterval(() => {
	console.log(pending);
}, 1000);
