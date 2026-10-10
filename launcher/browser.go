package main

import (
	"errors"
	"os/exec"
	"runtime"
)

// openURL shows url in the default browser, without waiting for it.
func openURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		// Linux and the BSDs: whichever opener the desktop has.
		for _, opener := range [][]string{
			{"xdg-open"},
			{"gio", "open"},
			{"sensible-browser"},
			{"x-www-browser"},
		} {
			if _, err := exec.LookPath(opener[0]); err == nil {
				cmd = exec.Command(opener[0], append(opener[1:], url)...)
				break
			}
		}
		if cmd == nil {
			return errors.New("no browser opener found")
		}
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	// Reaped in the background: some openers stay until the browser has the page.
	go func() { _ = cmd.Wait() }()
	return nil
}
