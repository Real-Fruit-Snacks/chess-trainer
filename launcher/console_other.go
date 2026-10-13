//go:build !windows

package main

// ownsConsole is false outside Windows: the terminal window stays open after
// the launcher exits (macOS Terminal shows "[Process completed]"), with its
// last words still in it.
func ownsConsole() bool { return false }
