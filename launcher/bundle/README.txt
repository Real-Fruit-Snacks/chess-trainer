Chess Trainer: the offline copy
===============================

Version {{VERSION}}.

Everything Chess Trainer needs is in this folder: the lessons, the 48,000
puzzles, the engine (Stockfish 19, the full one included) and the human-like
opponent. It runs on your own computer, with no internet connection and
nothing to install.


Start it
--------

Windows   Double-click "Start Chess Trainer.exe".
          The first time, Windows may say it protected your PC: click
          "More info", then "Run anyway".

macOS     Double-click "Start Chess Trainer.command".
          The first time, macOS may refuse to open it because it cannot check
          who made it. On macOS 15 and later, open System Settings > Privacy &
          Security and click "Open Anyway" near the bottom; on earlier
          versions, right-click the file, choose Open, then Open again.
          Or, in Terminal, in this folder:
            xattr -dr com.apple.quarantine .
            ./"Start Chess Trainer.command"

Linux     Run ./start-chess-trainer.sh in a terminal (or double-click it, if
          your file manager runs scripts).

Chess Trainer opens in your browser at

    http://localhost:{{PORT}}/

A small window (the launcher) stays open beside it: it hands the app its
files. Keep it open while you use Chess Trainer, and close it, or press
Ctrl+C in it, when you are done. Nobody else can reach it: it answers this
computer only.

You can install Chess Trainer from the browser for a window of its own: the
install button in the address bar (Chrome, Edge), or File > Add to Dock
(Safari). Once installed, it opens even while the launcher is closed, from
what the browser has stored.


Your progress
-------------

Your progress and settings are kept by your browser, for the address above,
not in this folder. A newer copy started the same way finds them again, so
you can delete an old copy once the new one runs. Each browser keeps its own:
to move them, use Settings > Data > Backups (Export, then Import), or sync.

The full engine and the human-like opponent are switched on in Settings
(Engine, and Play): their download comes from this folder, so it needs no
internet connection either.


What needs the internet
-----------------------

The Lichess features (signing in, importing your games, the opening explorer
and the endgame tablebase), syncing between devices and live games against
other people. Everything else works offline.

The same app is online at {{SITE_URL}}
Newer copies: {{RELEASES_URL}}


What is in this folder
----------------------

app/                          The app itself: a static website.
Start Chess Trainer.exe       The launcher for Windows (x64; Windows on Arm
                              runs it too).
Start Chess Trainer.command   The launcher for macOS (Apple silicon and
                              Intel).
start-chess-trainer.sh        The launcher for Linux (x64 and Arm64).
bin/                          The launchers the two scripts above start.
licences/                     The launchers' licence notice.

The app folder works with any web server too, served from the root of a site
(for example http://example.com/, not http://example.com/chess/). A path
without a file should answer with 404.html, as GitHub Pages does, and .wasm
files with the type application/wasm.


Licences
--------

Chess Trainer is free software under the GNU General Public License,
version 3 or later (app/licence.txt). The engine, the pieces, the puzzles
and the other parts it is built from have their own licences, listed in
app/notices.txt; the launchers' are in licences/launcher.txt. The source code
is at {{REPOSITORY_URL}}
