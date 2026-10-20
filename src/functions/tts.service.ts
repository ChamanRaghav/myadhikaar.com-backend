import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Env } from '../config/env.js';

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // multilingual voice that handles Hindi well
const MAX_CHARS = 800;
const CACHE_SIZE = 200;

/** ElevenLabs text-to-speech for blog "listen" and the assistant. Identical text is served from cache. */
@Injectable()
export class TtsService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async speak(text?: string) {
    const key = this.config.get('ELEVENLABS_API_KEY', { infer: true });
    if (!key) throw new ServiceUnavailableException('Text to speech is not configured');
    const input = text?.trim().slice(0, MAX_CHARS);
    if (!input) throw new BadRequestException('text is required');
    const hash = createHash('sha256').update(input).digest('hex');
    let audio = this.cache.get(hash);
    if (!audio) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: input,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
      });
      if (!res.ok) throw new ServiceUnavailableException('Text to speech failed');
      audio = Buffer.from(await res.arrayBuffer()).toString('base64');
      if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(hash, audio);
    }
    return { audio, format: 'mp3' };
  }
}
