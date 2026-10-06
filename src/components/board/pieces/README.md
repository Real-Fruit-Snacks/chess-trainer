# Piece sets

The app's piece sets. Each folder holds one set's twelve SVGs (`wK.svg` is the white king, `bN.svg`
the black knight), copied unchanged from the [Lichess repository](https://github.com/lichess-org/lila)
(`public/piece/<set>/`), where each set's author and licence are listed in
[COPYING.md](https://github.com/lichess-org/lila/blob/master/COPYING.md).

`npm run pieces:generate` (`scripts/generate-pieces.mjs`) turns each folder into `<set>.css`: the
twelve pieces as inline SVG behind the selectors the board uses. Classic has no folder: it is
Chessground's own cburnett set, re-emitted from the `@lichess-org/chessground` package as
`classic.css`.

| Set        | Author                      | Licence                                                                    |
| ---------- | --------------------------- | -------------------------------------------------------------------------- |
| Classic    | Colin M.L. Burnett          | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (cburnett) |
| Merida     | Armando Hernandez Marroquin | [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) |
| Chessnut   | Alexis Luengas              | [Apache-2.0](../../../../LICENSES/Apache-2.0.txt)                          |
| MPChess    | Maxime Chupin               | [GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html)              |
| Celtic     | Maurizio Monge              | MIT (below)                                                                |
| California | Jerry S.                    | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)      |
| Maestro    | sadsnake1                   | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)      |
| Staunty    | sadsnake1                   | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)      |
| Cardinal   | sadsnake1                   | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)      |

**California, Maestro, Staunty and Cardinal may not be used commercially.** They are free to use
while the app is free and makes no money. Anyone who sells the app, charges for access or shows ads
in it must remove them first: delete their folders and stylesheets, and take their ids out of
`PIECE_SET_IDS` (`src/store/settings.ts`), `PIECE_SETS` (`../pieceSets.ts`), `PIECE_STYLES`
(`../pieceStyles.ts`) and `SETS` (`scripts/pieces/index.mjs`).

Celtic's licence:

```
MIT License

Copyright (c) Maurizio Monge

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
