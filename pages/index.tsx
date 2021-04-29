import * as T from "@effect-ts/core/Effect"
import * as S from "@effect-ts/core/Effect/Experimental/Stream"
import * as L from "@effect-ts/core/Effect/Layer"
import type { Either } from "@effect-ts/core/Either"
import { pipe } from "@effect-ts/core/Function"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import type { _A } from "@effect-ts/core/Utils"
import { matchTag } from "@effect-ts/core/Utils"
import * as Q from "@effect-ts/query/Query"
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

  const [nameLength, queryNameLength] = App.useQuery((name: string) =>
    Q.fromEffect(T.succeedWith(() => name.length))
  )

  App.useEffect(() =>
    pipe(
      subName(),
      S.mapM((name) =>
        T.succeedWith(() => {
          queryNameLength(name)
        })
      ),
      S.runDrain
    )
  )

  const renderDone: (_: Either<never, number>) => string = matchTag({
    Right: (_) => `${_.right}`,
    Left: (_) => _.left
  })

  return (
    <div>
      <input
        type="text"
        name="name"
        onChange={(_) => {
          pubName(_.target.value)
        }}
      />
      <div>
        Length:
        {nameLength["|>"](
          matchTag({
            Done: (_) => _.current["|>"](renderDone),
            Initial: () => "N/A",
            Loading: () => "Loading...",
            Refreshing: (_) => `${_.current["|>"](renderDone)} (Loading...)`
          })
        )}
      </div>
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
