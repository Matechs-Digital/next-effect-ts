import { pipe } from "@effect-ts/core"
import { Case } from "@effect-ts/core/Case"
import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import * as S from "@effect-ts/core/Effect/Experimental/Stream"
import * as F from "@effect-ts/core/Effect/Fiber"
import * as H from "@effect-ts/core/Effect/Hub"
import * as L from "@effect-ts/core/Effect/Layer"
import * as Prom from "@effect-ts/core/Effect/Promise"
import * as Queue from "@effect-ts/core/Effect/Queue"
import * as E from "@effect-ts/core/Either"
import type { Lazy } from "@effect-ts/core/Function"
import { matchTag } from "@effect-ts/core/Utils"
import * as CRM from "@effect-ts/query/CompletedRequestMap"
import * as DS from "@effect-ts/query/DataSource"
import * as Q from "@effect-ts/query/Query"
import type * as Req from "@effect-ts/query/Request"
import * as React from "react"

export type AnyRef = unknown

export type QueryResult<E, A> = Loading | Refreshing<E, A> | Done<E, A>

export class Loading extends Case<{}> {
  readonly _tag = "Loading"
}

export class Done<E, A> extends Case<{ readonly current: E.Either<E, A> }> {
  readonly _tag = "Done"
}

export class Refreshing<E, A> extends Case<{ readonly current: E.Either<E, A> }> {
  readonly _tag = "Refreshing"
}

export interface AppEnvironment<R> {
  Provider: React.FC<{
    layer: L.Layer<T.DefaultEnv, never, R>
  }>
  Ticker: React.FC<{ sources: Iterable<Ticked<R, any>> }>
  useEffect: (self: Lazy<T.RIO<R, void>>, deps: AnyRef[]) => void
  useHub<A>(): UseHub<A>
  useSubscribe<A>(
    initial: A,
    subscribe: Lazy<S.Stream<unknown, never, A>>,
    deps: AnyRef[]
  ): [A]
  useQuery: <E, B>(f: Lazy<Q.Query<R, E, B>>, deps: AnyRef[]) => QueryResult<E, B>
}

export interface ServiceContext<R> {
  readonly provide: <E, A>(self: T.Effect<R, E, A>) => T.Effect<unknown, E, A>
}

export type UseHub<A> = [Lazy<S.Stream<unknown, never, A>>, (a: A) => void]

export function createApp<R extends T.DefaultEnv>(): AppEnvironment<R> {
  const MissingContext = T.die(
    "service context not provided, wrap your app in LiveServiceContext"
  )

  const ServiceContext = React.createContext<ServiceContext<R>>({
    provide: () => MissingContext
  })

  const Provider: React.FC<{ layer: L.Layer<T.DefaultEnv, never, R> }> = ({
    children,
    layer
  }) => {
    const provider = React.useMemo(() => L.unsafeMainProvider(layer), [])

    React.useEffect(() => {
      const cancel = T.runCancel(provider.allocate)
      return () => {
        T.run(cancel)
        T.run(provider.release)
      }
    }, [])

    return (
      <ServiceContext.Provider
        value={{
          provide: provider.provide
        }}
      >
        {children}
      </ServiceContext.Provider>
    )
  }

  function useHub<A>(): UseHub<A> {
    const deps: never[] = []
    const hub = React.useMemo(() => H.unsafeMakeUnbounded<A>(), deps)
    const subscribe = React.useCallback(() => S.fromHub(hub), deps)
    const publisher = React.useCallback((a) => {
      T.run(H.publish_(hub, a))
    }, deps)
    return [subscribe, publisher]
  }

  function useSubscribe<A>(
    initial: A,
    subscribe: Lazy<S.Stream<unknown, never, A>>,
    deps?: AnyRef[]
  ): [A] {
    const [state, updateState] = React.useState(initial)
    useEffect(
      () =>
        pipe(
          subscribe(),
          S.mapM((a) =>
            T.succeedWith(() => {
              updateState(a)
            })
          ),
          S.runDrain,
          T.onInterrupt(() =>
            T.succeedWith(() => {
              updateState(initial)
            })
          )
        ),
      deps
    )
    return [state]
  }

  function useEffect(self: Lazy<T.RIO<R, void>>, deps?: AnyRef[]) {
    const { provide } = React.useContext(ServiceContext)
    React.useEffect(() => {
      const fiber = T.runFiber(provide(self()))
      return () => {
        T.run(F.interrupt(fiber))
      }
    }, deps)
  }

  function useQuery<E, B>(
    f: Lazy<Q.Query<R, E, B>>,
    deps?: AnyRef[]
  ): QueryResult<E, B> {
    const [state, updateState] = React.useState<QueryResult<E, B>>(new Loading())

    useEffect(
      () =>
        pipe(
          T.succeedWith(() => {
            updateState(
              state["|>"](
                matchTag({
                  Done: (_) => new Refreshing({ current: _.current }),
                  Refreshing: (_) => _,
                  Loading: (_) => _
                })
              )
            )
          }),
          T.zipRight(T.suspend(() => Q.run(f()))),
          T.either,
          T.chain((done) =>
            T.succeedWith(() => {
              updateState((_) => new Done({ current: done }))
            })
          )
        ),
      deps
    )

    return state
  }

  const Ticker: React.FC<{ sources: Iterable<Ticked<R, any>> }> = ({
    children,
    sources
  }) => {
    useEffect(
      () =>
        T.forever(
          T.forEach_(sources, ({ tick }) => T.fork(tick))["|>"](T.zipRight(T.sleep(0)))
        )["|>"](T.awaitAllChildren),
      []
    )
    return <>{children}</>
  }

  return {
    Provider,
    Ticker,
    useEffect,
    useHub,
    useSubscribe,
    useQuery
  }
}

class Ticked<R, A extends Req.Request<any, any>> extends DS.DataSource<R, A> {
  private queue = Queue.unsafeMakeUnbounded<
    Tp.Tuple<
      [Chunk.Chunk<Chunk.Chunk<A>>, Prom.Promise<never, CRM.CompletedRequestMap>]
    >
  >()

  constructor(readonly ds: DS.DataSource<R, A>) {
    super(`Ticked(${ds.identifier})`, (requests: Chunk.Chunk<Chunk.Chunk<A>>) => {
      const queue = this.queue

      return T.gen(function* (_) {
        const promise = yield* _(Prom.make<never, CRM.CompletedRequestMap>())

        yield* _(queue["|>"](Queue.offer(Tp.tuple(requests, promise))))

        return yield* _(Prom.await(promise))
      })
    })
  }

  readonly tick = pipe(
    this.queue,
    Queue.takeAll,
    T.chain((batches) =>
      pipe(
        batches,
        Q.forEachPar(({ tuple: [r, p] }) =>
          pipe(
            r,
            Q.forEach(
              Q.forEachPar((a) =>
                pipe(
                  Q.fromRequest(a, this.ds),
                  Q.either,
                  Q.map((res) => Tp.tuple(a, res))
                )
              )
            ),
            Q.chain((as) =>
              pipe(
                p,
                Prom.succeed(
                  pipe(
                    as,
                    Chunk.reduce(CRM.empty, (crm, ser) =>
                      pipe(
                        ser,
                        Chunk.reduce(crm, (crm, { tuple: [a, res] }) =>
                          CRM.insert_(crm, a, res)
                        )
                      )
                    )
                  )
                ),
                Q.fromEffect
              )
            )
          )
        ),
        Q.run,
        T.asUnit
      )
    )
  )
}

export function appDS<R, A extends Req.Request<any, any>>(ds: DS.DataSource<R, A>) {
  return new Ticked(ds)
}
