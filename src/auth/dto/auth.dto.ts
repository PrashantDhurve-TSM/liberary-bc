import { IsEmail, IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AdminLoginDto extends LoginDto {}

export class RefreshTokenDto {
  @IsJWT()
  refreshToken: string;
}
