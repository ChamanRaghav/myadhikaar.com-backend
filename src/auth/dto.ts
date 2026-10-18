import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RequestCodeDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class VerifyCodeDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  /** Used only when this login creates the account */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;
}

export class GoogleLoginDto {
  @IsString()
  @Length(20, 5000)
  credential: string;
}

export class RefreshDto {
  @IsString()
  @Length(20, 200)
  refresh_token: string;
}

/** Fields users may change on their own profile (never role or email). */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsBoolean()
  notifications_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  avatar_url?: string;
}
