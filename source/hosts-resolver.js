'use strict';
const {watch} = require('fs');
const {readFile} = require('fs').promises;
const {isIP} = require('net');

const isWindows = process.platform === 'win32';
const hostsPath = isWindows ? `${process.env.SystemDrive}\\Windows\\System32\\drivers\\etc\\hosts` : '/etc/hosts';

const hostnameRegExp = /^(?:(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
const isHostname = hostname => hostnameRegExp.test(hostname);

const fileOptions = {
	encoding: 'utf8'
};

const whitespaceRegExp = /[^\S\r\n]{2,}/g;
const tabRegExp = /\t+/g;
const startsWithWhitespaceRegExp = /^[^\S\r\n]+/gm;

class HostsResolver {
	constructor({watching, customHostsPath}) {
		this._hostsPath = customHostsPath;
		this._error = null;
		this._watcher = null;
		this._watching = Boolean(watching);
		this._hosts = {};

		this._init();
	}

	_init() {
		if (typeof this._hostsPath !== 'string') {
			return;
		}

		this._promise = (async () => {
			await this._update();

			if (this._error) {
				return;
			}

			if (this._watching) {
				this._watcher = watch(this._hostsPath, {
					persistent: false
				}, eventType => {
					if (eventType === 'change') {
						this._update();
					} else {
						this._watcher.close();
					}
				});

				this._watcher.once('error', error => {
					this._error = error;
					this._hosts = {};
				});

				this._watcher.once('close', () => {
					this._init();
				});
			}

			this._promise = null;
		})();
	}

	async _update() {
		try {
			let lines = await readFile(this._hostsPath, fileOptions);
			lines = lines.replace(whitespaceRegExp, ' ');
			lines = lines.replace(tabRegExp, ' ');
			lines = lines.replace(startsWithWhitespaceRegExp, '');
			lines = lines.split('\n');

			this._hosts = {};

			for (const line of lines) {
				const parts = line.split(' ');

				const family = isIP(parts[0]);
				if (!family) {
					continue;
				}

				const address = parts.shift();

				for (const hostname of parts) {
					if (!isHostname(hostname)) {
						break;
					}

					if (this._hosts[hostname]) {
						let shouldAbort = false;

						for (const entry of this._hosts[hostname]) {
							if (entry.family === family) {
								shouldAbort = true;
								break;
							}
						}

						if (shouldAbort) {
							continue;
						}
					} else {
						this._hosts[hostname] = [];
						this._hosts[hostname].expires = Infinity;
					}

					this._hosts[hostname].push({
						address,
						family,
						expires: Infinity,
						ttl: Infinity
					});
				}
			}
		} catch (error) {
			this._hosts = {};
			this._error = error;
		}
	}

	async get(hostname) {
		if (this._promise) {
			await this._promise;
		}

		if (this._error) {
			throw this._error;
		}

		return this._hosts[hostname];
	}
}

const resolvers = {};

const getResolver = (options = {
	watching: false,
	customHostsPath: hostsPath
}) => {
	if (typeof options.customHostsPath !== 'string') {
		options.customHostsPath = false;
	}

	const id = `${options.customHostsPath}:${Boolean(options.watching)}`;

	let resolver = resolvers[id];

	if (resolver) {
		return resolver;
	}

	resolver = new HostsResolver(options);
	resolvers[id] = resolver;

	return resolver;
};

HostsResolver.getResolver = getResolver;

module.exports = HostsResolver;
