import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../config/env.js';

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

/** Verifies the ID token ("credential") from Google Identity Services on the frontend. */
@Injectable()
export class GoogleVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(credential: string): Promise<GoogleProfile> {
    const audience = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!audience) throw new ServiceUnavailableException('Google sign-in is not configured');
    let payload;
    try {
      payload = (await this.client.verifyIdToken({ idToken: credential, audience })).getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }
    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }
    return { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture };
  }
}
