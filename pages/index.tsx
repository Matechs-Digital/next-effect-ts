import * as T from "@effect-ts/core/Effect"
import * as S from "@effect-ts/core/Effect/Experimental/Stream"
import * as L from "@effect-ts/core/Effect/Layer"
import { identity, pipe } from "@effect-ts/core/Function"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import * as O from "@effect-ts/core/Option"
import type { _A } from "@effect-ts/core/Utils"
import * as React from "react"

import { createApp as createApp } from "../goods/appEnvironmet"

export const makeCalculator = T.succeedWith(() => {
  return {
    add: (x: number, y: number) => T.succeedWith(() => x + y)
  } as const
})

export interface Calculator extends _A<typeof makeCalculator> {}
export const Calculator = tag<Calculator>()
export const LiveCalculator = L.fromEffect(Calculator)(makeCalculator)

export const App = createApp<Has<Calculator> & T.DefaultEnv>()

export function Autocomplete() {
  const [subName, pubName] = App.useHub<string>()

  const [[current, count]] = App.useSubscribe(
    ["N/A", 0] as const,
    () =>
      pipe(
        subName(),
        S.map((s) => [s, s.length] as const)
      ),
    []
  )

  return (
    <div>
      <input
        type="text"
        name="name"
        onChange={(_) => {
          pubName(_.target.value)
        }}
      />
      <div>Count: {count}</div>
      <div>Current: {current}</div>
    </div>
  )
}

function Home() {
  return (
    <App.Provider layer={LiveCalculator["+++"](L.identity<T.DefaultEnv>())}>
      <Autocomplete />
    </App.Provider>
  )
}

export default Home
