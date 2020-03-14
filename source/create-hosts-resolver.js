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
const startsWithWhitespaceRegExp = /^[^\S\r\n]+/gm;

const create = (customHostsPath = hostsPath) => {
	if (customHostsPath === false) {
		return {
			hosts: {},
			updateHosts: () => {}
		};
	}

	let lastModifiedTime;
	let localHosts = {};

	const updateHosts = async () => {
		const {mtimeMs} = await stat(customHostsPath);

		if (mtimeMs === lastModifiedTime) {
			return localHosts;
		}

		lastModifiedTime = mtimeMs;
		localHosts = {};

		let lines = await readFile(customHostsPath, fileOptions);
		lines = lines.replace(whitespaceRegExp, ' ');
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

				if (localHosts[hostname]) {
					let shouldAbort = false;

					for (const entry of localHosts[hostname]) {
						if (entry.family === family) {
							shouldAbort = true;
							break;
						}
					}

					if (shouldAbort) {
						continue;
					}
				} else {
					localHosts[hostname] = [];
				}

				localHosts[hostname].push({
					address,
					family,
					expires: Infinity,
					ttl: Infinity
				});
			}
		}

		return localHosts;
	};

	return {
		get hosts() {
			return localHosts;
		},
		updateHosts
	};
};

module.exports = create;
