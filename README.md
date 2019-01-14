# cacheable-lookup

> Cacheable [`dns.lookup(…)`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) which respects the TTL :tada:

[![Build Status](https://travis-ci.org/szmarczak/cacheable-lookup.svg?branch=master)](https://travis-ci.org/szmarczak/cacheable-lookup)
[![Coverage Status](https://coveralls.io/repos/github/szmarczak/cacheable-lookup/badge.svg?branch=master)](https://coveralls.io/github/szmarczak/cacheable-lookup?branch=master)
[![npm](https://img.shields.io/npm/dm/cacheable-lookup.svg)](https://www.npmjs.com/package/cacheable-lookup)
[![install size](https://packagephobia.now.sh/badge?p=cacheable-lookup)](https://packagephobia.now.sh/result?p=cacheable-lookup)

Making lots of HTTP requests? You can save some time by caching DNS lookups.<br>
Don't worry, this package respects the TTL :smiley:

## Usage

```js
const CacheableLookup = require('cacheable-lookup');
const cacheable = new CacheableLookup();

http.get('https://example.com', {lookup: cacheable.lookup}, response => {
	// Handle the response here
});
```

## API

### new CacheableLookup(options)

Returns a new instance of `CacheableLookup`.

#### options

Type: `Object`<br>
Default: `{}`

Options used to cache the DNS lookups.

##### options.cacheAdapter

A [Keyv adapter](https://github.com/lukechilds/keyv) which stores the cache.

##### options.maxTtl

Type: `number`<br>
Default: `Infinity`

Limits the cache time (TTL).

If set to `0`, it will make a new DNS query each time.

##### options.resolver

Type: `Function`<br>
Default: [`new dns.Resolver()`](https://nodejs.org/api/dns.html#dns_class_dns_resolver)

An instance of [DNS Resolver](https://nodejs.org/api/dns.html#dns_class_dns_resolver) used to make DNS queries.

### Instance

#### servers

DNS servers used to make the query. Can be overriden - then the new servers will be used.

#### [lookup(hostname, options, callback)](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback)

#### lookupAsync(hostname, options)

The asynchronous version of `dns.lookup(…)`.

##### hostname

Type: `string`

##### options

Type: `Object`

The same as the [`dns.lookup(…)`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) options.

##### options.throwNotFound

Type: `boolean`<br>
Default: `false`

Throw when there's no match.

If set to `false` and it gets no match, it will return `undefined`.

**Note**: This option is meant **only** for the asynchronous implementation! The synchronous version will always throw an error if no match found.

##### options.details

Type: `boolean`<br>
Default: `false`

If `true` the entries will have additional `expires` and `ttl` properties representing the expiration timestamp and the original ttl.

#### query(hostname, family)

An asynchronous function which returns cached DNS lookup entries. This is the base for `lookupAsync(hostname, options)` and `lookup(hostname, options, callback)`.

**Note**: This function has no options.

Returns an array of objects with `address` and `family` properties.

#### queryAndCache(hostname, family)

An asynchronous function which makes a new DNS lookup query and updates the database. This is used by `query(hostname, family)` if no entry in the database is present.

Returns an array of objects with `address` and `family` properties.

##### entries

An array of objects with `address` and `family` properties.

## License

MIT
