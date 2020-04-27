'use strict';
const {
	V4MAPPED,
	ADDRCONFIG,
	promises: {
		Resolver: AsyncResolver
	},
	lookup
} = require('dns');
const {promisify} = require('util');
const os = require('os');
const HostsResolver = require('./hosts-resolver');

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
				break;
			}
		}
	}

	return {has4, has6};
};

const ttl = {ttl: true};

class CacheableLookup {
	constructor({
		customHostsPath,
		cache = new Map(),
		maxTtl = Infinity,
		resolver = new AsyncResolver(),
		fallbackTtl = 1,
		errorTtl = 0.15
	} = {}) {
		this.maxTtl = maxTtl;
		this.fallbackTtl = fallbackTtl;
		this.errorTtl = errorTtl;

		// This value is in milliseconds
		this._lockTime = Math.max(Math.floor(Math.min(this.fallbackTtl * 1000, this.errorTtl * 1000)), 10);

		this._cache = cache;
		this._resolver = resolver;

		this._lookup = promisify(lookup);

		if (this._resolver instanceof AsyncResolver) {
			this._resolve4 = this._resolver.resolve4.bind(this._resolver);
			this._resolve6 = this._resolver.resolve6.bind(this._resolver);
		} else {
			this._resolve4 = promisify(this._resolver.resolve4.bind(this._resolver));
			this._resolve6 = promisify(this._resolver.resolve6.bind(this._resolver));
		}

		this._iface = getIfaceInfo();
		this._hostsResolver = new HostsResolver(customHostsPath);
		this._tickLocked = false;

		this._pending = {};

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
		} else if (!options.all || options.family === 4) {
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

		if (cached.length === 1) {
			return cached[0];
		}

		return this._getEntry(cached, hostname);
	}

	async query(hostname) {
		this.tick();

		let cached = await this._hostsResolver.get(hostname) || await this._cache.get(hostname);

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

	async queryAndCache(hostname) {
		// We could make an ANY query, but DNS servers may reject that.
		const [As, AAAAs] = await Promise.all([this._resolve4(hostname, ttl).catch(() => []), this._resolve6(hostname, ttl).catch(() => [])]);

		let cacheTtl = 0;

		if (As) {
			for (const entry of As) {
				entry.family = 4;
				entry.expires = Date.now() + (entry.ttl * 1000);

				// Is the TTL the same for all entries?
				cacheTtl = Math.max(cacheTtl, entry.ttl);
			}
		}

		if (AAAAs) {
			for (const entry of AAAAs) {
				entry.family = 6;
				entry.expires = Date.now() + (entry.ttl * 1000);

				// Is the TTL the same for all entries?
				cacheTtl = Math.max(cacheTtl, entry.ttl);
			}
		}

		let entries = [...(As || []), ...(AAAAs || [])];

		if (entries.length === 0) {
			try {
				entries = await this._lookup(hostname, {
					all: true
				});

				for (const entry of entries) {
					entry.ttl = this.fallbackTtl;
					entry.expires = Date.now() + (entry.ttl * 1000);
				}

				cacheTtl = this.fallbackTtl * 1000;
			} catch (error) {
				delete this._pending[hostname];

				if (error.code === 'ENOTFOUND') {
					cacheTtl = this.errorTtl * 1000;

					entries.expires = Date.now() + cacheTtl;
					await this._cache.set(hostname, entries, cacheTtl);
				}

				throw error;
			}
		} else {
			cacheTtl = Math.min(this.maxTtl, cacheTtl) * 1000;
		}

		if (this.maxTtl > 0 && cacheTtl > 0) {
			entries.expires = Date.now() + cacheTtl;
			await this._cache.set(hostname, entries, cacheTtl);
		}

		delete this._pending[hostname];

		return entries;
	}

	// eslint-disable-next-line no-unused-vars
	_getEntry(entries, hostname) {
		return entries[Math.floor(Math.random() * entries.length)];
	}

	tick() {
		if (this._tickLocked) {
			return;
		}

		if (this._cache instanceof Map) {
			const now = Date.now();

			for (const [hostname, {expires}] of this._cache) {
				if (now >= expires) {
					this._cache.delete(hostname);
				}
			}
		}

		this._tickLocked = true;

		setTimeout(() => {
			this._tickLocked = false;
		}, this._lockTime).unref();
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
