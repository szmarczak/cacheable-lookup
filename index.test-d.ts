import {Resolver, lookup} from 'dns';
import {Agent} from 'https';
import {expectType} from 'tsd';
import * as QuickLRU from 'quick-lru';
import CacheableLookup, {EntryObject} from '.';

(async () => {
	const cacheable = new CacheableLookup();
	const agent = new Agent();

	new CacheableLookup({
		cache: new QuickLRU({maxSize: 100}),
		fallbackDuration: 0,
		errorTtl: 0,
		maxTtl: 0,
		resolver: new Resolver(),
		lookup
	});

	new CacheableLookup({
		lookup: false
	});

	expectType<string[]>(cacheable.servers);

	expectType<EntryObject>(await cacheable.lookupAsync('localhost', 4));
	expectType<EntryObject>(await cacheable.lookupAsync('localhost', {all: false}));
	expectType<ReadonlyArray<EntryObject>>(await cacheable.lookupAsync('localhost', {all: true}));

	cacheable.lookup('localhost', 6, (error, address, family) => {
		expectType<NodeJS.ErrnoException | null>(error);
		expectType<string>(address);
		expectType<4 | 6>(family);
	});

	cacheable.lookup('localhost', {all: false}, (error, address, family) => {
		expectType<NodeJS.ErrnoException | null>(error);
		expectType<string>(address);
		expectType<4 | 6>(family);
	});

	cacheable.lookup('localhost', {all: true}, (error, results) => {
		expectType<NodeJS.ErrnoException | null>(error);
		expectType<ReadonlyArray<EntryObject>>(results);
	});

	// @types/node has invalid typings :(
	// expectType<typeof cacheable.lookup>(lookup);

	expectType<ReadonlyArray<EntryObject>>(await cacheable.query('localhost'));
	expectType<ReadonlyArray<EntryObject>>(await cacheable.queryAndCache('localhost'));

	expectType<void>(cacheable.updateInterfaceInfo());
	expectType<void>(cacheable.install(agent));
	expectType<void>(cacheable.uninstall(agent));
	expectType<void>(cacheable.clear('localhost'));
	expectType<void>(cacheable.clear());

	cacheable.servers = ['127.0.0.1'];
})();
