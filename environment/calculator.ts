import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import { tag } from "@effect-ts/core/Has"
import type { _A } from "@effect-ts/core/Utils"

export const CalculatorTypeId: unique symbol = Symbol()

export const makeLiveCalculator = T.succeedWith(() => {
  return {
    _typeId: CalculatorTypeId,
    add: (x: number, y: number) => T.succeedWith(() => x + y)
  } as const
})

export interface Calculator extends _A<typeof makeLiveCalculator> {}

export const Calculator = tag<Calculator>().setKey(CalculatorTypeId)

export const LiveCalculator = L.fromEffect(Calculator)(makeLiveCalculator)

export const { add } = T.deriveLifted(Calculator)(["add"], [], [])
