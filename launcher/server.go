package main

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
)

// PingPath answers with the launcher's name and version, so a second start can
// tell its own kind already holding the port from another program.
const PingPath = "/__chess-trainer/launcher"

// contentTypes is every kind of file the app ships. The table is explicit, not
// the system's: Windows reads MIME types from the registry, where .js is
// sometimes text/plain, and browsers refuse module scripts served as that.
var contentTypes = map[string]string{
	".html":        "text/html; charset=utf-8",
	".js":          "text/javascript; charset=utf-8",
	".mjs":         "text/javascript; charset=utf-8",
	".css":         "text/css; charset=utf-8",
	".json":        "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".wasm":        "application/wasm",
	".onnx":        "application/octet-stream",
	".svg":         "image/svg+xml",
	".png":         "image/png",
	".jpg":         "image/jpeg",
	".jpeg":        "image/jpeg",
	".webp":        "image/webp",
	".avif":        "image/avif",
	".gif":         "image/gif",
	".ico":         "image/x-icon",
	".woff2":       "font/woff2",
	".woff":        "font/woff",
	".txt":         "text/plain; charset=utf-8",
	".md":          "text/markdown; charset=utf-8",
	".xml":         "application/xml; charset=utf-8",
}

// contentType is the type a file is served with: from its extension, or plain bytes.
func contentType(name string) string {
	if t, ok := contentTypes[strings.ToLower(path.Ext(name))]; ok {
		return t
	}
	return "application/octet-stream"
}

// newHandler serves the app in dir the way GitHub Pages serves the live site:
// a file as it is, a folder by its index.html, and any other path with
// 404.html (a copy of the app, which then shows the page asked for) and a 404.
//
// Every response is cross-origin isolated, so the threaded engine runs from
// the very first visit (on the live site the app's service worker adds the
// same two headers, after the first visit). Every response is revalidated:
// the service worker keeps the app for offline use, and a newer copy started
// at the same address is picked up at once.
func newHandler(dir, version string) http.Handler {
	root := os.DirFS(dir)
	ping := fmt.Appendf(nil, "{\"app\":\"chess-trainer\",\"version\":%q}\n", version)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Embedder-Policy", "require-corp")
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			h.Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == PingPath {
			h.Set("Content-Type", "application/json")
			h.Set("Cache-Control", "no-store")
			_, _ = w.Write(ping)
			return
		}
		name, status, location := resolve(root, r.URL.Path)
		switch {
		case location != "":
			http.Redirect(w, r, location, http.StatusMovedPermanently)
		case name == "":
			http.Error(w, "Not found", http.StatusNotFound)
		default:
			serveFile(w, r, root, name, status)
		}
	})
}

// resolve finds what answers a request path (already unescaped): a file with a
// 200, a redirect to the folder's path with a slash, or 404.html with a 404 (no
// name when there is no 404.html either). Nothing outside the app folder can be
// named: the path is cleaned first, and the folder refuses ".." and, on
// Windows, backslashes and drive letters.
func resolve(root fs.FS, urlPath string) (name string, status int, location string) {
	clean := path.Clean("/" + urlPath)
	name = strings.TrimPrefix(clean, "/")
	if name == "" {
		name = "."
	}
	if info, err := fs.Stat(root, name); err == nil {
		if info.Mode().IsRegular() {
			return name, http.StatusOK, ""
		}
		index := path.Join(name, "index.html")
		if info.IsDir() && isFile(root, index) {
			if !strings.HasSuffix(urlPath, "/") {
				return "", http.StatusMovedPermanently, (&url.URL{Path: clean + "/"}).EscapedPath()
			}
			return index, http.StatusOK, ""
		}
	}
	if isFile(root, "404.html") {
		return "404.html", http.StatusNotFound, ""
	}
	return "", http.StatusNotFound, ""
}

func isFile(root fs.FS, name string) bool {
	info, err := fs.Stat(root, name)
	return err == nil && info.Mode().IsRegular()
}

// serveFile writes one of the app's files. A 200 goes through ServeContent,
// which answers conditional and range requests; the 404 page is written as it is.
func serveFile(w http.ResponseWriter, r *http.Request, root fs.FS, name string, status int) {
	f, err := root.Open(name)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}
	h := w.Header()
	h.Set("Content-Type", contentType(name))
	h.Set("Cache-Control", "no-cache")
	if strings.HasSuffix(name, ".html") {
		// The one directive the page's own policy (a meta tag) cannot set.
		h.Set("Content-Security-Policy", "frame-ancestors 'none'")
	}
	if seeker, ok := f.(io.ReadSeeker); ok && status == http.StatusOK {
		http.ServeContent(w, r, name, info.ModTime(), seeker)
		return
	}
	h.Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, f)
	}
}
