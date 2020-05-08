'use strict';
const {
	V4MAPPED,
	ADDRCONFIG,
	promises: {
		Resolver: AsyncResolver
	},
	lookup: dnsLookup
} = require('dns');
const {promisify} = require('util');
const os = require('os');

const lookup = promisify(dnsLookup);

const kCacheableLookupCreateConnection = Symbol('cacheableLookupCreateConnection');
const kCacheableLookupInstance = Symbol('cacheableLookupInstance');

const verifyAgent = agent => {
	if (!(agent && typeof agent.createConnection === 'function')) {
		throw new Error('Expected an Agent instance as the first argument');
	}
};

const map4to6 = entries => {
	for (const entry of entries) {
		entry.address = `::ffff:${entry.address}`;
		entry.family = 6;
	}
};

const getIfaceInfo = () => {
	let has4 = false;
	let has6 = false;

	for (const device of Object.values(os.networkInterfaces())) {
		for (const iface of device) {
			if (iface.internal) {
				continue;
			}

			if (iface.family === 'IPv6') {
				has6 = true;
			} else {
				has4 = true;
			}

			if (has4 && has6) {
				return {has4, has6};
			}
		}
	}

	return {has4, has6};
};

const ttl = {ttl: true};
const all = {all: true};

class CacheableLookup {
	constructor({
		cache = new Map(),
		maxTtl = Infinity,
		resolver = new AsyncResolver(),
		fallbackDuration = 3600,
		errorTtl = 0.15
	} = {}) {
		this.maxTtl = maxTtl;
		this.errorTtl = errorTtl;

		this._cache = cache;
		this._resolver = resolver;

		if (this._resolver instanceof AsyncResolver) {
			this._resolve4 = this._resolver.resolve4.bind(this._resolver);
			this._resolve6 = this._resolver.resolve6.bind(this._resolver);
		} else {
			this._resolve4 = promisify(this._resolver.resolve4.bind(this._resolver));
			this._resolve6 = promisify(this._resolver.resolve6.bind(this._resolver));
		}

		this._iface = getIfaceInfo();

		this._pending = {};

		this._nextRemovalTime = false;

		this._hostnamesToFallback = new Set();

		/* istanbul ignore next: There is no `interval.unref()` when running inside an Electron renderer */
		const interval = setInterval(() => {
			this._hostnamesToFallback.clear();
		}, fallbackDuration * 1000);

		if (interval.unref) {
			interval.unref();
		}

		this.lookup = this.lookup.bind(this);
		this.lookupAsync = this.lookupAsync.bind(this);
	}

	set servers(servers) {
		this.updateInterfaceInfo();

		this._resolver.setServers(servers);
	}

	get servers() {
		return this._resolver.getServers();
	}

	lookup(hostname, options, callback) {
		if (typeof options === 'function') {
			callback = options;
			options = {};
		} else if (typeof options === 'number') {
			options = {
				family: options
			};
		}

		if (!callback) {
			throw new Error('Callback must be a function.');
		}

		// eslint-disable-next-line promise/prefer-await-to-then
		this.lookupAsync(hostname, options).then(result => {
			if (options.all) {
				callback(null, result);
			} else {
				callback(null, result.address, result.family, result.expires, result.ttl);
			}
		}, callback);
	}

	async lookupAsync(hostname, options = {}) {
		if (typeof options === 'number') {
			options = {
				family: options
			};
		}

		let cached = await this.query(hostname);

		if (options.family === 6) {
			const filtered = cached.filter(entry => entry.family === 6);

			if (filtered.length === 0 && options.hints & V4MAPPED) {
				map4to6(cached);
			} else {
				cached = filtered;
			}
		} else if (options.family === 4) {
			cached = cached.filter(entry => entry.family === 4);
		}

		if (options.hints & ADDRCONFIG) {
			const {_iface} = this;
			cached = cached.filter(entry => entry.family === 6 ? _iface.has6 : _iface.has4);
		}

		if (cached.length === 0) {
			const error = new Error(`ENOTFOUND ${hostname}`);
			error.code = 'ENOTFOUND';
			error.hostname = hostname;

			throw error;
		}

		if (options.all) {
			return cached;
		}

		return cached[0];
	}

	async query(hostname) {
		let cached = await this._cache.get(hostname);

		if (!cached) {
			const pending = this._pending[hostname];

			if (pending) {
				cached = await pending;
			} else {
				const newPromise = this.queryAndCache(hostname);
				this._pending[hostname] = newPromise;

				cached = await newPromise;
			}
		}

		cached = cached.map(entry => {
			return {...entry};
		});

		return cached;
	}

	async _resolve(hostname) {
		// We could make an ANY query, but DNS servers may reject that.
		const [A, AAAA] = await Promise.all([
			this._resolve4(hostname, ttl).catch(() => []),
			this._resolve6(hostname, ttl).catch(() => [])
		]);

		let cacheTtl = 0;

		const now = Date.now();

		for (const entry of A) {
			entry.family = 4;
			entry.expires = now + (entry.ttl * 1000);

			// Is the TTL the same for all entries?
			cacheTtl = Math.max(cacheTtl, entry.ttl);
		}

		for (const entry of AAAA) {
			entry.family = 6;
			entry.expires = now + (entry.ttl * 1000);

			// Is the TTL the same for all entries?
			cacheTtl = Math.max(cacheTtl, entry.ttl);
		}

		return {
			entries: [
				...A,
				...AAAA
			],
			cacheTtl,
			isLookup: false
		};
	}

	async _lookup(hostname) {
		const entries = await lookup(hostname, {
			all: true
		});

		return {
			entries,
			cacheTtl: 0,
			isLookup: true
		};
	}

	async _set(hostname, data, cacheTtl) {
		if (this.maxTtl > 0 && cacheTtl > 0) {
			data.expires = Date.now() + cacheTtl;
			await this._cache.set(hostname, data, cacheTtl);

			this._tick(cacheTtl);
		}
	}

	async queryAndCache(hostname) {
		if (this._hostnamesToFallback.has(hostname)) {
			return lookup(hostname, all);
		}

		const resolverPromise = this._resolve(hostname);
		const lookupPromise = this._lookup(hostname);

		try {
			const fastestQuery = await Promise.race([
				resolverPromise,
				lookupPromise
			]);

			(async () => {
				try {
					if (fastestQuery.isLookup) {
						const realDnsQuery = await resolverPromise;

						// If the DNS query failed
						if (realDnsQuery.cacheTtl === 0) {
							this._hostnamesToFallback.add(hostname);
						} else {
							await this._set(hostname, realDnsQuery.entries, realDnsQuery.cacheTtl);
						}
					} else {
						await this._set(hostname, fastestQuery.entries, fastestQuery.cacheTtl);
					}
				} catch (_) {
					// TODO: Make all further lookups throw
				}

				delete this._pending[hostname];
			})();

			return fastestQuery.entries;
		} catch (error) {
			if (error.code === 'ENOTFOUND') {
				await this._cache.set(hostname, [], this.errorTtl * 1000);
			}

			throw error;
		}
	}

	_tick(ms) {
		if (!(this._cache instanceof Map) || ms === undefined) {
			return;
		}

		const nextRemovalTime = this._nextRemovalTime;

		if (!nextRemovalTime || ms < nextRemovalTime) {
			clearTimeout(this._removalTimeout);

			this._nextRemovalTime = ms;

			this._removalTimeout = setTimeout(() => {
				this._nextRemovalTime = false;

				let nextExpiry = Infinity;

				const now = Date.now();

				for (const [hostname, {expires}] of this._cache) {
					if (now >= expires) {
						this._cache.delete(hostname);
					} else if (expires < nextExpiry) {
						nextExpiry = expires;
					}
				}

				if (nextExpiry !== Infinity) {
					this._tick(nextExpiry - now);
				}
			}, ms);

			/* istanbul ignore next: There is no `timeout.unref()` when running inside an Electron renderer */
			if (this._removalTimeout.unref) {
				this._removalTimeout.unref();
			}
		}
	}

	install(agent) {
		verifyAgent(agent);

		if (kCacheableLookupCreateConnection in agent) {
			throw new Error('CacheableLookup has been already installed');
		}

		agent[kCacheableLookupCreateConnection] = agent.createConnection;
		agent[kCacheableLookupInstance] = this;

		agent.createConnection = (options, callback) => {
			if (!('lookup' in options)) {
				options.lookup = this.lookup;
			}

			return agent[kCacheableLookupCreateConnection](options, callback);
		};
	}

	uninstall(agent) {
		verifyAgent(agent);

		if (agent[kCacheableLookupCreateConnection]) {
			if (agent[kCacheableLookupInstance] !== this) {
				throw new Error('The agent is not owned by this CacheableLookup instance');
			}

			agent.createConnection = agent[kCacheableLookupCreateConnection];

			delete agent[kCacheableLookupCreateConnection];
			delete agent[kCacheableLookupInstance];
		}
	}

	updateInterfaceInfo() {
		this._iface = getIfaceInfo();
		this._cache.clear();
	}

	clear(hostname) {
		if (hostname) {
			this._cache.delete(hostname);
			return;
		}

		this._cache.clear();
	}
}

module.exports = CacheableLookup;
module.exports.default = CacheableLookup;
