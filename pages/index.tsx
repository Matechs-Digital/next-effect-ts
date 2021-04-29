import * as T from "@effect-ts/core/Effect"
import { pipe } from "@effect-ts/core/Function"
import React from "react"

import { useServiceContext } from "../context"
import { add } from "../environment/calculator"

export default function Home() {
  const { runWithErrorLog } = useServiceContext()
  const [base, setBase] = React.useState(0)
  return (
    <div>
      {base}
      <br />
      <button
        onClick={() => {
          pipe(
            add(base, 1),
            T.chain((n) =>
              T.succeedWith(() => {
                setBase(n)
              })
            ),
            runWithErrorLog
          )
        }}
      >
        next
      </button>
    </div>
  )
}
