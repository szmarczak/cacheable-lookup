'use strict';
const {Resolver, V4MAPPED, ADDRCONFIG} = require('dns');
const {promisify} = require('util');
const os = require('os');
const Keyv = require('keyv');

class CacheableLookup {
	constructor(options = {}) {
		const {cacheAdapter} = options;
		this.cache = new Keyv({
			uri: typeof cacheAdapter === 'string' && cacheAdapter,
			store: typeof cacheAdapter !== 'string' && cacheAdapter,
			namespace: 'cached-lookup'
		});

		this.maxTtl = options.maxTtl !== 0 ? (options.maxTtl || Infinity) : 0;

		this.resolver = options.resolver || new Resolver();
		this.resolve4 = promisify(this.resolver.resolve4.bind(this.resolver));
		this.resolve6 = promisify(this.resolver.resolve6.bind(this.resolver));
	}

	set servers(servers) {
		this.resolver.setServers(servers);
	}

	get servers() {
		return this.resolver.getServers();
	}

	lookup(hostname, options, callback) {
		if (typeof options === 'function') {
			callback = options;
			options = {};
		}

		this.lookupAsync(hostname, {...options, throwNotFound: true}).then(result => {
			if (options.all) {
				callback(null, result);
			} else {
				callback(null, result.address, result.family);
			}
		}).catch(callback);
	}

	async lookupAsync(hostname, options = {}) {
		let cached;

		if (options.family !== 4 && options.family !== 6 && options.all) {
			const [cached4, cached6] = await Promise.all([this.lookupAsync(hostname, {all: true, family: 4}), this.lookupAsync(hostname, {all: true, family: 6})]);
			cached = [...cached4, ...cached6];
		} else {
			cached = await this.query(hostname, options.family || 4);
		}

		if (cached.length === 0 && options.family !== 4 && options.hints & V4MAPPED) {
			cached = await this.query(hostname, 4);

			for (const entry of cached) {
				entry.address = `::ffff:${entry.address}`;
				entry.family = 6;
			}
		}

		if (options.hints & ADDRCONFIG) {
			let has4 = false;
			let has6 = false;

			for (const device of Object.values(os.networkInterfaces())) {
				for (const iface of device) {
					if (iface.internal) {
						continue;
					}

					if (iface.family === 'IPv4') {
						has4 = true;
					}

					if (iface.family === 'IPv6') {
						has6 = true;
					}

					if (has4 && has6) {
						break;
					}
				}
			}

			cached = cached.filter(entry => entry.family === 6 ? has6 : has4);
		}

		if (options.throwNotFound && cached.length === 0) {
			const error = new Error(`ENOTFOUND ${hostname}`);
			error.code = 'ENOTFOUND';
			error.hostname = hostname;

			throw error;
		}

		if (options.all) {
			return cached;
		}

		if (cached.length === 0) {
			return undefined;
		}

		return this.getEntry(cached);
	}

	async query(hostname, family) {
		let cached = await this.cache.get(`${hostname}:${family}`);
		if (!cached) {
			cached = await this.queryAndCache(hostname, family);
		}

		return cached;
	}

	async queryAndCache(hostname, family) {
		const resolve = family === 6 ? this.resolve6 : this.resolve4;
		const entries = await resolve(hostname, {ttl: true});

		if (entries === undefined) {
			return [];
		}

		let ttl = 0;
		for (const entry of entries) {
			ttl = Math.max(ttl, entry.ttl);
			entry.family = family;
			delete entry.ttl;
		}
		ttl = Math.min(this.maxTtl, ttl) * 1000;
 
		if (this.maxTtl !== 0) {
			await this.cache.set(`${hostname}:${family}`, entries, ttl);
		}

		return entries;
	}

	getEntry(entries) {
		return entries[Math.floor(Math.random() * entries.length)];
	}
}

module.exports = CacheableLookup;
