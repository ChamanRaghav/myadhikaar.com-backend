import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller.js';

@Module({ controllers: [SeoController] })
export class SeoModule {}
