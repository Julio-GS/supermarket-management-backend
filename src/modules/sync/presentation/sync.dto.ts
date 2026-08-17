import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsNumber,
} from "class-validator";
import { Type } from "class-transformer";
import type {
  SyncOperationType,
  SyncAggregateType,
} from "../application/sync.types";

// ---------------------------------------------------------------------------
// Push request DTOs
// ---------------------------------------------------------------------------

export class SyncPushEntryDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  idempotency_key!: string;

  @IsString()
  @IsNotEmpty()
  operation_type!: SyncOperationType;

  @IsString()
  @IsNotEmpty()
  aggregate_type!: SyncAggregateType;

  @IsString()
  @IsNotEmpty()
  aggregate_id!: string;

  @IsNotEmpty()
  payload!: unknown;

  @IsOptional()
  @IsString()
  base_server_version?: string | null;

  @IsOptional()
  @IsString()
  actor_user_id?: string | null;

  @IsString()
  @IsNotEmpty()
  created_at!: string;
}

export class SyncPushRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncPushEntryDto)
  entries!: SyncPushEntryDto[];
}

// ---------------------------------------------------------------------------
// Push response DTOs (for OpenAPI/serialization shape)
// ---------------------------------------------------------------------------

export interface SyncPushResultEntryDto {
  id: string;
  idempotency_key: string;
  status: string;
  server_id?: string | null;
  server_version?: string | null;
  reason?: string | null;
}

export interface SyncPushResponseDto {
  results: SyncPushResultEntryDto[];
}

// ---------------------------------------------------------------------------
// Pull query DTOs
// ---------------------------------------------------------------------------

export class SyncPullQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

// ---------------------------------------------------------------------------
// Pull response DTOs
// ---------------------------------------------------------------------------

export interface SyncPullChangeDto {
  id: string;
  aggregate_type: string;
  operation_type: string;
  server_version: string;
  server_applied_at: string;
  payload: unknown;
  deleted?: boolean;
}

export interface SyncPullResponseDto {
  changes: SyncPullChangeDto[];
  cursor: string;
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Auth revalidate
// ---------------------------------------------------------------------------

export interface RevalidateResponseDto {
  valid: boolean;
  user_id: string;
  username?: string;
  reason?: string;
}
