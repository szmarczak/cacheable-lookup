import {expectType} from 'tsd';
import CacheableLookup, {EntryObject} from '.';

const cacheable = new CacheableLookup();

expectType<string[]>(cacheable.servers);

expectType<EntryObject>(await cacheable.lookupAsync('localhost', 4));
expectType<EntryObject>(await cacheable.lookupAsync('localhost', {all: false}));
expectType<ReadonlyArray<EntryObject>>(await cacheable.lookupAsync('localhost', {all: true}));

cacheable.lookup('localhost', 6, (error, address, family) => {
  expectType<NodeJS.ErrnoException>(error);
  expectType<string>(address);
  expectType<4 | 6>(family);
});

cacheable.lookup('localhost', {all: false}, (error, address, family) => {
  expectType<NodeJS.ErrnoException>(error);
  expectType<string>(address);
  expectType<4 | 6>(family);
});

cacheable.lookup('localhost', {all: true}, (error, results) => {
  expectType<NodeJS.ErrnoException>(error);
  expectType<ReadonlyArray<EntryObject>>(results);
});

expectType<ReadonlyArray<EntryObject>>(await cacheable.query('localhost'));
expectType<ReadonlyArray<EntryObject>>(await cacheable.queryAndCache('localhost'));

expectType<void>(cacheable.updateInterfaceInfo());
expectType<void>(cacheable.clear());
