// Command chess-trainer runs the offline copy of Chess Trainer: it serves the
// app folder beside it on this computer alone, at http://localhost:8064/, and
// opens it in the browser. Nothing is sent anywhere: the app keeps its data in
// the browser, and the launcher only hands it its own files.
//
// Usage:
//
//	chess-trainer [-port N] [-app DIR] [-no-browser] [-version]
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

// version is the app's version, set when a release is built
// (-ldflags "-X main.version=0.27.0").
var version = "dev"

// DefaultPort is the app's address on this computer. The browser keeps the
// app's data — progress, settings — per address, so the launcher always asks
// for this one: every start, and every later release, finds it again.
const DefaultPort = 8064

// spare is how many ports after the default are tried when another program holds it.
const spare = 9

// openBrowser shows a page in the default browser (replaced in the tests).
var openBrowser = openURL

func main() {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	code := run(os.Args[1:], os.Stdout, os.Stderr, stop)
	if code != 0 && ownsConsole() {
		// Started with a double-click: the window closes as soon as the launcher
		// exits, so keep it open until the message has been read.
		fmt.Fprint(os.Stderr, "\nPress Enter to close this window.")
		_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
	}
	os.Exit(code)
}

// run is the launcher, from its arguments to its exit code. It serves until
// stop delivers a signal (Ctrl+C, or the window closing).
func run(args []string, stdout, stderr io.Writer, stop <-chan os.Signal) int {
	flags := flag.NewFlagSet("chess-trainer", flag.ContinueOnError)
	flags.SetOutput(stderr)
	port := flags.Int("port", 0, fmt.Sprintf("serve on this port only (default %d, or the next free one)", DefaultPort))
	appDir := flags.String("app", "", "the app folder (default: the one that came with the launcher)")
	noBrowser := flags.Bool("no-browser", false, "do not open the browser")
	showVersion := flags.Bool("version", false, "print the version and exit")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if *showVersion {
		fmt.Fprintln(stdout, version)
		return 0
	}
	if *port < 0 || *port > 65535 {
		fmt.Fprintf(stderr, "There is no port %d: choose one from 1 to 65535.\n", *port)
		return 2
	}

	exe, _ := os.Executable()
	dir, err := findApp(*appDir, exe)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	bound, running, err := listen(candidatePorts(*port))
	if running != nil {
		return alreadyRunning(running, *noBrowser, stdout, stderr)
	}
	if err != nil {
		fmt.Fprintf(stderr, "Chess Trainer cannot start: %v.\n", err)
		if *port == 0 {
			fmt.Fprintf(stderr, "Close the program that uses port %d, or start the launcher with -port and a free port\n(your progress is kept per address, so use the same port each time).\n", DefaultPort)
		}
		return 1
	}

	url := address(bound.Port)
	server := &http.Server{
		Handler:           newHandler(dir, version),
		ReadHeaderTimeout: 10 * time.Second,
	}
	failed := make(chan error, len(bound.Listeners))
	for _, l := range bound.Listeners {
		go func() {
			if err := server.Serve(l); err != nil && !errors.Is(err, http.ErrServerClosed) {
				failed <- err
			}
		}()
	}

	fmt.Fprintf(stdout, "Chess Trainer %s is running on this computer at\n\n    %s\n\n", version, url)
	if *port == 0 && bound.Port != DefaultPort {
		fmt.Fprintf(stdout, "(Port %d is in use by another program, so this time Chess Trainer is at port %d.\nYour browser keeps progress separately for each address: close that program and\nstart Chess Trainer again to get back to yours.)\n\n", DefaultPort, bound.Port)
	}
	if !*noBrowser {
		if err := openBrowser(url); err != nil {
			fmt.Fprintln(stdout, "Open that address in your browser.")
		} else {
			fmt.Fprintln(stdout, "It is opening in your browser.")
		}
	}
	fmt.Fprintln(stdout, "Keep this window open while you use it. Close the window, or press Ctrl+C, to stop.")

	select {
	case <-stop:
	case err := <-failed:
		fmt.Fprintf(stderr, "Chess Trainer stopped: %v\n", err)
		bound.Close()
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	fmt.Fprintln(stdout, "\nChess Trainer has stopped.")
	return 0
}

// alreadyRunning handles a start while a launcher holds the port: the same
// version is simply shown again; another version is another copy, which has to
// be closed first (two copies at one address would share, and fight over, its data).
func alreadyRunning(r *Running, noBrowser bool, stdout, stderr io.Writer) int {
	url := address(r.Port)
	if r.Version != version {
		fmt.Fprintf(stderr, "Chess Trainer %s is already running at %s, from another copy.\nClose that copy's window, then start this one (%s) again.\n", r.Version, url, version)
		return 1
	}
	fmt.Fprintf(stdout, "Chess Trainer is already running at %s.\n", url)
	if !noBrowser {
		if err := openBrowser(url); err != nil {
			fmt.Fprintln(stdout, "Open that address in your browser.")
		} else {
			fmt.Fprintln(stdout, "It is opening in your browser.")
		}
	}
	return 0
}

// address is the app's URL at a port: always "localhost", which browsers treat
// as secure (service workers, the threaded engine), and the one name the
// browser's data for the app is kept under.
func address(port int) string {
	return fmt.Sprintf("http://localhost:%d/", port)
}

// findApp returns the app folder: the one given, or the "app" folder next to
// the launcher — or next to the folder it is in (bin/, in the copy's layout).
func findApp(given, exe string) (string, error) {
	if given != "" {
		if !isAppFolder(given) {
			return "", fmt.Errorf("%s is not Chess Trainer's app folder (it has no index.html)", given)
		}
		return filepath.Clean(given), nil
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	here := filepath.Dir(exe)
	for _, dir := range []string{filepath.Join(here, "app"), filepath.Join(here, "..", "app")} {
		if isAppFolder(dir) {
			return filepath.Clean(dir), nil
		}
	}
	return "", fmt.Errorf("Chess Trainer's app folder is missing. Keep the launcher in the folder it came in,\nnext to the app folder (or name the folder with -app)")
}

func isAppFolder(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, "index.html"))
	return err == nil && info.Mode().IsRegular()
}
