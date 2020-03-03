'use strict';
const {stat, readFile} = require('fs').promises;

const isWindows = process.platform === 'win32';
const hostsPath = isWindows ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts';

const fileOptions = {
	encoding: 'utf8'
};

const create = (customHostsPath = hostsPath) => {
	if (customHostsPath === false) {
		return {
			hosts: {},
			updateHosts: () => {}
		};
	}

	let lastModifiedTime;
	let localHosts = {};

	const ipAndHost = /^\s*(?<address>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(?<hostname>[a-zA-Z0-9-.]{1,63})/;

	const updateHosts = async () => {
		const {mtimeMs} = await stat(customHostsPath);

		if (mtimeMs === lastModifiedTime) {
			return localHosts;
		}

		lastModifiedTime = mtimeMs;

		localHosts = {};

		const lines = (await readFile(customHostsPath, fileOptions)).split('\n');
		for (let line of lines) {
			const commentIndex = line.indexOf('#');

			if (commentIndex !== -1) {
				line = line.slice(0, commentIndex);
			}

			const result = line.match(ipAndHost);

			if (result) {
				const {address, hostname} = result.groups;

				localHosts[hostname] = [
					{
						address,
						family: 4,
						expires: Infinity,
						ttl: Infinity
					}
				];
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
