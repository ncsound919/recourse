/**
 * publisher.ts — orchestrates a publish pass: take an article, deliver it to
 * every enabled target, and record each delivery. Re-publishing unchanged
 * content is a no-op per target (the delivery log holds the content hash), so a
 * scheduled pass is idempotent and cannot spam a channel.
 */
import type { PublicArticle, ArticleStore } from './articles.js';
import {
  deliverToTarget,
  type DeliveryLog,
  type PublishContext,
  type PublishDelivery,
  type PublishTarget,
  type PublishTargetStore,
} from './targets.js';

export interface PublishRun {
  slug: string;
  contentHash: string;
  attemptedAt: number;
  deliveries: PublishDelivery[];
  delivered: number;
  skipped: number;
  failed: number;
}

export async function publishArticleToTargets(
  article: PublicArticle,
  targets: readonly PublishTarget[],
  log: DeliveryLog,
  ctx: PublishContext = {},
): Promise<PublishRun> {
  const attemptedAt = ctx.now ?? Date.now();
  const deliveries: PublishDelivery[] = [];
  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of targets) {
    if (log.hasDelivered(article.contentHash, target.id)) {
      skipped += 1;
      continue;
    }
    const delivery = await deliverToTarget(target, article, { ...ctx, now: attemptedAt });
    log.record(delivery);
    deliveries.push(delivery);
    if (delivery.ok) delivered += 1;
    else failed += 1;
  }

  return { slug: article.slug, contentHash: article.contentHash, attemptedAt, deliveries, delivered, skipped, failed };
}

export interface PublishDeps {
  store: ArticleStore;
  targets: PublishTargetStore;
  log: DeliveryLog;
  ctx?: PublishContext;
}

/** Publish a stored article to all enabled targets. */
export async function publishArticle(slug: string, deps: PublishDeps): Promise<PublishRun | null> {
  const article = deps.store.publish(slug);
  if (!article) return null;
  return publishArticleToTargets(article, deps.targets.enabled(), deps.log, deps.ctx);
}

/** Publish every already-published public article (scheduled export). */
export async function publishAllPublished(deps: PublishDeps): Promise<PublishRun[]> {
  const runs: PublishRun[] = [];
  for (const article of deps.store.list()) {
    if (article.publishedAt === undefined) continue;
    runs.push(await publishArticleToTargets(article, deps.targets.enabled(), deps.log, deps.ctx));
  }
  return runs;
}
