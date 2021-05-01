import { Tagged } from "@effect-ts/core/Case"
import * as T from "@effect-ts/core/Effect"
import { flow } from "@effect-ts/core/Function"
import * as MO from "@effect-ts/schema"
import * as Parser from "@effect-ts/schema/Parser"

//
// Domain
//

export interface ApiLinkBrand {
  readonly ApiLinkBrand: unique symbol
}

export type ArtworkApiLink = string & ApiLinkBrand

export const ArtworkApiLink = MO.string["|>"](MO.brand((_) => _ as ArtworkApiLink))

export class ArtworkEntry extends MO.Schemed(
  MO.required({
    api_link: ArtworkApiLink
  })
) {
  static Model = MO.schema(ArtworkEntry)
}

export class Artworks extends MO.Schemed(
  MO.required({
    data: MO.chunk(ArtworkEntry.Model)
  })
) {
  static Model = MO.schema(Artworks)
}

export class Artwork extends MO.Schemed(
  MO.required({
    data: MO.required({
      title: MO.string
    })
  })
) {
  static Model = MO.schema(Artwork)
}

//
// Decoders
//

export class ParseArtworksError extends Tagged("ParseArtworksError")<{
  readonly error: MO.CondemnException
}> {}

export const parseArtworks = flow(
  Parser.for(Artworks.Model)["|>"](MO.condemnFail),
  T.mapError((_) => new ParseArtworksError({ error: _ }))
)

export class ParseArtworkError extends Tagged("ParseArtworkError")<{
  readonly error: MO.CondemnException
}> {}

export const parseArtwork = flow(
  Parser.for(Artwork.Model)["|>"](MO.condemnFail),
  T.mapError((_) => new ParseArtworkError({ error: _ }))
)
