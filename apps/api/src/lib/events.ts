/**
 * Event bus for video processing progress.
 *
 * Uses Redis pub/sub when REDIS_URL is configured; falls back to an
 * in-memory EventEmitter for dev/test. Workers emit progress events
 * here, and the SSE layer subscribes to forward them to connected
 * clients.
 *
 * Two channel namespaces:
 *   video:<videoId>   — events scoped to a single video
 *   user:<userId>     — all events for a user's videos
 */
import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import type { Env } from "@clipflow/config";

export const EVENT_CHANNEL_PREFIX = "clipflow:events";

// ---------- Event shapes ----------

export interface VideoStatusEvent {
  type: "STATUS_UPDATE";
  videoId: string;
  userId: string;
  status: string;
  timestamp: string;
}

export interface VideoProgressEvent {
  type: "PROGRESS";
  videoId: string;
  userId: string;
  progress: number;
  stage: string;
  timestamp: string;
}

export interface VideoErrorEvent {
  type: "ERROR";
  videoId: string;
  userId: string;
  error: string;
  timestamp: string;
}

export interface VideoChaptersPushEvent {
  type: "CHAPTERS_PUSH";
  videoId: string;
  userId: string;
  chaptersJson: unknown;
  timestamp: string;
}

export interface VideoThumbnailsPushEvent {
  type: "THUMBNAILS_PUSH";
  videoId: string;
  userId: string;
  timestamp: string;
}

export type VideoEvent =
  | VideoStatusEvent
  | VideoProgressEvent
  | VideoErrorEvent
  | VideoChaptersPushEvent
  | VideoThumbnailsPushEvent;

// ---------- Backend abstraction ----------

export interface EventBus {
  publish(event: VideoEvent): Promise<void>;
  subscribe(
    userId: string,
    videoId: string | null,
    handler: (event: VideoEvent) => void,
  ): () => void;
  dispose(): Promise<void>;
}

// ---------- In-memory (dev fallback) ----------

class InMemoryEventBus implements EventBus {
  private readonly emitter = new EventEmitter();
  private readonly maxListeners = 200;

  async publish(event: VideoEvent): Promise<void> {
    const userChannel = `${EVENT_CHANNEL_PREFIX}:user:${event.userId}`;
    const videoChannel = `${EVENT_CHANNEL_PREFIX}:video:${event.videoId}`;
    this.emitter.emit(userChannel, event);
    this.emitter.emit(videoChannel, event);
  }

  subscribe(
    userId: string,
    videoId: string | null,
    handler: (event: VideoEvent) => void,
  ): () => void {
    const channel = videoId
      ? `${EVENT_CHANNEL_PREFIX}:video:${videoId}`
      : `${EVENT_CHANNEL_PREFIX}:user:${userId}`;
    this.emitter.on(channel, handler);
    if (this.emitter.listenerCount(channel) > this.maxListeners) {
      this.emitter.removeListener(channel, handler);
    }
    return () => {
      this.emitter.removeListener(channel, handler);
    };
  }

  async dispose(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

// ---------- Redis (production) ----------

class RedisEventBus implements EventBus {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly subscriptions = new Map<string, Set<(event: VideoEvent) => void>>();

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: true,
    });
  }

  async connect(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  async publish(event: VideoEvent): Promise<void> {
    const userChannel = `${EVENT_CHANNEL_PREFIX}:user:${event.userId}`;
    const videoChannel = `${EVENT_CHANNEL_PREFIX}:video:${event.videoId}`;
    const payload = JSON.stringify(event);
    await Promise.all([
      this.publisher.publish(userChannel, payload),
      this.publisher.publish(videoChannel, payload),
    ]);
  }

  subscribe(
    userId: string,
    videoId: string | null,
    handler: (event: VideoEvent) => void,
  ): () => void {
    const channel = videoId
      ? `${EVENT_CHANNEL_PREFIX}:video:${videoId}`
      : `${EVENT_CHANNEL_PREFIX}:user:${userId}`;

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.subscriber.subscribe(channel, (err) => {
        if (err) {
          console.error(`[events] subscribe error on ${channel}:`, err.message);
        }
      });
      this.subscriber.on("message", (ch, message) => {
        if (ch === channel) {
          try {
            const event = JSON.parse(message) as VideoEvent;
            const handlers = this.subscriptions.get(channel);
            if (handlers) {
              for (const h of handlers) h(event);
            }
          } catch {
            // skip malformed messages
          }
        }
      });
    }

    const handlers = this.subscriptions.get(channel)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(channel);
        this.subscriber.unsubscribe(channel).catch(() => {});
      }
    };
  }

  async dispose(): Promise<void> {
    for (const channel of this.subscriptions.keys()) {
      await this.subscriber.unsubscribe(channel).catch(() => {});
    }
    this.subscriptions.clear();
    await Promise.all([
      this.publisher.quit().catch(() => {}),
      this.subscriber.quit().catch(() => {}),
    ]);
  }
}

// ---------- Singleton ----------

let bus: EventBus | null = null;

export const initEventBus = (env: Env): EventBus => {
  if (bus) return bus;
  bus = env.REDIS_URL
    ? new RedisEventBus(env.REDIS_URL)
    : new InMemoryEventBus();
  return bus;
};

const ensureBus = (): EventBus => {
  if (!bus) bus = new InMemoryEventBus();
  return bus;
};

export const eventBus: EventBus = {
  publish: (event) => ensureBus().publish(event),
  subscribe: (userId, videoId, handler) =>
    ensureBus().subscribe(userId, videoId, handler),
  dispose: () => ensureBus().dispose(),
};

export const connectEventBus = async (env: Env): Promise<void> => {
  const b = initEventBus(env);
  if (b instanceof RedisEventBus) {
    await b.connect();
  }
};
