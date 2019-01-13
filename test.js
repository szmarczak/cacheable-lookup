import {V4MAPPED, ADDRCONFIG} from 'dns';
import {promisify} from 'util';
import test from 'ava';
import CacheableLookup from '.';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class HostnameDoesntExistError extends Error {}

const resolver = {
	resolve: (hostname, options, callback) => {
		let data = resolver.data[hostname];
		if (!data) {
			callback(new HostnameDoesntExistError());
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
		static4: [
			{address: '127.0.0.1', family: 4, ttl: 1}
		]
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

	{
		const entry = await cacheable.lookupAsync('localhost', {family: 4});
		t.is(entry.address, '127.0.0.1');
		t.is(entry.family, 4);
	}

	{
		const entry = await cacheable.lookupAsync('localhost', {family: 6});
		t.is(entry.address, '::ffff:127.0.0.2');
		t.is(entry.family, 6);
	}
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

	{
		const entries = await cacheable.lookupAsync('localhost', {all: true, family: 4});
		t.deepEqual(entries, [
			{address: '127.0.0.1', family: 4}
		]);
	}

	{
		const entries = await cacheable.lookupAsync('localhost', {all: true, family: 6});
		t.deepEqual(entries, [
			{address: '::ffff:127.0.0.2', family: 6}
		]);
	}
});

test('V4MAPPED hint', async t => {
	const cacheable = new CacheableLookup({resolver});

	{
		const entries = await cacheable.lookupAsync('static4', {family: 6});
		t.is(entries, undefined);
	}

	{
		const entries = await cacheable.lookupAsync('static4', {family: 6, hints: V4MAPPED});
		t.deepEqual(entries, {address: '::ffff:127.0.0.1', family: 6});
	}
});

test.todo('ADDRCONFIG hint');

test('caching works', async t => {
	const cacheable = new CacheableLookup({resolver});

	let entries = await cacheable.lookupAsync('temporary', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);

	resolver.data.temporary[0].address = '127.0.0.2';

	entries = await cacheable.lookupAsync('temporary', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);
});

test('respects ttl', async t => {
	const cacheable = new CacheableLookup({resolver});

	let entries = await cacheable.lookupAsync('ttl', {all: true, family: 4});
	t.deepEqual(entries, [
		{address: '127.0.0.1', family: 4}
	]);

	resolver.data.ttl[0].address = '127.0.0.2';

	await sleep(2000);

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

test.todo('.getServers()');
test.todo('.setServers()');
test.todo('callback style');
