import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { appConfig } from "../src/shared/config/app.config";
import { jwtConfig } from "../src/shared/config/jwt.config";
import { arcaConfig } from "../src/shared/config/arca.config";
import { AuthModule } from "../src/modules/auth/auth.module";
import { UsersModule } from "../src/modules/users/users.module";
import { ProductsModule } from "../src/modules/products/products.module";
import { SalesModule } from "../src/modules/sales/sales.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, arcaConfig],
      envFilePath: ".env",
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
      ssl: (
        process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
      )?.includes("neon")
        ? { rejectUnauthorized: false }
        : undefined,
      autoLoadEntities: true,
      synchronize: true,
      dropSchema: true,
      logging: false,
    }),
    AuthModule,
    UsersModule,
    ProductsModule,
    SalesModule,
  ],
})
export class TestAppModule {}
