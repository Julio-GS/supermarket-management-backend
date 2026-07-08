import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { appConfig } from "./shared/config/app.config";
import { databaseConfig } from "./shared/config/database.config";
import { jwtConfig } from "./shared/config/jwt.config";
import { arcaConfig } from "./shared/config/arca.config";
import { DatabaseModule } from "./shared/database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProductsModule } from "./modules/products/products.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { PromotionsModule } from "./modules/promotions/promotions.module";
import { ReadCacheModule } from "./shared/cache/read-cache.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, arcaConfig],
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) =>
        config.get("database") as Record<string, unknown>,
      inject: [ConfigService],
    }),
    DatabaseModule,
    ReadCacheModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    SalesModule,
    ReportsModule,
    PromotionsModule,
  ],
})
export class AppModule {}
