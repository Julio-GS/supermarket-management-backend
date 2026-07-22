import {
  Controller,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RevalidateUseCase } from "../application/revalidate.use-case";
import type { RevalidateResponseDto } from "./sync.dto";

/**
 * Validate that a previously authenticated user is still permitted to
 * sync privileged actions on reconnect.
 */
@Controller("auth")
export class AuthRevalidateController {
  constructor(private readonly revalidateUseCase: RevalidateUseCase) {}

  @Post("revalidate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard("jwt"))
  async revalidate(
    @Req() req: { user: { sub: string } },
  ): Promise<RevalidateResponseDto> {
    return this.revalidateUseCase.execute(req.user.sub);
  }
}
