package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"
)

// Running is a launcher found already serving on a port this one wanted.
type Running struct {
	Port    int
	Version string
}

// Bound is a port this launcher holds: on the IPv4 loopback address, and on
// the IPv6 one too when the computer has it.
type Bound struct {
	Port      int
	Listeners []net.Listener
}

// Close lets the port go.
func (b *Bound) Close() {
	for _, l := range b.Listeners {
		_ = l.Close()
	}
}

// listen takes the first port of ports this launcher can serve on, and
// returns it — or the launcher already running on one of them (it is one
// that was started before: the browser should go there), or an error naming
// the ports other programs hold. Port 0 takes any free port (the tests).
//
// Only the loopback addresses are used: the app is reachable from this
// computer alone. A port counts as taken when another program answers on
// either loopback address, since "localhost" in the browser can mean either.
func listen(ports []int) (*Bound, *Running, error) {
	var taken []int
	for _, port := range ports {
		v4, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
		if err != nil {
			if version, ok := probe(port); ok {
				return nil, &Running{Port: port, Version: version}, nil
			}
			taken = append(taken, port)
			continue
		}
		actual := v4.Addr().(*net.TCPAddr).Port
		v6addr := net.JoinHostPort("::1", strconv.Itoa(actual))
		if conn, err := net.DialTimeout("tcp", v6addr, 300*time.Millisecond); err == nil {
			// Something else serves "localhost" over IPv6 on this port.
			_ = conn.Close()
			_ = v4.Close()
			taken = append(taken, actual)
			continue
		}
		bound := &Bound{Port: actual, Listeners: []net.Listener{v4}}
		// Best effort: a computer without IPv6 is served on IPv4 alone.
		if v6, err := net.Listen("tcp", v6addr); err == nil {
			bound.Listeners = append(bound.Listeners, v6)
		}
		return bound, nil, nil
	}
	return nil, nil, &PortsTakenError{Ports: taken}
}

// PortsTakenError says which ports other programs hold.
type PortsTakenError struct{ Ports []int }

func (e *PortsTakenError) Error() string {
	switch len(e.Ports) {
	case 0:
		return "no port to serve on"
	case 1:
		return fmt.Sprintf("port %d is in use by another program", e.Ports[0])
	default:
		return fmt.Sprintf("ports %d to %d are in use by other programs", e.Ports[0], e.Ports[len(e.Ports)-1])
	}
}

// probe asks whatever holds a port whether it is a Chess Trainer launcher, and its version.
func probe(port int) (version string, ok bool) {
	client := http.Client{
		Timeout: 2 * time.Second,
		// Never through a proxy: this is a question for this computer.
		Transport: &http.Transport{Proxy: nil},
	}
	url := fmt.Sprintf("http://127.0.0.1:%d%s", port, PingPath)
	resp, err := client.Get(url)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	var body struct {
		App     string `json:"app"`
		Version string `json:"version"`
	}
	if resp.StatusCode != http.StatusOK {
		return "", false
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&body); err != nil {
		return "", false
	}
	if body.App != "chess-trainer" {
		return "", false
	}
	return body.Version, true
}

// candidatePorts is where to look: the port asked for alone, or else the
// default and the few after it.
func candidatePorts(asked int) []int {
	if asked != 0 {
		return []int{asked}
	}
	ports := make([]int, 0, spare+1)
	for p := DefaultPort; p <= DefaultPort+spare; p++ {
		ports = append(ports, p)
	}
	return ports
}
