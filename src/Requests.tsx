// tracing: off

import * as Req from "@effect-ts/query/Request"

import type { Artwork, Artworks, ParseArtworkError, ParseArtworksError } from "./Domain"
import type { HttpError } from "./Http"

//
// Requests
//

export class GetArtworks extends Req.Static<
  { readonly page: number },
  HttpError | ParseArtworksError,
  Artworks
> {
  readonly _tag = "GetArtworks"
}

export class GetArtwork extends Req.Static<
  { readonly url: string },
  HttpError | ParseArtworkError,
  Artwork
> {
  readonly _tag = "GetArtwork"
}
