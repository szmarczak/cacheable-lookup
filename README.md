# cacheable-lookup

> Cacheable [`dns.lookup(...)`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) which respects the TTL :tada:

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

Type: `object`<br>
Default: `{}`

Options used to cache the DNS lookups.

##### options.cacheAdapter

A [Keyv adapter](https://github.com/lukechilds/keyv) where is stored the cache.

##### options.maxTtl

Type: `number`<br>
Default: `Infinity`

Limits the TTL. If set to `0` it'll make a new query each time.

##### options.resolver

An instance of [DNS Resolver](https://nodejs.org/api/dns.html#dns_class_dns_resolver) used to make DNS queries.

### Instance

#### servers

DNS servers used to make the query. Can be overriden - then the new servers will be used.

#### [lookup](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback)

#### lookupAsync(hostname, options)

The asynchronous version of `dns.lookup(...)`.

##### hostname

Type: `string`

##### options

Type: `object`

The same as [`dns.lookup(...)`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) options.

##### options.throwNotFound

Type: `boolean`<br>
Default: `false`

States if it should throw when there's no match. If set to `false` and got no match, it will return `undefined`.

**Note**: This option is meant **only** for the asynchronous implementation! The synchronous version will always throw an error if no match found.

#### query(hostname, family)

An asynchronous function which returns cached DNS lookup entries. This is the base for `lookupAsync(hostname, options)` and `lookup(hostname, options, callback)`.

**Note**: This function has no options.

Returns an array of objects with `address` and `family` properties.

#### queryAndCache(hostname, family)

An asynchronous function which makes a new DNS lookup query and updates the database. This is used by `query(hostname, family)` if no entry in the database is present.

Returns an array of objects with `address` and `family` properties.

#### getEntry(entries)

Selects one entry of many.

##### entries

An array of objects with `address` and `family` properties.

## License

MIT
