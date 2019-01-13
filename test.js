import {V4MAPPED, ADDRCONFIG} from 'dns';
import {promisify} from 'util';
import test from 'ava';
import proxyquire from 'proxyquire';
import CacheableLookup from '.';

const mockedInterfaces = (options = {}) => {
	const interfaces = {
		lo: [
			{
				internal: true
			}
		],
		eth0: []
	};

	if (options.has4) {
		interfaces.eth0.push({
			address: '192.168.0.111',
			netmask: '255.255.255.0',
			family: 'IPv4',
			mac: '00:00:00:00:00:00',
			internal: false,
			cidr: '192.168.0.111/24'
		});
	}

	if (options.has6) {
		interfaces.eth0.push({
			address: 'fe80::c962:2946:a4e2:9f05',
			netmask: 'ffff:ffff:ffff:ffff::',
			family: 'IPv6',
			mac: '00:00:00:00:00:00',
			scopeid: 8,
			internal: false,
			cidr: 'fe80::c962:2946:a4e2:9f05/64'
		});
	}

	return proxyquire('.', {
		os: {
			networkInterfaces: () => interfaces
		}
	});
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class HostnameDoesntExistError extends Error {}

const resolver = {
	servers: ['127.0.0.1'],
	getServers() {
		return [...resolver.servers];
	},
	setServers(servers) {
		resolver.servers = servers;
	},
	resolve: (hostname, options, callback) => {
		if (hostname === 'undefined') {
			callback(new HostnameDoesntExistError());
			return;
		}

		let data;
		for (const server of resolver.servers) {
			if (resolver.data[server][hostname]) {
				data = resolver.data[server][hostname];
				break;
			}
		}

		if (!data) {
			callback(null, undefined);
			return;
		}

		if (options.family === 4 || options.family === 6) {
			data = data.filter(entry => entry.family === options.family);
		}

		callback(null, JSON.parse(JSON.stringify(data)));
	},
	resolve4: (hostname, options, callback) => {
		return resolver.resolve(hostname, {...options, family: 4}, callback);
	},
	resolve6: (hostname, options, callback) => {
		return resolver.resolve(hostname, {...options, family: 6}, callback);
	},
	data: {
		'127.0.0.1': {
			localhost: [
				{address: '127.0.0.1', family: 4, ttl: 60},
				{address: '::ffff:127.0.0.2', family: 6, ttl: 60}
			],
			temporary: [
				{address: '127.0.0.1', family: 4, ttl: 1}
			],
			ttl: [
				{address: '127.0.0.1', family: 4, ttl: 1}
			],
			maxTtl: [
				{address: '127.0.0.1', family: 4, ttl: 60}
			],
			static4: [
				{address: '127.0.0.1', family: 4, ttl: 1}
			]
		},
		'192.168.0.100': {
			unique: [
				{address: '127.0.0.1', family: 4, ttl: 60}
			]
		}
	}
};

test('if `options.all` is falsy, then `options.family` is 4 when not defined', async t => {
	const cacheable = new CacheableLookup({resolver});

	const entry = await cacheable.lookupAsync('localhost');
	t.deepEqual(entry, {
		address: '127.0.0.1',
		family: 4
	});
});

test('options.family', async t => {
	const cacheable = new CacheableLookup({resolver});

	// IPv4
	let entry = await cacheable.lookupAsync('localhost', {family: 4});
	t.is(entry.address, '127.0.0.1');
	t.is(entry.family, 4);

	// IPv6
	entry = await cacheable.lookupAsync('localhost', {family: 6});
	t.is(entry.address, '::ffff:127.0.0.2');
	t.is(entry.family, 6);
});

test('options.all', async t => {
	const cacheable = new CacheableLookup({resolver});

	const entries = await cacheable.lookupAsync('localhost', {all: true});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4},
		{address: '::ffff:127.0.0.2', family: 6}
	]);
});

test('options.all mixed with options.family', async t => {
	const cacheable = new CacheableLookup({resolver});

	// IPv4
	let entries = await cacheable.lookupAsync('localhost', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// IPv6
	entries = await cacheable.lookupAsync('localhost', {all: true, family: 6});
	t.deepEqual(entries, [
		{address: '::ffff:127.0.0.2', family: 6}
	]);
});

test('V4MAPPED hint', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	let entries = await cacheable.lookupAsync('static4', {family: 6});
	t.is(entries, undefined);

	// V4MAPPED
	entries = await cacheable.lookupAsync('static4', {family: 6, hints: V4MAPPED});
	t.deepEqual(entries, {address: '::ffff:127.0.0.1', family: 6});
});

test('ADDRCONFIG hint', async t => {
	//=> has6 = false, family = 6
	{
		const CacheableLookup = mockedInterfaces({has4: true, has6: false});
		const cacheable = new CacheableLookup({resolver});

		t.is(await cacheable.lookupAsync('localhost', {family: 6, hints: ADDRCONFIG}), undefined);
	}

	//=> has6 = true, family = 6
	{
		const CacheableLookup = mockedInterfaces({has4: true, has6: true});
		const cacheable = new CacheableLookup({resolver});

		t.deepEqual(await cacheable.lookupAsync('localhost', {family: 6, hints: ADDRCONFIG}), {
			address: '::ffff:127.0.0.2',
			family: 6
		});
	}

	//=> has4 = false, family = 4
	{
		const CacheableLookup = mockedInterfaces({has4: false, has6: true});
		const cacheable = new CacheableLookup({resolver});

		t.is(await cacheable.lookupAsync('localhost', {family: 4, hints: ADDRCONFIG}), undefined);
	}

	//=> has4 = true, family = 4
	{
		const CacheableLookup = mockedInterfaces({has4: true, has6: true});
		const cacheable = new CacheableLookup({resolver});

		t.deepEqual(await cacheable.lookupAsync('localhost', {family: 4, hints: ADDRCONFIG}), {
			address: '127.0.0.1',
			family: 4
		});
	}
});

test('caching works', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	let entries = await cacheable.lookupAsync('temporary', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// Update DNS data
	resolver.data['127.0.0.1'].temporary[0].address = '127.0.0.2';

	// Lookup again
	entries = await cacheable.lookupAsync('temporary', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);
});

test('respects ttl', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	let entries = await cacheable.lookupAsync('ttl', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// Update DNS data
	resolver.data['127.0.0.1'].ttl[0].address = '127.0.0.2';

	// Wait until it expires
	await sleep(2000);

	// Lookup again
	entries = await cacheable.lookupAsync('ttl', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.2', family: 4}
	]);
});

test('`options.throwNotFound` is always `true` when using callback style', async t => {
	const cacheable = new CacheableLookup({resolver});

	const lookup = promisify(cacheable.lookup.bind(cacheable));

	await t.throwsAsync(() => lookup('static4', {family: 6, throwNotFound: false}), {code: 'ENOTFOUND'});
});

test('options.throwNotFound', async t => {
	const cacheable = new CacheableLookup({resolver});

	await t.notThrowsAsync(() => cacheable.lookupAsync('static4', {family: 6, throwNotFound: false}));
	await t.throwsAsync(() => cacheable.lookupAsync('static4', {family: 6, throwNotFound: true}), {code: 'ENOTFOUND'});
});

test('passes errors', async t => {
	const cacheable = new CacheableLookup({resolver});

	await t.throwsAsync(() => cacheable.lookupAsync('undefined'), HostnameDoesntExistError);
});

test('custom servers', async t => {
	const cacheable = new CacheableLookup({resolver});

	// .getServers()
	t.deepEqual(cacheable.getServers(), ['127.0.0.1']);
	t.is(await cacheable.lookupAsync('unique'), undefined);

	// .setServers()
	cacheable.setServers(['127.0.0.1', '192.168.0.100']);
	t.deepEqual(await cacheable.lookupAsync('unique'), {
		address: '127.0.0.1',
		family: 4
	});

	// Verify
	t.deepEqual(cacheable.getServers(), ['127.0.0.1', '192.168.0.100']);
});

test('callback style', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Custom promise for this particular test
	const lookup = (...args) => new Promise((resolve, reject) => {
		cacheable.lookup(...args, (error, ...data) => {
			if (error) {
				reject(error);
			} else {
				resolve(data);
			}
		});
	});

	// Without options
	t.deepEqual(await lookup('localhost'), ['127.0.0.1', 4]);

	// With options
	t.deepEqual(await lookup('localhost', {family: 6, all: true}), [
		[{address: '::ffff:127.0.0.2', family: 6}]
	]);
});

test('works', async t => {
	const cacheable = new CacheableLookup();

	t.deepEqual(await cacheable.lookupAsync('localhost'), {
		address: '127.0.0.1',
		family: 4
	});
});

test('options.maxTtl', async t => {
	//=> maxTtl = 1
	{
		const cacheable = new CacheableLookup({resolver, maxTtl: 1});

		// Make sure default behavior is right
		t.deepEqual(await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.1',
			family: 4
		});

		// Update DNS data
		resolver.data['127.0.0.1'].maxTtl[0].address = '127.0.0.2';

		// Wait until it expires
		await sleep(2000);

		// Lookup again
		t.deepEqual(await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.2',
			family: 4
		});

		// Reset
		resolver.data['127.0.0.1'].maxTtl[0].address = '127.0.0.1';
	}

	//=> maxTtl = 0
	{
		const cacheable = new CacheableLookup({resolver, maxTtl: 0});

		// Make sure default behavior is right
		t.deepEqual(await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.1',
			family: 4
		});

		// Update DNS data
		resolver.data['127.0.0.1'].maxTtl[0].address = '127.0.0.2';

		// Wait until it expires
		await sleep(10);

		// Lookup again
		t.deepEqual(await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.2',
			family: 4
		});
	}
});
