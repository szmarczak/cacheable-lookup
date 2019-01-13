'use strict';
const dns = require('dns');
const Benchmark = require('benchmark');
const CacheableLookup = require('.');

const cacheable = new CacheableLookup();
const notCacheable = new CacheableLookup({maxTtl: 0});
const suite = new Benchmark.Suite;

const options = {
	defer: true,
	minSamples: 200
};

suite.add('CacheableLookup#lookupAsync', deferred => {
	cacheable.lookupAsync('localhost').then(() => deferred.resolve());
}, options).add('CacheableLookup#lookup', deferred => {
	cacheable.lookup('localhost', () => deferred.resolve());
}, options).add('CacheableLookup#lookupAsync - zero TTL', deferred => {
	notCacheable.lookupAsync('localhost').then(() => deferred.resolve());
}, options).add('CacheableLookup#lookup - zero TTL', deferred => {
	notCacheable.lookup('localhost', () => deferred.resolve());
}, options).add('dns#resolve4', deferred => {
	dns.resolve4('localhost', {ttl: true}, () => deferred.resolve());
}, options).add('dns#lookup', deferred => {
	dns.lookup('localhost', {all: true}, () => deferred.resolve());
}, options).on('cycle', function(event) {
	console.log(String(event.target));
}).on('complete', function() {
	console.log(`Fastest is ${this.filter('fastest').map('name')}`);
}).run({async: true});
