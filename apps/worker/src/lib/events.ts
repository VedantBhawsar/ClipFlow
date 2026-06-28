/**
 * Worker event publisher.
 *
 * A lightweight Redis pub/sub publisher that mirrors the channel naming
 * convention of the API's event bus (`clipflow:events:user:{userId}` and
 * `clipflow:events:video:{videoId}`) so the API's SSE layer can forward
 * these events to connected clients without any shared package.
 *
 * The worker only publishes — it never subscribes. A single ioredis
 * connection is used (Redis pub/sub allows publishing on a connection
 * that hasn't called SUBSCRIBE).
 */
import { Redis } from "ioredis";
import type { SseVideoEvent } from "@clipflow/types";

export const EVENT_CHANNEL_PREFIX = "clipflow:events";

export interface EventPublisher {
  publish(event: SseVideoEvent): Promise<void>;
  dispose(): Promise<void>;
}

export class WorkerEventPublisher implements EventPublisher {
  private readonly redis: Redis;
  private connected = false;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: true,
    });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
    const pong = await this.redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Redis PING failed: expected PONG, received ${pong}`);
    }
    this.connected = true;
  }

  async publish(event: SseVideoEvent): Promise<void> {
    if (!this.connected) return;

    const userChannel = `${EVENT_CHANNEL_PREFIX}:user:${event.userId}`;
    const videoChannel = `${EVENT_CHANNEL_PREFIX}:video:${event.videoId}`;
    const payload = JSON.stringify(event);

    try {
      await Promise.all([
        this.redis.publish(userChannel, payload),
        this.redis.publish(videoChannel, payload),
      ]);
    } catch {
      // Publishing is best-effort — don't let a failed publish crash the job
    }
  }

  async dispose(): Promise<void> {
    this.connected = false;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
