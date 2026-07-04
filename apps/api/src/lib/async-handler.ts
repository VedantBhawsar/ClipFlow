/**
 * Patch Express 4's `Layer.handle_request` so a rejection in an async
 * route handler is forwarded to `next(err)` instead of bubbling out
 * as `process.on('unhandledRejection')`.
 *
 * Express 4 invokes handlers via `Layer.handle_request` and only
 * calls `next(err)` when the handler throws synchronously. An async
 * function that awaits a rejecting promise turns into an unhandled
 * rejection — Express never sees the error, no response is sent, and
 * the browser's request sits pending until its socket timeout.
 *
 * Express 5 fixed this natively. Until we migrate, every async
 * controller in this app is vulnerable. This patch monkey-patches
 * the Layer prototype once at boot to detect returned promises and
 * `.catch(next)` them — semantically equivalent to the well-known
 * `express-async-errors` package, with zero new dependencies.
 *
 * Idempotent — calling it more than once is a no-op.
 *
 * Must be imported BEFORE the first `Router()` is constructed, so
 * the prototype is patched before any Layer is created. The single
 * side-effect import at the top of `app.ts` is enough.
 */
import { createRequire } from "node:module";
import express from "express";

interface ExpressLayerInstance {
  handle: (...args: unknown[]) => unknown;
}

interface ExpressLayerProto {
  handle_request: (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown;
}

// `createRequire` lets us reach CommonJS internals from an ESM file
// without bundler magic. `express/lib/router/Layer` is private but
// stable across Express 4.x; if a future release moves it, this
// require throws and boot fails loud (preferable to silently
// shipping an unpatched app).
const requireCJS = createRequire(import.meta.url);
const LayerModule = requireCJS("express/lib/router/Layer") as {
  prototype: ExpressLayerProto;
};

const ORIGINAL = Symbol.for("clipflow.express-async-patch.original");

export const patchExpressAsyncErrors = (): void => {
  const proto = LayerModule.prototype;
  const protoWithMarker = proto as ExpressLayerProto & {
    [ORIGINAL]?: ExpressLayerProto["handle_request"];
  };
  if (protoWithMarker[ORIGINAL]) {
    // Already patched — keep this idempotent.
    return;
  }
  protoWithMarker[ORIGINAL] = proto.handle_request;

  proto.handle_request = function patchedHandleRequest(
    req: unknown,
    res: unknown,
    next: (err?: unknown) => void,
  ): unknown {
    const layer = this as unknown as ExpressLayerInstance & {
      handle_request: ExpressLayerProto["handle_request"];
    };
    const fn = layer.handle;
    // Express's convention: handlers with arity ≥ 4 are error
    // middleware (err, req, res, next). Handlers with arity ≤ 3 are
    // normal middleware/controllers. Only normal ones can be async;
    // error middleware is already sync.
    if (fn.length > 3) {
      return fn(req, res, next);
    }
    try {
      const ret = fn(req, res, next);
      if (ret && typeof (ret as Promise<unknown>).catch === "function") {
        (ret as Promise<unknown>).catch(next);
      }
      return ret;
    } catch (err) {
      next(err);
      return undefined;
    }
  };

  // Silence "express is imported but not used" lint complaints when
  // this module is imported purely for its side effect. The patch
  // targets the Layer prototype, which is reachable only after
  // Express has been loaded once — touching the import keeps the
  // module order explicit (this file MUST come after the express
  // import in the boot file).
  void express;
};