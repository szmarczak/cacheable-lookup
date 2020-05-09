const {V4MAPPED, ADDRCONFIG, ALL} = require('dns');
const {Resolver: AsyncResolver} = require('dns').promises;
const {promisify} = require('util');
const http = require('http');
const test = require('ava');
const Keyv = require('keyv');
const proxyquire = require('proxyquire');

const makeRequest = options => new Promise((resolve, reject) => {
	http.get(options, resolve).once('error', reject);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const mockedInterfaces = options => {
	const createInterfaces = (options = {}) => {
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

		return interfaces;
	};

	let interfaces = createInterfaces(options);

	const _updateInterfaces = (options = {}) => {
		interfaces = createInterfaces(options);
	};

	const result = proxyquire('../source', {
		os: {
			networkInterfaces: () => interfaces
		}
	});

	result._updateInterfaces = _updateInterfaces;

	return result;
};

const createResolver = () => {
	let counter = {
		4: 0,
		6: 0,
		lookup: 0
	};

	const resolver = {
		servers: ['127.0.0.1'],
		getServers() {
			return [...resolver.servers];
		},
		setServers(servers) {
			resolver.servers = [...servers];
		},
		resolve: (hostname, options, callback) => {
			let data;
			for (const server of resolver.servers) {
				if (resolver.data[server][hostname]) {
					data = resolver.data[server][hostname];
					break;
				}
			}

			if (!data) {
				const error = new Error(`ENOTFOUND ${hostname}`);
				error.code = 'ENOTFOUND';

				callback(error);
				return;
			}

			if (data.length === 0) {
				const error = new Error(`ENODATA ${hostname}`);
				error.code = 'ENODATA';

				callback(error);
				return;
			}

			if (options.family === 4 || options.family === 6) {
				data = data.filter(entry => entry.family === options.family);
			}

			callback(null, JSON.parse(JSON.stringify(data)));
		},
		resolve4: (hostname, options, callback) => {
			counter[4]++;

			return resolver.resolve(hostname, {...options, family: 4}, callback);
		},
		resolve6: (hostname, options, callback) => {
			counter[6]++;

			return resolver.resolve(hostname, {...options, family: 6}, callback);
		},
		lookup: (hostname, options, callback) => {
			// No need to implement hints yet

			counter.lookup++;

			if (!resolver.lookupData[hostname]) {
				const error = new Error(`ENOTFOUND ${hostname}`);
				error.code = 'ENOTFOUND';
				error.hostname = hostname;

				callback(error);
				return;
			}

			let entries = resolver.lookupData[hostname];

			if (options.family === 4 || options.family === 6) {
				entries = entries.filter(entry => entry.family === options.family);
			}

			if (options.all) {
				callback(null, entries);
				return;
			}

			callback(null, entries[0]);
		},
		data: {
			'127.0.0.1': {
				localhost: [
					{address: '127.0.0.1', family: 4, ttl: 60},
					{address: '::ffff:127.0.0.2', family: 6, ttl: 60}
				],
				example: [
					{address: '127.0.0.127', family: 4, ttl: 60}
				],
				temporary: [
					{address: '127.0.0.1', family: 4, ttl: 1}
				],
				twoSeconds: [
					{address: '127.0.0.1', family: 4, ttl: 2}
				],
				ttl: [
					{address: '127.0.0.1', family: 4, ttl: 1}
				],
				maxTtl: [
					{address: '127.0.0.1', family: 4, ttl: 60}
				],
				static4: [
					{address: '127.0.0.1', family: 4, ttl: 1}
				],
				zeroTtl: [
					{address: '127.0.0.127', family: 4, ttl: 0}
				],
				multiple: [
					{address: '127.0.0.127', family: 4, ttl: 0},
					{address: '127.0.0.128', family: 4, ttl: 0}
				]
			},
			'192.168.0.100': {
				unique: [
					{address: '127.0.0.1', family: 4, ttl: 60}
				]
			}
		},
		lookupData: {
			osHostname: [
				{address: '127.0.0.1', family: 4},
				{address: '127.0.0.2', family: 4}
			]
		},
		get counter() {
			return counter;
		},
		resetCounter() {
			counter = {
				4: 0,
				6: 0,
				lookup: 0
			};
		}
	};

	return resolver;
};

const resolver = createResolver();

const CacheableLookup = proxyquire('../source', {
	dns: {
		lookup: resolver.lookup
	}
});

const verify = (t, entry, value) => {
	if (Array.isArray(value)) {
		// eslint-disable-next-line guard-for-in
		for (const key in value) {
			t.true(typeof entry[key].expires === 'number' && entry[key].expires >= Date.now() - 1000);
			t.true(typeof entry[key].ttl === 'number' && entry[key].ttl >= 0);

			if (!('ttl' in value[key]) && 'ttl' in entry[key]) {
				value[key].ttl = entry[key].ttl;
			}

			if (!('expires' in value[key]) && 'expires' in entry[key]) {
				value[key].expires = entry[key].expires;
			}
		}
	} else {
		t.true(typeof entry.expires === 'number' && entry.expires >= Date.now() - 1000);
		t.true(typeof entry.ttl === 'number' && entry.ttl >= 0);

		if (!('ttl' in value)) {
			value.ttl = entry.ttl;
		}

		if (!('expires' in value)) {
			value.expires = entry.expires;
		}
	}

	t.deepEqual(entry, value);
};

test('options.family', async t => {
	const cacheable = new CacheableLookup({resolver});

	// IPv4
	let entry = await cacheable.lookupAsync('localhost', {family: 4});
	verify(t, entry, {
		address: '127.0.0.1',
		family: 4
	});

	// IPv6
	entry = await cacheable.lookupAsync('localhost', {family: 6});
	verify(t, entry, {
		address: '::ffff:127.0.0.2',
		family: 6
	});
});

test('options.all', async t => {
	const cacheable = new CacheableLookup({resolver});

	const entries = await cacheable.lookupAsync('localhost', {all: true});
	verify(t, entries, [
		{address: '127.0.0.1', family: 4},
		{address: '::ffff:127.0.0.2', family: 6}
	]);
});

test('options.all mixed with options.family', async t => {
	const cacheable = new CacheableLookup({resolver});

	// IPv4
	let entries = await cacheable.lookupAsync('localhost', {all: true, family: 4});
	verify(t, entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// IPv6
	entries = await cacheable.lookupAsync('localhost', {all: true, family: 6});
	verify(t, entries, [
		{address: '::ffff:127.0.0.2', family: 6}
	]);
});

test('V4MAPPED hint', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	await t.throwsAsync(cacheable.lookupAsync('static4', {family: 6}), {code: 'ENOTFOUND'});

	// V4MAPPED
	const entries = await cacheable.lookupAsync('static4', {family: 6, hints: V4MAPPED});
	verify(t, entries, {address: '::ffff:127.0.0.1', family: 6});
});

test('ALL hint', async t => {
	const cacheable = new CacheableLookup({resolver});

	// ALL
	const entries = await cacheable.lookupAsync('localhost', {family: 6, hints: V4MAPPED | ALL, all: true});

	verify(t, entries, [
		{address: '::ffff:127.0.0.1', family: 6, ttl: 60},
		{address: '::ffff:127.0.0.2', family: 6, ttl: 60}
	]);
});

test('ADDRCONFIG hint', async t => {
	//=> has6 = false, family = 6
	{
		const CacheableLookup = mockedInterfaces({has4: true, has6: false});
		const cacheable = new CacheableLookup({resolver});

		await t.throwsAsync(cacheable.lookupAsync('localhost', {family: 6, hints: ADDRCONFIG}), {code: 'ENOTFOUND'});
	}

	//=> has6 = true, family = 6
	{
		const CacheableLookup = mockedInterfaces({has4: true, has6: true});
		const cacheable = new CacheableLookup({resolver});

		verify(t, await cacheable.lookupAsync('localhost', {family: 6, hints: ADDRCONFIG}), {
			address: '::ffff:127.0.0.2',
			family: 6
		});
	}

	//=> has4 = false, family = 4
	{
		const CacheableLookup = mockedInterfaces({has4: false, has6: true});
		const cacheable = new CacheableLookup({resolver});

		await t.throwsAsync(cacheable.lookupAsync('localhost', {family: 4, hints: ADDRCONFIG}), {code: 'ENOTFOUND'});
	}

	//=> has4 = true, family = 4
	{
		const CacheableLookup = mockedInterfaces({has4: true, has6: true});
		const cacheable = new CacheableLookup({resolver});

		verify(t, await cacheable.lookupAsync('localhost', {family: 4, hints: ADDRCONFIG}), {
			address: '127.0.0.1',
			family: 4
		});
	}

	// Update interface info
	{
		const CacheableLookup = mockedInterfaces({has4: false, has6: true});
		const cacheable = new CacheableLookup({resolver});

		await t.throwsAsync(cacheable.lookupAsync('localhost', {family: 4, hints: ADDRCONFIG}), {code: 'ENOTFOUND'});

		//=> has4 = true, family = 4
		CacheableLookup._updateInterfaces({has4: true, has6: true}); // Override os.networkInterfaces()
		cacheable.updateInterfaceInfo();

		verify(t, await cacheable.lookupAsync('localhost', {family: 4, hints: ADDRCONFIG}), {
			address: '127.0.0.1',
			family: 4
		});
	}
});

test.serial('caching works', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	let entries = await cacheable.lookupAsync('temporary', {all: true, family: 4});
	verify(t, entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// Update DNS data
	const resovlerEntry = resolver.data['127.0.0.1'].temporary[0];
	const {address: resolverAddress} = resovlerEntry;
	resovlerEntry.address = '127.0.0.2';

	// Lookup again
	entries = await cacheable.lookupAsync('temporary', {all: true, family: 4});
	verify(t, entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// Restore back
	resovlerEntry.address = resolverAddress;
});

test('respects ttl', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	let entries = await cacheable.lookupAsync('ttl', {all: true, family: 4});
	verify(t, entries, [
		{address: '127.0.0.1', family: 4}
	]);

	// Update DNS data
	const resolverEntry = resolver.data['127.0.0.1'].ttl[0];
	const {address: resolverAddress} = resolverEntry;
	resolverEntry.address = '127.0.0.2';

	// Wait until it expires
	await sleep((resolverEntry.ttl * 1000) + 1);

	// Lookup again
	entries = await cacheable.lookupAsync('ttl', {all: true, family: 4});
	verify(t, entries, [
		{address: '127.0.0.2', family: 4}
	]);

	// Restore back
	resolverEntry.address = resolverAddress;
});

test('throw when there are entries available but not for the requested family', async t => {
	const cacheable = new CacheableLookup({resolver});

	await t.throwsAsync(cacheable.lookupAsync('static4', {family: 6}), {code: 'ENOTFOUND'});
});

test('custom servers', async t => {
	const cacheable = new CacheableLookup({resolver: createResolver()});

	// .servers (get)
	t.deepEqual(cacheable.servers, ['127.0.0.1']);
	await t.throwsAsync(cacheable.lookupAsync('unique'), {code: 'ENOTFOUND'});

	// .servers (set)
	cacheable.servers = ['127.0.0.1', '192.168.0.100'];
	verify(t, await cacheable.lookupAsync('unique'), {
		address: '127.0.0.1',
		family: 4
	});

	// Verify
	t.deepEqual(cacheable.servers, ['127.0.0.1', '192.168.0.100']);
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
	let result = await lookup('localhost');
	t.is(result.length, 4);
	t.is(result[0], '127.0.0.1');
	t.is(result[1], 4);
	t.true(typeof result[2] === 'number' && result[2] >= Date.now() - 1000);
	t.true(typeof result[3] === 'number' && result[3] >= 0);

	// With options
	result = await lookup('localhost', {family: 6, all: true});
	t.is(result.length, 1);
	verify(t, result[0], [{address: '::ffff:127.0.0.2', family: 6}]);
});

test('works', async t => {
	const cacheable = new CacheableLookup({resolver});

	verify(t, await cacheable.lookupAsync('localhost'), {
		address: '127.0.0.1',
		family: 4
	});
});

test('options.maxTtl', async t => {
	//=> maxTtl = 1
	{
		const cacheable = new CacheableLookup({resolver, maxTtl: 1});

		// Make sure default behavior is right
		verify(t, await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.1',
			family: 4
		});

		// Update DNS data
		const resolverEntry = resolver.data['127.0.0.1'].maxTtl[0];
		resolverEntry.address = '127.0.0.2';

		// Wait until it expires
		await sleep((cacheable.maxTtl * 1000) + 1);

		// Lookup again
		verify(t, await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.2',
			family: 4
		});

		// Reset
		resolverEntry.address = '127.0.0.1';
	}

	//=> maxTtl = 0
	{
		const cacheable = new CacheableLookup({resolver, maxTtl: 0});

		// Make sure default behavior is right
		verify(t, await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.1',
			family: 4
		});

		// Update DNS data
		const resolverEntry = resolver.data['127.0.0.1'].maxTtl[0];
		resolverEntry.address = '127.0.0.2';

		// Wait until it expires
		await sleep((cacheable.maxTtl * 1000) + 1);

		// Lookup again
		verify(t, await cacheable.lookupAsync('maxTtl'), {
			address: '127.0.0.2',
			family: 4
		});

		// Reset
		resolverEntry.address = '127.0.0.1';
	}
});

test('entry with 0 ttl', async t => {
	const cacheable = new CacheableLookup({resolver});

	// Make sure default behavior is right
	verify(t, await cacheable.lookupAsync('zeroTtl'), {
		address: '127.0.0.127',
		family: 4
	});

	// Update DNS data
	resolver.data['127.0.0.1'].zeroTtl[0].address = '127.0.0.1';

	// Lookup again
	verify(t, await cacheable.lookupAsync('zeroTtl'), {
		address: '127.0.0.1',
		family: 4
	});
});

test('http example', async t => {
	const cacheable = new CacheableLookup({resolver});

	const options = {
		hostname: 'example',
		port: 9999,
		lookup: cacheable.lookup
	};

	await t.throwsAsync(makeRequest(options), {
		message: 'connect ECONNREFUSED 127.0.0.127:9999'
	});
});

test('.lookup() and .lookupAsync() are automatically bounded', async t => {
	const cacheable = new CacheableLookup({resolver});

	await t.notThrowsAsync(cacheable.lookupAsync('localhost'));
	await t.notThrowsAsync(promisify(cacheable.lookup)('localhost'));

	t.throws(() => cacheable.lookup('localhost'), {
		message: 'Callback must be a function.'
	});
});

test('works (Internet connection)', async t => {
	const cacheable = new CacheableLookup();

	const {address, family} = await cacheable.lookupAsync('1dot1dot1dot1.cloudflare-dns.com');
	t.true(address === '1.1.1.1' || address === '1.0.0.1');
	t.is(family, 4);
});

test.serial('install & uninstall', async t => {
	const cacheable = new CacheableLookup({resolver});
	cacheable.install(http.globalAgent);

	const options = {
		hostname: 'example',
		port: 9999
	};

	await t.throwsAsync(makeRequest(options), {
		message: 'connect ECONNREFUSED 127.0.0.127:9999'
	});

	cacheable.uninstall(http.globalAgent);

	await t.throwsAsync(makeRequest(options), {
		message: /^getaddrinfo (?:ENOTFOUND|EAI_AGAIN) example/
	});

	http.globalAgent.destroy();
});

test('`.install()` throws if no Agent provided', t => {
	const cacheable = new CacheableLookup();

	t.throws(() => cacheable.install(), {
		message: 'Expected an Agent instance as the first argument'
	});

	t.throws(() => cacheable.install(1), {
		message: 'Expected an Agent instance as the first argument'
	});
});

test('`.uninstall()` throws if no Agent provided', t => {
	const cacheable = new CacheableLookup();

	t.throws(() => cacheable.uninstall(), {
		message: 'Expected an Agent instance as the first argument'
	});

	t.throws(() => cacheable.uninstall(1), {
		message: 'Expected an Agent instance as the first argument'
	});
});

test.serial('`.uninstall()` does not alter unmodified Agents', t => {
	const cacheable = new CacheableLookup();
	const {createConnection} = http.globalAgent;

	cacheable.uninstall(http.globalAgent);

	t.is(createConnection, http.globalAgent.createConnection);
});

test.serial('throws if double-installing CacheableLookup', t => {
	const cacheable = new CacheableLookup();

	cacheable.install(http.globalAgent);
	t.throws(() => cacheable.install(http.globalAgent), {
		message: 'CacheableLookup has been already installed'
	});

	cacheable.uninstall(http.globalAgent);
});

test.serial('install - providing custom lookup function anyway', async t => {
	const a = new CacheableLookup();
	const b = new CacheableLookup({resolver});

	a.install(http.globalAgent);

	const options = {
		hostname: 'example',
		port: 9999,
		lookup: b.lookup
	};

	await t.throwsAsync(makeRequest(options), {
		message: 'connect ECONNREFUSED 127.0.0.127:9999'
	});

	a.uninstall(http.globalAgent);
});

test.serial('throws when calling `.uninstall()` on the wrong instance', t => {
	const a = new CacheableLookup();
	const b = new CacheableLookup({resolver});

	a.install(http.globalAgent);

	t.throws(() => b.uninstall(http.globalAgent), {
		message: 'The agent is not owned by this CacheableLookup instance'
	});

	a.uninstall(http.globalAgent);
});

test('async resolver (Internet connection)', async t => {
	const cacheable = new CacheableLookup({resolver: new AsyncResolver()});

	t.is(typeof cacheable._resolve4, 'function');
	t.is(typeof cacheable._resolve6, 'function');

	const {address} = await cacheable.lookupAsync('1dot1dot1dot1.cloudflare-dns.com');
	t.true(address === '1.1.1.1' || address === '1.0.0.1');
});

test('clear() works', async t => {
	const cacheable = new CacheableLookup({resolver});

	await cacheable.lookupAsync('localhost');
	t.is(cacheable._cache.size, 1);

	cacheable.clear();

	t.is(cacheable._cache.size, 0);
});

test('ttl works', async t => {
	const cacheable = new CacheableLookup({resolver});

	await Promise.all([cacheable.lookupAsync('temporary'), cacheable.lookupAsync('ttl')]);
	t.is(cacheable._cache.size, 2);

	await sleep(2001);

	t.is(cacheable._cache.size, 0);
});

test('custom cache support', async t => {
	const cache = new Keyv();

	const cacheable = new CacheableLookup({
		resolver,
		cache
	});

	await cacheable.lookupAsync('temporary');

	const [entry] = await cache.get('temporary');

	t.is(entry.address, '127.0.0.1');
	t.is(entry.family, 4);
	t.is(entry.ttl, 1);

	await sleep(entry.ttl * 1001);

	const newEntry = await cache.get('temporary');

	t.is(newEntry, undefined);
});

test.serial('fallback works', async t => {
	const cacheable = new CacheableLookup({resolver, fallbackDuration: 3600});
	resolver.resetCounter();

	const entries = await cacheable.lookupAsync('osHostname', {all: true});
	t.is(entries.length, 2);

	t.is(entries[0].address, '127.0.0.1');
	t.is(entries[0].family, 4);

	t.is(entries[1].address, '127.0.0.2');
	t.is(entries[1].family, 4);

	t.is(cacheable._cache.size, 0);

	await cacheable.lookupAsync('osHostname', {all: true});

	t.deepEqual(resolver.counter, {
		6: 1,
		4: 1,
		lookup: 2
	});
});

test('fallback can be turned off', async t => {
	const cacheable = new CacheableLookup({resolver, fallbackDuration: 0});

	await t.throwsAsync(cacheable.lookupAsync('osHostname', {all: true}), {
		message: 'cacheableLookup ENOTFOUND osHostname'
	});
});

test('errors are cached', async t => {
	const cacheable = new CacheableLookup({resolver, errorTtl: 0.1});

	await t.throwsAsync(cacheable.lookupAsync('doesNotExist'), {
		code: 'ENOTFOUND'
	});

	t.is(cacheable._cache.size, 1);

	await sleep((cacheable.errorTtl * 1000) + 1);

	t.is(cacheable._cache.size, 0);
});

test('passing family as options', async t => {
	const cacheable = new CacheableLookup({resolver});

	const promisified = promisify(cacheable.lookup);

	const entry = await cacheable.lookupAsync('localhost', 6);
	t.is(entry.address, '::ffff:127.0.0.2');
	t.is(entry.family, 6);

	const address = await promisified('localhost', 6);
	t.is(address, '::ffff:127.0.0.2');
});

test('clear(hostname) works', async t => {
	const cacheable = new CacheableLookup({resolver});

	await cacheable.lookupAsync('localhost');
	await cacheable.lookupAsync('temporary');

	cacheable.clear('localhost');

	t.is(cacheable._cache.size, 1);
});

test('prevents overloading DNS', async t => {
	const resolver = createResolver();
	const {lookupAsync} = new CacheableLookup({
		resolver,
		lookup: resolver.lookup
	});

	await Promise.all([lookupAsync('localhost'), lookupAsync('localhost')]);

	t.deepEqual(resolver.counter, {
		4: 1,
		6: 1,
		lookup: 1
	});
});

test('returns IPv6 if no other entries available', async t => {
	const CacheableLookup = mockedInterfaces({has4: false, has6: true});
	const cacheable = new CacheableLookup({resolver});

	verify(t, await cacheable.lookupAsync('localhost', {hints: ADDRCONFIG}), {
		address: '::ffff:127.0.0.2',
		family: 6
	});
});
