import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class WalletOrderDto {
  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  coupon?: string;
}

export class ServiceOrderDto {
  @IsString()
  @MaxLength(40)
  service_request_id: string;

  /** Slug from the services catalog; falls back to the request's service title */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  service_slug?: string;
}

export class RglVehicleDto {
  @IsString()
  @MaxLength(20)
  vehicle_reg: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicle_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle_name?: string;

  @IsString()
  @MaxLength(80)
  driver_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  driver_phone?: string;
}

export class RglQuoteDto {
  @IsString()
  plan: string;

  @IsString()
  vehicle_type: string;

  @IsInt()
  @Min(1)
  @Max(500)
  fleet_size: number;

  @IsString()
  billing_period: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  promo_code?: string;
}

export class RglOrderDto extends RglQuoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  referral_code?: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ValidateNested({ each: true })
  @Type(() => RglVehicleDto)
  @ArrayMaxSize(500)
  vehicles: RglVehicleDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pending_cases_details?: string;
}

export const PURPOSES = ['wallet_recharge', 'service', 'rgl_subscription'] as const;
export type Purpose = (typeof PURPOSES)[number];

export class CreatePaymentDto {
  @IsIn(PURPOSES)
  purpose: Purpose;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalletOrderDto)
  wallet?: WalletOrderDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceOrderDto)
  service?: ServiceOrderDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RglOrderDto)
  rgl?: RglOrderDto;

  /** Payer's phone for the gateway; defaults to the profile phone */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class QuoteDto {
  @IsIn(PURPOSES)
  purpose: Purpose;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalletOrderDto)
  wallet?: WalletOrderDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RglQuoteDto)
  rgl?: RglQuoteDto;

  @IsOptional()
  @IsString()
  service_slug?: string;

  @IsOptional()
  @IsString()
  package_name?: string;
}
