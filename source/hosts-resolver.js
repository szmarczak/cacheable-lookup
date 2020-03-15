'use strict';
const {stat, readFile} = require('fs').promises;
const {isIP} = require('net');

const isWindows = process.platform === 'win32';
const hostsPath = isWindows ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts';

const hostnameRegExp = /^(?:(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
const isHostname = hostname => hostnameRegExp.test(hostname);

const fileOptions = {
	encoding: 'utf8'
};

const whitespaceRegExp = /[^\S\r\n]{2,}/g;
const tabRegExp = /\t+/g;
const startsWithWhitespaceRegExp = /^[^\S\r\n]+/gm;

class HostsResolver {
	constructor(customHostsPath = hostsPath) {
		this._hostsPath = customHostsPath;
		this._promise = undefined;
		this._error = null;
		this._hosts = {};
		this._lastModifiedTime = 0;

		this.update();
	}

	async _update() {
		try {
			const {_hostsPath} = this;
			const {mtimeMs} = await stat(_hostsPath);

			if (mtimeMs === this._lastModifiedTime) {
				return this._hosts;
			}

			this._lastModifiedTime = mtimeMs;
			this._hosts = {};

			let lines = await readFile(_hostsPath, fileOptions);
			lines = lines.replace(whitespaceRegExp, ' ');
			lines = lines.replace(tabRegExp, ' ');
			lines = lines.replace(startsWithWhitespaceRegExp, '');
			lines = lines.split('\n');

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

	async update() {
		if (this._error || this._hostsPath === false) {
			return this._hosts;
		}

		const promise = this._update();

		this._promise = promise;
		await promise;
		this._promise = undefined;

		return this._hosts;
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

module.exports = HostsResolver;
