'use strict';
const dns = require('dns');
const Benchmark = require('benchmark');
const CacheableLookup = require('.');

const cacheable = new CacheableLookup();
const suite = new Benchmark.Suite();

const options = {
	defer: true
};

const lookupOptions = {
	all: true
};

const lookupOptionsADDRCONFIG = {
	...lookupOptions,
	hints: dns.ADDRCONFIG
};

const query = 'example.com';

suite.add('CacheableLookup#lookupAsync', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	cacheable.lookupAsync(query).then(() => deferred.resolve());
}, options).add('CacheableLookup#lookupAsync.all', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	cacheable.lookupAsync(query, lookupOptions).then(() => deferred.resolve());
}, options).add('CacheableLookup#lookupAsync.all.ADDRCONFIG', deferred => {
	// eslint-disable-next-line promise/prefer-await-to-then
	cacheable.lookupAsync(query, lookupOptionsADDRCONFIG).then(() => deferred.resolve());
}, options).add('CacheableLookup#lookup', deferred => {
	cacheable.lookup(query, lookupOptions, () => deferred.resolve());
}, options).add('CacheableLookup#lookup.all', deferred => {
	cacheable.lookup(query, lookupOptions, () => deferred.resolve());
}, options).add('CacheableLookup#lookup.all.ADDRCONFIG', deferred => {
	cacheable.lookup(query, lookupOptionsADDRCONFIG, () => deferred.resolve());
}, options).add('dns#lookup', deferred => {
	dns.lookup(query, () => deferred.resolve());
}, options).add('dns#lookup.all', deferred => {
	dns.lookup(query, lookupOptions, () => deferred.resolve());
}, options).add('dns#lookup.all.ADDRCONFIG', deferred => {
	dns.lookup(query, lookupOptionsADDRCONFIG, () => deferred.resolve());
}, options).on('cycle', event => {
	console.log(String(event.target));
}).on('complete', function () {
	console.log(`Fastest is ${this.filter('fastest').map('name')}`);
});

(async () => {
	await cacheable.lookupAsync(query);

	await new Promise(resolve => setTimeout(resolve, 150));

	suite.run();
})();

// ---------------------------------------------------------------------------------------
// example.com
// CacheableLookup#lookupAsync                x 2,896,251 ops/sec ±1.07% (85 runs sampled)
// CacheableLookup#lookupAsync.all            x 2,842,664 ops/sec ±1.11% (88 runs sampled)
// CacheableLookup#lookupAsync.all.ADDRCONFIG x 2,598,283 ops/sec ±1.21% (88 runs sampled)
// CacheableLookup#lookup                     x 2,565,913 ops/sec ±1.56% (85 runs sampled)
// CacheableLookup#lookup.all                 x 2,609,039 ops/sec ±1.01% (86 runs sampled)
// CacheableLookup#lookup.all.ADDRCONFIG      x 2,416,242 ops/sec ±0.89% (85 runs sampled)
//
// demo (in the hosts file - 127.0.0.1)
// CacheableLookup#lookupAsync                x 2,970,364 ops/sec ±1.01% (86 runs sampled)
// CacheableLookup#lookupAsync.all            x 2,862,403 ops/sec ±1.44% (85 runs sampled)
// CacheableLookup#lookupAsync.all.ADDRCONFIG x 2,613,576 ops/sec ±2.46% (86 runs sampled)
// CacheableLookup#lookup                     x 2,716,194 ops/sec ±0.69% (88 runs sampled)
// CacheableLookup#lookup.all                 x 2,594,237 ops/sec ±1.79% (83 runs sampled)
// CacheableLookup#lookup.all.ADDRCONFIG      x 2,492,886 ops/sec ±1.18% (87 runs sampled)
