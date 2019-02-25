import {expectType} from 'tsd-check';
import CacheableLookup, { EntryObject } from '.';

const cacheable = new CacheableLookup();

expectType<string[]>(cacheable.servers);

expectType<EntryObject>(await cacheable.lookupAsync('localhost', 4));
expectType<EntryObject>(await cacheable.lookupAsync('localhost', {all: false}));
expectType<ReadonlyArray<EntryObject>>(await cacheable.lookupAsync('localhost', {all: true}));
expectType<EntryObject & {expires: number, ttl: number}>(await cacheable.lookupAsync('localhost', {details: true, all: false}));
expectType<EntryObject & {expires: number, ttl: number}>(await cacheable.lookupAsync('localhost', {details: true}));
expectType<ReadonlyArray<EntryObject & {expires: number, ttl: number}>>(await cacheable.lookupAsync('localhost', {all: true, details: true}));

cacheable.lookup('localhost', 6, (err, address, family) => {
  expectType<NodeJS.ErrnoException>(err);
  expectType<string>(address);
  expectType<4 | 6>(family);
});

cacheable.lookup('localhost', {all: false}, (err, address, family) => {
  expectType<NodeJS.ErrnoException>(err);
  expectType<string>(address);
  expectType<4 | 6>(family);
});

cacheable.lookup('localhost', {all: true}, (err, results) => {
  expectType<NodeJS.ErrnoException>(err);
  expectType<ReadonlyArray<EntryObject>>(results);
});

cacheable.lookup('localhost', {all: true, details: true}, (err, results) => {
  expectType<NodeJS.ErrnoException>(err);
  expectType<ReadonlyArray<EntryObject & {expires: number, ttl: number}>>(results);
});

expectType<ReadonlyArray<EntryObject>>(await cacheable.query('localhost', 4));
expectType<ReadonlyArray<EntryObject>>(await cacheable.queryAndCache('localhost', 4));