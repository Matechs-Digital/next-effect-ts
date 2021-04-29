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
  const [count, updateCount] = React.useState(0)
  const [current, updateCurrent] = React.useState(O.emptyOf<string>())
  const [getInputStream, publishInput] = App.useStream<string>()

  App.useEffect(
    pipe(
      getInputStream(),
      S.mapM((value) =>
        T.succeedWith(() => {
          updateCount(value.length)
        })
      ),
      S.runDrain
    )
  )

  App.useEffect(
    pipe(
      getInputStream(),
      S.mapM((value) =>
        T.succeedWith(() => {
          updateCurrent(O.some(value))
        })
      ),
      S.runDrain
    )
  )

  return (
    <div>
      <input
        type="text"
        name="name"
        onChange={(_) => {
          publishInput(_.target.value)
        }}
      />
      <div>Count: {count}</div>
      <div>Current: {current["|>"](O.fold(() => "N/A", identity))}</div>
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
