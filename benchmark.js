'use strict';
const dns = require('dns');
const Benchmark = require('benchmark');
const CacheableLookup = require('.');

const cacheable = new CacheableLookup();
const notCacheable = new CacheableLookup({maxTtl: 0});
const suite = new Benchmark.Suite();

const options = {
	defer: true
};

const resolve4Options = {
	ttl: true
};

const lookupOptions = {
	all: true
};

const lookupOptionsADDRCONFIG = {
	...lookupOptions,
	hints: dns.ADDRCONFIG
};

suite.add('CacheableLookup#lookupAsync', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	cacheable.lookupAsync('localhost').then(() => deferred.resolve());
}, options).add('CacheableLookup#lookupAsync.all', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	cacheable.lookupAsync('localhost', lookupOptions).then(() => deferred.resolve());
}, options).add('CacheableLookup#lookupAsync.all.ADDRCONFIG', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	cacheable.lookupAsync('localhost', lookupOptionsADDRCONFIG).then(() => deferred.resolve());
}, options).add('CacheableLookup#lookup', deferred => {
	cacheable.lookup('localhost', lookupOptions, () => deferred.resolve());
}, options).add('CacheableLookup#lookup.all', deferred => {
	cacheable.lookup('localhost', lookupOptions, () => deferred.resolve());
}, options).add('CacheableLookup#lookup.all.ADDRCONFIG', deferred => {
	cacheable.lookup('localhost', lookupOptionsADDRCONFIG, () => deferred.resolve());
}, options).add('CacheableLookup#lookupAsync - zero TTL', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	notCacheable.lookupAsync('localhost', lookupOptions).then(() => deferred.resolve());
}, options).add('CacheableLookup#lookup - zero TTL', deferred => {
	notCacheable.lookup('localhost', lookupOptions, () => deferred.resolve());
}, options).add('dns#resolve4', deferred => {
	dns.resolve4('localhost', resolve4Options, () => deferred.resolve());
}, options).add('dns#lookup', deferred => {
	dns.lookup('localhost', () => deferred.resolve());
}, options).add('dns#lookup.all', deferred => {
	dns.lookup('localhost', lookupOptions, () => deferred.resolve());
}, options).add('dns#lookup.all.ADDRCONFIG', deferred => {
	dns.lookup('localhost', lookupOptionsADDRCONFIG, () => deferred.resolve());
}, options).on('cycle', event => {
	console.log(String(event.target));
}).on('complete', function () {
	console.log(`Fastest is ${this.filter('fastest').map('name')}`);
}).run({async: true});
