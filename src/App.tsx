import type * as T from "@effect-ts/core/Effect"
import type { Has } from "@effect-ts/core/Has"
import * as Env from "@effect-ts/react/Env"

import type { ArtworkDataSource } from "./DataSources"
import type { ArtworkRepo } from "./Repositories"

//
// App
//

export const App = Env.make<Has<ArtworkRepo> & Has<ArtworkDataSource> & T.DefaultEnv>()
