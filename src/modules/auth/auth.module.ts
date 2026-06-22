import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./presentation/auth.controller";
import { RegisterUseCase } from "./application/register.use-case";
import { LoginUseCase } from "./application/login.use-case";
import { JwtStrategy } from "./infrastructure/jwt.strategy";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>("jwt.secret"),
        signOptions: {
          // jsonwebtoken v9's expiresIn type is stricter than plain string;
          // the config always supplies a valid value such as '7d'.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expiresIn: config.get<string>("jwt.expiresIn") as any,
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [RegisterUseCase, LoginUseCase, JwtStrategy],
})
export class AuthModule {}
