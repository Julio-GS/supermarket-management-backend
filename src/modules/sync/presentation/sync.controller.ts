import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PushUseCase } from "../application/push.use-case";
import { PullUseCase } from "../application/pull.use-case";
import type { SyncPushEntry } from "../application/sync.types";
import {
  SyncPushRequestDto,
  SyncPushResponseDto,
  SyncPullQueryDto,
  SyncPullResponseDto,
} from "./sync.dto";

@Controller("sync")
export class SyncController {
  constructor(
    private readonly pushUseCase: PushUseCase,
    private readonly pullUseCase: PullUseCase,
  ) {}

  /**
   * Accept an ordered batch of outbox operations from a desktop client.
   * Requires a valid JWT.
   */
  @Post("push")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard("jwt"))
  async push(
    @Body() body: SyncPushRequestDto,
  ): Promise<SyncPushResponseDto> {
    return this.pushUseCase.execute({
      entries: body.entries as SyncPushEntry[]
    });
  }

  /**
   * Return authoritative changes since a cursor.
   * Requires a valid JWT.
   */
  @Get("pull")
  @UseGuards(AuthGuard("jwt"))
  async pull(
    @Query() query: SyncPullQueryDto,
    @Req() req: { user: { sub: string } },
  ): Promise<SyncPullResponseDto> {
    // `req.user.sub` is available but not strictly needed for the current
    // pull implementation; it will be used when scoping changes by branch/user.
    void req.user.sub;
    return this.pullUseCase.execute({
      cursor: query.cursor,
      limit: query.limit,
    });
  }
}
