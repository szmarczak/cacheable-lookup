import Keyv from "keyv";
import dns from "dns";

type IPFamily = 4 | 6;

interface Options {
	/**
	 * A Keyv adapter which stores the cache.
	 * @default new Map()
	 */
	cacheAdapter?: Keyv;
	/**
	 * Limits the cache time (TTL).
	 * If set to `0`, it will make a new DNS query each time.
	 * @default Infinity
	 */
	maxTtl?: number;
	/**
	 * DNS Resolver used to make DNS queries.
	 * @default new dns.Resolver()
	 */
	resolver?: dns.Resolver;
}

interface EntryObject {
	/**
	 * The IP address (can be an IPv4 or IPv5 address).
	 */
	address: string;
	/**
	 * The IP family.
	 */
	family: IPFamily;
}

interface LookupOptions extends dns.LookupOptions {
	/**
	 * If `true` the entries returned by `lookup(…)` and `lookupAsync(…)`
	 * will have additional `expires` and `ttl` properties representing
	 * the expiration timestamp and the original TTL.
	 * @default false
	 */
	details?: boolean;
}

interface AsyncLookupOptions extends LookupOptions {
	/**
	 * Throw when there's no match.
	 * If set to `false` and it gets no match, it will return `undefined`.
	 * @default false
	 */
	throwNotFound?: boolean;
}

interface CachedEntry {
	address: string;
	family: IPFamily;
	ttl: number;
	expires: number;
}

declare function lookup(
	hostname: string,
	family: IPFamily,
	callback: (
		err: NodeJS.ErrnoException,
		address: string,
		family: IPFamily
	) => void
): void;
declare function lookup(
	hostname: string,
	options: LookupOptions,
	callback: (
		err: NodeJS.ErrnoException,
		address: string | dns.LookupAddress[],
		family?: IPFamily
	) => void
): void;
declare function lookup(
	hostname: string,
	callback: (
		err: NodeJS.ErrnoException,
		address: string,
		family: IPFamily
	) => void
): void;

declare function lookupAsync(
	hostname: string,
	family: IPFamily
): Promise<EntryObject>;
declare function lookupAsync(
	hostname: string,
	options: AsyncLookupOptions
): Promise<EntryObject>;
declare function lookupAsync(hostname: string): Promise<EntryObject>;

export default class CacheableLookup {
	constructor(options: Options);
	/**
	 * DNS servers used to make the query.
	 * Can be overriden - then the new servers will be used.
	 */
	servers: string[];
	/**
	 * https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback
	 */
	lookup: typeof lookup;
	/**
	 * The asynchronous version of `dns.lookup(…)`.
	 */
	lookupAsync: typeof lookupAsync;
	/**
	 * An asynchronous function which returns cached DNS lookup entries.
	 * This is the base for `lookupAsync(hostname, options)`
	 * and `lookup(hostname, options, callback)`.
	 */
	query(hostname: string, family: IPFamily): Promise<CachedEntry[]>;
	queryAndCache(hostname: string, family: IPFamily): Promise<CachedEntry[]>;
}
