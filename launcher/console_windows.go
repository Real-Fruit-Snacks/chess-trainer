//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// ownsConsole reports whether the launcher has its console window to itself —
// started with a double-click rather than from a terminal — so the window
// closes the moment it exits.
func ownsConsole() bool {
	proc := syscall.NewLazyDLL("kernel32.dll").NewProc("GetConsoleProcessList")
	if proc.Find() != nil {
		return false
	}
	var ids [2]uint32
	n, _, _ := proc.Call(uintptr(unsafe.Pointer(&ids[0])), uintptr(len(ids)))
	return n == 1
}
