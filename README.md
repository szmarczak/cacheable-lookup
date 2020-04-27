# cacheable-lookup

> A cacheable [`dns.lookup(…)`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) that respects TTL :tada:

[![Node CI](https://github.com/szmarczak/cacheable-lookup/workflows/Node%20CI/badge.svg)](https://github.com/szmarczak/cacheable-lookup/actions)
[![Coverage Status](https://coveralls.io/repos/github/szmarczak/cacheable-lookup/badge.svg?branch=master)](https://coveralls.io/github/szmarczak/cacheable-lookup?branch=master)
[![npm](https://img.shields.io/npm/dm/cacheable-lookup.svg)](https://www.npmjs.com/package/cacheable-lookup)
[![install size](https://packagephobia.now.sh/badge?p=cacheable-lookup)](https://packagephobia.now.sh/result?p=cacheable-lookup)

Making lots of HTTP requests? You can save some time by caching DNS lookups :zap:

## Usage

### Using the `lookup` option

```js
const http = require('http');
const CacheableLookup = require('cacheable-lookup');
const cacheable = new CacheableLookup();

http.get('https://example.com', {lookup: cacheable.lookup}, response => {
	// Handle the response here
});
```

### Attaching CacheableLookup to an Agent

```js
const http = require('http');
const CacheableLookup = require('cacheable-lookup');
const cacheable = new CacheableLookup();

cacheable.install(http.globalAgent);

http.get('https://example.com', response => {
	// Handle the response here
});
```

## API

### new CacheableLookup(options)

Returns a new instance of `CacheableLookup`.

#### cache

Type: `Map` | [`Keyv`](https://github.com/lukechilds/keyv/)<br>
Default: `new Map()`

Custom cache instance. If `undefined`, it will create a new one.

**Note**: If you decide to use Keyv instead of the native implementation, the performance will drop by 10x. Memory leaks may occur as it doesn't provide any way to remove all the deprecated values at once.

#### options

Type: `object`<br>
Default: `{}`

Options used to cache the DNS lookups.

##### options.maxTtl

Type: `number`<br>
Default: `Infinity`

The maximum lifetime of the entries received from the specifed DNS server (TTL in seconds).

If set to `0`, it will make a new DNS query each time.

**Pro Tip**: This shouldn't be lower than your DNS server response time in order to prevent bottlenecks. For example, if you use Cloudflare, this value should be greater than `0.01`.

##### options.fallbackTtl

Type: `number`<br>
Default: `1`

The lifetime of the entries received from the OS (TTL in seconds).

**Note**: This option is independent, `options.maxTtl` does not affect this.

**Pro Tip**: This shouldn't be lower than your DNS server response time in order to prevent bottlenecks. For example, if you use Cloudflare, this value should be greater than `0.01`.

##### options.errorTtl

Type: `number`<br>
Default: `0.15`

The time how long it needs to remember queries that threw `ENOTFOUND` (TTL in seconds).

**Note**: This option is independent, `options.maxTtl` does not affect this.

**Pro Tip**: This shouldn't be lower than your DNS server response time in order to prevent bottlenecks. For example, if you use Cloudflare, this value should be greater than `0.01`.

##### options.resolver

Type: `dns.Resolver | dns.promises.Resolver`<br>
Default: [`new dns.promises.Resolver()`](https://nodejs.org/api/dns.html#dns_class_dns_resolver)

An instance of [DNS Resolver](https://nodejs.org/api/dns.html#dns_class_dns_resolver) used to make DNS queries.

##### options.customHostsPath

Type: `string`<br>
Default: `undefined` (OS-specific)

The full path to the `hosts` file. Set this to `false` to prevent loading entries from the `hosts` file.

### Entry object

Type: `object`

#### address

Type: `string`

The IP address (can be an IPv4 or IPv6 address).

#### family

Type: `number`

The IP family (`4` or `6`).

##### expires

Type: `number`

**Note**: This is not present when using the native `dns.lookup(...)`!

The timestamp (`Date.now() + ttl * 1000`) when the entry expires.

#### ttl

**Note**: This is not present when using the native `dns.lookup(...)`!

The time in seconds for its lifetime.

### Entry object (callback-style)

When `options.all` is `false`, then `callback(error, address, family, expires, ttl)` is called. <br>
When `options.all` is `true`, then `callback(error, entries)` is called.

### CacheableLookup instance

#### servers

Type: `Array`

The DNS servers used to make queries. Can be overridden - doing so will trigger `cacheableLookup.updateInterfaceInfo()`.

#### [lookup(hostname, options, callback)](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback)

#### lookupAsync(hostname, options)

The asynchronous version of `dns.lookup(…)`.

Returns an [entry object](#entry-object).<br>
If `options.all` is true, returns an array of entry objects.

**Note**: If entry(ies) were not found, it will return `undefined` by default.

##### hostname

Type: `string`

##### options

Type: `object`

The same as the [`dns.lookup(…)`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) options.

#### query(hostname)

An asynchronous function which returns cached DNS lookup entries.<br>
This is the base for `lookupAsync(hostname, options)` and `lookup(hostname, options, callback)`.

**Note**: This function has no options.

Returns an array of objects with `address`, `family`, `ttl` and `expires` properties.

#### queryAndCache(hostname)

An asynchronous function which makes two DNS queries: A and AAAA. The result is cached.<br>
This is used by `query(hostname)` if no entry in the database is present.

Returns an array of objects with `address`, `family`, `ttl` and `expires` properties.

#### tick()

Removes outdated entries. It's automatically called on every lookup.

#### updateInterfaceInfo()

Updates interface info. For example, you need to run this when you plug or unplug your WiFi driver.

**Note:** Running `updateInterfaceInfo()` will also trigger `clear()`!

#### clear(hostname?)

Clears the cache for the given hostname. If the hostname argument is not present, the entire cache will be cleared.

## High performance

Performed on:
- Query: `example.com`
- CPU: i7-7700k
- CPU governor: performance

```
CacheableLookup#lookupAsync                x 2,441,577 ops/sec ±0.57% (87 runs sampled)
CacheableLookup#lookupAsync.all            x 2,539,120 ops/sec ±0.48% (88 runs sampled)
CacheableLookup#lookupAsync.all.ADDRCONFIG x 2,228,416 ops/sec ±0.31% (88 runs sampled)
CacheableLookup#lookup                     x 2,374,110 ops/sec ±0.29% (89 runs sampled)
CacheableLookup#lookup.all                 x 2,311,587 ops/sec ±0.38% (88 runs sampled)
CacheableLookup#lookup.all.ADDRCONFIG      x 2,074,475 ops/sec ±0.41% (90 runs sampled)
dns#lookup                                 x 7,272     ops/sec ±0.36% (86 runs sampled)
dns#lookup.all                             x 7,249     ops/sec ±0.40% (86 runs sampled)
dns#lookup.all.ADDRCONFIG                  x 5,693     ops/sec ±0.28% (85 runs sampled)
Fastest is CacheableLookup#lookupAsync.all
```

The package is based on [`dns.resolve4(…)`](https://nodejs.org/api/dns.html#dns_dns_resolve4_hostname_options_callback) and [`dns.resolve6(…)`](https://nodejs.org/api/dns.html#dns_dns_resolve6_hostname_options_callback).

[Why not `dns.lookup(…)`?](https://github.com/nodejs/node/issues/25560#issuecomment-455596215)

> It is not possible to use `dns.lookup(…)` because underlying calls like [getaddrinfo](http://man7.org/linux/man-pages/man3/getaddrinfo.3.html) have no concept of servers or TTL (caching is done on OS level instead).

## Related

 - [cacheable-request](https://github.com/lukechilds/cacheable-request) - Wrap native HTTP requests with RFC compliant cache support

## License

MIT
