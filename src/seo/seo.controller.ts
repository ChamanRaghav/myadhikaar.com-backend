import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as pages from './pages.js';

/** sitemap.xml and robots.txt for the website, which proxies them from here. */
@Controller('seo')
@Public()
@SkipThrottle()
export class SeoController {
  private cache?: { xml: string; at: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots() {
    return `User-agent: *\nAllow: /\n\nSitemap: ${this.config.get('APP_URL', { infer: true })}/sitemap.xml\n`;
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemap() {
    if (this.cache && Date.now() - this.cache.at < 10 * 60_000) return this.cache.xml;
    const base = this.config.get('APP_URL', { infer: true });
    const today = new Date().toISOString().slice(0, 10);
    const url = (loc: string, changefreq: string, priority: string, lastmod = today) =>
      `  <url>\n    <loc>${xmlEscape(base + loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

    const blogs = await this.prisma.blog.findMany({
      where: { is_published: true },
      select: { id: true, slug: true, created_date: true, updated_date: true },
      orderBy: { created_date: 'desc' },
    });
    const { RGL_CITY_SLUGS: cities } = pages;
    const entries = [
      ...pages.STATIC_PAGES.map((p) => url(p.url, p.changefreq, p.priority)),
      ...blogs.map((b) => url(`/Blog/${b.slug || b.id}`, 'monthly', '0.7', (b.updated_date ?? b.created_date).toISOString().slice(0, 10))),
      ...cities.map((s) => url(`/rgl/city/${s}`, 'weekly', '0.8')),
      ...pages.RGL_SERVICE_SLUGS.map((s) => url(`/rgl/service/${s}`, 'weekly', '0.8')),
      ...pages.RGL_STATE_SLUGS.map((s) => url(`/rgl/state/${s}`, 'monthly', '0.75')),
      ...pages.RGL_GUIDE_SLUGS.map((s) => url(`/rgl/guide/${s}`, 'monthly', '0.75')),
      ...cities.flatMap((c) => pages.RGL_SERVICE_SLUGS.map((s) => url(`/rgl/${c}/${s}`, 'monthly', '0.75'))),
      ...cities.flatMap((c) => pages.RGL_VEHICLE_SLUGS.map((v) => url(`/rgl/${c}/for/${v}`, 'monthly', '0.7'))),
      ...cities.flatMap((c) => pages.RGL_PLAN_SLUGS.map((p) => url(`/rgl/${c}/plan/${p}`, 'monthly', '0.7'))),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
    this.cache = { xml, at: Date.now() };
    return xml;
  }
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}
