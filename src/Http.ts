// tracing: off

import { Tagged } from "@effect-ts/core/Case"
import * as T from "@effect-ts/core/Effect"

//
// Http Utilities
//

export class HttpError extends Tagged("HttpError")<{
  readonly error: unknown
}> {}

export function httpFetch(input: RequestInfo, init?: Omit<RequestInit, "signal">) {
  if (typeof AbortController === "undefined") {
    return T.tryCatchPromise(
      () =>
        fetch(input, init)
          .then((data): Promise<unknown> => data.json())
          .then(),
      (error) => new HttpError({ error })
    )
  }
  return T.effectAsyncInterrupt<unknown, HttpError, unknown>((cb) => {
    const controller = new AbortController()

    fetch(input, {
      signal: controller.signal,
      ...init
    })
      .then((data): Promise<unknown> => data.json())
      .then(
        (out) => {
          cb(T.succeed(out))
        },
        (error) => {
          cb(T.fail(new HttpError({ error })))
        }
      )

    return T.succeedWith(() => {
      controller.abort()
    })
  })
}
