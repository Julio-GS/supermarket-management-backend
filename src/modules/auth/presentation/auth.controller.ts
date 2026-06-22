import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { RegisterUseCase } from "../application/register.use-case";
import { LoginUseCase } from "../application/login.use-case";
import { AuthResponseDto, LoginDto, RegisterDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    await this.registerUseCase.execute(dto);
    const { access_token } = await this.loginUseCase.execute(dto);
    return { access_token };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.loginUseCase.execute(dto);
  }
}
