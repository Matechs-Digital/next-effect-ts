import * as T from "@effect-ts/core/Effect"
import { pretty } from "@effect-ts/core/Effect/Cause"
import * as L from "@effect-ts/core/Effect/Layer"
import type { Has } from "@effect-ts/core/Has"
import React from "react"

import type { Calculator } from "../environment/calculator"
import { LiveCalculator } from "../environment/calculator"

export interface ServiceContext {
  readonly provide: <E, A>(
    self: T.Effect<Has<Calculator> & T.DefaultEnv, E, A>
  ) => T.Effect<unknown, E, A>
  readonly runWithErrorLog: <E, A>(
    self: T.Effect<Has<Calculator> & T.DefaultEnv, E, A>
  ) => () => void
}

const MissingContext = T.die(
  "service context not provided, wrap your app in LiveServiceContext"
)

export const ServiceContext = React.createContext<ServiceContext>({
  provide: () => MissingContext,
  runWithErrorLog: () => runWithErrorLog(MissingContext)
})

export const LiveServiceContext: React.FC = ({ children }) => {
  const provider = React.useMemo(() => L.unsafeMainProvider(LiveCalculator), [])

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
        provide: provider.provide,
        runWithErrorLog: (self) => runWithErrorLog(provider.provide(self))
      }}
    >
      {children}
    </ServiceContext.Provider>
  )
}

export const useServiceContext = () => React.useContext(ServiceContext)

export function runWithErrorLog<E, A>(self: T.Effect<unknown, E, A>) {
  const cancel = T.runCancel(self, (ex) => {
    if (ex._tag === "Failure") {
      console.error(pretty(ex.cause))
    }
  })
  return () => {
    T.run(cancel)
  }
}
