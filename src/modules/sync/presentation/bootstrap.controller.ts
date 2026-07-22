import { Controller, Post, UseGuards, Req, HttpCode, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BootstrapUseCase } from "../application/bootstrap.use-case";
import type { BootstrapSnapshotDto } from "./bootstrap.dto";

@Controller("sync")
export class BootstrapController {
  constructor(private readonly bootstrapUseCase: BootstrapUseCase) {}

  @Post("bootstrap")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard("jwt"))
  async bootstrap(@Req() req: { user: { sub: string } }): Promise<BootstrapSnapshotDto> {
    return this.bootstrapUseCase.execute(req.user.sub);
  }
}
