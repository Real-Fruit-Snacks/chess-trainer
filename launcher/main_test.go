package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

// syncBuffer is an io.Writer the test can read while the launcher writes to it.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// freePort is a port nothing listens on (as long as nothing takes it meanwhile).
func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	_ = l.Close()
	return port
}

// started runs the launcher until the returned stop is called, once it serves.
type started struct {
	stdout, stderr *syncBuffer
	done           chan int
	stop           chan os.Signal
}

func start(t *testing.T, args ...string) *started {
	t.Helper()
	s := &started{stdout: &syncBuffer{}, stderr: &syncBuffer{}, done: make(chan int, 1), stop: make(chan os.Signal, 1)}
	go func() { s.done <- run(args, s.stdout, s.stderr, s.stop) }()
	return s
}

// waitFor waits until the launcher has written text, or has exited.
func (s *started) waitFor(t *testing.T, text string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(s.stdout.String(), text) {
			return
		}
		select {
		case code := <-s.done:
			s.done <- code
			t.Fatalf("exited with %d before %q: %s%s", code, text, s.stdout, s.stderr)
		default:
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("no %q in %q", text, s.stdout.String())
}

func (s *started) exit(t *testing.T) int {
	t.Helper()
	s.stop <- os.Interrupt
	select {
	case code := <-s.done:
		return code
	case <-time.After(5 * time.Second):
		t.Fatal("did not stop")
		return -1
	}
}

// opened records what the launcher asked the browser to show.
func opened(t *testing.T) *[]string {
	t.Helper()
	var mu sync.Mutex
	var urls []string
	previous := openBrowser
	openBrowser = func(url string) error {
		mu.Lock()
		defer mu.Unlock()
		urls = append(urls, url)
		return nil
	}
	t.Cleanup(func() { openBrowser = previous })
	return &urls
}

func withVersion(t *testing.T, v string) {
	t.Helper()
	previous := version
	version = v
	t.Cleanup(func() { version = previous })
}

func TestServesTheAppAndOpensTheBrowser(t *testing.T) {
	withVersion(t, "1.2.3")
	urls := opened(t)
	port := freePort(t)
	s := start(t, "-app", app(t), "-port", fmt.Sprint(port))
	url := fmt.Sprintf("http://localhost:%d/", port)
	s.waitFor(t, "Close the window")
	if !strings.Contains(s.stdout.String(), "Chess Trainer 1.2.3 is running on this computer at\n\n    "+url) {
		t.Errorf("banner = %q", s.stdout.String())
	}

	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/", port))
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if string(page) != "<title>shell</title>" {
		t.Errorf("served %q", page)
	}
	if code := s.exit(t); code != 0 {
		t.Errorf("exit code %d", code)
	}
	if len(*urls) != 1 || (*urls)[0] != url {
		t.Errorf("opened %v", *urls)
	}
	if !strings.Contains(s.stdout.String(), "has stopped") {
		t.Errorf("no goodbye in %q", s.stdout.String())
	}
	// The port is free again.
	if l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port)); err != nil {
		t.Errorf("port still held: %v", err)
	} else {
		_ = l.Close()
	}
}

func TestASecondStartShowsTheRunningOne(t *testing.T) {
	withVersion(t, "1.2.3")
	urls := opened(t)
	port := freePort(t)
	first := start(t, "-app", app(t), "-port", fmt.Sprint(port), "-no-browser")
	first.waitFor(t, "Close the window")
	defer first.exit(t)

	var stdout, stderr bytes.Buffer
	if code := run([]string{"-app", app(t), "-port", fmt.Sprint(port)}, &stdout, &stderr, nil); code != 0 {
		t.Fatalf("second start = %d: %s", code, stderr.String())
	}
	url := fmt.Sprintf("http://localhost:%d/", port)
	if !strings.Contains(stdout.String(), "already running at "+url) {
		t.Errorf("second start said %q", stdout.String())
	}
	if len(*urls) != 1 || (*urls)[0] != url {
		t.Errorf("opened %v", *urls)
	}
}

func TestAnotherVersionHasToBeClosedFirst(t *testing.T) {
	withVersion(t, "1.2.3")
	opened(t)
	port := freePort(t)
	first := start(t, "-app", app(t), "-port", fmt.Sprint(port), "-no-browser")
	first.waitFor(t, "Close the window")
	defer first.exit(t)

	version = "1.3.0"
	var stdout, stderr bytes.Buffer
	if code := run([]string{"-app", app(t), "-port", fmt.Sprint(port), "-no-browser"}, &stdout, &stderr, nil); code != 1 {
		t.Fatalf("second start = %d", code)
	}
	if !strings.Contains(stderr.String(), "Chess Trainer 1.2.3 is already running") || !strings.Contains(stderr.String(), "start this one (1.3.0)") {
		t.Errorf("said %q", stderr.String())
	}
	version = "1.2.3"
}

func TestMovesOnFromAPortAnotherProgramHolds(t *testing.T) {
	other := &http.Server{Handler: http.NotFoundHandler()}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = other.Serve(l) }()
	defer other.Close()
	held := l.Addr().(*net.TCPAddr).Port

	bound, running, err := listen([]int{held, 0})
	if err != nil || running != nil {
		t.Fatalf("listen = %v, %v", running, err)
	}
	defer bound.Close()
	if bound.Port == held || bound.Port == 0 {
		t.Errorf("bound %d", bound.Port)
	}

	// Asked for that port alone, it says so.
	_, _, err = listen([]int{held})
	var taken *PortsTakenError
	if !errors.As(err, &taken) || err.Error() != fmt.Sprintf("port %d is in use by another program", held) {
		t.Errorf("err = %v", err)
	}
}

func TestExplainsAPortItCannotHave(t *testing.T) {
	other := &http.Server{Handler: http.NotFoundHandler()}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = other.Serve(l) }()
	defer other.Close()
	held := l.Addr().(*net.TCPAddr).Port

	var stdout, stderr bytes.Buffer
	if code := run([]string{"-app", app(t), "-port", fmt.Sprint(held)}, &stdout, &stderr, nil); code != 1 {
		t.Fatalf("code %d", code)
	}
	if !strings.Contains(stderr.String(), fmt.Sprintf("cannot start: port %d is in use by another program", held)) {
		t.Errorf("said %q", stderr.String())
	}
}

func TestPortsTakenSaysWhich(t *testing.T) {
	if got := (&PortsTakenError{Ports: []int{8064, 8065, 8066}}).Error(); got != "ports 8064 to 8066 are in use by other programs" {
		t.Errorf("%q", got)
	}
	if got := (&PortsTakenError{}).Error(); got != "no port to serve on" {
		t.Errorf("%q", got)
	}
}

func TestLooksAtTheDefaultPortFirst(t *testing.T) {
	ports := candidatePorts(0)
	if len(ports) != spare+1 || ports[0] != DefaultPort || ports[len(ports)-1] != DefaultPort+spare {
		t.Errorf("ports = %v", ports)
	}
	if got := candidatePorts(9000); len(got) != 1 || got[0] != 9000 {
		t.Errorf("an asked port = %v", got)
	}
}

func TestFindsTheAppFolder(t *testing.T) {
	root := t.TempDir()
	appDir := filepath.Join(root, "chess-trainer", "app")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appDir, "index.html"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "chess-trainer", "bin"), 0o755); err != nil {
		t.Fatal(err)
	}

	// Windows: the launcher beside the app folder.
	if dir, err := findApp("", filepath.Join(root, "chess-trainer", "Start Chess Trainer.exe")); err != nil || dir != appDir {
		t.Errorf("beside: %q, %v", dir, err)
	}
	// macOS and Linux: the launcher in bin/.
	if dir, err := findApp("", filepath.Join(root, "chess-trainer", "bin", "chess-trainer-linux-x64")); err != nil || dir != appDir {
		t.Errorf("in bin/: %q, %v", dir, err)
	}
	// Named.
	if dir, err := findApp(appDir, ""); err != nil || dir != appDir {
		t.Errorf("named: %q, %v", dir, err)
	}
	if _, err := findApp(root, ""); err == nil || !strings.Contains(err.Error(), "no index.html") {
		t.Errorf("a folder without the app: %v", err)
	}
	if _, err := findApp("", filepath.Join(root, "elsewhere", "launcher")); err == nil || !strings.Contains(err.Error(), "app folder is missing") {
		t.Errorf("no app folder: %v", err)
	}
}

func TestFlags(t *testing.T) {
	withVersion(t, "1.2.3")
	var stdout, stderr bytes.Buffer
	if code := run([]string{"-version"}, &stdout, &stderr, nil); code != 0 || stdout.String() != "1.2.3\n" {
		t.Errorf("-version = %d %q", code, stdout.String())
	}
	if code := run([]string{"-port", "70000"}, &stdout, &stderr, nil); code != 2 {
		t.Errorf("-port 70000 = %d", code)
	}
	if code := run([]string{"-nonsense"}, io.Discard, io.Discard, nil); code != 2 {
		t.Errorf("an unknown flag = %d", code)
	}
	stdout.Reset()
	stderr.Reset()
	if code := run([]string{"-h"}, &stdout, &stderr, nil); code != 0 || !regexp.MustCompile(`-no-browser`).MatchString(stderr.String()) {
		t.Errorf("-h = %d %q", code, stderr.String())
	}
}

func TestTheAddressIsLocalhost(t *testing.T) {
	if got := address(8064); got != "http://localhost:8064/" {
		t.Errorf("%q", got)
	}
}
