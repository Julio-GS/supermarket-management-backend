import { Global, Module } from "@nestjs/common";
import { InMemoryReadCache } from "./in-memory-read-cache";
import { ReadCachePort } from "./read-cache.port";

@Global()
@Module({
  providers: [{ provide: ReadCachePort, useClass: InMemoryReadCache }],
  exports: [ReadCachePort],
})
export class ReadCacheModule {}
