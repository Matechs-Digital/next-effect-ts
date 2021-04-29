import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as T from "@effect-ts/core/Effect"
import * as Ex from "@effect-ts/core/Effect/Exit"
import * as S from "@effect-ts/core/Effect/Experimental/Stream"
import * as Channel from "@effect-ts/core/Effect/Experimental/Stream/Channel"
import * as F from "@effect-ts/core/Effect/Fiber"
import * as H from "@effect-ts/core/Effect/Hub"
import * as L from "@effect-ts/core/Effect/Layer"
import type * as E from "@effect-ts/core/Either"
import type { Lazy } from "@effect-ts/core/Function"
import { pipe } from "@effect-ts/core/Function"
import * as React from "react"

export type AnyRef = unknown

export interface AppEnvironment<R> {
  Provider: React.FC<{
    layer: L.Layer<T.DefaultEnv, never, R>
  }>
  useEffect: (self: Lazy<T.RIO<R, void>>, dependencies?: AnyRef[]) => void
  useHub<A>(): UseHub<A>
  useSubscribe<A>(
    initial: A,
    subscribe: Lazy<S.Stream<unknown, never, A>>,
    deps?: unknown[] | undefined
  ): [A]
}

export interface ServiceContext<R> {
  readonly provide: <E, A>(self: T.Effect<R, E, A>) => T.Effect<unknown, E, A>
}

export type UseHub<A> = [Lazy<S.Stream<unknown, never, A>>, (a: A) => void]

export function createApp<R>(): AppEnvironment<R> {
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

  function useStream<A>(): UseHub<A> {
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

  return {
    Provider,
    useEffect,
    useHub: useStream,
    useSubscribe
  }
}
